/**
 * Central Routing Proxy Server
 * Routes incoming requests to the correct property server based on:
 *   1. Subdomain: acme.optima.io → property "acme"
 *   2. Header: X-Property-Slug: acme
 *   3. Query param: ?property=acme
 *
 * Runs on port 3000 (or ROUTER_PORT env).
 * In AWS, this is the ALB target — ALB host-based rules route to ECS tasks.
 *
 * Usage: node router-server.js
 * Requires: PROPERTY_MAP env var (JSON): '{"headquarters":5000,"acme":5001,"globex":5002}'
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { getDb } = require('./database/init');

const ROUTER_PORT = parseInt(process.env.ROUTER_PORT || '3000');
const app = express();

// Build property slug → target URL map from env or from DB
function buildPropertyMap() {
  if (process.env.PROPERTY_MAP) {
    try {
      const portMap = JSON.parse(process.env.PROPERTY_MAP); // { slug: port }
      return Object.fromEntries(Object.entries(portMap).map(([slug, port]) => [slug, `http://localhost:${port}`]));
    } catch (e) {
      console.error('Invalid PROPERTY_MAP JSON:', e.message);
    }
  }
  // Fallback: load from DB, assign ports starting at 5000
  const db = getDb();
  const props = db.prepare("SELECT slug FROM properties WHERE status='active' ORDER BY id").all();
  return Object.fromEntries(props.map((p, i) => [p.slug, `http://localhost:${5000 + i}`]));
}

function resolveSlug(req) {
  // 1. Subdomain (e.g. acme.optima.io)
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'optima') return subdomain;

  // 2. Header
  const headerSlug = req.headers['x-property-slug'];
  if (headerSlug) return headerSlug;

  // 3. Query param
  if (req.query.property) return req.query.property;

  return null;
}

app.use((req, res, next) => {
  const propertyMap = buildPropertyMap();
  const slug = resolveSlug(req);

  if (!slug) {
    return res.status(400).json({ error: 'No property specified. Use subdomain, X-Property-Slug header, or ?property= query param.' });
  }

  const target = propertyMap[slug];
  if (!target) {
    return res.status(404).json({ error: `Property "${slug}" not found or not running.`, available: Object.keys(propertyMap) });
  }

  // Proxy the request to the property server
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    logLevel: 'warn',
    on: {
      error: (err, req, res) => res.status(502).json({ error: 'Property server unavailable', details: err.message }),
    },
  })(req, res, next);
});

app.listen(ROUTER_PORT, () => {
  console.log(`\n🔀 Optima Router running on http://localhost:${ROUTER_PORT}`);
  console.log('   Routes requests to property servers by subdomain / header / query param\n');
});
