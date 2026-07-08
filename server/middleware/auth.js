const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');

const JWT_SECRET = getJwtSecret();

/**
 * Protects routes - verifies JWT and attaches user to req.
 * Expects: Authorization: Bearer <token>
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = { authMiddleware };
