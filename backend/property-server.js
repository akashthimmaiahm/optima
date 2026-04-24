/**
 * Per-Property Server
 * Each EC2 instance runs this with its own environment variables.
 *
 * Required env vars:
 *   PROPERTY_ID    - integer ID matching the properties table
 *   PROPERTY_SLUG  - URL-safe slug (e.g. "acme-corp")
 *   PORT           - HTTP port (default 5000)
 *   DB_PATH        - absolute path to SQLite file (default ./optima.db)
 *                    On EC2 point this to the EBS mount: /opt/optima/data/optima.db
 *   ALLOWED_ORIGIN - CORS origin (default *)
 *   JWT_SECRET     - override JWT secret (optional, has default in middleware/auth.js)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Override DB path before init loads it
if (process.env.DB_PATH) {
  process.env.OPTIMA_DB_PATH = process.env.DB_PATH;
}

const { initDatabase, getDb } = require('./database/init');

const PROPERTY_ID   = parseInt(process.env.PROPERTY_ID || '1');
const PROPERTY_SLUG = process.env.PROPERTY_SLUG || 'default';
const PORT          = parseInt(process.env.PORT || '5000');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Boot database
initDatabase();

const db = getDb();
const property = db.prepare('SELECT * FROM properties WHERE id=?').get(PROPERTY_ID);
if (!property) {
  console.error(`❌ Property ID ${PROPERTY_ID} not found. Run the app once to seed the default property.`);
  process.exit(1);
}

const app = express();

app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Stamp every request with this property's ID
app.use((req, _res, next) => {
  req.propertyId   = PROPERTY_ID;
  req.propertySlug = PROPERTY_SLUG;
  next();
});

// Routes — identical to main server
app.use('/api/auth',              require('./routes/auth'));
app.use('/api/dashboard',         require('./routes/dashboard'));
app.use('/api/software',          require('./routes/software'));
app.use('/api/hardware',          require('./routes/hardware'));
app.use('/api/licenses',          require('./routes/licenses'));
app.use('/api/integrations',      require('./routes/integrations'));
app.use('/api/users',             require('./routes/users'));
app.use('/api/vendors',           require('./routes/vendors'));
app.use('/api/contracts',         require('./routes/contracts'));
app.use('/api/reports',           require('./routes/reports'));
app.use('/api/cloud-intelligence',require('./routes/cloud_intelligence'));
app.use('/api/cmdb',              require('./routes/cmdb'));
app.use('/api/chat',              require('./routes/chat'));
app.use('/api/mdm',               require('./routes/mdm'));
app.use('/api/properties',        require('./routes/properties'));
app.use('/api/procurement',       require('./routes/procurement'));
app.use('/api/agent',             require('./routes/agent'));
app.use('/api/update',            require('./routes/update'));

const CLIENT_VERSION = '7.1.2';

app.get('/api/health', (_req, res) => res.json({
  status:        'OK',
  app:           'Optima',
  version:       CLIENT_VERSION,
  property:      property.name,
  property_id:   PROPERTY_ID,
  property_slug: PROPERTY_SLUG,
  port:          PORT,
  db_path:       process.env.OPTIMA_DB_PATH || './optima.db',
  uptime_s:      Math.floor(process.uptime()),
}));

// ── Check for updates from portal ────────────────────────────────────────────
const http = require('http');
const https = require('https');

app.get('/api/update/check', require('./middleware/auth').authenticate, async (_req, res) => {
  const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3000';
  const isHttps = PORTAL_URL.startsWith('https');
  const url = new URL('/api/version', PORTAL_URL);

  const lib = isHttps ? https : http;
  lib.get(url.toString(), (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      try {
        const manifest = JSON.parse(d);
        const upToDate = manifest.version === CLIENT_VERSION;
        res.json({ current_version: CLIENT_VERSION, ...manifest, up_to_date: upToDate });
      } catch { res.status(502).json({ error: 'Failed to parse version manifest' }); }
    });
  }).on('error', err => res.status(503).json({ error: 'Cannot reach portal', detail: err.message }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏢  Property : "${property.name}"  (id=${PROPERTY_ID})`);
  console.log(`🚀  Backend  : http://0.0.0.0:${PORT}`);
  console.log(`💾  Database : ${process.env.OPTIMA_DB_PATH || './optima.db'}\n`);
});
