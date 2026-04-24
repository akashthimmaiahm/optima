const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  it_admin: ['read:all', 'write:software', 'write:hardware', 'write:licenses', 'write:integrations'],
  it_manager: ['read:all', 'write:software', 'write:hardware', 'approve:all'],
  asset_manager: ['read:all', 'write:hardware', 'write:software'],
  auditor: ['read:all'],
  user: ['read:own'],
};

function authorize(...requiredRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = req.user.role;
    if (requiredRoles.includes(userRole) || userRole === 'super_admin') return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = { authorize, ROLE_PERMISSIONS };
