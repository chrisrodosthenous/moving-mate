/**
 * Centralized env resolution for MongoDB URI and JWT secret.
 * In production, secrets and DB URI must come from the environment (no insecure fallbacks).
 */
const isProd = process.env.NODE_ENV === 'production';

const DEV_JWT_PLACEHOLDER = 'dev-secret-change-in-production';
const DEV_MONGO_FALLBACK = 'mongodb://localhost:27017/moving-mate';

function getMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (uri && String(uri).trim()) return String(uri).trim();
  if (isProd) {
    throw new Error('MONGODB_URI or MONGO_URI must be set in production');
  }
  return DEV_MONGO_FALLBACK;
}

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s && String(s).trim()) return String(s).trim();
  if (isProd) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_JWT_PLACEHOLDER;
}

/** True if running in production with the insecure default JWT (should refuse to start). */
function isProductionDefaultJwt(secret) {
  return isProd && secret === DEV_JWT_PLACEHOLDER;
}

/** `mock` (default) until Stripe is integrated; `stripe` when live PSP is wired. */
function getPaymentsProvider() {
  const raw = (process.env.PAYMENTS_PROVIDER || 'mock').trim().toLowerCase();
  return raw === 'stripe' ? 'stripe' : 'mock';
}

function isMockPayments() {
  return getPaymentsProvider() === 'mock';
}

module.exports = {
  isProd,
  getMongoUri,
  getJwtSecret,
  isProductionDefaultJwt,
  getPaymentsProvider,
  isMockPayments,
  DEV_JWT_PLACEHOLDER,
};
