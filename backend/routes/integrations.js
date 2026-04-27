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

// ── AWS IAM/EC2 sync helper ──────────────────────────────────────────────────

const AWS_ALL_REGIONS = [
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-north-1','eu-south-1',
  'ap-south-1','ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-northeast-2','ap-northeast-3','ap-east-1',
  'sa-east-1','ca-central-1','me-south-1','af-south-1',
];

async function syncAWS(integration) {
  const config = typeof integration.config === 'string' ? JSON.parse(integration.config) : (integration.config || {});
  const accessKeyId = integration.client_id;
  const secretAccessKey = config.client_secret;
  const region = config.region || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) throw new Error('Missing Access Key ID or Secret Access Key');

  const credentials = { accessKeyId, secretAccessKey };

  // IAM is global — fetch users, roles, policies
  const { IAMClient, ListUsersCommand, ListRolesCommand, ListPoliciesCommand, ListAccessKeysCommand, ListMFADevicesCommand } = require('@aws-sdk/client-iam');
  const iamClient = new IAMClient({ region: 'us-east-1', credentials });

  const [usersResp, rolesResp, policiesResp] = await Promise.all([
    iamClient.send(new ListUsersCommand({ MaxItems: 1000 })),
    iamClient.send(new ListRolesCommand({ MaxItems: 1000 })),
    iamClient.send(new ListPoliciesCommand({ Scope: 'Local', MaxItems: 1000 })),
  ]);

  const iamUsers = usersResp.Users || [];
  const iamRoles = rolesResp.Roles || [];
  const iamPolicies = policiesResp.Policies || [];

  // Enrich users with access keys and MFA
  const enrichedUsers = await Promise.all(iamUsers.slice(0, 100).map(async (u) => {
    try {
      const [keysResp, mfaResp] = await Promise.all([
        iamClient.send(new ListAccessKeysCommand({ UserName: u.UserName })),
        iamClient.send(new ListMFADevicesCommand({ UserName: u.UserName })),
      ]);
      return {
        name: u.UserName,
        arn: u.Arn,
        created: u.CreateDate,
        password_last_used: u.PasswordLastUsed || null,
        access_keys: (keysResp.AccessKeyMetadata || []).length,
        mfa_enabled: (mfaResp.MFADevices || []).length > 0,
      };
    } catch {
      return { name: u.UserName, arn: u.Arn, created: u.CreateDate };
    }
  }));

  // EC2 instances — across selected region(s)
  const { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
  let regionsToScan = [region];
  if (region === 'all' || region === 'All Regions') {
    try {
      const ec2 = new EC2Client({ region: 'us-east-1', credentials });
      const regResp = await ec2.send(new DescribeRegionsCommand({}));
      regionsToScan = (regResp.Regions || []).map(r => r.RegionName);
    } catch {
      regionsToScan = AWS_ALL_REGIONS;
    }
  }

  const allInstances = [];
  await Promise.all(regionsToScan.map(async (r) => {
    try {
      const ec2 = new EC2Client({ region: r, credentials });
      const resp = await ec2.send(new DescribeInstancesCommand({ MaxResults: 500 }));
      for (const reservation of (resp.Reservations || [])) {
        for (const inst of (reservation.Instances || [])) {
          const nameTag = (inst.Tags || []).find(t => t.Key === 'Name');
          allInstances.push({
            id: inst.InstanceId,
            name: nameTag ? nameTag.Value : inst.InstanceId,
            type: inst.InstanceType,
            state: inst.State ? inst.State.Name : 'unknown',
            region: r,
            az: inst.Placement ? inst.Placement.AvailabilityZone : r,
            public_ip: inst.PublicIpAddress || null,
            private_ip: inst.PrivateIpAddress || null,
            platform: inst.PlatformDetails || inst.Platform || 'Linux',
            launch_time: inst.LaunchTime,
          });
        }
      }
    } catch {}
  }));

  // S3 buckets (global)
  let buckets = [];
  try {
    const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'us-east-1', credentials });
    const resp = await s3.send(new ListBucketsCommand({}));
    buckets = (resp.Buckets || []).map(b => ({ name: b.Name, created: b.CreationDate }));
  } catch {}

  return {
    users_synced: iamUsers.length,
    licenses_discovered: allInstances.length,
    sync_details: {
      iam_users: enrichedUsers,
      iam_roles: iamRoles.map(r => ({ name: r.RoleName, arn: r.Arn, created: r.CreateDate })),
      iam_policies: iamPolicies.map(p => ({ name: p.PolicyName, arn: p.Arn, attachments: p.AttachmentCount })),
      ec2_instances: allInstances,
      s3_buckets: buckets,
      total_iam_users: iamUsers.length,
      total_iam_roles: iamRoles.length,
      total_iam_policies: iamPolicies.length,
      total_ec2_instances: allInstances.length,
      total_s3_buckets: buckets.length,
      regions_scanned: regionsToScan,
      running_instances: allInstances.filter(i => i.state === 'running').length,
      stopped_instances: allInstances.filter(i => i.state === 'stopped').length,
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

// Update payment/billing info for an integration
router.put('/:id/payment', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { payment_card, payment_method, billing_cycle, next_payment_date, billing_email, monthly_budget } = req.body;
  db.prepare(`UPDATE cloud_integrations SET payment_card=?, payment_method=?, billing_cycle=?, next_payment_date=?, billing_email=?, monthly_budget=?, updated_at=datetime('now') WHERE id=?`)
    .run(payment_card, payment_method || 'credit_card', billing_cycle || 'monthly', next_payment_date, billing_email, monthly_budget, req.params.id);
  res.json({ message: 'Payment info updated' });
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
    } else if (integration.name === 'AWS IAM') {
      result = await syncAWS(integration);
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
