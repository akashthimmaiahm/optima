const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const contracts = db.prepare(`SELECT c.*, v.name as vendor_name FROM contracts c LEFT JOIN vendors v ON c.vendor_id = v.id ORDER BY c.end_date`).all();
  res.json({ data: contracts, total: contracts.length });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { title, vendor_id, type, start_date, end_date, value, status, auto_renew, renewal_notice_days, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const result = db.prepare(`INSERT INTO contracts (title, vendor_id, type, start_date, end_date, value, status, auto_renew, renewal_notice_days, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(title, vendor_id, type, start_date, end_date, value || 0, status || 'active', auto_renew ? 1 : 0, renewal_notice_days || 30, description);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Contract added successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { title, vendor_id, type, start_date, end_date, value, status, auto_renew, renewal_notice_days, description } = req.body;
  db.prepare(`UPDATE contracts SET title=?, vendor_id=?, type=?, start_date=?, end_date=?, value=?, status=?, auto_renew=?, renewal_notice_days=?, description=?, updated_at=datetime('now') WHERE id=?`).run(title, vendor_id, type, start_date, end_date, value, status, auto_renew ? 1 : 0, renewal_notice_days, description, req.params.id);
  res.json({ message: 'Contract updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Contract deleted successfully' });
});

module.exports = router;
