/**
 * Property Proxy
 *
 * ALL requests to /api/* (except /api/auth and /api/portal) are proxied
 * to the selected property's EC2 instance.
 *
 * The frontend sends: X-Property-Id: <property_id>
 * This middleware looks up the ec2_url for that property and forwards the request.
 *
 * The same JWT issued at login is forwarded as-is — since the central server
 * and property EC2s share the same JWT_SECRET, it validates on both ends.
 */

const { createProxyMiddleware } = require('http-proxy-middleware');
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Cache property → ec2_url lookups for 60 seconds to avoid DB hit on every request
const cache = new Map();
const CACHE_TTL = 60_000;

function getPropertyUrl(propertyId) {
  const cached = cache.get(propertyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;
  const db = getDb();
  const prop = db.prepare("SELECT ec2_url FROM properties WHERE id=? AND status='active'").get(propertyId);
  if (!prop) return null;
  cache.set(propertyId, { url: prop.ec2_url, ts: Date.now() });
  return prop.ec2_url;
}

function resolvePropertyId(req) {
  // 1. From header (preferred — set by frontend after property selection)
  const fromHeader = req.headers['x-property-id'];
  if (fromHeader) return parseInt(fromHeader);

  // 2. From JWT payload (if user only has one property, auto-set on login)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.accessible_property_ids?.length === 1) {
        return decoded.accessible_property_ids[0];
      }
    } catch { /* ignore */ }
  }
  return null;
}

function proxyMiddleware(req, res, next) {
  const propertyId = resolvePropertyId(req);

  if (!propertyId) {
    return res.status(400).json({
      error: 'no_property_selected',
      message: 'No property selected. Set X-Property-Id header or select a property in the portal.',
    });
  }

  // Verify the user is allowed to access this property
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded.global_role !== 'super_admin') {
        const allowed = decoded.accessible_property_ids || [];
        if (!allowed.includes(propertyId)) {
          return res.status(403).json({ error: 'Access denied to this property' });
        }
      }
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  const target = getPropertyUrl(propertyId);
  if (!target) {
    return res.status(503).json({
      error: 'property_unavailable',
      message: `Property ${propertyId} is not available or not registered.`,
    });
  }

  // Stamp the request so the property EC2 knows it came from the portal
  req.headers['x-from-portal'] = 'true';
  req.headers['x-portal-property-id'] = String(propertyId);

  // Dynamic proxy to the resolved target.
  // NOTE: Express strips the /api mount prefix before this middleware runs,
  // so req.url is e.g. /dashboard/stats — we must prepend /api back.
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    logLevel: 'warn',
    pathRewrite: (path) => '/api' + path,
    on: {
      error: (err, req, res) => {
        cache.delete(propertyId); // clear stale cache on error
        res.status(502).json({
          error: 'property_unreachable',
          message: `Could not connect to property server. It may be starting up.`,
          detail: err.message,
        });
      },
    },
  })(req, res, next);
}

module.exports = { proxyMiddleware };
