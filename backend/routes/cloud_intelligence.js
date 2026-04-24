const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Discovered apps (SaaS visibility)
router.get('/discovered-apps', authenticate, (req, res) => {
  const db = getDb();
  const apps = db.prepare('SELECT * FROM discovered_apps ORDER BY detected_users DESC').all();
  res.json({ data: apps, total: apps.length });
});

router.put('/discovered-apps/:id/sanction', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { is_sanctioned } = req.body;
  db.prepare('UPDATE discovered_apps SET is_sanctioned = ? WHERE id = ?').run(is_sanctioned ? 1 : 0, req.params.id);
  res.json({ message: 'App status updated' });
});

// License reclamation
router.get('/reclamation', authenticate, (req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM license_reclamation ORDER BY days_inactive DESC').all();
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status='in_review' THEN 1 ELSE 0 END) as in_review,
      SUM(CASE WHEN status='pending' THEN license_cost ELSE 0 END) as potential_savings,
      SUM(savings) as realized_savings
    FROM license_reclamation
  `).get();
  res.json({ data: items, summary });
});

router.put('/reclamation/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { status, action_taken } = req.body;
  const savings = status === 'completed' ? db.prepare('SELECT license_cost FROM license_reclamation WHERE id=?').get(req.params.id)?.license_cost || 0 : 0;
  db.prepare(`UPDATE license_reclamation SET status=?, action_taken=?, savings=? WHERE id=?`).run(status, action_taken, savings, req.params.id);
  res.json({ message: 'Reclamation record updated' });
});

// Simulate automated reclamation scan
router.post('/reclamation/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  // Simulate new inactive users discovered
  const newItems = [
    ['Microsoft Office 365', 'Scan User ' + Math.floor(Math.random()*1000), 'scan' + Math.floor(Math.random()*1000) + '@company.com', '2024-01-' + String(Math.floor(Math.random()*28)+1).padStart(2,'0'), Math.floor(Math.random()*60)+60, 23.00],
    ['Slack Business+', 'Scan User ' + Math.floor(Math.random()*1000), 'scan' + Math.floor(Math.random()*1000) + '@company.com', '2024-01-' + String(Math.floor(Math.random()*28)+1).padStart(2,'0'), Math.floor(Math.random()*60)+60, 8.75],
  ];
  const ins = db.prepare('INSERT INTO license_reclamation (software_name,user_name,user_email,last_used,days_inactive,license_cost,status) VALUES (?,?,?,?,?,?,?)');
  newItems.forEach(i => ins.run(i[0], i[1], i[2], i[3], i[4], i[5], 'pending'));
  res.json({ message: `Scan complete. ${newItems.length} new inactive licenses found.`, found: newItems.length });
});

// Cloud resources (infrastructure visibility)
router.get('/cloud-resources', authenticate, (req, res) => {
  const db = getDb();
  const { provider } = req.query;
  let q = 'SELECT cr.*, ci.name as integration_name FROM cloud_resources cr LEFT JOIN cloud_integrations ci ON cr.integration_id = ci.id';
  const params = [];
  if (provider) { q += ' WHERE cr.provider = ?'; params.push(provider); }
  q += ' ORDER BY cr.monthly_cost DESC';
  const resources = db.prepare(q).all(...params);
  const summary = db.prepare('SELECT provider, COUNT(*) as count, SUM(monthly_cost) as monthly_cost FROM cloud_resources GROUP BY provider').all();
  res.json({ data: resources, summary, total: resources.length });
});

router.post('/cloud-resources/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  // Simulate scanning
  db.prepare("UPDATE cloud_resources SET last_scanned = datetime('now')").run();
  const total = db.prepare('SELECT COUNT(*) as c FROM cloud_resources').get().c;
  res.json({ message: `Infrastructure scan complete. ${total} resources found.`, resources_found: total });
});

// Shadow IT
router.get('/shadow-it', authenticate, (req, res) => {
  const db = getDb();
  const apps = db.prepare('SELECT * FROM shadow_it ORDER BY risk_level DESC, users_count DESC').all();
  const summary = {
    total: apps.length,
    high_risk: apps.filter(a => a.risk_level === 'high').length,
    medium_risk: apps.filter(a => a.risk_level === 'medium').length,
    low_risk: apps.filter(a => a.risk_level === 'low').length,
    total_monthly_cost: apps.reduce((sum, a) => sum + (a.monthly_cost_estimate || 0), 0),
  };
  res.json({ data: apps, summary });
});

router.put('/shadow-it/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { status, notes } = req.body;
  db.prepare('UPDATE shadow_it SET status=?, notes=? WHERE id=?').run(status, notes, req.params.id);
  res.json({ message: 'Shadow IT record updated' });
});

// Combined intelligence summary
router.get('/summary', authenticate, (req, res) => {
  const db = getDb();
  try {
    const discovered = db.prepare('SELECT COUNT(*) as c FROM discovered_apps').get().c;
    const unsanctioned = db.prepare('SELECT COUNT(*) as c FROM discovered_apps WHERE is_sanctioned=0').get().c;
    const reclaimPending = db.prepare("SELECT COUNT(*) as c, SUM(license_cost) as savings FROM license_reclamation WHERE status='pending'").get();
    const shadowHigh = db.prepare("SELECT COUNT(*) as c FROM shadow_it WHERE risk_level='high' AND status != 'resolved'").get().c;
    const cloudResources = db.prepare('SELECT COUNT(*) as c, SUM(monthly_cost) as cost FROM cloud_resources').get();
    res.json({
      discovered_apps: discovered,
      unsanctioned_apps: unsanctioned,
      reclaim_candidates: reclaimPending.c,
      potential_savings: reclaimPending.savings || 0,
      shadow_it_high_risk: shadowHigh,
      cloud_resources: cloudResources.c,
      cloud_monthly_cost: cloudResources.cost || 0,
    });
  } catch (e) {
    res.json({ discovered_apps: 0, unsanctioned_apps: 0, reclaim_candidates: 0, potential_savings: 0, shadow_it_high_risk: 0, cloud_resources: 0, cloud_monthly_cost: 0 });
  }
});

module.exports = router;
