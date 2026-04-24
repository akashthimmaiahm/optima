const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { randomUUID } = require('crypto');

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT UNIQUE NOT NULL,
      property_id  INTEGER,
      hostname     TEXT,
      platform     TEXT,
      os_name      TEXT,
      ip_address   TEXT,
      status       TEXT DEFAULT 'active',
      last_seen    TEXT DEFAULT (datetime('now')),
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);
  try { db.exec("ALTER TABLE agents ADD COLUMN agent_version TEXT") } catch(e){}
}

// POST /api/agent/register
router.post('/register', (req, res) => {
  ensureTable();
  const db = getDb();
  const { property_key, hostname, platform, os, ip_address, agent_version } = req.body;
  if (!property_key) return res.status(400).json({ error: 'property_key required' });

  const agent_id = randomUUID();
  db.prepare(`
    INSERT INTO agents (agent_id, property_id, hostname, platform, os_name, ip_address, agent_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(agent_id, req.propertyId || 1, hostname, platform, os, ip_address || '', agent_version || '1.0.0');

  res.json({ agent_id, property_id: req.propertyId || 1 });
});

// POST /api/agent/heartbeat
router.post('/heartbeat', (req, res) => {
  ensureTable();
  const db = getDb();
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
  db.prepare("UPDATE agents SET last_seen=datetime('now'), status='active' WHERE agent_id=?").run(agent_id);
  res.json({ ok: true });
});

// POST /api/agent/inventory
router.post('/inventory', (req, res) => {
  ensureTable();
  const db = getDb();
  const { agent_id, property_key, hardware, software, collected_at } = req.body;

  if (!agent_id || !hardware) return res.status(400).json({ error: 'agent_id and hardware required' });

  const propId = req.propertyId || 1;

  // Update agent last seen
  db.prepare(`UPDATE agents SET last_seen=datetime('now'), hostname=?, ip_address=? WHERE agent_id=?`)
    .run(hardware.hostname || '', (hardware.network_interfaces?.[0]?.ip4) || '', agent_id);

  // Upsert hardware asset (match by serial_number)
  const assetTag = `AGT-${agent_id.slice(0, 8).toUpperCase()}`;
  const ramStr = hardware.ram_gb ? `${hardware.ram_gb}GB` : '';
  const storageStr = (hardware.disks || []).map(d => `${d.size_gb}GB ${d.type}`).join(', ') || '';
  const ip4 = (hardware.network_interfaces || []).find(n => n.ip4)?.ip4 || '';
  const mac = (hardware.network_interfaces || []).find(n => n.mac)?.mac || '';

  const deviceType = hardware.platform === 'win32' ? 'Laptop' :
                     hardware.platform === 'darwin' ? 'MacBook' : 'Workstation';

  const existing = db.prepare("SELECT id FROM hardware_assets WHERE serial_number=?").get(hardware.serial_number);
  if (existing) {
    db.prepare(`
      UPDATE hardware_assets
      SET name=?, os=?, processor=?, ram=?, storage=?, ip_address=?, mac_address=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      hardware.hostname, hardware.os, hardware.cpu_model || '', ramStr, storageStr, ip4, mac,
      existing.id
    );
  } else {
    try {
      db.prepare(`
        INSERT INTO hardware_assets
          (asset_tag, name, type, manufacturer, model, serial_number, status, condition, os, processor, ram, storage, ip_address, mac_address, notes, property_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        assetTag, hardware.hostname, deviceType,
        hardware.manufacturer || 'Unknown', hardware.model || 'Unknown',
        hardware.serial_number, 'active', 'good',
        hardware.os, hardware.cpu_model || '', ramStr, storageStr, ip4, mac,
        `Agent-discovered. GPU: ${hardware.gpu || 'N/A'}`,
        propId
      );
    } catch(e) {
      // Duplicate asset_tag — skip
    }
  }

  // Upsert software assets (only insert new ones to avoid flooding)
  let inserted = 0;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO software_assets
      (name, vendor, version, category, license_type, total_licenses, used_licenses, status, notes, property_id)
    VALUES (?, ?, ?, 'Discovered', 'agent', 0, 0, 'active', 'Agent-discovered', ?)
  `);
  const upsertMany = db.transaction((apps) => {
    for (const app of apps) {
      if (!app.name || app.name.length < 2) continue;
      const result = insertStmt.run(app.name, app.vendor || '', app.version || '', propId);
      if (result.changes > 0) inserted++;
    }
  });
  upsertMany((software || []).slice(0, 500));

  res.json({
    ok: true,
    hardware_upserted: true,
    software_new: inserted,
    software_total: (software || []).length,
    collected_at
  });
});

// GET /api/agent/list (authenticated — for UI)
const { authenticate } = require('../middleware/auth');
router.get('/list', authenticate, (req, res) => {
  ensureTable();
  const db = getDb();
  const agents = db.prepare("SELECT * FROM agents WHERE property_id=? ORDER BY last_seen DESC").all(req.propertyId || 1);
  res.json({ data: agents });
});

module.exports = router;
