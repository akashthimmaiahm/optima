const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ═══════════════════════════════════════════════════════════════════════════════
//  ASSET LOANS  —  checkout / checkin / overdue / history
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/asset-management/loans — list all loans (filters: status, asset_type, overdue)
router.get('/loans', authenticate, (req, res) => {
  const db = getDb();
  const { status, asset_type, overdue, search } = req.query;
  let query = 'SELECT * FROM asset_loans WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status=?'; params.push(status); }
  if (asset_type) { query += ' AND asset_type=?'; params.push(asset_type); }
  if (overdue === '1') {
    query += " AND status='checked_out' AND due_date IS NOT NULL AND due_date < datetime('now')";
  }
  if (search) {
    query += ' AND (asset_name LIKE ? OR loaned_to LIKE ? OR loaned_to_email LIKE ? OR purpose LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY checkout_date DESC';
  const loans = db.prepare(query).all(...params);

  // Compute overdue flag
  const now = new Date().toISOString();
  loans.forEach(l => {
    l.is_overdue = l.status === 'checked_out' && l.due_date && l.due_date < now;
  });

  res.json({ data: loans, total: loans.length });
});

// GET /api/asset-management/loans/stats
router.get('/loans/stats', authenticate, (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const total = db.prepare('SELECT COUNT(*) as c FROM asset_loans').get().c;
  const checked_out = db.prepare("SELECT COUNT(*) as c FROM asset_loans WHERE status='checked_out'").get().c;
  const overdue = db.prepare("SELECT COUNT(*) as c FROM asset_loans WHERE status='checked_out' AND due_date IS NOT NULL AND due_date < ?").get(now).c;
  const returned = db.prepare("SELECT COUNT(*) as c FROM asset_loans WHERE status='returned'").get().c;
  res.json({ total, checked_out, overdue, returned });
});

// GET /api/asset-management/loans/history/:asset_type/:asset_id — loan history for a specific asset
router.get('/loans/history/:asset_type/:asset_id', authenticate, (req, res) => {
  const db = getDb();
  const loans = db.prepare('SELECT * FROM asset_loans WHERE asset_type=? AND asset_id=? ORDER BY checkout_date DESC')
    .all(req.params.asset_type, req.params.asset_id);
  res.json({ data: loans });
});

// POST /api/asset-management/loans — checkout an asset
router.post('/loans', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { asset_type, asset_id, loaned_to, loaned_to_email, loaned_to_department, due_date, condition_out, purpose, notes } = req.body;

  if (!asset_type || !asset_id || !loaned_to) {
    return res.status(400).json({ error: 'asset_type, asset_id, and loaned_to are required' });
  }

  // Check asset isn't already checked out
  const existing = db.prepare("SELECT id FROM asset_loans WHERE asset_type=? AND asset_id=? AND status='checked_out'").get(asset_type, asset_id);
  if (existing) return res.status(400).json({ error: 'Asset is already checked out' });

  // Get asset name
  let asset_name = '';
  if (asset_type === 'hardware') {
    const hw = db.prepare('SELECT name FROM hardware_assets WHERE id=?').get(asset_id);
    asset_name = hw?.name || '';
  } else if (asset_type === 'software') {
    const sw = db.prepare('SELECT name FROM software_assets WHERE id=?').get(asset_id);
    asset_name = sw?.name || '';
  }

  const result = db.prepare(`
    INSERT INTO asset_loans (asset_type, asset_id, asset_name, loaned_to, loaned_to_email, loaned_to_department, loaned_by, checkout_date, due_date, status, condition_out, purpose, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'checked_out', ?, ?, ?)
  `).run(asset_type, asset_id, asset_name, loaned_to, loaned_to_email, loaned_to_department, req.user.name, due_date, condition_out || 'good', purpose, notes);

  // Update asset status
  if (asset_type === 'hardware') {
    db.prepare("UPDATE hardware_assets SET assigned_to=?, status='active', updated_at=datetime('now') WHERE id=?").run(loaned_to, asset_id);
  }

  db.prepare("INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, details) VALUES (?, ?, 'checkout', ?, ?, ?)")
    .run(req.user.id, req.user.name, asset_type, asset_id, `Checked out ${asset_name} to ${loaned_to}`);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Asset checked out successfully' });
});

// PUT /api/asset-management/loans/:id/checkin — return an asset
router.put('/loans/:id/checkin', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { condition_in, notes } = req.body;
  const loan = db.prepare('SELECT * FROM asset_loans WHERE id=?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan record not found' });
  if (loan.status === 'returned') return res.status(400).json({ error: 'Asset already returned' });

  db.prepare("UPDATE asset_loans SET status='returned', checkin_date=datetime('now'), condition_in=?, notes=COALESCE(notes,'') || ? WHERE id=?")
    .run(condition_in || 'good', notes ? '\n[Return] ' + notes : '', req.params.id);

  // Update asset — clear assignment
  if (loan.asset_type === 'hardware') {
    db.prepare("UPDATE hardware_assets SET assigned_to=NULL, condition=?, updated_at=datetime('now') WHERE id=?")
      .run(condition_in || 'good', loan.asset_id);
  }

  db.prepare("INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, details) VALUES (?, ?, 'checkin', ?, ?, ?)")
    .run(req.user.id, req.user.name, loan.asset_type, loan.asset_id, `Checked in ${loan.asset_name} from ${loan.loaned_to}`);

  res.json({ message: 'Asset checked in successfully' });
});

// DELETE /api/asset-management/loans/:id
router.delete('/loans/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM asset_loans WHERE id=?').run(req.params.id);
  res.json({ message: 'Loan record deleted' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ASSET RELATIONSHIPS  —  link any asset to any other asset/contract/software
// ═══════════════════════════════════════════════════════════════════════════════

const RELATIONSHIP_TYPES = [
  'installed_on', 'runs_on', 'connected_to', 'depends_on', 'licensed_for',
  'covered_by', 'accessory_of', 'replacement_for', 'backup_of', 'managed_by',
  'used_by', 'hosts', 'part_of',
];

// GET /api/asset-management/relationships — list all or filtered
router.get('/relationships', authenticate, (req, res) => {
  const db = getDb();
  const { source_type, source_id, target_type, target_id } = req.query;
  let query = 'SELECT * FROM asset_relationships WHERE 1=1';
  const params = [];
  if (source_type) { query += ' AND source_type=?'; params.push(source_type); }
  if (source_id)   { query += ' AND source_id=?'; params.push(source_id); }
  if (target_type) { query += ' AND target_type=?'; params.push(target_type); }
  if (target_id)   { query += ' AND target_id=?'; params.push(target_id); }
  query += ' ORDER BY created_at DESC';

  const rels = db.prepare(query).all(...params);

  // Enrich with asset names
  rels.forEach(r => {
    r.source_name = getAssetName(db, r.source_type, r.source_id);
    r.target_name = getAssetName(db, r.target_type, r.target_id);
  });

  res.json({ data: rels, relationship_types: RELATIONSHIP_TYPES });
});

// GET /api/asset-management/relationships/for/:type/:id — all relationships for a specific asset
router.get('/relationships/for/:type/:id', authenticate, (req, res) => {
  const db = getDb();
  const { type, id } = req.params;
  const rels = db.prepare(
    'SELECT * FROM asset_relationships WHERE (source_type=? AND source_id=?) OR (target_type=? AND target_id=?) ORDER BY created_at DESC'
  ).all(type, id, type, id);

  rels.forEach(r => {
    r.source_name = getAssetName(db, r.source_type, r.source_id);
    r.target_name = getAssetName(db, r.target_type, r.target_id);
  });

  res.json({ data: rels, relationship_types: RELATIONSHIP_TYPES });
});

// POST /api/asset-management/relationships
router.post('/relationships', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { source_type, source_id, target_type, target_id, relationship, description } = req.body;
  if (!source_type || !source_id || !target_type || !target_id || !relationship) {
    return res.status(400).json({ error: 'source_type, source_id, target_type, target_id, and relationship are required' });
  }

  // Prevent duplicate
  const exists = db.prepare(
    'SELECT id FROM asset_relationships WHERE source_type=? AND source_id=? AND target_type=? AND target_id=? AND relationship=?'
  ).get(source_type, source_id, target_type, target_id, relationship);
  if (exists) return res.status(400).json({ error: 'This relationship already exists' });

  const result = db.prepare(
    'INSERT INTO asset_relationships (source_type, source_id, target_type, target_id, relationship, description, created_by) VALUES (?,?,?,?,?,?,?)'
  ).run(source_type, source_id, target_type, target_id, relationship, description, req.user.name);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Relationship created' });
});

// DELETE /api/asset-management/relationships/:id
router.delete('/relationships/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM asset_relationships WHERE id=?').run(req.params.id);
  res.json({ message: 'Relationship deleted' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DYNAMIC TYPE FIELDS  —  per-asset-type custom fields
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/asset-management/type-fields/:assetType
router.get('/type-fields/:assetType', authenticate, (req, res) => {
  const db = getDb();
  const fields = db.prepare('SELECT * FROM asset_type_fields WHERE asset_type=? ORDER BY sort_order').all(req.params.assetType);
  res.json({ data: fields });
});

// GET /api/asset-management/type-fields — all type fields grouped
router.get('/type-fields', authenticate, (req, res) => {
  const db = getDb();
  const fields = db.prepare('SELECT * FROM asset_type_fields ORDER BY asset_type, sort_order').all();
  const grouped = {};
  fields.forEach(f => {
    if (!grouped[f.asset_type]) grouped[f.asset_type] = [];
    grouped[f.asset_type].push(f);
  });
  res.json({ data: grouped });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ASSET SEARCH  —  unified search across all asset types (for relationship picker)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/search', authenticate, (req, res) => {
  const db = getDb();
  const { q, type } = req.query;
  if (!q || q.length < 2) return res.json({ data: [] });

  const results = [];
  const term = `%${q}%`;

  if (!type || type === 'hardware') {
    const hw = db.prepare("SELECT id, name, asset_tag, type as subtype, 'hardware' as asset_type FROM hardware_assets WHERE name LIKE ? OR asset_tag LIKE ? LIMIT 10").all(term, term);
    results.push(...hw);
  }
  if (!type || type === 'software') {
    const sw = db.prepare("SELECT id, name, vendor as subtype, 'software' as asset_type FROM software_assets WHERE name LIKE ? OR vendor LIKE ? LIMIT 10").all(term, term);
    results.push(...sw);
  }
  if (!type || type === 'contract') {
    const ct = db.prepare("SELECT id, title as name, type as subtype, 'contract' as asset_type FROM contracts WHERE title LIKE ? LIMIT 10").all(term);
    results.push(...ct);
  }
  if (!type || type === 'license') {
    const li = db.prepare("SELECT l.id, COALESCE(s.name, 'License #'||l.id) as name, l.license_type as subtype, 'license' as asset_type FROM licenses l LEFT JOIN software_assets s ON l.software_id=s.id WHERE s.name LIKE ? OR l.license_key LIKE ? LIMIT 10").all(term, term);
    results.push(...li);
  }

  res.json({ data: results });
});

// ── Helper ────────────────────────────────────────────────────────────────────
function getAssetName(db, type, id) {
  if (type === 'hardware') {
    const r = db.prepare('SELECT name, asset_tag FROM hardware_assets WHERE id=?').get(id);
    return r ? `${r.name} (${r.asset_tag})` : `Hardware #${id}`;
  }
  if (type === 'software') {
    const r = db.prepare('SELECT name, vendor FROM software_assets WHERE id=?').get(id);
    return r ? `${r.name} — ${r.vendor || ''}` : `Software #${id}`;
  }
  if (type === 'contract') {
    const r = db.prepare('SELECT title FROM contracts WHERE id=?').get(id);
    return r ? r.title : `Contract #${id}`;
  }
  if (type === 'license') {
    const r = db.prepare('SELECT l.id, s.name FROM licenses l LEFT JOIN software_assets s ON l.software_id=s.id WHERE l.id=?').get(id);
    return r?.name ? `${r.name} License` : `License #${id}`;
  }
  return `${type} #${id}`;
}

module.exports = router;
