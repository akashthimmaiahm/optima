/**
 * Property scoping middleware.
 * Attaches `req.propertyId` based on the authenticated user's property_id.
 * super_admin with property_id=null has cross-property access:
 *   - they can pass ?property_id=X to scope to a specific property
 *   - without it they see all data (no WHERE clause added)
 */
function scopeProperty(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });

  if (user.role === 'super_admin') {
    // Allow super_admin to optionally scope to a property
    const requested = req.query.property_id || req.headers['x-property-id'];
    req.propertyId = requested ? parseInt(requested) : null;
  } else {
    // Regular users are always scoped to their property
    req.propertyId = user.property_id || null;
  }
  next();
}

module.exports = { scopeProperty };
