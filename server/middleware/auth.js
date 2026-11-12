const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');
const User = require('../models/User');
const { CUSTOMER_SUSPENDED_MESSAGE } = require('../constants/accountStatus');

const JWT_SECRET = getJwtSecret();

/**
 * Protects routes - verifies JWT and attaches user to req.
 * Expects: Authorization: Bearer <token>
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const account = await User.findById(decoded.userId).select('isSuspended role');
    if (account && account.role !== 'admin' && account.isSuspended) {
      return res.status(403).json({
        message: CUSTOMER_SUSPENDED_MESSAGE,
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    next(err);
  }
}

module.exports = { authMiddleware };
