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

// EC2 monthly cost lookup
const EC2_MONTHLY_COST = {
  't2.nano': 4.18, 't2.micro': 8.35, 't2.small': 16.79, 't2.medium': 33.58, 't2.large': 67.16,
  't3.nano': 3.80, 't3.micro': 7.59, 't3.small': 15.18, 't3.medium': 30.37, 't3.large': 60.74,
  't3a.nano': 3.43, 't3a.micro': 6.86, 't3a.small': 13.72, 't3a.medium': 27.45, 't3a.large': 54.90,
  'm5.large': 70.08, 'm5.xlarge': 140.16, 'm5.2xlarge': 280.32, 'm5.4xlarge': 560.64,
  'm5a.large': 63.07, 'm5a.xlarge': 126.14, 'm5a.2xlarge': 252.29,
  'm6i.large': 70.08, 'm6i.xlarge': 140.16, 'm6i.2xlarge': 280.32,
  'c5.large': 62.05, 'c5.xlarge': 124.10, 'c5.2xlarge': 248.20,
  'c6i.large': 62.05, 'c6i.xlarge': 124.10,
  'r5.large': 91.98, 'r5.xlarge': 183.96, 'r5.2xlarge': 367.92,
  'g4dn.xlarge': 383.25, 'g4dn.2xlarge': 546.25, 'g5.xlarge': 779.34,
  'p3.2xlarge': 2233.66,
};

// ── Helper: get all connected integrations ───────────────────────────────────

function getAllConnectedIntegrations() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
  return rows.map(r => {
    try { r.config = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {}); } catch { r.config = {}; }
    return r;
  });
}

// ── M365 anomaly generation ──────────────────────────────────────────────────

async function generateM365Anomalies(integration) {
  const config = integration.config || {};
  const tokenRes = await httpsPost(`https://login.microsoftonline.com/${integration.tenant_id}/oauth2/v2.0/token`, {
    client_id: integration.client_id, client_secret: config.client_secret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  if (!tokenRes.access_token) throw new Error('M365 token failed');
  const token = tokenRes.access_token;

  const [users, skusRes, orgRes] = await Promise.all([
    graphGetAll('https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department,signInActivity', token),
    graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token),
    graphGet('https://graph.microsoft.com/v1.0/organization', token),
  ]);

  const skus = skusRes.value || [];
  const org = orgRes.value && orgRes.value[0];
  const anomalies = [];

  // 1. License capacity alerts
  for (const s of skus) {
    const enabled = s.prepaidUnits ? s.prepaidUnits.enabled : 0;
    const consumed = s.consumedUnits || 0;
    if (enabled === 0) continue;
    const pct = Math.round((consumed / enabled) * 100);
    const name = SKU_NAMES[s.skuPartNumber] || s.skuPartNumber.replace(/_/g, ' ');
    const price = SKU_PRICES[s.skuPartNumber] || 0;

    if (pct >= 100) {
      anomalies.push({
        severity: 'critical', type: 'License Compliance', category: 'License', status: 'active',
        source: 'Microsoft 365',
        title: `${name} — Fully Consumed (${consumed}/${enabled})`,
        description: `All ${enabled} seats are in use. New users cannot be assigned this license until seats are freed or additional licenses are purchased.`,
        asset: name, detected: 'Now',
        action: `Purchase additional ${name} licenses or reclaim from inactive users.`,
        cost_impact: price > 0 ? `$${price}/user/month` : null,
      });
    } else if (pct >= 90) {
      anomalies.push({
        severity: 'high', type: 'License Compliance', category: 'License', status: 'active',
        source: 'Microsoft 365',
        title: `${name} — Near Capacity (${consumed}/${enabled}, ${pct}%)`,
        description: `Only ${enabled - consumed} seats remaining. At current rate, capacity will be reached soon.`,
        asset: name, detected: 'Now',
        action: `Plan procurement for additional ${name} licenses. ${enabled - consumed} seats left.`,
        cost_impact: price > 0 ? `$${(price * 10).toFixed(0)}/mo for 10 more seats` : null,
      });
    }

    if (price > 0 && pct < 50 && consumed > 0) {
      const waste = (enabled - consumed) * price;
      anomalies.push({
        severity: 'medium', type: 'License Optimization', category: 'Cost', status: 'active',
        source: 'Microsoft 365',
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
    anomalies.push({
      severity: 'high', type: 'Inactive Users', category: 'Cost', status: 'active',
      source: 'Microsoft 365',
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
    anomalies.push({
      severity: 'medium', type: 'Security', category: 'Security', status: 'active',
      source: 'Microsoft 365',
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
    anomalies.push({
      severity: 'low', type: 'License Optimization', category: 'License', status: 'active',
      source: 'Microsoft 365',
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
    anomalies.push({
      severity: 'low', type: 'License Coverage', category: 'License', status: 'active',
      source: 'Microsoft 365',
      title: `${unlicensedDepts.length} Department(s) with No Licensed Users`,
      description: `${unlicensedDepts.map(([name, v]) => `${name} (${v.total} users)`).join(', ')} — all users in these departments have no M365 licenses assigned.`,
      asset: 'Microsoft 365', detected: 'Now',
      action: 'Verify if these departments need licenses or are using alternative tools.',
      cost_impact: null,
    });
  }

  return anomalies;
}

// ── AWS anomaly generation ───────────────────────────────────────────────────

function generateAWSAnomalies(integration) {
  const sd = integration.config?.sync_details || {};
  const anomalies = [];
  const providerName = integration.name || 'AWS';

  const ec2Instances = sd.ec2_instances || [];
  const s3Buckets = sd.s3_buckets || [];
  const iamUsers = sd.iam_users || [];
  const iamRoles = sd.iam_roles || [];

  // 1. IAM users without MFA — critical security risk
  const noMFA = iamUsers.filter(u => !u.mfa_enabled);
  if (noMFA.length > 0) {
    anomalies.push({
      severity: 'critical', type: 'Security', category: 'Security', status: 'active',
      source: providerName,
      title: `${noMFA.length} IAM User(s) Without MFA Enabled`,
      description: `${noMFA.slice(0, 5).map(u => u.user_name || u.UserName).join(', ')}${noMFA.length > 5 ? ` and ${noMFA.length - 5} more` : ''} — IAM users without multi-factor authentication are a critical security risk. Compromised credentials can lead to full account takeover.`,
      asset: `${providerName} IAM`, detected: 'Now',
      action: 'Enable MFA for all IAM users immediately. Use virtual MFA devices or hardware keys.',
      cost_impact: null,
    });
  }

  // 2. IAM users with multiple access keys — high risk
  const multiKeys = iamUsers.filter(u => (u.access_keys || 0) > 1);
  if (multiKeys.length > 0) {
    anomalies.push({
      severity: 'high', type: 'Security', category: 'Security', status: 'active',
      source: providerName,
      title: `${multiKeys.length} IAM User(s) with Multiple Access Keys`,
      description: `${multiKeys.slice(0, 5).map(u => u.user_name || u.UserName).join(', ')}${multiKeys.length > 5 ? ` and ${multiKeys.length - 5} more` : ''} — users should have at most one active access key. Multiple keys increase the attack surface.`,
      asset: `${providerName} IAM`, detected: 'Now',
      action: 'Rotate and remove unused access keys. Each user should have only one active key.',
      cost_impact: null,
    });
  }

  // 3. Root account access keys (if detectable)
  const rootUser = iamUsers.find(u => (u.user_name || u.UserName) === '<root_account>' || (u.user_name || u.UserName) === 'root');
  if (rootUser && (rootUser.access_keys || 0) > 0) {
    anomalies.push({
      severity: 'critical', type: 'Security', category: 'Security', status: 'active',
      source: providerName,
      title: 'Root Account Has Active Access Keys',
      description: 'The AWS root account has active access keys. This is a critical security risk. Root access keys should be deleted and IAM users used instead.',
      asset: `${providerName} Root Account`, detected: 'Now',
      action: 'Delete root account access keys immediately. Use IAM users with least-privilege policies.',
      cost_impact: null,
    });
  }

  // 4. Stopped EC2 instances (still incur EBS costs)
  const stoppedInstances = ec2Instances.filter(i => i.state === 'stopped');
  if (stoppedInstances.length > 0) {
    const ebsCostEstimate = stoppedInstances.length * 8; // ~$8/month per stopped instance EBS
    anomalies.push({
      severity: 'medium', type: 'Cost Optimization', category: 'Cost', status: 'active',
      source: providerName,
      title: `${stoppedInstances.length} Stopped EC2 Instance(s) Still Incurring Costs`,
      description: `${stoppedInstances.slice(0, 5).map(i => i.instance_id || i.InstanceId).join(', ')}${stoppedInstances.length > 5 ? ` and ${stoppedInstances.length - 5} more` : ''} — stopped instances still pay for attached EBS volumes (~$${ebsCostEstimate}/month estimated).`,
      asset: `${providerName} EC2`, detected: 'Now',
      action: 'Terminate unused stopped instances or snapshot and delete their EBS volumes to save costs.',
      cost_impact: `~$${ebsCostEstimate}/month`,
    });
  }

  // 5. Oversized EC2 instances (large/xlarge running)
  const largeInstances = ec2Instances.filter(i => i.state === 'running' && i.instance_type && (
    i.instance_type.includes('xlarge') || i.instance_type.includes('4xlarge') || i.instance_type.includes('8xlarge')
  ));
  if (largeInstances.length > 0) {
    const totalCost = largeInstances.reduce((s, i) => s + (EC2_MONTHLY_COST[i.instance_type] || 200), 0);
    anomalies.push({
      severity: 'medium', type: 'Cost Optimization', category: 'Cost', status: 'active',
      source: providerName,
      title: `${largeInstances.length} Large/XLarge EC2 Instance(s) Running`,
      description: `${largeInstances.slice(0, 5).map(i => `${i.instance_id || i.InstanceId} (${i.instance_type})`).join(', ')} — review if these instance sizes are justified. Right-sizing can save 30-50% on compute costs.`,
      asset: `${providerName} EC2`, detected: 'Now',
      action: 'Review CloudWatch CPU/memory metrics. Consider downsizing underutilized instances or switching to Graviton.',
      cost_impact: `$${totalCost.toFixed(0)}/month total for these instances`,
    });
  }

  // 6. EC2 instances without tags (governance risk)
  const untagged = ec2Instances.filter(i => !i.name && !i.Name);
  if (untagged.length > 2) {
    anomalies.push({
      severity: 'low', type: 'Governance', category: 'Compliance', status: 'active',
      source: providerName,
      title: `${untagged.length} EC2 Instance(s) Without Name Tags`,
      description: 'Untagged instances make cost allocation, ownership tracking, and incident response difficult.',
      asset: `${providerName} EC2`, detected: 'Now',
      action: 'Implement a tagging policy. At minimum, tag with Name, Environment, Owner, and CostCenter.',
      cost_impact: null,
    });
  }

  // 7. S3 bucket count advisory
  if (s3Buckets.length > 20) {
    anomalies.push({
      severity: 'low', type: 'Governance', category: 'Compliance', status: 'active',
      source: providerName,
      title: `${s3Buckets.length} S3 Buckets — Review for Unused Storage`,
      description: 'A high number of S3 buckets may include unused or orphaned data. Periodic review can reduce storage costs.',
      asset: `${providerName} S3`, detected: 'Now',
      action: 'Audit S3 buckets for empty or unused data. Enable lifecycle policies for cost optimization.',
      cost_impact: `~$${(s3Buckets.length * 2.30).toFixed(0)}/month estimated`,
    });
  }

  // 8. Total AWS spend alert
  const runningInstances = ec2Instances.filter(i => i.state === 'running');
  const totalEC2Cost = runningInstances.reduce((s, i) => s + (EC2_MONTHLY_COST[i.instance_type] || 50), 0);
  const totalS3Cost = s3Buckets.length * 2.30;
  const totalAWSCost = totalEC2Cost + totalS3Cost;
  if (totalAWSCost > 500) {
    anomalies.push({
      severity: 'medium', type: 'Cost Overview', category: 'Cost', status: 'active',
      source: providerName,
      title: `AWS Monthly Spend: ~$${totalAWSCost.toFixed(0)}/month`,
      description: `${runningInstances.length} running EC2 instances (~$${totalEC2Cost.toFixed(0)}/mo) and ${s3Buckets.length} S3 buckets (~$${totalS3Cost.toFixed(0)}/mo). Consider Reserved Instances or Savings Plans for 30-60% savings.`,
      asset: `${providerName} Infrastructure`, detected: 'Now',
      action: 'Evaluate Reserved Instances or Savings Plans for predictable workloads. Review instance utilization.',
      cost_impact: `$${totalAWSCost.toFixed(0)}/month`,
    });
  }

  return anomalies;
}

// ── Generate real-time anomalies from ALL integrations ───────────────────────

router.get('/anomalies', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    if (integrations.length === 0) {
      return res.json({ anomalies: [], stats: { active: 0, critical: 0, total: 0, resolved: 0 }, sources: [] });
    }

    const allAnomalies = [];
    const sources = [];
    const errors = [];

    // Process all integrations in parallel
    const promises = integrations.map(async (integ) => {
      const providerName = integ.name || integ.provider || 'Unknown';
      try {
        if (providerName.includes('Microsoft') || providerName.includes('M365') || providerName.includes('365')) {
          sources.push('Microsoft 365');
          const anomalies = await generateM365Anomalies(integ);
          allAnomalies.push(...anomalies);
        } else if (providerName.includes('AWS') || providerName.includes('Amazon')) {
          sources.push('AWS');
          const anomalies = generateAWSAnomalies(integ);
          allAnomalies.push(...anomalies);
        } else {
          sources.push(providerName);
          // Generic: check sync_details for any anomalies
          const sd = integ.config?.sync_details || {};
          if (Object.keys(sd).length === 0) {
            allAnomalies.push({
              severity: 'low', type: 'Integration', category: 'Compliance', status: 'active',
              source: providerName,
              title: `${providerName} — No Data Synced`,
              description: 'This integration is connected but has not synced any data yet.',
              asset: providerName, detected: 'Now',
              action: 'Trigger a manual sync or check integration credentials.',
              cost_impact: null,
            });
          }
        }
      } catch (err) {
        errors.push({ source: providerName, error: err.message });
      }
    });

    await Promise.all(promises);

    // Assign IDs and sort by severity
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allAnomalies.sort((a, b) => (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9));
    allAnomalies.forEach((a, i) => { a.id = i + 1; });

    const stats = {
      active: allAnomalies.filter(a => a.status === 'active').length,
      critical: allAnomalies.filter(a => a.severity === 'critical').length,
      total: allAnomalies.length,
      resolved: 0,
    };

    res.json({ anomalies: allAnomalies, stats, sources: [...new Set(sources)], errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error('AI Intelligence error:', err.message);
    res.json({ anomalies: [], stats: { active: 0, critical: 0, total: 0, resolved: 0 }, error: err.message });
  }
});

module.exports = router;
