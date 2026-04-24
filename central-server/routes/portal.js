const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { getDb } = require('../database/init');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// POST /api/portal/verify-key — installer uses this to validate a property key (no auth needed)
router.post('/verify-key', (req, res) => {
  const { property_key } = req.body;
  if (!property_key) return res.status(400).json({ error: 'property_key required' });
  const db = getDb();
  const prop = db.prepare(
    "SELECT id, name, slug, domain, plan, status FROM properties WHERE property_key=? AND status='active'"
  ).get(property_key);
  if (!prop) return res.status(404).json({ error: 'Invalid or inactive property key' });
  res.json({ valid: true, property: prop });
});

// GET /api/portal/properties/health — ping all property EC2s and return online/offline per id
router.get('/properties/health', authenticate, async (req, res) => {
  const db = getDb();
  const http  = require('http');
  const https = require('https');

  let rows;
  if (req.user.global_role === 'super_admin') {
    rows = db.prepare("SELECT id, ec2_url FROM properties WHERE status='active'").all();
  } else {
    rows = db.prepare(`
      SELECT p.id, p.ec2_url FROM properties p
      JOIN user_properties up ON up.property_id = p.id
      WHERE up.user_id = ? AND p.status = 'active'
    `).all(req.user.id);
  }

  const ping = (url) => new Promise((resolve) => {
    if (!url) return resolve(false);
    try {
      const target = new URL('/api/health', url);
      const lib = target.protocol === 'https:' ? https : http;
      const req = lib.get(target.toString(), { timeout: 4000 }, (r) => {
        resolve(r.statusCode === 200);
        r.resume();
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch { resolve(false); }
  });

  const results = await Promise.all(rows.map(async (p) => ({
    id: p.id,
    online: await ping(p.ec2_url),
  })));

  res.json({ health: Object.fromEntries(results.map(r => [r.id, r.online])) });
});

// GET /api/portal/properties — properties the logged-in user can access
router.get('/properties', authenticate, (req, res) => {
  const db = getDb();
  let rows;
  if (req.user.global_role === 'super_admin') {
    rows = db.prepare("SELECT p.*, 'super_admin' as role FROM properties p WHERE p.status='active' ORDER BY p.name").all();
  } else {
    rows = db.prepare(`
      SELECT p.*, up.role
      FROM properties p
      JOIN user_properties up ON up.property_id = p.id
      WHERE up.user_id = ? AND p.status = 'active'
      ORDER BY p.name
    `).all(req.user.id);
  }
  res.json({ data: rows });
});

// ── Super-admin: manage the property registry ─────────────────────────────────

// GET /api/portal/registry — all properties (super admin)
router.get('/registry', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM properties ORDER BY name').all();
  res.json({ data: rows });
});

// POST /api/portal/registry — add a property
router.post('/registry', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const { name, slug, ec2_url, domain, plan = 'standard', description, address, logo_url, vdms_id } = req.body;
  if (!name || !slug || !ec2_url) return res.status(400).json({ error: 'name, slug, ec2_url required' });
  try {
    const property_key = randomUUID();
    const r = db.prepare(
      `INSERT INTO properties (name, slug, ec2_url, domain, plan, description, address, logo_url, vdms_id, property_key) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(name, slug, ec2_url, domain || null, plan, description || null, address || null, logo_url || null, vdms_id || null, property_key);
    res.status(201).json(db.prepare('SELECT * FROM properties WHERE id=?').get(r.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/portal/registry/:id
router.put('/registry/:id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const { name, slug, ec2_url, domain, plan, status, description, address, logo_url, vdms_id } = req.body;
  db.prepare(`UPDATE properties SET
    name=COALESCE(?,name), slug=COALESCE(?,slug), ec2_url=COALESCE(?,ec2_url),
    domain=COALESCE(?,domain), plan=COALESCE(?,plan), status=COALESCE(?,status),
    description=COALESCE(?,description), address=COALESCE(?,address),
    logo_url=COALESCE(?,logo_url), vdms_id=COALESCE(?,vdms_id),
    updated_at=datetime('now')
    WHERE id=?`).run(name, slug, ec2_url, domain, plan, status, description, address, logo_url, vdms_id, req.params.id);
  res.json(db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id));
});

// DELETE /api/portal/registry/:id — archive
router.delete('/registry/:id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE properties SET status='archived', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ message: 'Property archived' });
});

// ── User → Property assignments ───────────────────────────────────────────────

// GET /api/portal/users — all portal users (super admin)
router.get('/users', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, global_role, is_active, last_login, created_at FROM users ORDER BY name').all();
  // Attach their property assignments
  const enriched = users.map(u => {
    const props = db.prepare(`
      SELECT p.id, p.name, p.slug, up.role
      FROM properties p JOIN user_properties up ON up.property_id=p.id
      WHERE up.user_id=?
    `).all(u.id);
    return { ...u, properties: props };
  });
  res.json({ data: enriched });
});

// POST /api/portal/users — create portal user
router.post('/users', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const bcrypt = require('bcryptjs');
  const { name, email, password, global_role = 'user', property_ids = [] } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const userId = db.prepare(
      `INSERT INTO users (name, email, password, global_role) VALUES (?,?,?,?)`
    ).run(name, email, hash, global_role).lastInsertRowid;
    const assign = db.prepare(`INSERT OR IGNORE INTO user_properties (user_id, property_id, role) VALUES (?,?,'user')`);
    property_ids.forEach(pid => assign.run(userId, pid));
    res.status(201).json({ id: userId, name, email, global_role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/portal/users/:id/grant — grant property access
router.post('/users/:id/grant', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  const { property_id, role = 'user' } = req.body;
  db.prepare(`INSERT OR REPLACE INTO user_properties (user_id, property_id, role) VALUES (?,?,?)`).run(req.params.id, property_id, role);
  res.json({ message: 'Access granted' });
});

// DELETE /api/portal/users/:id/revoke/:property_id — revoke property access
router.delete('/users/:id/revoke/:property_id', authenticate, superAdminOnly, (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM user_properties WHERE user_id=? AND property_id=?`).run(req.params.id, req.params.property_id);
  res.json({ message: 'Access revoked' });
});

module.exports = router;
