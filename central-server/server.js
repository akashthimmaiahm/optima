require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { initDatabase } = require('./database/init');
const { proxyMiddleware } = require('./routes/proxy');

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

// ── Trigger client update (super admin only, proxied to property EC2) ──────────
// This is handled by the proxy — property EC2 exposes POST /api/update/apply

// ── Proxy: ALL other /api/* → selected property EC2 ──────────────────────────
// Must come AFTER the central API routes above
app.use('/api', proxyMiddleware);

// ── Serve React frontend (SPA) ────────────────────────────────────────────────
const FRONTEND_DIST = process.env.FRONTEND_DIST
  || path.join(__dirname, '../frontend/dist');

app.use(express.static(FRONTEND_DIST));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐  Optima Central Portal`);
  console.log(`🚀  Running on http://0.0.0.0:${PORT}`);
  console.log(`🔑  Auth  : POST /api/auth/login`);
  console.log(`🏢  Portal: GET  /api/portal/properties`);
  console.log(`🔀  Proxy : /api/* → property EC2\n`);
});
