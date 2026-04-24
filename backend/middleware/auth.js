const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'optima_secret_key_2024_enterprise';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Normalize portal tokens — map global_role → role for downstream route compatibility
    if (decoded.fromPortal && !decoded.role) {
      decoded.role = decoded.global_role || 'user';
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate, JWT_SECRET };
