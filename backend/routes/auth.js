const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');
const router = express.Router();
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');

// ── Sclera SSO Config ─────────────────────────────────────────────────────
const SCLERA_SSO = {
  client_id: 'optima',
  client_secret: 'dUQBBkkdtUVKh7LuebfuN9zvGDQfiPmL',
  base_url: 'https://app.sclera.com',
  authorize_path: '/oauth/authorize',
  token_path: '/oauth/token',
  userinfo_path: '/oauth/userinfo',
};

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, property_id: user.property_id || null }, JWT_SECRET, { expiresIn: '8h' });
  const { password: _, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

router.post('/logout', (req, res) => res.json({ message: 'Logged out successfully' }));

// ── Sclera SSO ─────────────────────────────────────────────────────────────

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

// GET /api/auth/sso/sclera — returns the authorization URL to redirect to
router.get('/sso/sclera', (req, res) => {
  const { redirect_uri } = req.query;
  if (!redirect_uri) return res.status(400).json({ error: 'redirect_uri required' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SCLERA_SSO.client_id,
    redirect_uri,
    scope: 'openid profile email',
    state: require('crypto').randomBytes(16).toString('hex'),
  });

  const authUrl = `${SCLERA_SSO.base_url}${SCLERA_SSO.authorize_path}?${params}`;
  res.json({ auth_url: authUrl, state: params.get('state') });
});

// POST /api/auth/sso/sclera/callback — exchange code for token, create/find user
router.post('/sso/sclera/callback', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  try {
    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect_uri || '',
      client_id: SCLERA_SSO.client_id,
      client_secret: SCLERA_SSO.client_secret,
    }).toString();

    const tokenResp = await httpRequest(
      `${SCLERA_SSO.base_url}${SCLERA_SSO.token_path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) } },
      tokenBody
    );

    if (tokenResp.status >= 400 || !tokenResp.data.access_token) {
      return res.status(401).json({ error: 'SSO token exchange failed', details: tokenResp.data });
    }

    const accessToken = tokenResp.data.access_token;

    // Fetch user info
    const userResp = await httpRequest(
      `${SCLERA_SSO.base_url}${SCLERA_SSO.userinfo_path}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (userResp.status >= 400 || !userResp.data.email) {
      return res.status(401).json({ error: 'Failed to fetch user info from Sclera SSO', details: userResp.data });
    }

    const ssoUser = userResp.data;
    const db = getDb();

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(ssoUser.email);

    if (!user) {
      // Auto-create SSO user
      const hashedPw = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 10);
      const result = db.prepare(
        "INSERT INTO users (name, email, password, role, department, is_active, created_at) VALUES (?, ?, ?, 'viewer', ?, 1, datetime('now'))"
      ).run(
        ssoUser.name || ssoUser.preferred_username || ssoUser.email.split('@')[0],
        ssoUser.email,
        hashedPw,
        ssoUser.department || 'SSO'
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    // Update last login
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    // Issue JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, property_id: user.property_id || null },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword, sso_provider: 'sclera' });

  } catch (err) {
    console.error('Sclera SSO error:', err.message);
    res.status(500).json({ error: 'SSO authentication failed', details: err.message });
  }
});

router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role, department, phone, is_active, last_login, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
