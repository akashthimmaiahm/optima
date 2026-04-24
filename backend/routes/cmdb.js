const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// GET /cmdb/stats
router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM cmdb_items').get().count;
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM cmdb_items GROUP BY type ORDER BY count DESC').all();
  const byCriticality = db.prepare('SELECT criticality, COUNT(*) as count FROM cmdb_items GROUP BY criticality').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM cmdb_items GROUP BY status').all();
  const byEnvironment = db.prepare('SELECT environment, COUNT(*) as count FROM cmdb_items GROUP BY environment').all();
  const totalRelationships = db.prepare('SELECT COUNT(*) as count FROM cmdb_relationships').get().count;
  const critical = db.prepare("SELECT COUNT(*) as count FROM cmdb_items WHERE criticality='critical'").get().count;
  res.json({ total, byType, byCriticality, byStatus, byEnvironment, totalRelationships, critical });
});

// GET /cmdb/items
router.get('/items', authenticate, (req, res) => {
  const db = getDb();
  const { type, status, criticality, environment, search, page = 1, limit = 50 } = req.query;
  let where = [];
  let params = [];

  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (criticality) { where.push('criticality = ?'); params.push(criticality); }
  if (environment) { where.push('environment = ?'); params.push(environment); }
  if (search) {
    where.push('(name LIKE ? OR ci_id LIKE ? OR owner LIKE ? OR department LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const total = db.prepare(`SELECT COUNT(*) as count FROM cmdb_items ${whereClause}`).get(...params).count;
  const items = db.prepare(`SELECT * FROM cmdb_items ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  // Attach relationship counts
  const relCount = db.prepare('SELECT source_ci_id as ci_id, COUNT(*) as cnt FROM cmdb_relationships GROUP BY source_ci_id');
  const counts = {};
  relCount.all().forEach(r => { counts[r.ci_id] = r.cnt; });

  const result = items.map(item => ({
    ...item,
    tags: item.tags ? JSON.parse(item.tags) : [],
    relationship_count: counts[item.id] || 0,
  }));

  res.json({ items: result, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /cmdb/items/:id
router.get('/items/:id', authenticate, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM cmdb_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'CI not found' });

  item.tags = item.tags ? JSON.parse(item.tags) : [];

  // Get relationships (outgoing)
  const outgoing = db.prepare(`
    SELECT r.id, r.relationship_type, r.description, c.ci_id as target_ci_id, c.name as target_name, c.type as target_type, c.status as target_status
    FROM cmdb_relationships r JOIN cmdb_items c ON r.target_ci_id = c.id
    WHERE r.source_ci_id = ?
  `).all(req.params.id);

  // Get relationships (incoming)
  const incoming = db.prepare(`
    SELECT r.id, r.relationship_type, r.description, c.ci_id as source_ci_id, c.name as source_name, c.type as source_type, c.status as source_status
    FROM cmdb_relationships r JOIN cmdb_items c ON r.source_ci_id = c.id
    WHERE r.target_ci_id = ?
  `).all(req.params.id);

  res.json({ ...item, relationships: { outgoing, incoming } });
});

// POST /cmdb/items
router.post('/items', authenticate, (req, res) => {
  const db = getDb();
  const { name, type, category, status = 'active', environment = 'production', criticality = 'medium',
    owner, department, location, ip_address, os, version, description, managed_by,
    linked_asset_id, linked_asset_type, tags = [] } = req.body;

  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });

  // Generate CI ID
  const count = db.prepare('SELECT COUNT(*) as count FROM cmdb_items').get().count;
  const ci_id = `CI-${String(count + 1).padStart(5, '0')}`;

  const result = db.prepare(`
    INSERT INTO cmdb_items (ci_id, name, type, category, status, environment, criticality, owner, department,
      location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ci_id, name, type, category, status, environment, criticality, owner, department,
    location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type,
    JSON.stringify(tags));

  res.status(201).json({ id: result.lastInsertRowid, ci_id });
});

// PUT /cmdb/items/:id
router.put('/items/:id', authenticate, (req, res) => {
  const db = getDb();
  const { name, type, category, status, environment, criticality, owner, department,
    location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type, tags } = req.body;

  const existing = db.prepare('SELECT id FROM cmdb_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'CI not found' });

  db.prepare(`
    UPDATE cmdb_items SET name=?, type=?, category=?, status=?, environment=?, criticality=?,
      owner=?, department=?, location=?, ip_address=?, os=?, version=?, description=?,
      managed_by=?, linked_asset_id=?, linked_asset_type=?, tags=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, type, category, status, environment, criticality, owner, department,
    location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type,
    JSON.stringify(tags || []), req.params.id);

  res.json({ success: true });
});

// DELETE /cmdb/items/:id
router.delete('/items/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cmdb_relationships WHERE source_ci_id = ? OR target_ci_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM cmdb_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /cmdb/relationships
router.get('/relationships', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.*, s.name as source_name, s.ci_id as source_ci, s.type as source_type,
           t.name as target_name, t.ci_id as target_ci, t.type as target_type
    FROM cmdb_relationships r
    JOIN cmdb_items s ON r.source_ci_id = s.id
    JOIN cmdb_items t ON r.target_ci_id = t.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(rows);
});

// POST /cmdb/relationships
router.post('/relationships', authenticate, (req, res) => {
  const db = getDb();
  const { source_ci_id, target_ci_id, relationship_type, description } = req.body;
  if (!source_ci_id || !target_ci_id || !relationship_type) {
    return res.status(400).json({ error: 'source_ci_id, target_ci_id, and relationship_type are required' });
  }
  const result = db.prepare(
    'INSERT INTO cmdb_relationships (source_ci_id, target_ci_id, relationship_type, description) VALUES (?, ?, ?, ?)'
  ).run(source_ci_id, target_ci_id, relationship_type, description);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /cmdb/relationships/:id
router.delete('/relationships/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cmdb_relationships WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /cmdb/discover — auto-create CIs from existing hardware/software assets
router.post('/discover', authenticate, (req, res) => {
  const db = getDb();
  let created = 0;

  const hardware = db.prepare("SELECT * FROM hardware_assets WHERE status != 'retired' AND status != 'disposed'").all();
  for (const h of hardware) {
    const existing = db.prepare('SELECT id FROM cmdb_items WHERE linked_asset_id = ? AND linked_asset_type = ?').get(h.id, 'hardware');
    if (existing) continue;
    const count = db.prepare('SELECT COUNT(*) as count FROM cmdb_items').get().count;
    const ci_id = `CI-${String(count + 1).padStart(5, '0')}`;
    const ciType = h.type === 'Server' ? 'Server' : h.type === 'Network Switch' || h.type === 'Firewall' ? 'Network' : 'Hardware';
    db.prepare(`
      INSERT INTO cmdb_items (ci_id, name, type, category, status, environment, criticality, owner, department, location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ci_id, h.name, ciType, h.type, h.status === 'active' ? 'active' : h.status,
      'production',
      h.type === 'Server' || h.type === 'Firewall' ? 'critical' : 'medium',
      h.assigned_to, h.department, h.location, h.ip_address, h.os, null,
      `Auto-discovered from Hardware Asset ${h.asset_tag}`, 'IT Operations',
      h.id, 'hardware', '[]');
    created++;
  }

  const software = db.prepare("SELECT * FROM software_assets WHERE status = 'active'").all();
  for (const s of software) {
    const existing = db.prepare('SELECT id FROM cmdb_items WHERE linked_asset_id = ? AND linked_asset_type = ?').get(s.id, 'software');
    if (existing) continue;
    const count = db.prepare('SELECT COUNT(*) as count FROM cmdb_items').get().count;
    const ci_id = `CI-${String(count + 1).padStart(5, '0')}`;
    db.prepare(`
      INSERT INTO cmdb_items (ci_id, name, type, category, status, environment, criticality, owner, department, location, ip_address, os, version, description, managed_by, linked_asset_id, linked_asset_type, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ci_id, s.name, 'Application', s.category, 'active', 'production',
      s.category === 'Security' ? 'critical' : s.category === 'OS' ? 'high' : 'medium',
      null, s.department, null, null, null, s.version,
      `Auto-discovered from Software Asset. Vendor: ${s.vendor}`, s.vendor,
      s.id, 'software', '[]');
    created++;
  }

  res.json({ created, message: `Discovered and created ${created} configuration items` });
});

module.exports = router;
