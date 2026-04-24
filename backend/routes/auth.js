const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, property_id: user.property_id || null }, JWT_SECRET, { expiresIn: '8h' });
  const { password: _, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

router.post('/logout', (req, res) => res.json({ message: 'Logged out successfully' }));

router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role, department, phone, is_active, last_login, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
