const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.OPTIMA_DB_PATH || path.join(__dirname, '../optima.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');     // 64 MB page cache
    db.pragma('mmap_size = 268435456');   // 256 MB memory-map
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  // Properties table (multi-tenant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      domain TEXT,
      plan TEXT DEFAULT 'standard',
      status TEXT DEFAULT 'active',
      admin_email TEXT,
      max_assets INTEGER DEFAULT 10000,
      timezone TEXT DEFAULT 'UTC',
      logo_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT null,
      email TEXT UNIQUE NOT null,
      password TEXT NOT null,
      role TEXT NOT null DEFAULT 'user',
      department TEXT,
      phone TEXT,
      avatar TEXT,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS software_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT null,
      vendor TEXT,
      version TEXT,
      category TEXT,
      license_type TEXT,
      total_licenses INTEGER DEFAULT 0,
      used_licenses INTEGER DEFAULT 0,
      cost_per_license REAL DEFAULT 0,
      purchase_date TEXT,
      expiry_date TEXT,
      status TEXT DEFAULT 'active',
      description TEXT,
      install_count INTEGER DEFAULT 0,
      assigned_to TEXT,
      department TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hardware_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag TEXT UNIQUE NOT null,
      name TEXT NOT null,
      type TEXT NOT null,
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT UNIQUE,
      status TEXT DEFAULT 'active',
      condition TEXT DEFAULT 'good',
      location TEXT,
      assigned_to TEXT,
      assigned_user_id INTEGER,
      department TEXT,
      purchase_date TEXT,
      purchase_cost REAL DEFAULT 0,
      warranty_expiry TEXT,
      last_maintenance TEXT,
      next_maintenance TEXT,
      ip_address TEXT,
      mac_address TEXT,
      os TEXT,
      processor TEXT,
      ram TEXT,
      storage TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id INTEGER,
      license_key TEXT,
      license_type TEXT,
      seats INTEGER DEFAULT 1,
      used_seats INTEGER DEFAULT 0,
      purchase_date TEXT,
      expiry_date TEXT,
      cost REAL DEFAULT 0,
      vendor TEXT,
      order_number TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (software_id) REFERENCES software_assets(id)
    );

    CREATE TABLE IF NOT EXISTS cloud_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT null,
      provider TEXT NOT null,
      type TEXT NOT null,
      status TEXT DEFAULT 'disconnected',
      api_endpoint TEXT,
      auth_type TEXT,
      client_id TEXT,
      tenant_id TEXT,
      last_sync TEXT,
      sync_frequency TEXT DEFAULT 'daily',
      licenses_discovered INTEGER DEFAULT 0,
      users_synced INTEGER DEFAULT 0,
      config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT null,
      type TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      address TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT null,
      vendor_id INTEGER,
      type TEXT,
      start_date TEXT,
      end_date TEXT,
      value REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      auto_renew INTEGER DEFAULT 0,
      renewal_notice_days INTEGER DEFAULT 30,
      description TEXT,
      document_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT null,
      resource_type TEXT,
      resource_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hardware_id INTEGER NOT null,
      type TEXT NOT null,
      description TEXT,
      performed_by TEXT,
      cost REAL DEFAULT 0,
      date TEXT NOT null,
      next_date TEXT,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hardware_id) REFERENCES hardware_assets(id)
    );

    CREATE TABLE IF NOT EXISTS discovered_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      source TEXT,
      integration_id INTEGER,
      url TEXT,
      detected_users INTEGER DEFAULT 0,
      monthly_cost REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'low',
      is_sanctioned INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS license_reclamation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id INTEGER,
      software_name TEXT,
      user_name TEXT,
      user_email TEXT,
      last_used TEXT,
      days_inactive INTEGER DEFAULT 0,
      license_cost REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      action_taken TEXT,
      savings REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_id INTEGER,
      resource_type TEXT,
      resource_name TEXT,
      region TEXT,
      provider TEXT,
      status TEXT DEFAULT 'running',
      hourly_cost REAL DEFAULT 0,
      monthly_cost REAL DEFAULT 0,
      tags TEXT,
      software_installed TEXT,
      last_scanned TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shadow_it (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      detected_via TEXT,
      users_count INTEGER DEFAULT 0,
      first_detected TEXT,
      last_seen TEXT DEFAULT (datetime('now')),
      risk_level TEXT DEFAULT 'medium',
      category TEXT,
      monthly_cost_estimate REAL DEFAULT 0,
      status TEXT DEFAULT 'detected',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cmdb_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ci_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      status TEXT DEFAULT 'active',
      environment TEXT DEFAULT 'production',
      criticality TEXT DEFAULT 'medium',
      owner TEXT,
      department TEXT,
      location TEXT,
      ip_address TEXT,
      os TEXT,
      version TEXT,
      description TEXT,
      managed_by TEXT,
      linked_asset_id INTEGER,
      linked_asset_type TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cmdb_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_ci_id INTEGER NOT NULL,
      target_ci_id INTEGER NOT NULL,
      relationship_type TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_ci_id) REFERENCES cmdb_items(id),
      FOREIGN KEY (target_ci_id) REFERENCES cmdb_items(id)
    );

    CREATE TABLE IF NOT EXISTS mdm_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      os TEXT,
      assigned_user TEXT,
      department TEXT,
      serial TEXT,
      status TEXT DEFAULT 'pending',
      encrypted INTEGER DEFAULT 0,
      passcode INTEGER DEFAULT 0,
      last_sync TEXT DEFAULT 'Never',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Multi-property migrations — add property_id to all asset tables
  try { db.exec("ALTER TABLE software_assets ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE licenses ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE vendors ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE contracts ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE mdm_devices ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE cmdb_items ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE shadow_it ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}
  try { db.exec("ALTER TABLE cloud_integrations ADD COLUMN property_id INTEGER REFERENCES properties(id)") } catch(e) {}

  // Migrate existing tables with new columns
  try { db.exec("ALTER TABLE vendors ADD COLUMN poc_name TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE vendors ADD COLUMN poc_phone TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE vendors ADD COLUMN service_hours TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE vendors ADD COLUMN sla_tier TEXT DEFAULT 'standard'") } catch(e) {}
  try { db.exec("ALTER TABLE vendors ADD COLUMN escalation_email TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN warranty_status TEXT DEFAULT 'active'") } catch(e) {}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN warranty_provider TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN warranty_type TEXT DEFAULT 'standard'") } catch(e) {}
  try { db.exec("ALTER TABLE software_assets ADD COLUMN ai_platform INTEGER DEFAULT 0") } catch(e) {}

  // Production: only seed property record + admin login. No dummy data.
  // Development (NODE_ENV !== 'production'): seed full sample data for testing.
  seedDefaultProperty(db);
  if (process.env.NODE_ENV !== 'production') {
    seedData(db);
    seedAILicenses(db);
    seedMDMDevices(db);
  } else {
    seedProductionUsers(db);
  }
  console.log('✅ Database initialized successfully');
}

function seedDefaultProperty(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM properties').get();
  if (existing.c === 0) {
    // Use real name/slug from env if provided by key verification, else use placeholder
    const name = process.env.PROPERTY_NAME || 'My Property';
    const slug = process.env.PROPERTY_SLUG || 'my-property';
    db.prepare(`INSERT INTO properties (id, name, slug, plan, status, max_assets) VALUES (1, ?, ?, 'enterprise', 'active', 10000)`).run(name, slug);
    console.log(`✅ Property record created: "${name}"`);
  } else if (process.env.PROPERTY_NAME) {
    // Update name/slug if central server provided fresh values
    db.prepare(`UPDATE properties SET name=?, slug=?, updated_at=datetime('now') WHERE id=1`).run(
      process.env.PROPERTY_NAME, process.env.PROPERTY_SLUG || 'my-property'
    );
  }
  // Always backfill property_id=1 for rows without one (idempotent)
  db.prepare("UPDATE software_assets SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE hardware_assets SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE licenses SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE vendors SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE contracts SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE mdm_devices SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE cmdb_items SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE shadow_it SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE cloud_integrations SET property_id=1 WHERE property_id IS NULL").run();
  db.prepare("UPDATE users SET property_id=1 WHERE property_id IS NULL AND role != 'super_admin'").run();
}

function seedMDMDevices(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM mdm_devices').get();
  if (existing.c > 0) return;
  const stmt = db.prepare(`INSERT INTO mdm_devices (name, platform, os, assigned_user, department, serial, status, encrypted, passcode, last_sync) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  [
    ["John Smith's iPhone 14 Pro", 'iOS', 'iOS 17.3', 'john@optima.com', 'Engineering', 'DNPMXQ12F3GH', 'compliant', 1, 1, '2 min ago'],
    ['Sarah J. MacBook Pro', 'macOS', 'macOS 14.3', 'sarah@optima.com', 'Marketing', 'C02YK1XJJGH5', 'compliant', 1, 1, '5 min ago'],
    ['Dev Laptop - Engineering #3', 'Windows', 'Windows 11 22H2', 'unassigned', 'Engineering', 'WK9241-3X', 'non_compliant', 1, 0, '2 hours ago'],
    ['Android Tablet - Reception', 'Android', 'Android 14', 'reception@optima.com', 'Operations', 'RF8N10ABCDE', 'compliant', 1, 1, '15 min ago'],
    ['IT Admin Surface Pro', 'Windows', 'Windows 11 23H2', 'itadmin@optima.com', 'IT', 'SN12345SP4', 'compliant', 1, 1, '1 min ago'],
    ['Unknown Android Device', 'Android', 'Android 13', 'unknown', '', 'UNKNOWN', 'pending', 0, 0, 'Never'],
    ['Finance iPad Pro', 'iOS', 'iOS 17.2', 'finance@optima.com', 'Finance', 'FNIPAD2024F1', 'compliant', 1, 1, '30 min ago'],
    ['Marketing MacBook Air', 'macOS', 'macOS 14.2', 'marketing@optima.com', 'Marketing', 'C02MBA2024M1', 'compliant', 1, 1, '10 min ago'],
    ['Warehouse Android Scanner', 'Android', 'Android 12', 'ops@optima.com', 'Operations', 'SCAN2024WH01', 'non_compliant', 0, 1, '1 day ago'],
    ['HR Windows Laptop', 'Windows', 'Windows 10 22H2', 'hr@optima.com', 'HR', 'HRWIN2024H01', 'non_compliant', 1, 0, '3 hours ago'],
  ].forEach(r => stmt.run(...r));
  console.log('✅ MDM devices seeded');
}

function seedAILicenses(db) {
  const hasOpenAI = db.prepare("SELECT id FROM software_assets WHERE name='OpenAI GPT-4' LIMIT 1").get();
  if (hasOpenAI) return;
  const insert = db.prepare(`INSERT INTO software_assets (name, vendor, version, category, license_type, total_licenses, used_licenses, cost_per_license, purchase_date, expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    ['OpenAI GPT-4', 'OpenAI', 'gpt-4-turbo', 'AI Platform', 'api', 50, 38, 20.00, '2024-01-01', '2025-12-31', 'active'],
    ['Anthropic Claude', 'Anthropic', 'claude-3-opus', 'AI Platform', 'api', 25, 18, 30.00, '2024-03-01', '2025-02-28', 'active'],
    ['xAI Grok', 'xAI', 'grok-2', 'AI Platform', 'api', 10, 5, 25.00, '2024-06-01', '2025-05-31', 'active'],
    ['AWS Bedrock', 'Amazon', 'bedrock-claude', 'AI Platform', 'usage', 0, 0, 0, '2024-01-01', null, 'active'],
  ].forEach(r => insert.run(...r));
  console.log('✅ AI Platform licenses seeded');
}

function seedData(db) {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count > 0) return;

  // Seed users
  const users = [
    { name: 'Super Admin', email: 'admin@optima.com', password: 'Admin@123', role: 'super_admin', department: 'IT' },
    { name: 'IT Manager', email: 'manager@optima.com', password: 'Manager@123', role: 'it_manager', department: 'IT' },
    { name: 'IT Admin', email: 'itadmin@optima.com', password: 'ITAdmin@123', role: 'it_admin', department: 'IT' },
    { name: 'Asset Manager', email: 'assets@optima.com', password: 'Assets@123', role: 'asset_manager', department: 'Operations' },
    { name: 'John Smith', email: 'john@optima.com', password: 'User@123', role: 'user', department: 'Engineering' },
    { name: 'Sarah Johnson', email: 'sarah@optima.com', password: 'User@123', role: 'user', department: 'Marketing' },
    { name: 'Auditor', email: 'auditor@optima.com', password: 'Audit@123', role: 'auditor', department: 'Finance' },
  ];

  const insertUser = db.prepare(`INSERT INTO users (name, email, password, role, department, property_id) VALUES (?, ?, ?, ?, ?, ?)`);
  users.forEach(u => {
    const hash = bcrypt.hashSync(u.password, 10);
    // super_admin gets null (cross-property), others get property 1
    const propId = u.role === 'super_admin' ? null : 1;
    insertUser.run(u.name, u.email, hash, u.role, u.department, propId);
  });

  // Seed software
  const softwareData = [
    ['Microsoft Office 365', 'Microsoft', '365', 'Productivity', 'subscription', 500, 423, 15.00, '2023-01-01', '2025-12-31', 'active'],
    ['Adobe Creative Cloud', 'Adobe', '2024', 'Design', 'subscription', 50, 48, 55.00, '2023-06-01', '2025-05-31', 'active'],
    ['AutoCAD', 'Autodesk', '2024', 'Engineering', 'perpetual', 25, 20, 1800.00, '2022-03-15', '2026-03-15', 'active'],
    ['Slack', 'Salesforce', '4.35', 'Communication', 'subscription', 500, 387, 8.75, '2023-01-01', '2025-12-31', 'active'],
    ['Zoom', 'Zoom Video', '5.17', 'Communication', 'subscription', 200, 156, 15.99, '2023-04-01', '2025-03-31', 'active'],
    ['GitHub Enterprise', 'Microsoft', '3.12', 'Development', 'subscription', 100, 87, 21.00, '2023-01-01', '2025-12-31', 'active'],
    ['Salesforce CRM', 'Salesforce', 'Spring 24', 'CRM', 'subscription', 75, 68, 150.00, '2022-07-01', '2025-06-30', 'active'],
    ['Jira Software', 'Atlassian', '9.12', 'Project Management', 'subscription', 150, 134, 8.15, '2023-01-01', '2025-12-31', 'active'],
    ['Windows 11 Pro', 'Microsoft', '23H2', 'OS', 'perpetual', 300, 285, 200.00, '2022-01-01', null, 'active'],
    ['Antivirus Pro', 'CrowdStrike', '7.14', 'Security', 'subscription', 500, 412, 9.50, '2023-01-01', '2025-12-31', 'active'],
    ['AWS CloudWatch', 'Amazon', 'N/A', 'Cloud', 'usage', 0, 0, 0, '2022-01-01', null, 'active'],
    ['Google Workspace', 'Google', 'Enterprise', 'Productivity', 'subscription', 250, 198, 18.00, '2023-01-01', '2025-12-31', 'active'],
  ];

  const insertSoftware = db.prepare(`INSERT INTO software_assets (name, vendor, version, category, license_type, total_licenses, used_licenses, cost_per_license, purchase_date, expiry_date, status, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  softwareData.forEach(s => insertSoftware.run(...s));

  // Seed AI platform licenses
  const hasOpenAI = db.prepare("SELECT id FROM software_assets WHERE name='OpenAI GPT-4' LIMIT 1").get();
  if (!hasOpenAI) {
    const aiLicenses = [
      ['OpenAI GPT-4', 'OpenAI', 'gpt-4-turbo', 'AI Platform', 'api', 50, 38, 20.00, '2024-01-01', '2025-12-31', 'active'],
      ['Anthropic Claude', 'Anthropic', 'claude-3-opus', 'AI Platform', 'api', 25, 18, 30.00, '2024-03-01', '2025-02-28', 'active'],
      ['xAI Grok', 'xAI', 'grok-2', 'AI Platform', 'api', 10, 5, 25.00, '2024-06-01', '2025-05-31', 'active'],
      ['AWS Bedrock', 'Amazon', 'bedrock-claude', 'AI Platform', 'usage', 0, 0, 0, '2024-01-01', null, 'active'],
    ];
    aiLicenses.forEach(s => insertSoftware.run(...s));
  }

  // Seed hardware
  const hardwareData = [
    ['HW-001', 'Dell XPS 15 Laptop', 'Laptop', 'Dell', 'XPS 15 9530', 'SN-DL-001', 'active', 'good', 'HQ - Floor 2', 'John Smith', 1, 'Engineering', '2022-06-15', 2499.00, '2025-06-15', 'Intel Core i9', '32GB', '1TB SSD', 'Windows 11 Pro'],
    ['HW-002', 'MacBook Pro 16"', 'Laptop', 'Apple', 'MacBook Pro 16"', 'SN-AP-001', 'active', 'excellent', 'HQ - Floor 3', 'Sarah Johnson', 1, 'Marketing', '2023-01-20', 2999.00, '2026-01-20', 'Apple M3 Pro', '36GB', '512GB SSD', 'macOS Sonoma'],
    ['HW-003', 'HP ProDesk 600', 'Desktop', 'HP', 'ProDesk 600 G9', 'SN-HP-001', 'active', 'good', 'HQ - Floor 1', 'IT Admin', 3, 'IT', '2022-03-10', 1200.00, '2025-03-10', 'Intel Core i7', '16GB', '512GB SSD', 'Windows 11 Pro'],
    ['HW-004', 'Cisco Catalyst 9300', 'Network Switch', 'Cisco', 'Catalyst 9300-24P', 'SN-CS-001', 'active', 'good', 'Server Room', null, null, 'IT', '2021-11-05', 8500.00, '2026-11-05', null, null, null, 'IOS-XE 17.9'],
    ['HW-005', 'Dell PowerEdge R750', 'Server', 'Dell', 'PowerEdge R750', 'SN-DL-SRV-001', 'active', 'good', 'Data Center', null, null, 'IT', '2022-08-20', 15000.00, '2025-08-20', 'Intel Xeon Gold', '256GB', '10TB RAID', 'Windows Server 2022'],
    ['HW-006', 'iPhone 14 Pro', 'Mobile', 'Apple', 'iPhone 14 Pro', 'SN-AP-IP-001', 'active', 'good', 'HQ - Floor 2', 'John Smith', 1, 'Engineering', '2023-03-15', 999.00, '2026-03-15', null, null, null, 'iOS 17'],
    ['HW-007', 'LG UltraWide 34"', 'Monitor', 'LG', '34WN780-B', 'SN-LG-001', 'active', 'excellent', 'HQ - Floor 2', 'John Smith', 1, 'Engineering', '2022-06-15', 549.00, '2025-06-15', null, null, null, null],
    ['HW-008', 'HP LaserJet Pro', 'Printer', 'HP', 'LaserJet Pro M404dn', 'SN-HP-PR-001', 'active', 'good', 'HQ - Floor 1', null, null, 'Operations', '2021-04-10', 350.00, '2024-04-10', null, null, null, null],
    ['HW-009', 'Lenovo ThinkPad X1', 'Laptop', 'Lenovo', 'ThinkPad X1 Carbon', 'SN-LN-001', 'in_repair', 'fair', 'IT Storage', null, null, 'IT', '2021-09-01', 1899.00, '2024-09-01', 'Intel Core i7', '16GB', '512GB SSD', 'Windows 11 Pro'],
    ['HW-010', 'Cisco ASA 5506', 'Firewall', 'Cisco', 'ASA 5506-X', 'SN-CS-FW-001', 'active', 'good', 'Server Room', null, null, 'IT', '2020-05-15', 1200.00, '2025-05-15', null, null, null, 'ASA OS 9.16'],
  ];

  const insertHardware = db.prepare(`INSERT INTO hardware_assets (asset_tag, name, type, manufacturer, model, serial_number, status, condition, location, assigned_to, assigned_user_id, department, purchase_date, purchase_cost, warranty_expiry, processor, ram, storage, os, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  hardwareData.forEach(h => insertHardware.run(...h));

  // Seed cloud integrations
  const integrationsData = [
    ['Microsoft 365', 'Microsoft', 'productivity', 'connected', 'https://graph.microsoft.com/v1.0', 'oauth2', '2023-01-15', 500, 423],
    ['Google Workspace', 'Google', 'productivity', 'connected', 'https://admin.googleapis.com', 'oauth2', '2023-02-10', 250, 198],
    ['Salesforce', 'Salesforce', 'crm', 'connected', 'https://api.salesforce.com', 'oauth2', '2023-01-20', 75, 68],
    ['AWS', 'Amazon', 'cloud', 'connected', 'https://aws.amazon.com/api', 'api_key', '2023-03-05', 45, 0],
    ['Azure', 'Microsoft', 'cloud', 'connected', 'https://management.azure.com', 'oauth2', '2023-01-15', 32, 0],
    ['GCP', 'Google', 'cloud', 'disconnected', 'https://cloudresourcemanager.googleapis.com', 'service_account', null, 0, 0],
    ['Slack', 'Salesforce', 'communication', 'connected', 'https://slack.com/api', 'oauth2', '2023-04-01', 500, 387],
    ['Zoom', 'Zoom', 'communication', 'connected', 'https://api.zoom.us/v2', 'oauth2', '2023-04-01', 200, 156],
    ['GitHub', 'Microsoft', 'development', 'connected', 'https://api.github.com', 'oauth2', '2023-02-20', 100, 87],
    ['Jira', 'Atlassian', 'project_management', 'connected', 'https://your-domain.atlassian.net', 'api_key', '2023-03-15', 150, 134],
    ['Adobe Creative Cloud', 'Adobe', 'design', 'connected', 'https://ims-na1.adobelogin.com', 'oauth2', '2023-05-01', 50, 48],
    ['Okta', 'Okta', 'identity', 'connected', 'https://your-domain.okta.com', 'api_key', '2023-01-10', 750, 712],
    ['Dropbox Business', 'Dropbox', 'storage', 'disconnected', 'https://api.dropboxapi.com/2', 'oauth2', null, 0, 0],
    ['ServiceNow', 'ServiceNow', 'itsm', 'disconnected', 'https://your-instance.service-now.com', 'oauth2', null, 0, 0],
  ];

  const insertIntegration = db.prepare(`INSERT INTO cloud_integrations (name, provider, type, status, api_endpoint, auth_type, last_sync, licenses_discovered, users_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  integrationsData.forEach(i => insertIntegration.run(...i));

  // Seed vendors
  const vendorsData = [
    ['Microsoft', 'Software', 'Partner Support', 'enterprise@microsoft.com', '+1-800-642-7676', 'https://microsoft.com', 'Redmond, WA, USA', 'active'],
    ['Dell Technologies', 'Hardware', 'Enterprise Sales', 'enterprise@dell.com', '+1-800-289-3355', 'https://dell.com', 'Round Rock, TX, USA', 'active'],
    ['Apple', 'Hardware/Software', 'Business Support', 'business@apple.com', '+1-800-692-7753', 'https://apple.com/business', 'Cupertino, CA, USA', 'active'],
    ['Cisco', 'Network', 'Enterprise Team', 'enterprise@cisco.com', '+1-800-553-6387', 'https://cisco.com', 'San Jose, CA, USA', 'active'],
    ['Adobe', 'Software', 'Creative Licensing', 'enterprise@adobe.com', '+1-800-833-6687', 'https://adobe.com', 'San Jose, CA, USA', 'active'],
    ['Salesforce', 'Software', 'Account Manager', 'sales@salesforce.com', '+1-800-667-6389', 'https://salesforce.com', 'San Francisco, CA, USA', 'active'],
    ['Atlassian', 'Software', 'Support', 'support@atlassian.com', '+1-415-701-1110', 'https://atlassian.com', 'Austin, TX, USA', 'active'],
    ['Amazon Web Services', 'Cloud', 'Enterprise Support', 'aws-enterprise@amazon.com', '+1-206-266-4064', 'https://aws.amazon.com', 'Seattle, WA, USA', 'active'],
  ];

  const insertVendor = db.prepare(`INSERT INTO vendors (name, type, contact_name, email, phone, website, address, status, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  vendorsData.forEach(v => insertVendor.run(...v));

  // Seed contracts
  const contractsData = [
    ['Microsoft Enterprise Agreement', 1, 'Enterprise License', '2023-01-01', '2025-12-31', 180000, 'active', 1, 90],
    ['Dell Hardware Refresh', 2, 'Hardware Purchase', '2022-06-01', '2025-05-31', 75000, 'active', 0, 30],
    ['Adobe Creative Cloud Enterprise', 5, 'SaaS Subscription', '2023-06-01', '2025-05-31', 33000, 'active', 1, 60],
    ['Cisco Network Maintenance', 4, 'Maintenance', '2023-01-01', '2025-12-31', 45000, 'active', 1, 90],
    ['Salesforce CRM License', 6, 'SaaS Subscription', '2022-07-01', '2025-06-30', 135000, 'active', 1, 90],
    ['AWS Enterprise Support', 8, 'Cloud Services', '2022-01-01', '2024-12-31', 60000, 'expiring_soon', 1, 30],
    ['Atlassian Cloud', 7, 'SaaS Subscription', '2023-01-01', '2025-12-31', 14700, 'active', 1, 60],
  ];

  const insertContract = db.prepare(`INSERT INTO contracts (title, vendor_id, type, start_date, end_date, value, status, auto_renew, renewal_notice_days, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  contractsData.forEach(c => insertContract.run(...c));

  console.log('✅ Sample data seeded successfully');
}

// Minimal seed for production: just the super_admin login so the property is usable
function seedProductionUsers(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) return;
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare(`INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, 'super_admin', 'IT')`)
    .run('Admin', 'admin@optima.com', hash);
  console.log('✅ Default admin user created (admin@optima.com / Admin@123) — change password after first login');
}

module.exports = { getDb, initDatabase };
