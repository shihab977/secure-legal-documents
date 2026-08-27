const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware to verify JWT Access Token from Authorization Header.
 */
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_2026');

    const user = await User.findById(decoded.id).select('-authHash');
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token. User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or corrupted authentication token.' });
  }
};

/**
 * Middleware for Role-Based Access Control (RBAC).
 * Example usage: requireRole('lawyer') or requireRole('lawyer', 'client')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access forbidden. Requires one of the following roles: ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
};

module.exports = {
  authenticateJWT,
  requireRole
};
