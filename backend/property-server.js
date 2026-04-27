/**
 * Per-Property Server
 *
 * First-time setup (no PROPERTY_KEY in .env):
 *   node property-server.js   →  prompts for property key from Optima portal
 *
 * Subsequent starts (PROPERTY_KEY saved in .env):
 *   node property-server.js   →  auto-verifies key and starts
 *
 * Optional env vars:
 *   PORT           - HTTP port (default 5000)
 *   DB_PATH        - SQLite path (default ./optima.db)
 *   CENTRAL_SERVER_URL - portal URL (default https://optima.sclera.com)
 *   ALLOWED_ORIGIN - CORS origin (default *)
 *   JWT_SECRET     - JWT secret (must match central server)
 */

require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const http     = require('http');
const https    = require('https');

// Override DB path before init loads it
if (process.env.DB_PATH) process.env.OPTIMA_DB_PATH = process.env.DB_PATH;

const PORT           = parseInt(process.env.PORT || '5000');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const CENTRAL_URL    = process.env.CENTRAL_SERVER_URL || 'https://optima.sclera.com';
const ENV_FILE       = path.join(__dirname, '.env');

// ── Helpers ───────────────────────────────────────────────────────────────────

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const data   = JSON.stringify(body);
    const req    = lib.request(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.write(data);
    req.end();
  });
}

function saveEnvVar(key, value) {
  let content = '';
  try { content = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* file may not exist yet */ }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line  = `${key}=${value}`;
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.trimEnd() + '\n' + line + '\n';
  }
  fs.writeFileSync(ENV_FILE, content);
}

// ── Detect real public IP (EC2 IMDSv2 or env var fallback) ───────────────────

async function getPublicIP() {
  // Allow manual override via env var (useful for non-EC2 or local installs)
  if (process.env.EC2_PUBLIC_IP) return process.env.EC2_PUBLIC_IP;

  // Try EC2 IMDSv2: first get token, then use it to fetch public IPv4
  return new Promise((resolve) => {
    const tokenReq = http.request({
      hostname: '169.254.169.254',
      path:     '/latest/api/token',
      method:   'PUT',
      headers:  { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      timeout:  2000,
    }, (res) => {
      let token = '';
      res.on('data', c => token += c);
      res.on('end', () => {
        const ipReq = http.request({
          hostname: '169.254.169.254',
          path:     '/latest/meta-data/public-ipv4',
          method:   'GET',
          headers:  { 'X-aws-ec2-metadata-token': token.trim() },
          timeout:  2000,
        }, (r) => {
          let ip = '';
          r.on('data', c => ip += c);
          r.on('end', () => resolve(ip.trim() || null));
        });
        ipReq.on('error', () => resolve(null));
        ipReq.on('timeout', () => { ipReq.destroy(); resolve(null); });
        ipReq.end();
      });
    });
    tokenReq.on('error', () => resolve(null));
    tokenReq.on('timeout', () => { tokenReq.destroy(); resolve(null); });
    tokenReq.end();
  });
}

// ── Setup: verify property key with central server ────────────────────────────

async function setupWithKey(key) {
  const publicIp = await getPublicIP();
  const ec2_url  = publicIp ? `http://${publicIp}:${PORT}` : null;
  if (publicIp) console.log(`  Public IP detected: ${publicIp}`);
  const result  = await postJson(`${CENTRAL_URL}/api/portal/verify-key`, { property_key: key, ec2_url });
  return result.property;   // { id, name, slug, domain, plan, status }
}

async function runSetup() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║      Optima Property Server — Setup        ║');
  console.log('╚════════════════════════════════════════════╝\n');
  console.log(`  Central server : ${CENTRAL_URL}`);
  console.log('  Get your property key from:\n');
  console.log(`  ${CENTRAL_URL}  →  Properties  →  Your Property  →  Key\n`);

  let property = null;
  while (!property) {
    const key = await prompt('  Enter property key: ');
    if (!key) { console.log('  ⚠️  Key cannot be empty.\n'); continue; }

    try {
      console.log('  Verifying with central server…');
      property = await setupWithKey(key);

      // Persist to .env for future starts
      saveEnvVar('PROPERTY_KEY',  key);
      saveEnvVar('PROPERTY_SLUG', property.slug);

      console.log(`\n  ✅  Registered as "${property.name}"`);
      console.log(`      Slug : ${property.slug}`);
      console.log(`      Plan : ${property.plan}\n`);
    } catch (err) {
      console.log(`  ❌  ${err.message}  — try again.\n`);
    }
  }
  return property;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const express = require('express');
  const cors    = require('cors');
  const morgan  = require('morgan');
  const { initDatabase, getDb } = require('./database/init');

  let PROPERTY_SLUG = process.env.PROPERTY_SLUG || 'default';
  let centralProperty = null;

  const savedKey = process.env.PROPERTY_KEY;

  if (savedKey) {
    // Auto-verify on every start to confirm key still valid + update ec2_url
    try {
      centralProperty = await setupWithKey(savedKey);
      PROPERTY_SLUG   = centralProperty.slug;
      console.log(`\n🔑  Verified with central server — "${centralProperty.name}"`);
    } catch (err) {
      console.error(`\n⚠️   Could not reach central server (${err.message}). Starting in offline mode.`);
    }
  } else if (!process.env.PROPERTY_ID) {
    // First time — interactive setup
    centralProperty = await runSetup();
    PROPERTY_SLUG   = centralProperty.slug;
  }

  // Expose verified name/slug to initDatabase so property record is correct
  if (centralProperty) {
    process.env.PROPERTY_NAME = centralProperty.name;
    process.env.PROPERTY_SLUG = centralProperty.slug;
  }

  // Boot local database
  initDatabase();
  const db = getDb();

  // Sync local property record from central if we have details
  if (centralProperty) {
    const existing = db.prepare('SELECT id FROM properties WHERE id=1').get();
    if (existing) {
      db.prepare(`UPDATE properties SET name=?, slug=?, updated_at=datetime('now') WHERE id=1`)
        .run(centralProperty.name, centralProperty.slug);
    }
  }

  const PROPERTY_ID = 1;  // local DB always uses id=1
  const property    = db.prepare('SELECT * FROM properties WHERE id=1').get();
  if (!property) {
    console.error('❌ Local property record not found. Run once to seed the database.');
    process.exit(1);
  }

  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('combined'));

  app.use((req, _res, next) => {
    req.propertyId   = PROPERTY_ID;
    req.propertySlug = PROPERTY_SLUG;
    next();
  });

  // Routes
  app.use('/api/auth',               require('./routes/auth'));
  app.use('/api/dashboard',          require('./routes/dashboard'));
  app.use('/api/software',           require('./routes/software'));
  app.use('/api/hardware',           require('./routes/hardware'));
  app.use('/api/licenses',           require('./routes/licenses'));
  app.use('/api/integrations',       require('./routes/integrations'));
  // User management is handled at the central portal level
  app.use('/api/vendors',            require('./routes/vendors'));
  app.use('/api/contracts',          require('./routes/contracts'));
  app.use('/api/reports',            require('./routes/reports'));
  app.use('/api/cloud-intelligence', require('./routes/cloud_intelligence'));
  app.use('/api/cmdb',               require('./routes/cmdb'));
  app.use('/api/chat',               require('./routes/chat'));
  app.use('/api/mdm',                require('./routes/mdm'));
  app.use('/api/properties',         require('./routes/properties'));
  app.use('/api/procurement',        require('./routes/procurement'));
  app.use('/api/ai-intelligence',    require('./routes/ai_intelligence'));
  app.use('/api/agent',              require('./routes/agent'));
  app.use('/api/update',             require('./routes/update'));
  app.use('/api/backup',             require('./routes/backup'));
  app.use('/api/asset-management',   require('./routes/asset_management'));

  const CLIENT_VERSION = '7.1.2';

  app.get('/api/health', (_req, res) => res.json({
    status:        'OK',
    app:           'Optima',
    version:       CLIENT_VERSION,
    property:      property.name,
    property_slug: PROPERTY_SLUG,
    port:          PORT,
    db_path:       process.env.OPTIMA_DB_PATH || './optima.db',
    uptime_s:      Math.floor(process.uptime()),
  }));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🏢  Property : "${property.name}"  (${PROPERTY_SLUG})`);
    console.log(`🚀  Backend  : http://0.0.0.0:${PORT}`);
    console.log(`🌐  Portal   : ${CENTRAL_URL}`);
    console.log(`💾  Database : ${process.env.OPTIMA_DB_PATH || './optima.db'}\n`);
  });

  // ── WebSocket: persistent connection to central server for health status ────
  if (centralProperty && process.env.PROPERTY_KEY) {
    connectWebSocket(centralProperty, PROPERTY_SLUG);
  }
}

function connectWebSocket(centralProperty, slug) {
  let WebSocket;
  try { WebSocket = require('ws'); } catch { console.log('  ws package not installed — skipping WebSocket'); return; }

  const wsProto = CENTRAL_URL.startsWith('https') ? 'wss' : 'ws';
  const host = CENTRAL_URL.replace(/^https?:\/\//, '');
  const params = `role=property&property_id=${centralProperty.id}&slug=${encodeURIComponent(slug)}&ec2_url=${encodeURIComponent(`http://${process.env.EC2_PUBLIC_IP || 'localhost'}:${PORT}`)}`;
  const wsUrl = `${wsProto}://${host}/ws?${params}`;

  let ws = null;
  let heartbeatInterval = null;
  let reconnectTimeout = null;

  function connect() {
    try {
      ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    } catch (e) {
      console.log(`  WS connection error: ${e.message}`);
      scheduleReconnect();
      return;
    }

    ws.on('open', () => {
      console.log('  WS connected to central server');
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 15000);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'connected') {
          console.log(`  WS acknowledged: property_id=${msg.property_id}`);
        }
      } catch {}
    });

    ws.on('close', () => {
      cleanup();
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.log(`  WS error: ${err.message}`);
      cleanup();
      scheduleReconnect();
    });
  }

  function cleanup() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  }

  function scheduleReconnect() {
    if (reconnectTimeout) return;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      console.log('  WS reconnecting to central server...');
      connect();
    }, 5000);
  }

  connect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
