/**
 * Mass seed script — generates 10,000+ assets per property using SQLite transactions.
 * Usage: node seed_mass.js [property_id] [asset_count]
 * Example: node seed_mass.js 1 10000
 */

const Database = require('better-sqlite3');
const path = require('path');

const propertyId = parseInt(process.argv[2] || '1');
const targetCount = parseInt(process.argv[3] || '10000');

const db = new Database(path.join(__dirname, 'optima.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const DEPTS = ['Engineering', 'Marketing', 'Finance', 'HR', 'Operations', 'IT', 'Legal', 'Sales', 'Product', 'Support'];
const HW_TYPES = ['Laptop', 'Desktop', 'Server', 'Mobile', 'Monitor', 'Network Switch', 'Tablet', 'Printer', 'Firewall', 'Router'];
const MANUFACTURERS = ['Dell', 'HP', 'Apple', 'Lenovo', 'Cisco', 'Microsoft', 'Samsung', 'Asus', 'Acer', 'LG'];
const SW_CATEGORIES = ['Productivity', 'Security', 'Development', 'Design', 'Communication', 'Analytics', 'CRM', 'ERP', 'Cloud', 'AI Platform'];
const SW_VENDORS = ['Microsoft', 'Adobe', 'Atlassian', 'Salesforce', 'AWS', 'Google', 'Slack', 'Zoom', 'GitHub', 'JetBrains'];
const STATUSES = ['active', 'active', 'active', 'active', 'inactive', 'in_repair', 'retired'];
const CONDITIONS = ['excellent', 'good', 'good', 'good', 'fair', 'poor'];
const PLATFORMS = ['Windows', 'macOS', 'iOS', 'Android', 'Linux'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(yearsBack = 3) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - Math.random() * yearsBack);
  return d.toISOString().split('T')[0];
}
function futureDate(yearsAhead = 2) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + Math.random() * yearsAhead);
  return d.toISOString().split('T')[0];
}

const prop = db.prepare('SELECT * FROM properties WHERE id=?').get(propertyId);
if (!prop) { console.error(`Property ${propertyId} not found. Run the server once first to seed the default property.`); process.exit(1); }

console.log(`\n🚀 Seeding ${targetCount} assets for property: "${prop.name}" (id=${propertyId})`);

const hwCount = Math.floor(targetCount * 0.5);
const swCount = Math.floor(targetCount * 0.3);
const mdmCount = Math.floor(targetCount * 0.15);
const cmdbCount = Math.floor(targetCount * 0.05);

console.log(`  Hardware: ${hwCount}, Software: ${swCount}, MDM: ${mdmCount}, CMDB: ${cmdbCount}`);

// ── Hardware ─────────────────────────────────────────────────────────────────
const insertHw = db.prepare(`
  INSERT INTO hardware_assets (asset_tag, name, type, manufacturer, model, serial_number, status, condition, location, department, purchase_date, purchase_cost, warranty_expiry, os, property_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seedHardware = db.transaction(() => {
  let inserted = 0;
  for (let i = 1; i <= hwCount; i++) {
    const type = rand(HW_TYPES);
    const mfr = rand(MANUFACTURERS);
    const tag = `${prop.slug.toUpperCase().substring(0, 3)}-HW-${String(i).padStart(6, '0')}`;
    const serial = `SN-${propertyId}-${i}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    try {
      insertHw.run(tag, `${mfr} ${type} #${i}`, type, mfr, `Model-${randInt(100, 999)}`, serial, rand(STATUSES), rand(CONDITIONS), `${rand(DEPTS)} - Floor ${randInt(1, 5)}`, rand(DEPTS), randDate(4), randInt(500, 20000), futureDate(3), rand(['Windows 11', 'macOS Sonoma', 'Ubuntu 22.04', 'RHEL 9', null]), propertyId);
      inserted++;
    } catch { /* skip duplicates */ }
  }
  return inserted;
});

// ── Software ─────────────────────────────────────────────────────────────────
const insertSw = db.prepare(`
  INSERT INTO software_assets (name, vendor, version, category, license_type, total_licenses, used_licenses, cost_per_license, purchase_date, expiry_date, status, property_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
`);

const seedSoftware = db.transaction(() => {
  let inserted = 0;
  for (let i = 1; i <= swCount; i++) {
    const vendor = rand(SW_VENDORS);
    const cat = rand(SW_CATEGORIES);
    const total = randInt(10, 500);
    const used = randInt(0, total);
    insertSw.run(`${vendor} ${cat} Suite v${randInt(1, 15)}`, vendor, `${randInt(1, 20)}.${randInt(0, 9)}`, cat, rand(['subscription', 'perpetual', 'usage', 'open_source']), total, used, randInt(0, 200), randDate(3), futureDate(2), propertyId);
    inserted++;
  }
  return inserted;
});

// ── MDM Devices ───────────────────────────────────────────────────────────────
const insertMdm = db.prepare(`
  INSERT INTO mdm_devices (name, platform, os, assigned_user, department, serial, status, encrypted, passcode, last_sync, property_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seedMDM = db.transaction(() => {
  let inserted = 0;
  for (let i = 1; i <= mdmCount; i++) {
    const platform = rand(PLATFORMS);
    const dept = rand(DEPTS);
    insertMdm.run(`${dept} ${platform} Device #${i}`, platform, `${platform} ${randInt(10, 14)}`, `user${i}@${prop.slug}.com`, dept, `MDM-${propertyId}-${i}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`, rand(['compliant', 'compliant', 'non_compliant', 'pending']), Math.random() > 0.2 ? 1 : 0, Math.random() > 0.3 ? 1 : 0, `${randInt(1, 60)} min ago`, propertyId);
    inserted++;
  }
  return inserted;
});

// ── CMDB Items ────────────────────────────────────────────────────────────────
const insertCmdb = db.prepare(`
  INSERT INTO cmdb_items (ci_id, name, type, category, status, environment, criticality, owner, department, property_id)
  VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
`);

const seedCMDB = db.transaction(() => {
  let inserted = 0;
  const types = ['Server', 'Database', 'Application', 'Network Device', 'Service', 'Virtual Machine'];
  const envs = ['production', 'staging', 'development', 'dr'];
  const crits = ['critical', 'high', 'medium', 'low'];
  for (let i = 1; i <= cmdbCount; i++) {
    const type = rand(types);
    const dept = rand(DEPTS);
    insertCmdb.run(`CI-${prop.slug.toUpperCase().substring(0,3)}-${String(i).padStart(6, '0')}`, `${dept} ${type} ${i}`, type, rand(SW_CATEGORIES), rand(envs), rand(crits), `admin@${prop.slug}.com`, dept, propertyId);
    inserted++;
  }
  return inserted;
});

// ── Run all ───────────────────────────────────────────────────────────────────
console.time('seed');

const hwInserted = seedHardware();
console.log(`  ✅ Hardware: ${hwInserted} rows`);

const swInserted = seedSoftware();
console.log(`  ✅ Software: ${swInserted} rows`);

const mdmInserted = seedMDM();
console.log(`  ✅ MDM Devices: ${mdmInserted} rows`);

const cmdbInserted = seedCMDB();
console.log(`  ✅ CMDB Items: ${cmdbInserted} rows`);

console.timeEnd('seed');

const total = hwInserted + swInserted + mdmInserted + cmdbInserted;
console.log(`\n🎉 Total inserted: ${total.toLocaleString()} records for property "${prop.name}"\n`);
db.close();
