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

  // Total software spend (monthly)
  const softwareSpend = db.prepare(`
    SELECT SUM(total_licenses * cost_per_license) as total FROM software_assets WHERE cost_per_license > 0
  `).get().total || 0;

  // Total hardware value
  const hardwareValue = db.prepare(`
    SELECT SUM(purchase_cost) as total FROM hardware_assets WHERE status != 'retired' AND status != 'disposed'
  `).get().total || 0;

  // Monthly cloud infrastructure cost
  let cloudCost = 0;
  try {
    cloudCost = db.prepare('SELECT SUM(monthly_cost) as total FROM cloud_resources').get().total || 0;
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

  // Shadow IT unsanctioned cost
  let shadowCost = 0;
  try {
    shadowCost = db.prepare("SELECT SUM(monthly_cost_estimate) as total FROM shadow_it WHERE status != 'resolved'").get().total || 0;
  } catch (e) {}

  // Top 5 costliest software
  const topSoftwareCost = db.prepare(`
    SELECT name, vendor, total_licenses, cost_per_license,
      total_licenses * cost_per_license as monthly_cost,
      ROUND(used_licenses * 100.0 / total_licenses, 1) as utilization_pct
    FROM software_assets WHERE cost_per_license > 0 AND total_licenses > 0
    ORDER BY monthly_cost DESC LIMIT 5
  `).all();

  // Monthly spend trend by category
  const spendByCategory = db.prepare(`
    SELECT category, SUM(total_licenses * cost_per_license) as monthly_cost
    FROM software_assets WHERE cost_per_license > 0
    GROUP BY category ORDER BY monthly_cost DESC
  `).all();

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
  });
});

module.exports = router;
