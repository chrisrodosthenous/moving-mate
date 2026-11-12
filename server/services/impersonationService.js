const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminAudit = require('../models/AdminAudit');
const ImpersonationGrant = require('../models/ImpersonationGrant');
const { getJwtSecret } = require('../config/env');
const { buildUserOut } = require('../controllers/auth.controller');

const GRANT_TTL_MS = 60_000;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code), 'utf8').digest('hex');
}

function signImpersonationToken(user, adminId) {
  return jwt.sign(
    {
      userId: user._id,
      phone: user.phoneNumber,
      role: user.role,
      impersonatedBy: adminId,
    },
    getJwtSecret(),
    { expiresIn: '8h' },
  );
}

/** Issue a one-time code. The login token is returned only by {@link redeemImpersonationGrant}. */
async function createImpersonationGrant({ adminId, user }) {
  const code = crypto.randomBytes(32).toString('hex');
  await ImpersonationGrant.create({
    codeHash: hashCode(code),
    adminId,
    targetUserId: user._id,
    expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    used: false,
  });
  await AdminAudit.create({
    adminId,
    targetUserId: user._id,
    targetRole: user.role,
    action: 'impersonate',
  });
  return code;
}

async function redeemImpersonationGrant({ adminId, code }) {
  const grant = await ImpersonationGrant.findOneAndUpdate(
    {
      codeHash: hashCode(code),
      adminId,
      used: false,
      expiresAt: { $gt: new Date() },
    },
    { $set: { used: true } },
    { returnDocument: 'after' },
  );
  if (!grant) return null;
  const user = await User.findById(grant.targetUserId);
  if (!user || user.isSuspended || (user.role !== 'customer' && user.role !== 'driver')) return null;
  return {
    token: signImpersonationToken(user, String(adminId)),
    user: buildUserOut(user),
  };
}

module.exports = {
  createImpersonationGrant,
  redeemImpersonationGrant,
  signImpersonationToken,
};
