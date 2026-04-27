const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// All property routes require super_admin
function superAdminOnly(req, res, next) {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  next();
}

// GET /api/properties — list all properties with asset counts
router.get('/', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const properties = db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  // Enrich each property with counts
  const enriched = properties.map(p => {
    const hw = db.prepare("SELECT COUNT(*) as c FROM hardware_assets WHERE property_id=?").get(p.id);
    const sw = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE property_id=?").get(p.id);
    const users = db.prepare("SELECT COUNT(*) as c FROM users WHERE property_id=?").get(p.id);
    const mdm = db.prepare("SELECT COUNT(*) as c FROM mdm_devices WHERE property_id=?").get(p.id);
    return { ...p, asset_count: (hw.c || 0) + (sw.c || 0), hardware_count: hw.c || 0, software_count: sw.c || 0, user_count: users.c || 0, mdm_count: mdm.c || 0 };
  });
  res.json({ data: enriched });
});

// GET /api/properties/:id
router.get('/:id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Property not found' });
  res.json(p);
});

// POST /api/properties — create new property
router.post('/', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const { name, slug, domain, plan = 'standard', admin_email, max_assets = 10000, timezone = 'UTC', currency = 'USD', notes } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with hyphens only' });

  try {
    const stmt = db.prepare(`INSERT INTO properties (name, slug, domain, plan, status, admin_email, max_assets, timezone, currency, notes) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`);
    const result = stmt.run(name, slug, domain || null, plan, admin_email || null, max_assets, timezone, currency || 'USD', notes || null);
    const newProp = db.prepare('SELECT * FROM properties WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json(newProp);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'A property with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/properties/:id
router.put('/:id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const { name, slug, domain, plan, status, admin_email, max_assets, timezone, currency, notes } = req.body;
  if (slug && !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with hyphens only' });
  try {
    db.prepare(`UPDATE properties SET name=COALESCE(?,name), slug=COALESCE(?,slug), domain=COALESCE(?,domain), plan=COALESCE(?,plan), status=COALESCE(?,status), admin_email=COALESCE(?,admin_email), max_assets=COALESCE(?,max_assets), timezone=COALESCE(?,timezone), currency=COALESCE(?,currency), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`).run(name, slug, domain, plan, status, admin_email, max_assets, timezone, currency, notes, req.params.id);
    const updated = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Slug already in use' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/currency — get currency for current property (or first active)
router.get('/currency', authenticate, (req, res) => {
  const db = getDb();
  const prop = db.prepare("SELECT currency FROM properties WHERE status='active' ORDER BY id LIMIT 1").get();
  res.json({ currency: prop?.currency || 'USD' });
});

// DELETE /api/properties/:id  (soft delete — set status=archived)
router.delete('/:id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  if (req.params.id === '1') return res.status(400).json({ error: 'Cannot delete the default property' });
  db.prepare("UPDATE properties SET status='archived', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ message: 'Property archived' });
});

// GET /api/properties/:id/stats — detailed stats for one property
router.get('/:id/stats', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const pid = req.params.id;
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(pid);
  if (!p) return res.status(404).json({ error: 'Not found' });

  const hw = db.prepare("SELECT COUNT(*) as c FROM hardware_assets WHERE property_id=?").get(pid);
  const sw = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE property_id=?").get(pid);
  const users = db.prepare("SELECT COUNT(*) as c FROM users WHERE property_id=?").get(pid);
  const mdm = db.prepare("SELECT COUNT(*) as c FROM mdm_devices WHERE property_id=?").get(pid);
  const contracts = db.prepare("SELECT COUNT(*) as c FROM contracts WHERE property_id=? AND status='active'").get(pid);
  const vendors = db.prepare("SELECT COUNT(*) as c FROM vendors WHERE property_id=?").get(pid);
  const lic = db.prepare("SELECT SUM(total_licenses) as t, SUM(used_licenses) as u FROM software_assets WHERE property_id=?").get(pid);
  const wasted = db.prepare("SELECT SUM((total_licenses-used_licenses)*cost_per_license) as w FROM software_assets WHERE property_id=? AND total_licenses>0 AND cost_per_license>0 AND (used_licenses*1.0/total_licenses)<0.7").get(pid);

  res.json({
    property: p,
    hardware_count: hw.c || 0,
    software_count: sw.c || 0,
    user_count: users.c || 0,
    mdm_count: mdm.c || 0,
    contracts_active: contracts.c || 0,
    vendor_count: vendors.c || 0,
    licenses_total: lic.t || 0,
    licenses_used: lic.u || 0,
    wasted_spend_mo: Math.round(wasted.w || 0),
  });
});

module.exports = router;
