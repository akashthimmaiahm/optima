const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { getDb } = require('../database/init');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

// POST /api/auth/login
// Returns JWT + list of properties the user can access
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);

  // Fetch accessible properties
  let properties;
  if (user.global_role === 'super_admin') {
    // Super admin sees all active properties
    properties = db.prepare("SELECT p.*, 'super_admin' as role FROM properties p WHERE p.status='active' ORDER BY p.name").all();
  } else {
    properties = db.prepare(`
      SELECT p.*, up.role
      FROM properties p
      JOIN user_properties up ON up.property_id = p.id
      WHERE up.user_id = ? AND p.status = 'active'
      ORDER BY p.name
    `).all(user.id);
  }

  // Issue JWT — same secret as property EC2s so it's valid there too
  const token = jwt.sign({
    id:                  user.id,
    email:               user.email,
    name:                user.name,
    global_role:         user.global_role,
    fromPortal:          true,
    accessible_property_ids: properties.map(p => p.id),
  }, JWT_SECRET, { expiresIn: '8h' });

  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser, properties });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => res.json({ message: 'Logged out' }));

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, global_role, is_active, last_login, created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
