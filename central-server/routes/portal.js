const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { getDb } = require('../database/init');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// POST /api/portal/verify-key — property server calls this on startup to register itself
router.post('/verify-key', (req, res) => {
  const { property_key, ec2_url } = req.body;
  if (!property_key) return res.status(400).json({ error: 'property_key required' });
  const db = getDb();
  const prop = db.prepare(
    "SELECT id, name, slug, domain, plan, status FROM properties WHERE property_key=? AND status='active'"
  ).get(property_key);
  if (!prop) return res.status(404).json({ error: 'Invalid or inactive property key' });
  // Register the property server's URL so portal can reach it for health checks
  if (ec2_url) {
    db.prepare("UPDATE properties SET ec2_url=?, updated_at=datetime('now') WHERE id=?").run(ec2_url, prop.id);
  }
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

// ── User → Property assignments (hierarchical) ──────────────────────────────
// Master admin (admin@optima.com, global_role=super_admin) can manage all users/properties.
// A super_admin for specific properties can invite it_admin/it_manager/user to those properties.

function getCallerProperties(req) {
  const db = getDb();
  if (req.user.global_role === 'super_admin') return null; // null = all properties
  return db.prepare(`SELECT property_id FROM user_properties WHERE user_id=? AND role IN ('super_admin','it_admin')`).all(req.user.id).map(r => r.property_id);
}

function canManageProperty(req, propertyId) {
  const allowed = getCallerProperties(req);
  if (allowed === null) return true; // master admin
  return allowed.includes(Number(propertyId));
}

// GET /api/portal/users — list users (super_admin sees all, property admins see their property users)
router.get('/users', authenticate, (req, res) => {
  const db = getDb();
  if (!['super_admin', 'it_admin', 'it_manager'].includes(req.user.global_role)) {
    // Check if user is a property-level admin
    const propRoles = db.prepare(`SELECT role FROM user_properties WHERE user_id=?`).all(req.user.id);
    const isPropertyAdmin = propRoles.some(r => ['super_admin', 'it_admin'].includes(r.role));
    if (!isPropertyAdmin) return res.status(403).json({ error: 'Insufficient permissions' });
  }

  let users;
  const callerProps = getCallerProperties(req);
  if (callerProps === null) {
    // Master admin — see all users
    users = db.prepare('SELECT id, name, email, global_role, is_active, last_login, created_at FROM users ORDER BY name').all();
  } else {
    // Property admin — see users in their properties + themselves
    users = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email, u.global_role, u.is_active, u.last_login, u.created_at
      FROM users u
      LEFT JOIN user_properties up ON up.user_id=u.id
      WHERE up.property_id IN (${callerProps.map(() => '?').join(',')}) OR u.id=?
      ORDER BY u.name
    `).all(...callerProps, req.user.id);
  }

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

// POST /api/portal/users — invite/create a user (hierarchical)
router.post('/users', authenticate, (req, res) => {
  const db = getDb();
  const bcrypt = require('bcryptjs');
  const { name, email, password, global_role = 'user', property_ids = [], property_roles = {} } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

  // Hierarchy: only master admin can create super_admin users
  if (global_role === 'super_admin' && req.user.global_role !== 'super_admin') {
    return res.status(403).json({ error: 'Only master admin can create super_admin users' });
  }

  // Property admins can only assign to properties they manage
  const callerProps = getCallerProperties(req);
  if (callerProps !== null) {
    for (const pid of property_ids) {
      if (!callerProps.includes(Number(pid))) {
        return res.status(403).json({ error: `You do not have admin access to property ${pid}` });
      }
    }
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const userId = db.prepare(
      `INSERT INTO users (name, email, password, global_role) VALUES (?,?,?,?)`
    ).run(name, email, hash, global_role).lastInsertRowid;

    const assign = db.prepare(`INSERT OR IGNORE INTO user_properties (user_id, property_id, role) VALUES (?,?,?)`);
    property_ids.forEach(pid => {
      const role = property_roles[pid] || global_role || 'user';
      assign.run(userId, pid, role);
    });

    res.status(201).json({ id: userId, name, email, global_role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/portal/users/:id — update user
router.put('/users/:id', authenticate, (req, res) => {
  const db = getDb();
  const { name, email, global_role, is_active } = req.body;

  // Only master admin can change global_role to super_admin
  if (global_role === 'super_admin' && req.user.global_role !== 'super_admin') {
    return res.status(403).json({ error: 'Only master admin can promote to super_admin' });
  }

  db.prepare(`UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email), global_role=COALESCE(?,global_role), is_active=COALESCE(?,is_active) WHERE id=?`)
    .run(name, email, global_role, is_active, req.params.id);
  res.json({ message: 'User updated' });
});

// DELETE /api/portal/users/:id — deactivate user
router.delete('/users/:id', authenticate, (req, res) => {
  const db = getDb();
  if (req.user.id == req.params.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  // Only master admin can deactivate super_admins
  const target = db.prepare('SELECT global_role FROM users WHERE id=?').get(req.params.id);
  if (target?.global_role === 'super_admin' && req.user.global_role !== 'super_admin') {
    return res.status(403).json({ error: 'Only master admin can deactivate super_admins' });
  }
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

// POST /api/portal/users/:id/grant — grant property access (hierarchical)
router.post('/users/:id/grant', authenticate, (req, res) => {
  const db = getDb();
  const { property_id, role = 'user' } = req.body;
  if (!canManageProperty(req, property_id)) {
    return res.status(403).json({ error: 'You do not have admin access to this property' });
  }
  db.prepare(`INSERT OR REPLACE INTO user_properties (user_id, property_id, role) VALUES (?,?,?)`).run(req.params.id, property_id, role);
  res.json({ message: 'Access granted' });
});

// DELETE /api/portal/users/:id/revoke/:property_id — revoke property access
router.delete('/users/:id/revoke/:property_id', authenticate, (req, res) => {
  const db = getDb();
  if (!canManageProperty(req, req.params.property_id)) {
    return res.status(403).json({ error: 'You do not have admin access to this property' });
  }
  db.prepare(`DELETE FROM user_properties WHERE user_id=? AND property_id=?`).run(req.params.id, req.params.property_id);
  res.json({ message: 'Access revoked' });
});

module.exports = router;
