const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../database/init');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

// ── Sclera SSO Config ─────────────────────────────────────────────────────
const SCLERA_SSO = {
  client_id: 'optima',
  client_secret: 'dUQBBkkdtUVKh7LuebfuN9zvGDQfiPmL',
  base_url: 'https://app.sclera.com',
  authorize_path: '/oauth/authorize',
  token_path: '/oauth/token',
  userinfo_path: '/oauth/userinfo',
};

// Helper: HTTPS/HTTP request as promise
function httpRequest(url, options = {}, postData) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { ...options, insecureHTTPParser: true }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('SSO request timeout')));
    if (postData) req.write(postData);
    req.end();
  });
}

// POST /api/auth/login
// Returns JWT + list of properties the user can access
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);

  // Fetch accessible properties
  let properties;
  if (user.global_role === 'super_admin') {
    // Super admin sees all active properties
    properties = db.prepare("SELECT p.*, 'super_admin' as role FROM properties p WHERE p.status='active' ORDER BY p.name").all();
  } else {
    properties = db.prepare(`
      SELECT p.*, up.role
      FROM properties p
      JOIN user_properties up ON up.property_id = p.id
      WHERE up.user_id = ? AND p.status = 'active'
      ORDER BY p.name
    `).all(user.id);
  }

  // Issue JWT — same secret as property EC2s so it's valid there too
  const token = jwt.sign({
    id:                  user.id,
    email:               user.email,
    name:                user.name,
    global_role:         user.global_role,
    fromPortal:          true,
    accessible_property_ids: properties.map(p => p.id),
  }, JWT_SECRET, { expiresIn: '8h' });

  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser, properties });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => res.json({ message: 'Logged out' }));

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, global_role, is_active, last_login, created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── Microsoft SSO Config (stored in central DB) ───────────────────────────
// Reads M365 credentials from sso_config table in central portal DB.
// Set via POST /api/auth/sso/microsoft/configure

function ensureSsoConfigTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS sso_config (
    provider TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    tenant_id TEXT,
    extra TEXT,
    updated_at TEXT
  )`);
}

function getM365Credentials() {
  try {
    ensureSsoConfigTable();
    const db = getDb();
    const row = db.prepare("SELECT client_id, client_secret, tenant_id FROM sso_config WHERE provider='microsoft'").get();
    if (row && row.client_id && row.client_secret && row.tenant_id) return row;
  } catch (e) {
    console.error('Failed to read M365 SSO config:', e.message);
  }
  return null;
}

// ── Microsoft Entra ID SSO ─────────────────────────────────────────────────

// GET /api/auth/sso/microsoft — returns the authorization URL
router.get('/sso/microsoft', (req, res) => {
  const { redirect_uri } = req.query;
  if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri required' });

  try {
    const creds = getM365Credentials();
    if (!creds || !creds.client_id || !creds.tenant_id) {
      return res.status(503).json({ error: 'Microsoft 365 integration not configured. Connect M365 in Cloud Integrations first.' });
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.client_id,
      redirect_uri,
      scope: 'openid profile email User.Read',
      response_mode: 'query',
      state: `ms_${crypto.randomBytes(16).toString('hex')}`,
    });

    const authUrl = `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/authorize?${params}`;
    res.json({ auth_url: authUrl, state: params.get('state') });
  } catch (err) {
    console.error('Microsoft SSO init error:', err.message);
    res.status(500).json({ error: 'Failed to initiate Microsoft SSO', details: err.message });
  }
});

// POST /api/auth/sso/microsoft/callback — exchange code for token, create/find user
router.post('/sso/microsoft/callback', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  try {
    const creds = getM365Credentials();
    if (!creds || !creds.client_id || !creds.client_secret || !creds.tenant_id) {
      return res.status(503).json({ error: 'Microsoft 365 integration not configured' });
    }

    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect_uri || '',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      scope: 'openid profile email User.Read',
    }).toString();

    const tokenResp = await httpRequest(
      `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) } },
      tokenBody
    );

    if (tokenResp.status >= 400 || !tokenResp.data.access_token) {
      console.error('Microsoft token exchange failed:', tokenResp.status, tokenResp.data);
      return res.status(401).json({ error: 'Microsoft SSO token exchange failed', details: tokenResp.data });
    }

    const accessToken = tokenResp.data.access_token;

    // Fetch user profile from Microsoft Graph
    const userResp = await httpRequest(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,department,jobTitle',
      { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (userResp.status >= 400 || (!userResp.data.mail && !userResp.data.userPrincipalName)) {
      console.error('Microsoft Graph /me failed:', userResp.status, userResp.data);
      return res.status(401).json({ error: 'Failed to fetch user info from Microsoft', details: userResp.data });
    }

    const msUser = userResp.data;
    const email = msUser.mail || msUser.userPrincipalName;
    const db = getDb();

    // User must already exist and be authorized in central DB
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);

    if (!user) {
      return res.status(403).json({ error: 'Access denied. Your account has not been authorized for Optima. Contact your administrator to add your account and assign a property.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    // Check user has property assignments
    let properties;
    if (user.global_role === 'super_admin') {
      properties = db.prepare("SELECT p.*, 'super_admin' as role FROM properties p WHERE p.status='active' ORDER BY p.name").all();
    } else {
      properties = db.prepare(`
        SELECT p.*, up.role
        FROM properties p
        JOIN user_properties up ON up.property_id = p.id
        WHERE up.user_id = ? AND p.status = 'active'
        ORDER BY p.name
      `).all(user.id);
    }

    if (!properties.length) {
      return res.status(403).json({ error: 'No properties assigned to your account. Contact your administrator to assign a property and role.' });
    }

    db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);

    // Issue JWT
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      global_role: user.global_role,
      fromPortal: true,
      accessible_property_ids: properties.map(p => p.id),
    }, JWT_SECRET, { expiresIn: '8h' });

    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser, properties, sso_provider: 'microsoft' });

  } catch (err) {
    console.error('Microsoft SSO error:', err.message);
    res.status(500).json({ error: 'Microsoft SSO authentication failed', details: err.message });
  }
});

// POST /api/auth/sso/microsoft/configure — save M365 SSO credentials (super_admin only)
router.post('/sso/microsoft/configure', authenticate, (req, res) => {
  if (req.user.global_role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  const { client_id, client_secret, tenant_id } = req.body;
  if (!client_id || !client_secret || !tenant_id) return res.status(400).json({ error: 'client_id, client_secret, and tenant_id are required' });
  ensureSsoConfigTable();
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO sso_config (provider, client_id, client_secret, tenant_id, updated_at) VALUES ('microsoft', ?, ?, ?, datetime('now'))").run(client_id, client_secret, tenant_id);
  res.json({ message: 'Microsoft SSO configured successfully' });
});

// GET /api/auth/sso/microsoft/status — check if M365 SSO is configured
router.get('/sso/microsoft/status', (req, res) => {
  const creds = getM365Credentials();
  res.json({ configured: !!creds, tenant_id: creds?.tenant_id || null });
});

// ── Sclera SSO ─────────────────────────────────────────────────────────────

// GET /api/auth/sso/sclera — returns the authorization URL to redirect to
router.get('/sso/sclera', (req, res) => {
  // Always use the canonical redirect URI registered on Sclera's OAuth app
  const redirect_uri = 'https://optima.sclera.com/login';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SCLERA_SSO.client_id,
    redirect_uri,
    scope: 'openid profile email',
    state: crypto.randomBytes(16).toString('hex'),
  });

  const authUrl = `${SCLERA_SSO.base_url}${SCLERA_SSO.authorize_path}?${params}`;
  res.json({ auth_url: authUrl, state: params.get('state') });
});

// POST /api/auth/sso/sclera/callback — exchange code for token, find authorized user
router.post('/sso/sclera/callback', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  try {
    // Must match the redirect_uri used in the authorize request
    const redirect_uri = 'https://optima.sclera.com/login';

    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      client_id: SCLERA_SSO.client_id,
      client_secret: SCLERA_SSO.client_secret,
    }).toString();

    const tokenResp = await httpRequest(
      `${SCLERA_SSO.base_url}${SCLERA_SSO.token_path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) } },
      tokenBody
    );

    if (tokenResp.status >= 400 || !tokenResp.data.access_token) {
      console.error('SSO token exchange failed:', tokenResp.status, tokenResp.data);
      return res.status(401).json({ error: 'SSO token exchange failed', details: tokenResp.data });
    }

    const accessToken = tokenResp.data.access_token;

    // Fetch user info
    const userResp = await httpRequest(
      `${SCLERA_SSO.base_url}${SCLERA_SSO.userinfo_path}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (userResp.status >= 400 || !userResp.data.email) {
      console.error('SSO userinfo failed:', userResp.status, userResp.data);
      return res.status(401).json({ error: 'Failed to fetch user info from Sclera SSO', details: userResp.data });
    }

    const ssoUser = userResp.data;
    const db = getDb();

    // User must already exist and be authorized in central DB
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(ssoUser.email);

    if (!user) {
      return res.status(403).json({ error: 'Access denied. Your account has not been authorized for Optima. Contact your administrator to add your account and assign a property.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    // Check user has property assignments
    let properties;
    if (user.global_role === 'super_admin') {
      properties = db.prepare("SELECT p.*, 'super_admin' as role FROM properties p WHERE p.status='active' ORDER BY p.name").all();
    } else {
      properties = db.prepare(`
        SELECT p.*, up.role
        FROM properties p
        JOIN user_properties up ON up.property_id = p.id
        WHERE up.user_id = ? AND p.status = 'active'
        ORDER BY p.name
      `).all(user.id);
    }

    if (!properties.length) {
      return res.status(403).json({ error: 'No properties assigned to your account. Contact your administrator to assign a property and role.' });
    }

    // Update last login
    db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);

    // Issue JWT
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      global_role: user.global_role,
      fromPortal: true,
      accessible_property_ids: properties.map(p => p.id),
    }, JWT_SECRET, { expiresIn: '8h' });

    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser, properties, sso_provider: 'sclera' });

  } catch (err) {
    console.error('Sclera SSO error:', err.message);
    res.status(500).json({ error: 'SSO authentication failed', details: err.message });
  }
});

module.exports = router;
