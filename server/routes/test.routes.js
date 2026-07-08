/**
 * Dev / explicit test API under /api/test/*
 * Mounted in server.js: app.use('/api/test', testRoutes) — before 404 handler.
 *
 * Enabled when NODE_ENV is not production, OR ENABLE_TEST_ROUTES=true (for prod smoke tests).
 */
const express = require('express');
const { auditRateProbeLimiter } = require('../middleware/rateLimiters');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');

const router = express.Router();

function testAccessGate(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  const enabled = process.env.ENABLE_TEST_ROUTES === 'true' || !isProd;
  if (!enabled) {
    return res.status(404).json({ message: 'Not found' });
  }
  next();
}

router.use(testAccessGate);

/** GET /api/test/full-notification-flow */
const fullNotificationFlowHandler = async (req, res) => {
  try {
    const { runFullNotificationFlow } = require('../scripts/fullNotificationFlowTest');
    const report = await runFullNotificationFlow();
    res.json(report);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || 'Full notification flow failed' });
  }
};
router.get('/full-notification-flow', fullNotificationFlowHandler);

/** GET /api/test/districts-flow */
router.get('/districts-flow', async (req, res) => {
  try {
    const { runDistrictsFlowTest } = require('../scripts/districtsFlowTest');
    const report = await runDistrictsFlowTest();
    res.status(report.ok ? 200 : 500).json(report);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || 'Districts flow test failed' });
  }
});

/** GET /api/test/sockets — registered on app in server.js (same pattern as final-grand-audit). */

function phoneFromSeed(seed, salt = 0) {
  const base = String(seed)
    .split('')
    .reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0) + salt) % 100000000, 17);
  return `+357${String(base).padStart(8, '0')}`;
}

/** POST /api/test/e2e/bootstrap — create deterministic admin+customer credentials for Playwright. */
router.post('/e2e/bootstrap', async (req, res) => {
  try {
    const runId = String(req.body?.runId || '').trim();
    if (!runId) return res.status(400).json({ message: 'runId is required' });

    const adminEmail = `e2e-admin-${runId}@movingmate.test`;
    const customerEmail = `e2e-customer-${runId}@movingmate.test`;
    const driverEmail = `e2e-driver-${runId}@movingmate.test`;
    const password = 'E2ePass1!';
    const hashed = await bcrypt.hash(password, 10);

    const [admin, customer, driver] = await Promise.all([
      User.findOneAndUpdate(
        { email: adminEmail },
        {
          $set: {
            firstName: 'E2E',
            lastName: 'Admin',
            role: 'admin',
            password: hashed,
            isVerified: true,
            verificationStatus: 'approved',
          },
          $setOnInsert: {
            dateOfBirth: new Date('1990-01-01'),
            phoneNumber: phoneFromSeed(`${runId}-admin`, 3),
            licenseUrl: '',
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: false }
      ),
      User.findOneAndUpdate(
        { email: customerEmail },
        {
          $set: {
            firstName: 'E2E',
            lastName: 'Customer',
            role: 'customer',
            password: hashed,
            isVerified: true,
            verificationStatus: 'approved',
          },
          $setOnInsert: {
            dateOfBirth: new Date('1992-01-01'),
            phoneNumber: phoneFromSeed(`${runId}-customer`, 7),
            licenseUrl: '',
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: false }
      ),
      User.findOneAndUpdate(
        { email: driverEmail },
        {
          $set: {
            firstName: 'E2E',
            lastName: 'Driver',
            role: 'driver',
            password: hashed,
            isVerified: true,
            verificationStatus: 'approved',
            districts: ['Nicosia'],
            vehicleType: 'pickup',
          },
          $setOnInsert: {
            dateOfBirth: new Date('1988-06-01'),
            phoneNumber: phoneFromSeed(`${runId}-driver`, 11),
            licenseUrl: '',
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: false }
      ),
    ]);

    return res.json({
      ok: true,
      runId,
      admin: { email: admin.email, password },
      customer: { email: customer.email, password },
      driver: { email: driver.email, password },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'e2e bootstrap failed' });
  }
});

/** POST /api/test/e2e/set-driver-verified — mark driver verified (E2E only). */
router.post('/e2e/set-driver-verified', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'email is required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'driver') return res.status(400).json({ message: 'Not a driver account' });
    user.isVerified = true;
    user.verificationStatus = 'approved';
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'set-driver-verified failed' });
  }
});

/** POST /api/test/e2e/delete-user-by-email — remove one user (E2E cleanup). */
router.post('/e2e/delete-user-by-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'email is required' });
    const u = await User.findOne({ email }).select('_id').lean();
    if (!u) return res.json({ ok: true, deleted: 0 });
    await TransportOrder.deleteMany({ $or: [{ customerId: u._id }, { driverId: u._id }] });
    const r = await User.deleteOne({ _id: u._id });
    return res.json({ ok: true, deleted: r.deletedCount || 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'delete-user failed' });
  }
});

/** POST /api/test/e2e/cleanup — remove E2E users/orders for this runId. */
router.post('/e2e/cleanup', async (req, res) => {
  try {
    const runId = String(req.body?.runId || '').trim();
    if (!runId) return res.status(400).json({ message: 'runId is required' });
    const emailRegex = new RegExp(`^e2e-(admin|customer|driver)-${runId}@movingmate\\.test$`);
    const users = await User.find({ email: emailRegex }).select('_id').lean();
    const ids = users.map((u) => u._id);

    const [ordersDeleted, usersDeleted] = await Promise.all([
      ids.length ? TransportOrder.deleteMany({ $or: [{ customerId: { $in: ids } }, { driverId: { $in: ids } }] }) : { deletedCount: 0 },
      User.deleteMany({ email: emailRegex }),
    ]);

    return res.json({
      ok: true,
      runId,
      usersDeleted: usersDeleted.deletedCount || 0,
      ordersDeleted: ordersDeleted.deletedCount || 0,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || 'e2e cleanup failed' });
  }
});

/** GET /api/test/rate-limit-probe */
router.get('/rate-limit-probe', auditRateProbeLimiter, (req, res) => {
  res.json({ ok: true, probe: true });
});

/** final-grand-audit is registered on app in server.js (avoids test router 404 gate). */

module.exports = router;
