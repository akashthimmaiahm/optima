require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const { initDatabase } = require('./database/init');
const { proxyMiddleware } = require('./routes/proxy');
const { initWebSocketHub, getHealthMap } = require('./ws-hub');

const app  = express();
const PORT = parseInt(process.env.PORT || '4000');

// Boot central DB
initDatabase();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(morgan('combined'));

// ── Central API (auth + portal management) ────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/agents', require('./routes/agents'));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({
  status:  'OK',
  app:     'Optima Central Portal',
  port:    PORT,
  uptime:  Math.floor(process.uptime()),
}));

// ── Version manifest — clients poll this to check for updates ─────────────────
// Update this object whenever a new release is deployed to the portal.
const VERSION_MANIFEST = {
  version:      '7.1.2',
  released_at:  '2026-04-24',
  mandatory:    false,
  changelog: [
    'Procurement management with approval workflow',
    'Property agent download (Windows/Linux/macOS)',
    'Property key-based client installer',
    'Monitor button for IT assets (app.sclera.com)',
    'Optima logo update throughout the app',
    'Dark theme scrollbar (blue on black)',
    'User authorization matrix in property selector',
  ],
  min_client_version: '7.0.0',
};

app.get('/api/version', (_req, res) => res.json(VERSION_MANIFEST));

// ── Agent proxy: resolve property from property_key in body ──────────────────
// Agents don't have JWT tokens, so we resolve the property from the key
app.use('/api/agent', (req, res, next) => {
  const propertyKey = req.body?.property_key;
  if (!propertyKey && !req.body?.agent_id) return next();
  const db = require('./database/init').getDb();
  // Try property_key first
  let prop = null;
  if (propertyKey) {
    prop = db.prepare("SELECT id, ec2_url FROM properties WHERE property_key=? AND status='active'").get(propertyKey);
  }
  // For heartbeat/inventory, look up agent_id to find property
  if (!prop && req.body?.agent_id) {
    // We don't store agents centrally, so just try all properties with ec2_url
    // Forward to the property that has this agent registered
    const props = db.prepare("SELECT id, ec2_url FROM properties WHERE ec2_url IS NOT NULL AND status='active'").all();
    if (props.length === 1) prop = props[0];
    else {
      // Multi-property: use X-Property-Id if available, or try first one
      const hdr = req.headers['x-property-id'];
      if (hdr) prop = props.find(p => p.id === parseInt(hdr));
      if (!prop) prop = props[0];
    }
  }
  if (prop) {
    req.headers['x-property-id'] = String(prop.id);
  }
  next();
}, proxyMiddleware);

// ── Proxy: ALL other /api/* → selected property EC2 ──────────────────────────
// Must come AFTER the central API routes above
app.use('/api', proxyMiddleware);

// ── Serve React frontend (SPA) ────────────────────────────────────────────────
const FRONTEND_DIST = process.env.FRONTEND_DIST
  || path.join(__dirname, '../frontend/dist');

app.use(express.static(FRONTEND_DIST));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));

const server = http.createServer(app);
initWebSocketHub(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐  Optima Central Portal`);
  console.log(`🚀  Running on http://0.0.0.0:${PORT}`);
  console.log(`🔑  Auth  : POST /api/auth/login`);
  console.log(`🏢  Portal: GET  /api/portal/properties`);
  console.log(`🔀  Proxy : /api/* → property EC2\n`);
});
