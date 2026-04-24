const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

router.get('/stats', authenticate, (req, res) => {
  const db = getDb();

  const totalSoftware = db.prepare('SELECT COUNT(*) as count FROM software_assets').get().count;
  const totalHardware = db.prepare('SELECT COUNT(*) as count FROM hardware_assets').get().count;
  const totalLicenses = db.prepare('SELECT SUM(total_licenses) as total, SUM(used_licenses) as used FROM software_assets').get();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
  const expiringLicenses = db.prepare("SELECT COUNT(*) as count FROM software_assets WHERE expiry_date IS NOT NULL AND expiry_date <= date('now', '+90 days') AND expiry_date >= date('now')").get().count;
  const hardwareByStatus = db.prepare('SELECT status, COUNT(*) as count FROM hardware_assets GROUP BY status').all();
  const softwareByCategory = db.prepare('SELECT category, COUNT(*) as count FROM software_assets GROUP BY category ORDER BY count DESC').all();
  const recentAuditLogs = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10").all();
  const connectedIntegrations = db.prepare("SELECT COUNT(*) as count FROM cloud_integrations WHERE status = 'connected'").get().count;
  const totalContractValue = db.prepare("SELECT SUM(value) as total FROM contracts WHERE status = 'active'").get().total || 0;
  const expiringContracts = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE end_date <= date('now', '+90 days') AND status != 'expired'").get().count;
  const inRepairHardware = db.prepare("SELECT COUNT(*) as count FROM hardware_assets WHERE status = 'in_repair'").get().count;
  const licenseCompliance = totalLicenses.total > 0 ? Math.round((totalLicenses.used / totalLicenses.total) * 100) : 0;

  // ── COST OPTIMIZATION ──────────────────────────────────────────────────────

  const SKU_PRICES = {
    SPB: 22.00, O365_BUSINESS_PREMIUM: 12.50, FLOW_FREE: 0, POWER_BI_STANDARD: 0,
    POWERAPPS_DEV: 0, AAD_PREMIUM_P2: 9.00, INTUNE_A_D: 2.00, RMSBASIC: 0,
    'Teams_Premium_(for_Departments)': 10.00, 'Power_Pages_vTrial_for_Makers': 0,
    ENTERPRISEPACK: 23.00, ENTERPRISEPREMIUM: 38.00,
    'Microsoft_365_E3': 36.00, 'Microsoft_365_E5': 57.00,
    O365_BUSINESS_ESSENTIALS: 6.00, EXCHANGESTANDARD: 4.00, EXCHANGEENTERPRISE: 8.00,
    VISIOCLIENT: 15.00, PROJECTPREMIUM: 55.00, EMS_E5: 16.00, EMS_E3: 10.90,
  };

  // Total software spend (monthly) — local DB + integrated SaaS costs
  let softwareSpend = db.prepare(`
    SELECT SUM(total_licenses * cost_per_license) as total FROM software_assets WHERE cost_per_license > 0
  `).get().total || 0;

  // Add M365 license costs from integrated data
  let integrationSoftwareCost = 0;
  try {
    const integrations = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
    for (const integ of integrations) {
      let config = {};
      try { config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {}); } catch {}
      const sd = config.sync_details || {};
      const providerName = integ.name || integ.provider || '';
      if (providerName.includes('Microsoft') || providerName.includes('M365') || providerName.includes('365')) {
        const skus = sd.skus || [];
        for (const sku of skus) {
          const price = SKU_PRICES[sku.name] || 0;
          integrationSoftwareCost += price * (sku.consumed || 0);
        }
      }
    }
  } catch (e) {}
  softwareSpend += integrationSoftwareCost;

  // Total hardware value
  const hardwareValue = db.prepare(`
    SELECT SUM(purchase_cost) as total FROM hardware_assets WHERE status != 'retired' AND status != 'disposed'
  `).get().total || 0;

  // Monthly cloud infrastructure cost — read from connected integrations' sync_details
  let cloudCost = 0;
  let cloudResources = { ec2: 0, s3: 0, iamUsers: 0, iamRoles: 0, m365Users: 0, m365Licenses: 0 };
  let cloudProviders = [];
  try {
    const integrations = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
    for (const integ of integrations) {
      let config = {};
      try { config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {}); } catch {}
      const sd = config.sync_details || {};
      const providerName = integ.name || integ.provider || 'Unknown';

      if (providerName.includes('AWS') || providerName.includes('Amazon')) {
        cloudProviders.push('AWS');
        const ec2s = sd.ec2_instances || [];
        const s3s = sd.s3_buckets || [];
        cloudResources.ec2 += ec2s.length;
        cloudResources.s3 += s3s.length;
        cloudResources.iamUsers += (sd.iam_users || []).length;
        cloudResources.iamRoles += (sd.iam_roles || []).length;
        // EC2 cost estimation
        const EC2_COST = {
          't2.nano': 4.18, 't2.micro': 8.35, 't2.small': 16.79, 't2.medium': 33.58, 't2.large': 67.16,
          't3.nano': 3.80, 't3.micro': 7.59, 't3.small': 15.18, 't3.medium': 30.37, 't3.large': 60.74,
          'm5.large': 70.08, 'm5.xlarge': 140.16, 'm5.2xlarge': 280.32,
          'm6i.large': 70.08, 'm6i.xlarge': 140.16, 'c5.large': 62.05, 'c5.xlarge': 124.10,
          'r5.large': 91.98, 'r5.xlarge': 183.96, 'c6i.large': 62.05, 'm7i.large': 73.58,
        };
        for (const inst of ec2s) {
          if (inst.state === 'running') {
            cloudCost += EC2_COST[inst.instance_type] || 50;
          }
        }
        cloudCost += s3s.length * 2.30; // S3 estimate
      } else if (providerName.includes('Microsoft') || providerName.includes('M365') || providerName.includes('365')) {
        cloudProviders.push('Microsoft 365');
        const users = sd.users || [];
        const licenses = sd.subscribed_skus || [];
        cloudResources.m365Users += users.length;
        cloudResources.m365Licenses += licenses.reduce((s, l) => s + (l.consumedUnits || 0), 0);
        // M365 cost estimate: ~$12.50/user/month average
        cloudCost += users.filter(u => u.accountEnabled !== false).length * 12.50;
      } else {
        cloudProviders.push(providerName);
      }
    }
    cloudProviders = [...new Set(cloudProviders)];
  } catch (e) {}

  // Wasted license spend — underutilized (< 50% used) with cost
  const wastedLicenses = db.prepare(`
    SELECT name, vendor, total_licenses, used_licenses, cost_per_license,
      (total_licenses - used_licenses) * cost_per_license as wasted_cost,
      ROUND(used_licenses * 100.0 / total_licenses, 1) as utilization_pct
    FROM software_assets
    WHERE total_licenses > 0 AND cost_per_license > 0
      AND (used_licenses * 100.0 / total_licenses) < 70
    ORDER BY wasted_cost DESC
    LIMIT 6
  `).all();

  const totalWastedCost = wastedLicenses.reduce((s, r) => s + (r.wasted_cost || 0), 0);

  // License reclamation savings
  let reclaimSavings = 0;
  let reclaimPotential = 0;
  try {
    const rs = db.prepare(`SELECT SUM(savings) as realized, SUM(CASE WHEN status='pending' THEN license_cost ELSE 0 END) as potential FROM license_reclamation`).get();
    reclaimSavings = rs.realized || 0;
    reclaimPotential = rs.potential || 0;
  } catch (e) {}

  // Shadow IT — compute from connected integrations
  let shadowCost = 0;
  let shadowITCount = 0;
  let shadowITHighRisk = 0;
  let disabledUsersWithLicenses = 0;
  let iamUsersWithoutMFA = 0;
  try {
    // First try local DB table
    const localShadow = db.prepare("SELECT SUM(monthly_cost_estimate) as total, COUNT(*) as cnt FROM shadow_it WHERE status != 'resolved'").get();
    shadowCost = localShadow.total || 0;
    shadowITCount = localShadow.cnt || 0;
  } catch (e) {
    // No local table — compute from integration sync_details
    try {
      const integrations = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
      for (const integ of integrations) {
        let config = {};
        try { config = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {}); } catch {}
        const sd = config.sync_details || {};
        const providerName = integ.name || integ.provider || '';

        if (providerName.includes('Microsoft') || providerName.includes('M365') || providerName.includes('365')) {
          // Disabled users with licenses = shadow IT risk
          const totalUsers = sd.total_users || 0;
          const enabledUsers = sd.enabled_users || 0;
          disabledUsersWithLicenses = totalUsers - enabledUsers;
          if (disabledUsersWithLicenses > 0) {
            shadowITCount += disabledUsersWithLicenses;
            shadowCost += disabledUsersWithLicenses * 12.50;
          }
        }
        if (providerName.includes('AWS') || providerName.includes('Amazon')) {
          const iamUsers = sd.iam_users || [];
          for (const u of iamUsers) {
            if (!u.mfa_enabled) {
              iamUsersWithoutMFA++;
              shadowITCount++;
              if ((u.access_keys || 0) > 1) shadowITHighRisk++;
            }
          }
        }
      }
    } catch (e2) {}
  }

  // Top 5 costliest software (local + integrated)
  const topSoftwareCostLocal = db.prepare(`
    SELECT name, vendor, total_licenses, cost_per_license,
      total_licenses * cost_per_license as monthly_cost,
      ROUND(used_licenses * 100.0 / total_licenses, 1) as utilization_pct
    FROM software_assets WHERE cost_per_license > 0 AND total_licenses > 0
    ORDER BY monthly_cost DESC LIMIT 5
  `).all();

  // Add integrated SaaS (M365 SKUs) to top software cost
  const SKU_NAMES = {
    SPB: 'Microsoft 365 Business Premium', O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
    FLOW_FREE: 'Power Automate Free', POWER_BI_STANDARD: 'Power BI Free',
    'Teams_Premium_(for_Departments)': 'Teams Premium', ENTERPRISEPACK: 'Office 365 E3',
    ENTERPRISEPREMIUM: 'Office 365 E5', 'Microsoft_365_E3': 'Microsoft 365 E3',
  };
  const integrationTopCost = [];
  try {
    const integrations2 = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
    for (const integ of integrations2) {
      let config2 = {};
      try { config2 = typeof integ.config === 'string' ? JSON.parse(integ.config) : (integ.config || {}); } catch {}
      const sd2 = config2.sync_details || {};
      const pn = integ.name || integ.provider || '';
      if (pn.includes('Microsoft') || pn.includes('M365') || pn.includes('365')) {
        const skus = sd2.skus || [];
        for (const sku of skus) {
          const price = SKU_PRICES[sku.name] || 0;
          if (price > 0 && (sku.consumed || 0) > 0) {
            integrationTopCost.push({
              name: SKU_NAMES[sku.name] || sku.name.replace(/_/g, ' '),
              vendor: 'Microsoft',
              total_licenses: sku.enabled || 0,
              cost_per_license: price,
              monthly_cost: price * (sku.consumed || 0),
              utilization_pct: sku.enabled > 0 ? Math.round((sku.consumed / sku.enabled) * 100 * 10) / 10 : 0,
            });
          }
        }
      }
    }
  } catch (e) {}
  const topSoftwareCost = [...topSoftwareCostLocal, ...integrationTopCost]
    .sort((a, b) => (b.monthly_cost || 0) - (a.monthly_cost || 0))
    .slice(0, 5);

  // Monthly spend trend by category (local + integrated)
  const spendByCategoryLocal = db.prepare(`
    SELECT category, SUM(total_licenses * cost_per_license) as monthly_cost
    FROM software_assets WHERE cost_per_license > 0
    GROUP BY category ORDER BY monthly_cost DESC
  `).all();
  // Add cloud integration categories
  const spendMap = {};
  for (const r of spendByCategoryLocal) spendMap[r.category] = r.monthly_cost;
  if (integrationSoftwareCost > 0) spendMap['Cloud SaaS (M365)'] = (spendMap['Cloud SaaS (M365)'] || 0) + integrationSoftwareCost;
  if (cloudCost > 0) spendMap['Cloud Infrastructure'] = (spendMap['Cloud Infrastructure'] || 0) + cloudCost;
  const spendByCategory = Object.entries(spendMap)
    .map(([category, monthly_cost]) => ({ category, monthly_cost }))
    .sort((a, b) => b.monthly_cost - a.monthly_cost);

  // Hardware cost by type
  const hardwareCostByType = db.prepare(`
    SELECT type, COUNT(*) as count, SUM(purchase_cost) as total_cost
    FROM hardware_assets WHERE status != 'retired'
    GROUP BY type ORDER BY total_cost DESC LIMIT 6
  `).all();

  // Expiring assets costing money (next 90 days)
  const expiringCostlyAssets = db.prepare(`
    SELECT name, vendor, expiry_date, total_licenses * cost_per_license as monthly_cost,
      CAST(julianday(expiry_date) - julianday('now') AS INTEGER) as days_left
    FROM software_assets
    WHERE expiry_date IS NOT NULL AND expiry_date >= date('now')
      AND expiry_date <= date('now', '+90 days') AND cost_per_license > 0
    ORDER BY monthly_cost DESC LIMIT 5
  `).all();

  // Optimization opportunities summary
  const optimizationScore = Math.max(0, Math.min(100, Math.round(
    100 - (totalWastedCost / Math.max(softwareSpend, 1)) * 100
  )));

  res.json({
    // Existing
    totalSoftware, totalHardware,
    totalLicenses: totalLicenses.total || 0,
    usedLicenses: totalLicenses.used || 0,
    availableLicenses: (totalLicenses.total || 0) - (totalLicenses.used || 0),
    totalUsers, expiringLicenses, connectedIntegrations,
    totalContractValue, expiringContracts, inRepairHardware, licenseCompliance,
    hardwareByStatus, softwareByCategory, recentAuditLogs,
    // Cost optimization
    cost: {
      softwareMonthly: softwareSpend,
      hardwareTotal: hardwareValue,
      cloudMonthly: cloudCost,
      totalMonthly: softwareSpend + cloudCost,
      wastedLicenseCost: totalWastedCost,
      reclaimSavings,
      reclaimPotential,
      shadowCost,
      potentialSavings: totalWastedCost + reclaimPotential,
      optimizationScore,
      topSoftwareCost,
      spendByCategory,
      hardwareCostByType,
      wastedLicenses,
      expiringCostlyAssets,
    },
    // Cloud integration details
    cloud: {
      providers: cloudProviders,
      resources: cloudResources,
      totalCloudCost: cloudCost,
    },
    // Shadow IT / security risk details
    shadowIT: {
      count: shadowITCount,
      highRisk: shadowITHighRisk,
      disabledUsersWithLicenses,
      iamUsersWithoutMFA,
      monthlyCost: shadowCost,
    },
  });
});

module.exports = router;
