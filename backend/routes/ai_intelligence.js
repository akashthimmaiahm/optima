const express = require('express');
const https = require('https');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// ── Graph helpers ─────────────────────────────────────────────────────────────

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

const SKU_PRICES = {
  SPB: 22.00, O365_BUSINESS_PREMIUM: 12.50, FLOW_FREE: 0, POWER_BI_STANDARD: 0,
  POWERAPPS_DEV: 0, AAD_PREMIUM_P2: 9.00, INTUNE_A_D: 2.00, RMSBASIC: 0,
  'Teams_Premium_(for_Departments)': 10.00, 'Power_Pages_vTrial_for_Makers': 0,
  ENTERPRISEPACK: 23.00, ENTERPRISEPREMIUM: 38.00,
};

const SKU_NAMES = {
  SPB: 'Microsoft 365 Business Premium', O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  FLOW_FREE: 'Power Automate Free', POWER_BI_STANDARD: 'Power BI Free',
  'Teams_Premium_(for_Departments)': 'Teams Premium', ENTERPRISEPACK: 'Office 365 E3',
};

// ── Generate real-time anomalies from M365 data ──────────────────────────────

router.get('/anomalies', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const m365 = db.prepare("SELECT * FROM cloud_integrations WHERE name='Microsoft 365' AND status='connected'").get();
    if (!m365) return res.json({ anomalies: [], stats: { active: 0, critical: 0, total: 0, resolved: 0 } });

    const config = typeof m365.config === 'string' ? JSON.parse(m365.config) : (m365.config || {});
    const tokenRes = await httpsPost(`https://login.microsoftonline.com/${m365.tenant_id}/oauth2/v2.0/token`, {
      client_id: m365.client_id, client_secret: config.client_secret,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    });
    if (!tokenRes.access_token) throw new Error('Token failed');
    const token = tokenRes.access_token;

    // Fetch data in parallel
    const [users, skusRes, orgRes] = await Promise.all([
      graphGetAll('https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department,signInActivity', token),
      graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token),
      graphGet('https://graph.microsoft.com/v1.0/organization', token),
    ]);

    const skus = skusRes.value || [];
    const org = orgRes.value && orgRes.value[0];
    const anomalies = [];
    let id = 0;
    const now = Date.now();

    // 1. License capacity alerts
    for (const s of skus) {
      const enabled = s.prepaidUnits ? s.prepaidUnits.enabled : 0;
      const consumed = s.consumedUnits || 0;
      if (enabled === 0) continue;
      const pct = Math.round((consumed / enabled) * 100);
      const name = SKU_NAMES[s.skuPartNumber] || s.skuPartNumber.replace(/_/g, ' ');
      const price = SKU_PRICES[s.skuPartNumber] || 0;

      if (pct >= 100) {
        id++;
        anomalies.push({
          id, severity: 'critical', type: 'License Compliance', category: 'License', status: 'active',
          title: `${name} — Fully Consumed (${consumed}/${enabled})`,
          description: `All ${enabled} seats are in use. New users cannot be assigned this license until seats are freed or additional licenses are purchased.`,
          asset: name, detected: 'Now',
          action: `Purchase additional ${name} licenses or reclaim from inactive users.`,
          cost_impact: price > 0 ? `$${price}/user/month` : null,
        });
      } else if (pct >= 90) {
        id++;
        anomalies.push({
          id, severity: 'high', type: 'License Compliance', category: 'License', status: 'active',
          title: `${name} — Near Capacity (${consumed}/${enabled}, ${pct}%)`,
          description: `Only ${enabled - consumed} seats remaining. At current rate, capacity will be reached soon.`,
          asset: name, detected: 'Now',
          action: `Plan procurement for additional ${name} licenses. ${enabled - consumed} seats left.`,
          cost_impact: price > 0 ? `$${(price * 10).toFixed(0)}/mo for 10 more seats` : null,
        });
      }

      // Underutilization alert
      if (price > 0 && pct < 50 && consumed > 0) {
        const waste = (enabled - consumed) * price;
        id++;
        anomalies.push({
          id, severity: 'medium', type: 'License Optimization', category: 'Cost', status: 'active',
          title: `${name} — Low Utilization (${pct}%, ${consumed}/${enabled})`,
          description: `${enabled - consumed} unused seats costing ~$${waste.toFixed(0)}/month. Consider reducing license count at next renewal.`,
          asset: name, detected: 'Now',
          action: `Review if ${enabled} seats are needed. Potential savings: $${waste.toFixed(0)}/month by right-sizing.`,
          cost_impact: `$${waste.toFixed(0)}/month wasted`,
        });
      }
    }

    // 2. Disabled accounts with active licenses
    const disabledWithLicenses = users.filter(u => !u.accountEnabled && u.assignedLicenses && u.assignedLicenses.length > 0);
    if (disabledWithLicenses.length > 0) {
      const totalWaste = disabledWithLicenses.reduce((s, u) => s + u.assignedLicenses.length * 15, 0);
      id++;
      anomalies.push({
        id, severity: 'high', type: 'Inactive Users', category: 'Cost', status: 'active',
        title: `${disabledWithLicenses.length} Disabled Accounts Still Have Active Licenses`,
        description: `${disabledWithLicenses.slice(0, 5).map(u => u.displayName).join(', ')}${disabledWithLicenses.length > 5 ? ` and ${disabledWithLicenses.length - 5} more` : ''} — accounts are disabled but licenses remain assigned, costing ~$${totalWaste}/month.`,
        asset: 'Microsoft 365 User Licenses', detected: 'Now',
        action: 'Remove license assignments from disabled accounts to reclaim seats and reduce costs.',
        cost_impact: `$${totalWaste}/month`,
      });
    }

    // 3. External guests count
    const guests = users.filter(u => u.userPrincipalName && u.userPrincipalName.includes('#EXT#'));
    if (guests.length > 20) {
      id++;
      anomalies.push({
        id, severity: 'medium', type: 'Security', category: 'Security', status: 'active',
        title: `${guests.length} External Guest Users in Directory`,
        description: `Your tenant has ${guests.length} external/guest user accounts. Review periodically to ensure only authorized collaborators have access.`,
        asset: `${org ? org.displayName : 'Tenant'} Azure AD`, detected: 'Now',
        action: 'Audit guest accounts quarterly. Remove guests who no longer need access.',
        cost_impact: null,
      });
    }

    // 4. Users with excessive licenses
    const overLicensed = users.filter(u => u.accountEnabled && u.assignedLicenses && u.assignedLicenses.length >= 4);
    if (overLicensed.length > 0) {
      id++;
      anomalies.push({
        id, severity: 'low', type: 'License Optimization', category: 'License', status: 'active',
        title: `${overLicensed.length} Users with 4+ License Assignments`,
        description: `${overLicensed.slice(0, 5).map(u => `${u.displayName} (${u.assignedLicenses.length})`).join(', ')}${overLicensed.length > 5 ? ` and ${overLicensed.length - 5} more` : ''} — users with many licenses may have overlapping capabilities.`,
        asset: 'Microsoft 365 User Licenses', detected: 'Now',
        action: 'Review license assignments for overlap. E.g., Business Premium includes most features of standalone plans.',
        cost_impact: null,
      });
    }

    // 5. Departments with no licensed users
    const deptMap = {};
    users.filter(u => u.accountEnabled && u.department).forEach(u => {
      if (!deptMap[u.department]) deptMap[u.department] = { total: 0, licensed: 0 };
      deptMap[u.department].total++;
      if (u.assignedLicenses && u.assignedLicenses.length > 0) deptMap[u.department].licensed++;
    });
    const unlicensedDepts = Object.entries(deptMap).filter(([, v]) => v.licensed === 0 && v.total >= 3);
    if (unlicensedDepts.length > 0) {
      id++;
      anomalies.push({
        id, severity: 'low', type: 'License Coverage', category: 'License', status: 'active',
        title: `${unlicensedDepts.length} Department(s) with No Licensed Users`,
        description: `${unlicensedDepts.map(([name, v]) => `${name} (${v.total} users)`).join(', ')} — all users in these departments have no M365 licenses assigned.`,
        asset: 'Microsoft 365', detected: 'Now',
        action: 'Verify if these departments need licenses or are using alternative tools.',
        cost_impact: null,
      });
    }

    // Sort: critical first, then high, medium, low
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    anomalies.sort((a, b) => (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9));

    const stats = {
      active: anomalies.filter(a => a.status === 'active').length,
      critical: anomalies.filter(a => a.severity === 'critical').length,
      total: anomalies.length,
      resolved: 0,
    };

    res.json({ anomalies, stats });
  } catch (err) {
    console.error('AI Intelligence error:', err.message);
    res.json({ anomalies: [], stats: { active: 0, critical: 0, total: 0, resolved: 0 }, error: err.message });
  }
});

module.exports = router;
