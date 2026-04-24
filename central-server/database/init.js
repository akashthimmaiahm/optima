const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../portal.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    -- Central user accounts (cross-property)
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      global_role TEXT NOT NULL DEFAULT 'user',
      is_active   INTEGER DEFAULT 1,
      last_login  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Property registry — one row per property EC2
    CREATE TABLE IF NOT EXISTS properties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      ec2_url     TEXT NOT NULL,          -- internal URL: http://10.0.1.50:5000
      domain      TEXT,                   -- public: acme.optima.sclera.com
      plan        TEXT DEFAULT 'standard',
      status      TEXT DEFAULT 'active',
      logo_url    TEXT,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- Which users can access which properties, and their role inside that property
    CREATE TABLE IF NOT EXISTS user_properties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      role        TEXT NOT NULL DEFAULT 'user',
      granted_at  TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, property_id)
    );
  `);

  // Add new columns if they don't exist (idempotent migrations)
  const cols = db.prepare("PRAGMA table_info(properties)").all().map(c => c.name);
  if (!cols.includes('address'))      db.exec("ALTER TABLE properties ADD COLUMN address TEXT");
  if (!cols.includes('vdms_id'))      db.exec("ALTER TABLE properties ADD COLUMN vdms_id TEXT");
  if (!cols.includes('property_key')) {
    db.exec("ALTER TABLE properties ADD COLUMN property_key TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_key ON properties(property_key)");
  }

  // Backfill property_key for existing rows that don't have one
  const { randomUUID } = require('crypto');
  const needsKey = db.prepare("SELECT id FROM properties WHERE property_key IS NULL").all();
  const setKey = db.prepare("UPDATE properties SET property_key=? WHERE id=?");
  for (const row of needsKey) setKey.run(randomUUID(), row.id);

  seedPortalData(db);
  console.log('✅ Central portal database initialized');
}

function seedPortalData(db) {
  const exists = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (exists.c > 0) return;

  // Super admin can see all properties
  const adminHash = bcrypt.hashSync('Admin@123', 10);
  const adminId = db.prepare(
    `INSERT INTO users (name, email, password, global_role) VALUES ('Super Admin', 'admin@optima.com', ?, 'super_admin')`
  ).run(adminHash).lastInsertRowid;

  // Demo property EC2 entries — update ec2_url to actual private IPs after provisioning
  const p1 = db.prepare(
    `INSERT INTO properties (name, slug, ec2_url, domain, plan, description)
     VALUES ('Headquarters', 'headquarters', 'http://127.0.0.1:5000', 'hq.optima.sclera.com', 'enterprise', 'Main HQ property')`
  ).run().lastInsertRowid;

  const p2 = db.prepare(
    `INSERT INTO properties (name, slug, ec2_url, domain, plan, description)
     VALUES ('Acme Corporation', 'acme-corp', 'http://10.0.1.51:5000', 'acme.optima.sclera.com', 'standard', 'Acme Corp property')`
  ).run().lastInsertRowid;

  // Grant super_admin access to both properties
  db.prepare(`INSERT INTO user_properties (user_id, property_id, role) VALUES (?, ?, 'super_admin')`).run(adminId, p1);
  db.prepare(`INSERT INTO user_properties (user_id, property_id, role) VALUES (?, ?, 'super_admin')`).run(adminId, p2);

  // Demo user with access to only HQ
  const userHash = bcrypt.hashSync('User@123', 10);
  const userId = db.prepare(
    `INSERT INTO users (name, email, password, global_role) VALUES ('John Smith', 'john@optima.com', ?, 'user')`
  ).run(userHash).lastInsertRowid;
  db.prepare(`INSERT INTO user_properties (user_id, property_id, role) VALUES (?, ?, 'user')`).run(userId, p1);

  console.log('✅ Portal seed data created');
}

module.exports = { getDb, initDatabase };
