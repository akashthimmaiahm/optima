const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

router.get('/software-compliance', authenticate, (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT name, vendor, total_licenses, used_licenses, (total_licenses - used_licenses) as available, CASE WHEN total_licenses > 0 THEN ROUND((used_licenses * 100.0 / total_licenses), 1) ELSE 0 END as utilization_pct, cost_per_license, (total_licenses * cost_per_license) as total_cost FROM software_assets ORDER BY utilization_pct DESC`).all();
  res.json({ data });
});

router.get('/hardware-lifecycle', authenticate, (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT type, COUNT(*) as count, status, AVG(purchase_cost) as avg_cost, SUM(purchase_cost) as total_cost FROM hardware_assets GROUP BY type, status ORDER BY type`).all();
  res.json({ data });
});

router.get('/expiring-assets', authenticate, (req, res) => {
  const db = getDb();
  const softwareExpiring = db.prepare(`SELECT 'software' as asset_type, name, vendor, expiry_date, (julianday(expiry_date) - julianday('now')) as days_remaining FROM software_assets WHERE expiry_date IS NOT NULL AND expiry_date >= date('now') AND expiry_date <= date('now', '+90 days') ORDER BY expiry_date`).all();
  const contractsExpiring = db.prepare(`SELECT 'contract' as asset_type, title as name, '' as vendor, end_date as expiry_date, (julianday(end_date) - julianday('now')) as days_remaining FROM contracts WHERE end_date >= date('now') AND end_date <= date('now', '+90 days') ORDER BY end_date`).all();
  const warrantyExpiring = db.prepare(`SELECT 'hardware' as asset_type, name, manufacturer as vendor, warranty_expiry as expiry_date, (julianday(warranty_expiry) - julianday('now')) as days_remaining FROM hardware_assets WHERE warranty_expiry IS NOT NULL AND warranty_expiry >= date('now') AND warranty_expiry <= date('now', '+90 days') ORDER BY warranty_expiry`).all();
  res.json({ data: [...softwareExpiring, ...contractsExpiring, ...warrantyExpiring].sort((a, b) => a.days_remaining - b.days_remaining) });
});

router.get('/cost-analysis', authenticate, (req, res) => {
  const db = getDb();
  const softwareCosts = db.prepare(`SELECT category, SUM(total_licenses * cost_per_license) as total_cost FROM software_assets GROUP BY category`).all();
  const hardwareCosts = db.prepare(`SELECT type, COUNT(*) as count, SUM(purchase_cost) as total_cost FROM hardware_assets GROUP BY type`).all();
  const contractCosts = db.prepare(`SELECT type, SUM(value) as total_value FROM contracts WHERE status='active' GROUP BY type`).all();
  res.json({ softwareCosts, hardwareCosts, contractCosts });
});

router.get('/audit-logs', authenticate, (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json({ data: logs });
});

module.exports = router;
