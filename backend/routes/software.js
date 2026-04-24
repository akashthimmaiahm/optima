const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, category, status, source, agent_id, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM software_assets WHERE 1=1';
  const params = [];
  if (search) { query += ' AND (name LIKE ? OR vendor LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (source === 'agent') { query += " AND (source='agent' OR notes='Agent-discovered')"; }
  else if (source === 'manual') { query += " AND (source IS NULL OR source='manual') AND notes != 'Agent-discovered'"; }
  if (agent_id) { query += ' AND discovered_by_agent = ?'; params.push(agent_id); }
  query += ' ORDER BY created_at DESC';
  const software = db.prepare(query).all(...params);
  res.json({ data: software, total: software.length });
});

// GET /software/agents — list agents with software count
router.get('/agents', authenticate, (req, res) => {
  const db = getDb();
  try {
    const agents = db.prepare(`
      SELECT
        COALESCE(s.discovered_by_agent, 'unknown') as agent_id,
        COALESCE(s.agent_hostname, 'Unknown Host') as hostname,
        COUNT(*) as software_count,
        MAX(s.created_at) as last_discovery
      FROM software_assets s
      WHERE s.source = 'agent' OR s.notes = 'Agent-discovered'
      GROUP BY COALESCE(s.discovered_by_agent, 'unknown')
      ORDER BY software_count DESC
    `).all();

    // Enrich with agent details from agents table
    const agentStmt = db.prepare("SELECT hostname, platform, os_name, last_seen, status FROM agents WHERE agent_id = ?");
    for (const a of agents) {
      if (a.agent_id !== 'unknown') {
        const agentInfo = agentStmt.get(a.agent_id);
        if (agentInfo) {
          a.hostname = agentInfo.hostname || a.hostname;
          a.platform = agentInfo.platform;
          a.os_name = agentInfo.os_name;
          a.last_seen = agentInfo.last_seen;
          a.agent_status = agentInfo.status;
        }
      }
    }
    res.json({ data: agents });
  } catch (e) {
    // Fallback if columns don't exist yet
    const count = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE notes = 'Agent-discovered'").get();
    res.json({ data: [{ agent_id: 'unknown', hostname: 'Legacy Agents', software_count: count.c, last_discovery: null }] });
  }
});

// GET /software/source-stats — counts by source
router.get('/source-stats', authenticate, (req, res) => {
  const db = getDb();
  try {
    const agentCount = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE source='agent' OR notes='Agent-discovered'").get().c;
    const manualCount = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE (source IS NULL OR source='manual') AND (notes IS NULL OR notes != 'Agent-discovered')").get().c;
    const totalCount = db.prepare("SELECT COUNT(*) as c FROM software_assets").get().c;
    res.json({ agent: agentCount, manual: manualCount, total: totalCount });
  } catch {
    const total = db.prepare("SELECT COUNT(*) as c FROM software_assets").get().c;
    res.json({ agent: 0, manual: total, total });
  }
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
