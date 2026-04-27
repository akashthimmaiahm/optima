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
  try { db.exec("ALTER TABLE software_assets ADD COLUMN source TEXT DEFAULT 'manual'") } catch(e) {}
  try { db.exec("ALTER TABLE software_assets ADD COLUMN discovered_by_agent TEXT") } catch(e) {}
  try { db.exec("ALTER TABLE software_assets ADD COLUMN agent_hostname TEXT") } catch(e) {}
  // Backfill source for existing agent-discovered rows
  try { db.exec("UPDATE software_assets SET source='agent' WHERE notes='Agent-discovered' AND (source IS NULL OR source='manual')") } catch(e) {}
  // Backfill discovered_by_agent for legacy agent-discovered software
  try {
    const needsBackfill = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE (source='agent' OR notes='Agent-discovered') AND discovered_by_agent IS NULL").get();
    if (needsBackfill.c > 0) {
      const latestAgent = db.prepare("SELECT agent_id, hostname FROM agents ORDER BY last_seen DESC LIMIT 1").get();
      if (latestAgent) {
        db.prepare("UPDATE software_assets SET discovered_by_agent=?, agent_hostname=? WHERE (source='agent' OR notes='Agent-discovered') AND discovered_by_agent IS NULL")
          .run(latestAgent.agent_id, latestAgent.hostname);
      }
    }
  } catch(e) {}

  // ── Asset Loans table ───────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NOT NULL,
      asset_name TEXT,
      loaned_to TEXT NOT NULL,
      loaned_to_email TEXT,
      loaned_to_department TEXT,
      loaned_by TEXT,
      checkout_date TEXT NOT NULL DEFAULT (datetime('now')),
      due_date TEXT,
      checkin_date TEXT,
      status TEXT DEFAULT 'checked_out',
      condition_out TEXT DEFAULT 'good',
      condition_in TEXT,
      purpose TEXT,
      notes TEXT,
      property_id INTEGER REFERENCES properties(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Asset Relationships table ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      property_id INTEGER REFERENCES properties(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Dynamic Type Fields table ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_type_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT DEFAULT 'text',
      options TEXT,
      required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      property_id INTEGER REFERENCES properties(id),
      UNIQUE(asset_type, field_name, property_id)
    );
  `);

  // ── Hardware custom fields (JSON storage) ──────────────────────────────────
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN custom_fields TEXT") } catch(e) {}

  // Seed default type-specific fields
  seedTypeFields(db);

  seedDefaultProperty(db);
  seedProductionUsers(db);
  console.log('✅ Database initialized successfully');
}

function seedTypeFields(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM asset_type_fields').get();
  if (existing.c > 0) return;
  const ins = db.prepare('INSERT OR IGNORE INTO asset_type_fields (asset_type, field_name, field_label, field_type, options, required, sort_order) VALUES (?,?,?,?,?,?,?)');
  const fields = [
    // Laptop
    ['Laptop', 'battery_health', 'Battery Health', 'select', 'Excellent,Good,Fair,Poor,Replace', 0, 1],
    ['Laptop', 'charger_included', 'Charger Included', 'select', 'Yes,No', 0, 2],
    ['Laptop', 'screen_size', 'Screen Size', 'text', null, 0, 3],
    ['Laptop', 'gpu', 'GPU', 'text', null, 0, 4],
    ['Laptop', 'webcam', 'Webcam', 'select', 'Built-in,External,None', 0, 5],
    // Desktop
    ['Desktop', 'form_factor', 'Form Factor', 'select', 'Tower,SFF,Mini,AIO', 0, 1],
    ['Desktop', 'gpu', 'GPU', 'text', null, 0, 2],
    ['Desktop', 'psu_wattage', 'PSU Wattage', 'text', null, 0, 3],
    ['Desktop', 'expansion_slots', 'Expansion Slots', 'text', null, 0, 4],
    // Server
    ['Server', 'rack_unit', 'Rack Unit (U)', 'text', null, 0, 1],
    ['Server', 'rack_location', 'Rack Location', 'text', null, 0, 2],
    ['Server', 'cpu_count', 'CPU Count', 'text', null, 0, 3],
    ['Server', 'raid_config', 'RAID Configuration', 'select', 'RAID 0,RAID 1,RAID 5,RAID 6,RAID 10,None', 0, 4],
    ['Server', 'power_supply', 'Power Supply', 'select', 'Single,Dual Redundant', 0, 5],
    ['Server', 'ilo_ip', 'iLO/iDRAC IP', 'text', null, 0, 6],
    ['Server', 'virtualization', 'Virtualization', 'select', 'VMware,Hyper-V,KVM,Proxmox,None', 0, 7],
    // Network Switch
    ['Network Switch', 'port_count', 'Port Count', 'text', null, 0, 1],
    ['Network Switch', 'port_speed', 'Port Speed', 'select', '1GbE,10GbE,25GbE,40GbE,100GbE', 0, 2],
    ['Network Switch', 'poe', 'PoE Support', 'select', 'Yes,No,PoE+,PoE++', 0, 3],
    ['Network Switch', 'managed', 'Managed', 'select', 'Managed,Unmanaged,Smart Managed', 0, 4],
    ['Network Switch', 'layer', 'Layer', 'select', 'Layer 2,Layer 3', 0, 5],
    ['Network Switch', 'stacking', 'Stacking', 'select', 'Yes,No', 0, 6],
    // Router
    ['Router', 'wan_ports', 'WAN Ports', 'text', null, 0, 1],
    ['Router', 'lan_ports', 'LAN Ports', 'text', null, 0, 2],
    ['Router', 'wifi_standard', 'WiFi Standard', 'select', 'WiFi 5,WiFi 6,WiFi 6E,WiFi 7,None', 0, 3],
    ['Router', 'throughput', 'Max Throughput', 'text', null, 0, 4],
    ['Router', 'vpn_support', 'VPN Support', 'select', 'IPSec,SSL,WireGuard,None', 0, 5],
    // Firewall
    ['Firewall', 'throughput', 'Firewall Throughput', 'text', null, 0, 1],
    ['Firewall', 'vpn_throughput', 'VPN Throughput', 'text', null, 0, 2],
    ['Firewall', 'max_connections', 'Max Connections', 'text', null, 0, 3],
    ['Firewall', 'subscription_expiry', 'Security Subscription Expiry', 'date', null, 0, 4],
    ['Firewall', 'ha_mode', 'HA Mode', 'select', 'Active-Passive,Active-Active,Standalone', 0, 5],
    // Printer
    ['Printer', 'print_type', 'Print Type', 'select', 'Laser,Inkjet,Thermal,Dot Matrix', 0, 1],
    ['Printer', 'color', 'Color', 'select', 'Color,Monochrome', 0, 2],
    ['Printer', 'duplex', 'Duplex', 'select', 'Auto,Manual,No', 0, 3],
    ['Printer', 'network_print', 'Network Print', 'select', 'Ethernet,WiFi,Both,USB Only', 0, 4],
    ['Printer', 'ppm', 'Pages Per Minute', 'text', null, 0, 5],
    // Monitor
    ['Monitor', 'screen_size', 'Screen Size', 'text', null, 0, 1],
    ['Monitor', 'resolution', 'Resolution', 'select', '1080p,1440p,4K,5K,Ultrawide', 0, 2],
    ['Monitor', 'panel_type', 'Panel Type', 'select', 'IPS,VA,TN,OLED', 0, 3],
    ['Monitor', 'ports', 'Ports', 'text', null, 0, 4],
    ['Monitor', 'adjustable_stand', 'Adjustable Stand', 'select', 'Yes,No', 0, 5],
    // Mobile
    ['Mobile', 'imei', 'IMEI', 'text', null, 0, 1],
    ['Mobile', 'phone_number', 'Phone Number', 'text', null, 0, 2],
    ['Mobile', 'carrier', 'Carrier', 'text', null, 0, 3],
    ['Mobile', 'screen_size', 'Screen Size', 'text', null, 0, 4],
    ['Mobile', 'mdm_enrolled', 'MDM Enrolled', 'select', 'Yes,No', 0, 5],
    // Tablet
    ['Tablet', 'screen_size', 'Screen Size', 'text', null, 0, 1],
    ['Tablet', 'cellular', 'Cellular', 'select', 'WiFi Only,WiFi + Cellular', 0, 2],
    ['Tablet', 'stylus', 'Stylus Support', 'select', 'Yes,No', 0, 3],
    ['Tablet', 'keyboard', 'Keyboard Attached', 'select', 'Yes,No', 0, 4],
    // Storage
    ['Storage', 'total_capacity', 'Total Capacity', 'text', null, 0, 1],
    ['Storage', 'usable_capacity', 'Usable Capacity', 'text', null, 0, 2],
    ['Storage', 'storage_protocol', 'Protocol', 'select', 'iSCSI,FC,NFS,SMB,S3', 0, 3],
    ['Storage', 'raid_level', 'RAID Level', 'select', 'RAID 0,RAID 1,RAID 5,RAID 6,RAID 10', 0, 4],
    ['Storage', 'drive_type', 'Drive Type', 'select', 'SSD,HDD,NVMe,Hybrid', 0, 5],
  ];
  fields.forEach(f => ins.run(...f));
  console.log('✅ Asset type fields seeded');
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

// Seed the master super_admin account
function seedProductionUsers(db) {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) return;
  const hash = bcrypt.hashSync('A1s2d3f4@Pl@t1num', 10);
  db.prepare(`INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, 'super_admin', 'IT')`)
    .run('Master Admin', 'admin@optima.com', hash);
  console.log('✅ Master admin created (admin@optima.com)');
}

module.exports = { getDb, initDatabase };
