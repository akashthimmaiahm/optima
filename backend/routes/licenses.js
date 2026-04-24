const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const licenses = db.prepare(`SELECT l.*, s.name as software_name, s.vendor FROM licenses l LEFT JOIN software_assets s ON l.software_id = s.id ORDER BY l.created_at DESC`).all();
  res.json({ data: licenses, total: licenses.length });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { software_id, license_key, license_type, seats, purchase_date, expiry_date, cost, vendor, order_number, notes } = req.body;
  const result = db.prepare(`INSERT INTO licenses (software_id, license_key, license_type, seats, purchase_date, expiry_date, cost, vendor, order_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(software_id, license_key, license_type, seats || 1, purchase_date, expiry_date, cost || 0, vendor, order_number, notes);
  if (software_id) {
    db.prepare(`UPDATE software_assets SET total_licenses = total_licenses + ? WHERE id = ?`).run(seats || 1, software_id);
  }
  res.status(201).json({ id: result.lastInsertRowid, message: 'License added successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { license_key, license_type, seats, used_seats, purchase_date, expiry_date, cost, vendor, order_number, status, notes } = req.body;
  db.prepare(`UPDATE licenses SET license_key=?, license_type=?, seats=?, used_seats=?, purchase_date=?, expiry_date=?, cost=?, vendor=?, order_number=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`).run(license_key, license_type, seats, used_seats, purchase_date, expiry_date, cost, vendor, order_number, status, notes, req.params.id);
  res.json({ message: 'License updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'License deleted successfully' });
});

module.exports = router;
