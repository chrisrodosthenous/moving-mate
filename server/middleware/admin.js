/**
 * Requires req.user (set by authMiddleware) and req.user.role === 'admin'.
 * Use after authMiddleware.
 */
function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { adminMiddleware };
