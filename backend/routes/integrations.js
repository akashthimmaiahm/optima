const express = require('express');
const https = require('https');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── Microsoft Graph API helpers ───────────────────────────────────────────────

function httpsPost(url, formBody) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(formBody).toString();
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error(d)) } }); });
    req.on('error', reject); req.end(data);
  });
}

function graphGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error(d)) } }); });
    req.on('error', reject); req.end();
  });
}

async function graphGetAll(url, token) {
  const all = [];
  let next = url;
  while (next) {
    const res = await graphGet(next, token);
    if (res.value) all.push(...res.value);
    next = res['@odata.nextLink'] || null;
  }
  return all;
}

async function syncMicrosoft365(integration) {
  const config = typeof integration.config === 'string' ? JSON.parse(integration.config) : (integration.config || {});
  const clientId = integration.client_id;
  const clientSecret = config.client_secret;
  const tenantId = integration.tenant_id;

  if (!clientId || !clientSecret || !tenantId) throw new Error('Missing client_id, client_secret, or tenant_id');

  // 1. Get OAuth token
  const tokenRes = await httpsPost(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    client_id: clientId, client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  if (!tokenRes.access_token) throw new Error(tokenRes.error_description || 'Failed to get token');
  const token = tokenRes.access_token;

  // 2. Fetch all users
  const users = await graphGetAll(
    'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department,jobTitle,createdDateTime',
    token
  );

  // 3. Fetch subscribed SKUs (licenses)
  const skus = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
  const licenses = skus.value || [];

  // 4. Fetch organization info
  const orgRes = await graphGet('https://graph.microsoft.com/v1.0/organization', token);
  const org = orgRes.value && orgRes.value[0];

  // 5. Count
  const totalUsers = users.length;
  const enabledUsers = users.filter(u => u.accountEnabled).length;
  const licensedUsers = users.filter(u => u.assignedLicenses && u.assignedLicenses.length > 0).length;
  const totalLicenses = licenses.reduce((s, l) => s + (l.prepaidUnits ? l.prepaidUnits.enabled : 0), 0);
  const consumedLicenses = licenses.reduce((s, l) => s + (l.consumedUnits || 0), 0);

  return {
    users_synced: totalUsers,
    licenses_discovered: totalLicenses,
    sync_details: {
      org_name: org ? org.displayName : null,
      domains: org && org.verifiedDomains ? org.verifiedDomains.map(d => d.name) : [],
      total_users: totalUsers,
      enabled_users: enabledUsers,
      licensed_users: licensedUsers,
      total_license_seats: totalLicenses,
      consumed_license_seats: consumedLicenses,
      skus: licenses.map(l => ({
        name: l.skuPartNumber,
        consumed: l.consumedUnits,
        enabled: l.prepaidUnits ? l.prepaidUnits.enabled : 0,
      })),
      top_departments: Object.entries(
        users.reduce((acc, u) => { if (u.department) acc[u.department] = (acc[u.department] || 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    },
  };
}

// Add a new integration from catalog
router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { name, provider, type, api_endpoint, auth_type } = req.body;
  if (!name || !provider || !type) return res.status(400).json({ error: 'name, provider, type required' });
  try {
    const r = db.prepare(
      `INSERT INTO cloud_integrations (name, provider, type, status, api_endpoint, auth_type, sync_frequency) VALUES (?,?,?,'disconnected',?,?,'daily')`
    ).run(name, provider, type, api_endpoint || '', auth_type || 'oauth2');
    const row = db.prepare('SELECT * FROM cloud_integrations WHERE id=?').get(r.lastInsertRowid);
    try { row.config = row.config ? JSON.parse(row.config) : {} } catch { row.config = {} }
    res.status(201).json(row);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Integration already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const integrations = db.prepare('SELECT * FROM cloud_integrations ORDER BY name').all();
  // Parse config JSON for each
  const data = integrations.map(i => {
    try { return { ...i, config: i.config ? JSON.parse(i.config) : {} } } catch { return { ...i, config: {} } }
  });
  res.json({ data, total: data.length });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const i = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'Integration not found' });
  try { i.config = i.config ? JSON.parse(i.config) : {} } catch { i.config = {} }
  res.json(i);
});

// Connect / update credentials
router.put('/:id/connect', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { client_id, client_secret, tenant_id, api_key, api_endpoint, auth_type, scopes, webhook_url, sync_frequency, region, instance_url } = req.body;
  const config = JSON.stringify({ client_secret, api_key, scopes, webhook_url, region, instance_url });
  db.prepare(`UPDATE cloud_integrations SET status='connected', client_id=?, tenant_id=?, api_endpoint=?, auth_type=?, sync_frequency=?, config=?, last_sync=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(client_id || api_key, tenant_id, api_endpoint, auth_type, sync_frequency || 'daily', config, req.params.id);
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, details) VALUES (?, ?, 'connect', 'integration', ?, ?)`)
    .run(req.user.id, req.user.name, req.params.id, `Connected integration: ${integration.name}`);
  res.json({ message: `${integration.name} connected successfully` });
});

// Update config of already-connected integration
router.put('/:id/configure', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { client_id, client_secret, tenant_id, api_key, api_endpoint, auth_type, scopes, webhook_url, sync_frequency, region, instance_url } = req.body;
  const config = JSON.stringify({ client_secret, api_key, scopes, webhook_url, region, instance_url });
  db.prepare(`UPDATE cloud_integrations SET client_id=?, tenant_id=?, api_endpoint=?, auth_type=?, sync_frequency=?, config=?, updated_at=datetime('now') WHERE id=?`)
    .run(client_id || api_key, tenant_id, api_endpoint, auth_type, sync_frequency || 'daily', config, req.params.id);
  res.json({ message: 'Integration configuration updated' });
});

router.put('/:id/disconnect', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE cloud_integrations SET status='disconnected', last_sync=NULL, licenses_discovered=0, users_synced=0, updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ message: 'Integration disconnected' });
});

router.post('/:id/sync', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), async (req, res) => {
  const db = getDb();
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!integration || integration.status !== 'connected') return res.status(400).json({ error: 'Integration not connected' });

  try {
    let result;

    // Route to the right connector based on provider/name
    if (integration.name === 'Microsoft 365' || integration.name === 'Microsoft Intune') {
      result = await syncMicrosoft365(integration);
    } else {
      // Generic: just update timestamp for unsupported connectors
      db.prepare(`UPDATE cloud_integrations SET last_sync=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(req.params.id);
      return res.json({ message: `${integration.name} sync triggered (connector not yet implemented)`, licenses_discovered: integration.licenses_discovered, users_synced: integration.users_synced });
    }

    // Save results
    const syncDetailsJson = JSON.stringify(result.sync_details || {});
    const existingConfig = integration.config ? (typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config) : {};
    existingConfig.sync_details = result.sync_details;
    const newConfig = JSON.stringify(existingConfig);

    db.prepare(`UPDATE cloud_integrations SET last_sync=datetime('now'), licenses_discovered=?, users_synced=?, config=?, updated_at=datetime('now') WHERE id=?`)
      .run(result.licenses_discovered, result.users_synced, newConfig, req.params.id);

    res.json({
      message: `${integration.name} synced successfully`,
      licenses_discovered: result.licenses_discovered,
      users_synced: result.users_synced,
      sync_details: result.sync_details,
    });
  } catch (err) {
    console.error(`Sync failed for ${integration.name}:`, err.message);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// Get sync details for a connected integration
router.get('/:id/sync-details', authenticate, (req, res) => {
  const db = getDb();
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  try {
    const config = integration.config ? JSON.parse(integration.config) : {};
    res.json({ sync_details: config.sync_details || null });
  } catch {
    res.json({ sync_details: null });
  }
});

// Delete an integration entirely
router.delete('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  db.prepare('DELETE FROM cloud_integrations WHERE id=?').run(req.params.id);
  res.json({ message: `${integration.name} removed` });
});

module.exports = router;
