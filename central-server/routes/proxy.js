/**
 * Property Proxy
 *
 * ALL requests to /api/* (except /api/auth and /api/portal) are proxied
 * to the selected property's EC2 instance.
 *
 * Uses manual http forwarding instead of http-proxy-middleware to handle
 * the case where express.json() has already consumed the request body.
 */

const http = require('http');
const https = require('https');
const { getDb } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Cache property → ec2_url lookups for 60 seconds
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
  const fromHeader = req.headers['x-property-id'];
  if (fromHeader) return parseInt(fromHeader);

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

function proxyMiddleware(req, res) {
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

  // Build the upstream URL
  // Use originalUrl to preserve the full path (e.g. /api/agent/register)
  // since sub-mounted middleware (like /api/agent) strips its prefix from req.url
  const upstreamUrl = new URL(req.originalUrl, target);
  const isHttps = upstreamUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  // Re-serialize body if express.json() already parsed it
  let bodyBuffer = null;
  if (req.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    bodyBuffer = Buffer.from(JSON.stringify(req.body));
  }

  // Build forwarded headers (strip host, add portal stamps)
  const fwdHeaders = { ...req.headers };
  delete fwdHeaders.host;
  fwdHeaders['x-from-portal'] = 'true';
  fwdHeaders['x-portal-property-id'] = String(propertyId);
  if (bodyBuffer) {
    fwdHeaders['content-type'] = 'application/json';
    fwdHeaders['content-length'] = String(bodyBuffer.length);
  }

  const proxyReq = transport.request({
    hostname: upstreamUrl.hostname,
    port:     upstreamUrl.port || (isHttps ? 443 : 80),
    path:     upstreamUrl.pathname + upstreamUrl.search,
    method:   req.method,
    headers:  fwdHeaders,
    timeout:  30000,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    cache.delete(propertyId);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'property_unreachable',
        message: 'Could not connect to property server. It may be starting up.',
        detail: err.message,
      });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    cache.delete(propertyId);
    if (!res.headersSent) {
      res.status(504).json({
        error: 'property_timeout',
        message: 'Property server did not respond in time.',
      });
    }
  });

  if (bodyBuffer) {
    proxyReq.end(bodyBuffer);
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    proxyReq.end();
  } else {
    // For non-parsed bodies (e.g. file uploads), pipe the raw stream
    req.pipe(proxyReq);
  }
}

module.exports = { proxyMiddleware };
