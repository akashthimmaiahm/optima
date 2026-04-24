const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, category, status, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM software_assets WHERE 1=1';
  const params = [];
  if (search) { query += ' AND (name LIKE ? OR vendor LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const software = db.prepare(query).all(...params);
  res.json({ data: software, total: software.length });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const software = db.prepare('SELECT * FROM software_assets WHERE id = ?').get(req.params.id);
  if (!software) return res.status(404).json({ error: 'Software not found' });
  const licenses = db.prepare('SELECT * FROM licenses WHERE software_id = ?').all(req.params.id);
  res.json({ ...software, licenses });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { name, vendor, version, category, license_type, total_licenses, cost_per_license, purchase_date, expiry_date, description, department } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(`INSERT INTO software_assets (name, vendor, version, category, license_type, total_licenses, cost_per_license, purchase_date, expiry_date, description, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(name, vendor, version, category, license_type, total_licenses || 0, cost_per_license || 0, purchase_date, expiry_date, description, department);
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, details) VALUES (?, ?, 'create', 'software', ?, ?)`).run(req.user.id, req.user.name, result.lastInsertRowid, `Created software: ${name}`);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Software added successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { name, vendor, version, category, license_type, total_licenses, used_licenses, cost_per_license, purchase_date, expiry_date, description, status, department } = req.body;
  db.prepare(`UPDATE software_assets SET name=?, vendor=?, version=?, category=?, license_type=?, total_licenses=?, used_licenses=?, cost_per_license=?, purchase_date=?, expiry_date=?, description=?, status=?, department=?, updated_at=datetime('now') WHERE id=?`).run(name, vendor, version, category, license_type, total_licenses, used_licenses, cost_per_license, purchase_date, expiry_date, description, status, department, req.params.id);
  res.json({ message: 'Software updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM software_assets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Software deleted successfully' });
});

module.exports = router;
