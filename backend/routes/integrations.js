const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

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

router.post('/:id/sync', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!integration || integration.status !== 'connected') return res.status(400).json({ error: 'Integration not connected' });
  // Update last_sync timestamp — actual license/user counts are updated by real connector logic
  db.prepare(`UPDATE cloud_integrations SET last_sync=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(req.params.id);
  res.json({ message: `${integration.name} sync triggered`, licenses_discovered: integration.licenses_discovered, users_synced: integration.users_synced });
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
