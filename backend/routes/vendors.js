const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all();
  res.json({ data: vendors, total: vendors.length });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { name, type, contact_name, email, phone, website, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(`INSERT INTO vendors (name, type, contact_name, email, phone, website, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(name, type, contact_name, email, phone, website, address, notes);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Vendor added successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { name, type, contact_name, email, phone, website, address, status, notes } = req.body;
  db.prepare(`UPDATE vendors SET name=?, type=?, contact_name=?, email=?, phone=?, website=?, address=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`).run(name, type, contact_name, email, phone, website, address, status, notes, req.params.id);
  res.json({ message: 'Vendor updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.json({ message: 'Vendor deleted successfully' });
});

module.exports = router;
