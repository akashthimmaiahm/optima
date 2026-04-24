const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'auditor'), (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, department, phone, is_active, last_login, created_at FROM users ORDER BY name').all();
  res.json({ data: users, total: users.length });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  const { name, email, password, role, department, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`INSERT INTO users (name, email, password, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)`).run(name, email, hash, role || 'user', department, phone);
  res.status(201).json({ id: result.lastInsertRowid, message: 'User created successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  const { name, email, role, department, phone, is_active } = req.body;
  db.prepare(`UPDATE users SET name=?, email=?, role=?, department=?, phone=?, is_active=?, updated_at=datetime('now') WHERE id=?`).run(name, email, role, department, phone, is_active, req.params.id);
  res.json({ message: 'User updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin'), (req, res) => {
  const db = getDb();
  if (req.user.id == req.params.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deactivated successfully' });
});

module.exports = router;
