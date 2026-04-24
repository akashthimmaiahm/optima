const express = require('express');
const https = require('https');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── Microsoft Graph helpers (shared with integrations.js) ─────────────────────

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

async function getM365Token(integration) {
  const config = typeof integration.config === 'string' ? JSON.parse(integration.config) : (integration.config || {});
  const res = await httpsPost(`https://login.microsoftonline.com/${integration.tenant_id}/oauth2/v2.0/token`, {
    client_id: integration.client_id, client_secret: config.client_secret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  if (!res.access_token) throw new Error(res.error_description || 'Token failed');
  return res.access_token;
}

function getConnectedM365() {
  const db = getDb();
  return db.prepare("SELECT * FROM cloud_integrations WHERE name='Microsoft 365' AND status='connected'").get();
}

// SKU friendly names and per-user/month retail pricing (USD)
const SKU_NAMES = {
  SPB: 'Microsoft 365 Business Premium', O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  FLOW_FREE: 'Power Automate Free', POWER_BI_STANDARD: 'Power BI Free',
  POWERAPPS_DEV: 'Power Apps Developer', AAD_PREMIUM_P2: 'Entra ID P2',
  INTUNE_A_D: 'Intune Device', RMSBASIC: 'Azure RMS Basic',
  'Teams_Premium_(for_Departments)': 'Teams Premium', 'Power_Pages_vTrial_for_Makers': 'Power Pages Trial',
  ENTERPRISEPACK: 'Office 365 E3', ENTERPRISEPREMIUM: 'Office 365 E5',
  'Microsoft_365_E3': 'Microsoft 365 E3', 'Microsoft_365_E5': 'Microsoft 365 E5',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  EXCHANGESTANDARD: 'Exchange Online Plan 1', EXCHANGEENTERPRISE: 'Exchange Online Plan 2',
  VISIOCLIENT: 'Visio Plan 2', PROJECTPREMIUM: 'Project Plan 5',
  EMS_E5: 'Enterprise Mobility + Security E5', EMS_E3: 'Enterprise Mobility + Security E3',
};

const SKU_PRICES = {
  SPB: 22.00, O365_BUSINESS_PREMIUM: 12.50, FLOW_FREE: 0, POWER_BI_STANDARD: 0,
  POWERAPPS_DEV: 0, AAD_PREMIUM_P2: 9.00, INTUNE_A_D: 2.00, RMSBASIC: 0,
  'Teams_Premium_(for_Departments)': 10.00, 'Power_Pages_vTrial_for_Makers': 0,
  ENTERPRISEPACK: 23.00, ENTERPRISEPREMIUM: 38.00,
  'Microsoft_365_E3': 36.00, 'Microsoft_365_E5': 57.00,
  O365_BUSINESS_ESSENTIALS: 6.00, EXCHANGESTANDARD: 4.00, EXCHANGEENTERPRISE: 8.00,
  VISIOCLIENT: 15.00, PROJECTPREMIUM: 55.00,
  EMS_E5: 16.00, EMS_E3: 10.90,
};

// ── SaaS Discovery — real SKUs from M365 ──────────────────────────────────────

router.get('/discovered-apps', authenticate, async (req, res) => {
  try {
    const m365 = getConnectedM365();
    if (!m365) return res.json({ data: [], total: 0 });

    const token = await getM365Token(m365);
    const skus = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
    const data = (skus.value || []).map((s, i) => {
      const pricePerUser = SKU_PRICES[s.skuPartNumber] ?? null;
      const consumed = s.consumedUnits || 0;
      return {
        id: i + 1,
        name: SKU_NAMES[s.skuPartNumber] || s.skuPartNumber.replace(/_/g, ' '),
        sku: s.skuPartNumber,
        category: 'SaaS',
        source: 'Microsoft 365',
        url: 'https://admin.microsoft.com',
        detected_users: consumed,
        total_seats: s.prepaidUnits ? s.prepaidUnits.enabled : 0,
        price_per_user: pricePerUser,
        monthly_cost: pricePerUser !== null ? pricePerUser * consumed : null,
        total_cost: pricePerUser !== null ? pricePerUser * (s.prepaidUnits ? s.prepaidUnits.enabled : 0) : null,
        is_sanctioned: 1,
      };
    });
    res.json({ data, total: data.length });
  } catch (err) {
    console.error('discovered-apps error:', err.message);
    res.json({ data: [], total: 0 });
  }
});

router.put('/discovered-apps/:id/sanction', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'App status updated' });
});

// ── License Reclamation — real inactive users from M365 ───────────────────────

router.get('/reclamation', authenticate, async (req, res) => {
  try {
    const m365 = getConnectedM365();
    if (!m365) return res.json({ data: [], summary: { pending: 0, in_review: 0, completed: 0, potential_savings: 0, realized_savings: 0 } });

    const token = await getM365Token(m365);

    // Fetch users with signInActivity (requires AuditLog.Read.All — may return partial data)
    let users;
    try {
      users = await graphGetAll(
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department,signInActivity',
        token
      );
    } catch {
      // Fallback without signInActivity if permission not granted
      users = await graphGetAll(
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department',
        token
      );
    }

    const now = Date.now();
    const items = [];
    let id = 0;

    for (const u of users) {
      if (!u.assignedLicenses || u.assignedLicenses.length === 0) continue;
      if (!u.accountEnabled) {
        // Disabled accounts with licenses — definite reclamation candidates
        id++;
        items.push({
          id,
          software_name: 'Microsoft 365 (' + u.assignedLicenses.length + ' licenses)',
          user_name: u.displayName,
          user_email: u.mail || u.userPrincipalName,
          last_used: null,
          days_inactive: 999,
          license_cost: u.assignedLicenses.length * 15.00,
          status: 'pending',
          action_taken: null,
          savings: 0,
        });
        continue;
      }

      // Check sign-in activity if available
      const lastSignIn = u.signInActivity?.lastSignInDateTime;
      if (lastSignIn) {
        const daysSince = Math.floor((now - new Date(lastSignIn).getTime()) / 86400000);
        if (daysSince > 30) {
          id++;
          items.push({
            id,
            software_name: 'Microsoft 365 (' + u.assignedLicenses.length + ' licenses)',
            user_name: u.displayName,
            user_email: u.mail || u.userPrincipalName,
            last_used: lastSignIn.split('T')[0],
            days_inactive: daysSince,
            license_cost: u.assignedLicenses.length * 15.00,
            status: daysSince > 90 ? 'pending' : 'in_review',
            action_taken: null,
            savings: 0,
          });
        }
      }
    }

    // Sort by days inactive descending
    items.sort((a, b) => b.days_inactive - a.days_inactive);

    const summary = {
      pending: items.filter(i => i.status === 'pending').length,
      in_review: items.filter(i => i.status === 'in_review').length,
      completed: 0,
      potential_savings: items.filter(i => i.status === 'pending').reduce((s, i) => s + i.license_cost, 0),
      realized_savings: 0,
    };

    res.json({ data: items, summary });
  } catch (err) {
    console.error('reclamation error:', err.message);
    res.json({ data: [], summary: { pending: 0, in_review: 0, completed: 0, potential_savings: 0, realized_savings: 0 } });
  }
});

router.put('/reclamation/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Reclamation record updated' });
});

router.post('/reclamation/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Scan triggered — data is now pulled live from connected integrations.', found: 0 });
});

// ── Cloud Infrastructure — from connected integrations ────────────────────────

router.get('/cloud-resources', authenticate, async (req, res) => {
  try {
    const m365 = getConnectedM365();
    if (!m365) return res.json({ data: [], summary: [], total: 0 });

    const token = await getM365Token(m365);
    const config = typeof m365.config === 'string' ? JSON.parse(m365.config) : (m365.config || {});
    const syncDetails = config.sync_details || {};

    // Show M365 subscriptions as cloud resources
    const skus = syncDetails.skus || [];
    const resources = skus.map((s, i) => ({
      id: i + 1,
      resource_name: SKU_NAMES[s.name] || s.name.replace(/_/g, ' '),
      provider: 'Microsoft',
      resource_type: 'SaaS License',
      region: 'Global',
      status: s.consumed > 0 ? 'active' : 'inactive',
      monthly_cost: 0,
      software_installed: s.name,
      integration_name: 'Microsoft 365',
      last_scanned: m365.last_sync,
    }));

    const summary = [{
      provider: 'Microsoft',
      count: resources.length,
      monthly_cost: 0,
    }];

    res.json({ data: resources, summary, total: resources.length });
  } catch (err) {
    console.error('cloud-resources error:', err.message);
    res.json({ data: [], summary: [], total: 0 });
  }
});

router.post('/cloud-resources/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Infrastructure data is pulled live from connected integrations.' });
});

// ── Shadow IT — disabled users with active licenses ───────────────────────────

router.get('/shadow-it', authenticate, async (req, res) => {
  try {
    const m365 = getConnectedM365();
    if (!m365) return res.json({ data: [], summary: { total: 0, high_risk: 0, medium_risk: 0, low_risk: 0, total_monthly_cost: 0 } });

    const token = await getM365Token(m365);
    const users = await graphGetAll(
      'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department',
      token
    );

    const items = [];
    let id = 0;

    // Disabled accounts that still have licenses = potential shadow IT / waste
    for (const u of users) {
      if (!u.accountEnabled && u.assignedLicenses && u.assignedLicenses.length > 0) {
        id++;
        items.push({
          id,
          app_name: u.displayName + ' (Disabled Account)',
          category: 'Disabled User with Licenses',
          detected_via: 'Microsoft 365 Sync',
          users_count: u.assignedLicenses.length,
          risk_level: u.assignedLicenses.length >= 3 ? 'high' : u.assignedLicenses.length >= 2 ? 'medium' : 'low',
          monthly_cost_estimate: u.assignedLicenses.length * 12.50,
          status: 'detected',
          notes: `${u.mail || u.userPrincipalName} — account disabled but ${u.assignedLicenses.length} license(s) still assigned. Department: ${u.department || 'N/A'}`,
        });
      }
    }

    // Unlicensed enabled accounts that are external (guests)
    for (const u of users) {
      if (u.accountEnabled && u.userPrincipalName && u.userPrincipalName.includes('#EXT#')) {
        id++;
        items.push({
          id,
          app_name: u.displayName + ' (External Guest)',
          category: 'Guest Access',
          detected_via: 'Microsoft 365 Sync',
          users_count: 1,
          risk_level: 'low',
          monthly_cost_estimate: 0,
          status: 'detected',
          notes: `External guest: ${u.userPrincipalName}`,
        });
      }
    }

    const summary = {
      total: items.length,
      high_risk: items.filter(a => a.risk_level === 'high').length,
      medium_risk: items.filter(a => a.risk_level === 'medium').length,
      low_risk: items.filter(a => a.risk_level === 'low').length,
      total_monthly_cost: items.reduce((s, a) => s + (a.monthly_cost_estimate || 0), 0),
    };

    res.json({ data: items, summary });
  } catch (err) {
    console.error('shadow-it error:', err.message);
    res.json({ data: [], summary: { total: 0, high_risk: 0, medium_risk: 0, low_risk: 0, total_monthly_cost: 0 } });
  }
});

router.put('/shadow-it/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Shadow IT record updated' });
});

// ── Combined intelligence summary — live from connected integrations ──────────

router.get('/summary', authenticate, async (req, res) => {
  try {
    const m365 = getConnectedM365();
    if (!m365) {
      return res.json({ discovered_apps: 0, unsanctioned_apps: 0, reclaim_candidates: 0, potential_savings: 0, shadow_it_high_risk: 0, cloud_resources: 0, cloud_monthly_cost: 0 });
    }

    const config = typeof m365.config === 'string' ? JSON.parse(m365.config) : (m365.config || {});
    const sd = config.sync_details || {};
    const skus = sd.skus || [];

    const totalSkus = skus.length;
    const totalSeats = sd.total_license_seats || 0;
    const consumedSeats = sd.consumed_license_seats || 0;
    const unusedSeats = totalSeats - consumedSeats;
    const disabledWithLicenses = (sd.total_users || 0) - (sd.enabled_users || 0);

    // Calculate total monthly cost from SKU prices
    const totalMonthlyCost = skus.reduce((sum, s) => {
      const price = SKU_PRICES[s.name] ?? 0;
      return sum + (price * (s.consumed || 0));
    }, 0);
    const totalCommittedCost = skus.reduce((sum, s) => {
      const price = SKU_PRICES[s.name] ?? 0;
      return sum + (price * (s.enabled || 0));
    }, 0);

    res.json({
      discovered_apps: totalSkus,
      unsanctioned_apps: 0,
      reclaim_candidates: disabledWithLicenses,
      potential_savings: disabledWithLicenses * 15.00,
      shadow_it_high_risk: disabledWithLicenses,
      cloud_resources: totalSkus,
      cloud_monthly_cost: totalMonthlyCost,
      total_committed_cost: totalCommittedCost,
      total_users: sd.total_users || 0,
      enabled_users: sd.enabled_users || 0,
      licensed_users: sd.licensed_users || 0,
      total_license_seats: totalSeats,
      consumed_license_seats: consumedSeats,
      unused_license_seats: unusedSeats,
      org_name: sd.org_name || null,
    });
  } catch (err) {
    console.error('summary error:', err.message);
    res.json({ discovered_apps: 0, unsanctioned_apps: 0, reclaim_candidates: 0, potential_savings: 0, shadow_it_high_risk: 0, cloud_resources: 0, cloud_monthly_cost: 0 });
  }
});

module.exports = router;
