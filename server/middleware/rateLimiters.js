const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;

// In dev/E2E we want determinism (avoid flakiness from repeated login attempts).
const IS_RELAXED_TEST_MODE =
  process.env.ENABLE_TEST_ROUTES === 'true' ||
  process.env.NODE_ENV !== 'production' ||
  process.env.E2E_TEST === 'true';

/** Global cap hits fast during Playwright; skip in non-production (same as login/order relax). */
const globalApiLimiter = IS_RELAXED_TEST_MODE
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: WINDOW_MS,
      max: 100,
      message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
      standardHeaders: true,
      legacyHeaders: false,
    });

/** Stricter limit for login: 5 requests per 15 minutes per IP (disabled in relaxed test mode). */
const authLoginLimiter = IS_RELAXED_TEST_MODE
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: WINDOW_MS,
      max: 5,
      message: {
        message: 'Too many login attempts from this IP, please try again after 15 minutes.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

/** Stricter limit for order creation: 5 requests per 15 minutes per IP (disabled in relaxed test mode). */
const createOrderLimiter = IS_RELAXED_TEST_MODE
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: WINDOW_MS,
      max: 5,
      message: {
        message: 'Too many order creation attempts from this IP, please try again after 15 minutes.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

/**
 * Grand-audit probe: 5 hits per batch, 6th returns 429.
 * keyGenerator uses X-Audit-Batch so each audit run gets a fresh counter (same IP).
 */
const auditRateProbeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'AUDIT_RATE_LIMIT: Too many requests (rate-limit probe).' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const batch = String(req.get('X-Audit-Batch') || 'default').slice(0, 128);
    return `${rateLimit.ipKeyGenerator(req.ip || 'unknown')}:${batch}`;
  },
});

/** Forgot-password: limit abuse while keeping UX usable (disabled in relaxed test mode). */
const authForgotPasswordLimiter = IS_RELAXED_TEST_MODE
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: WINDOW_MS,
      max: 10,
      message: {
        message: 'Too many password reset requests from this IP, please try again after 15 minutes.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

module.exports = {
  globalApiLimiter,
  authLoginLimiter,
  authForgotPasswordLimiter,
  createOrderLimiter,
  auditRateProbeLimiter,
};
