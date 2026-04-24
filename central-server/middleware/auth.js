const jwt = require('jsonwebtoken');

// This secret MUST match the JWT_SECRET on every property EC2
// so the same token works when proxied through
const JWT_SECRET = process.env.JWT_SECRET || 'optima_secret_key_2024_enterprise';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function superAdminOnly(req, res, next) {
  if (req.user?.global_role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin only' });
  }
  next();
}

module.exports = { authenticate, superAdminOnly, JWT_SECRET };
