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
  db.prepare(`UPDATE cloud_integrations SET status='disconnected', last_sync=NULL, updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ message: 'Integration disconnected' });
});

router.post('/:id/sync', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const integration = db.prepare('SELECT * FROM cloud_integrations WHERE id = ?').get(req.params.id);
  if (!integration || integration.status !== 'connected') return res.status(400).json({ error: 'Integration not connected' });
  const newLicenses = Math.floor(Math.random() * 15) + integration.licenses_discovered;
  const newUsers = Math.floor(Math.random() * 8) + integration.users_synced;
  db.prepare(`UPDATE cloud_integrations SET last_sync=datetime('now'), licenses_discovered=?, users_synced=?, updated_at=datetime('now') WHERE id=?`)
    .run(newLicenses, newUsers, req.params.id);
  res.json({ message: `${integration.name} synced successfully`, licenses_discovered: newLicenses, users_synced: newUsers });
});

// Force reseed integrations with fresh sample data
router.post('/reseed', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cloud_integrations').run();
  const integrationsData = [
    ['Microsoft 365', 'Microsoft', 'productivity', 'connected', 'https://graph.microsoft.com/v1.0', 'oauth2', 'daily', '2024-01-15', 500, 423, 'app_client_m365_001', 'tenant_contoso_001'],
    ['Google Workspace', 'Google', 'productivity', 'connected', 'https://admin.googleapis.com', 'oauth2', 'daily', '2024-02-10', 250, 198, 'client_gws_002', 'domain_company_com'],
    ['Salesforce CRM', 'Salesforce', 'crm', 'connected', 'https://login.salesforce.com/services/oauth2', 'oauth2', 'hourly', '2024-01-20', 75, 68, 'client_sf_003', 'instance_na1'],
    ['AWS IAM', 'Amazon', 'cloud', 'connected', 'https://iam.amazonaws.com', 'api_key', 'daily', '2024-03-05', 45, 0, 'AKIAIOSFODNN7EXAMPLE', 'us-east-1'],
    ['Microsoft Azure', 'Microsoft', 'cloud', 'connected', 'https://management.azure.com', 'oauth2', 'daily', '2024-01-15', 32, 0, 'client_azure_005', 'tenant_azure_001'],
    ['Google Cloud Platform', 'Google', 'cloud', 'disconnected', 'https://cloudresourcemanager.googleapis.com', 'service_account', 'daily', null, 0, 0, '', ''],
    ['Slack', 'Salesforce', 'communication', 'connected', 'https://slack.com/api', 'oauth2', 'hourly', '2024-04-01', 500, 387, 'client_slack_007', 'workspace_T0123'],
    ['Zoom', 'Zoom', 'communication', 'connected', 'https://api.zoom.us/v2', 'oauth2', 'daily', '2024-04-01', 200, 156, 'client_zoom_008', 'account_zoom_001'],
    ['GitHub Enterprise', 'Microsoft', 'development', 'connected', 'https://api.github.com', 'oauth2', 'daily', '2024-02-20', 100, 87, 'client_gh_009', 'org_contoso'],
    ['Jira Cloud', 'Atlassian', 'project_management', 'connected', 'https://contoso.atlassian.net', 'api_key', 'daily', '2024-03-15', 150, 134, 'ATATT3x_jira_010', 'contoso.atlassian.net'],
    ['Adobe Creative Cloud', 'Adobe', 'design', 'connected', 'https://ims-na1.adobelogin.com/ims', 'oauth2', 'weekly', '2024-05-01', 50, 48, 'client_adobe_011', 'org_adobe_001'],
    ['Okta', 'Okta', 'identity', 'connected', 'https://contoso.okta.com/api/v1', 'api_key', 'realtime', '2024-01-10', 750, 712, 'token_okta_012', 'contoso.okta.com'],
    ['Dropbox Business', 'Dropbox', 'storage', 'disconnected', 'https://api.dropboxapi.com/2', 'oauth2', 'daily', null, 0, 0, '', ''],
    ['ServiceNow', 'ServiceNow', 'itsm', 'disconnected', 'https://contoso.service-now.com/api', 'oauth2', 'daily', null, 0, 0, '', ''],
    ['Microsoft Intune', 'Microsoft', 'endpoint_management', 'connected', 'https://graph.microsoft.com/v1.0/deviceManagement', 'oauth2', 'hourly', '2024-01-15', 300, 285, 'client_intune_015', 'tenant_contoso_001'],
    ['Crowdstrike Falcon', 'CrowdStrike', 'security', 'connected', 'https://api.crowdstrike.com', 'api_key', 'realtime', '2024-06-01', 500, 412, 'client_cs_016', 'us-2.crowdstrike.com'],
    ['Datadog', 'Datadog', 'monitoring', 'connected', 'https://api.datadoghq.com/api/v1', 'api_key', 'realtime', '2024-03-20', 0, 0, 'api_dd_017', 'us3.datadoghq.com'],
    ['Workday', 'Workday', 'hr', 'disconnected', 'https://wd2-impl-services1.workday.com/ccx/api', 'oauth2', 'daily', null, 0, 0, '', ''],
  ];
  const insert = db.prepare(`INSERT INTO cloud_integrations (name, provider, type, status, api_endpoint, auth_type, sync_frequency, last_sync, licenses_discovered, users_synced, client_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  integrationsData.forEach(row => insert.run(...row));
  res.json({ message: 'Integrations reseeded successfully', count: integrationsData.length });
});

module.exports = router;
