require('dotenv').config();
/**
 * Moving Mate API server.
 * Uses process.env.PORT and process.env.MONGODB_URI (or MONGO_URI) for configuration.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const hpp = require('hpp');
const { sanitizeInputMiddleware } = require('./middleware/sanitizeInput');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const NotificationService = require('./services/notificationService');
const PushNotificationService = require('./services/pushNotificationService');
const SchedulerService = require('./services/schedulerService');
const { getMongoUri, getJwtSecret, isProductionDefaultJwt, getPaymentsProvider, isMockPayments } = require('./config/env');
const { registerClientStatic, registerSpaFallback } = require('./config/clientStatic');
const { ALLOWED_ORIGINS, ALLOWED_HEADERS, ALLOWED_METHODS } = require('./config/cors');
const { buildHelmetOptions } = require('./config/helmetConfig');
const { globalApiLimiter } = require('./middleware/rateLimiters');
const { joinUserSocketRooms, attachDriverLocationHandlers } = require('./services/realtimeService');
const { attachChatPresenceToSocket } = require('./services/chatPresenceService');
const { attachSocketPresenceToSocket } = require('./services/socketPresenceService');
const { attachChatSocketHandlers } = require('./services/chatSocketHandlers');
const { activeFcmTokens } = require('./utils/fcmTokens');
const { validateGoogleMapsApiKeyAtStartup } = require('./config/mapsEnv');

/** Legacy /api/test-email etc.: on when not production or ENABLE_TEST_ROUTES=true */
const testRoutesEnabled =
  process.env.ENABLE_TEST_ROUTES === 'true' || process.env.NODE_ENV !== 'production';

let MONGODB_URI;
let JWT_SECRET;
try {
  MONGODB_URI = getMongoUri();
  JWT_SECRET = getJwtSecret();
  if (isProductionDefaultJwt(JWT_SECRET)) {
    console.error('[Server] Refusing to start: JWT_SECRET cannot be the default value in production.');
    process.exit(1);
  }
} catch (e) {
  console.error('[Server] Invalid configuration:', e.message);
  process.exit(1);
}

validateGoogleMapsApiKeyAtStartup();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// CORS: origin function in config/cors.js — dev allows all origins (reflected), prod uses allow-list
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ALLOWED_METHODS,
    credentials: true,
  },
});
app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.role = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(
    `[Socket] connected id=${socket.id} userId=${socket.userId} role=${socket.role ?? ''}`
  );
  attachChatPresenceToSocket(socket);
  attachSocketPresenceToSocket(socket);
  attachChatSocketHandlers(socket, io);
  attachDriverLocationHandlers(socket, io);
  joinUserSocketRooms(socket).catch((err) => {
    console.warn('[Socket] joinUserSocketRooms failed:', err.message);
  });
});

// ── Security & parsing middleware ─────────────────────────────────────────────
app.use(helmet(buildHelmetOptions()));
// CORS only on /api — global CORS rejects ES module chunk requests (Origin header)
// for static JS when the prod allow-list omits the live site URL (black screen).
const apiCors = cors({
  origin: ALLOWED_ORIGINS, // dev: echo any origin; prod: allow-list
  credentials: true,
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  optionsSuccessStatus: 204,
});
app.use('/api', apiCors);
app.use('/api', globalApiLimiter);
app.use(hpp());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// After body parsers. Do not use express-mongo-sanitize / xss-clean before or in place of this:
// they can reassign req.query and throw "Cannot set property query" on Express 5. Our
// sanitizeInputMiddleware mutates inputs in place (see middleware/sanitizeInput.js).
app.use(sanitizeInputMiddleware);

// Static uploads (e.g. future profile or document uploads)
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

/** Project-root `public/` (e.g. socket-test.html) — before API routes so 404 handler does not swallow HTML */
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Health check (plain text for quick curl / proxy checks; JSON when requested)
app.get('/api/health', (req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('application/json')) {
    return res.json({
      ok: true,
      payments: getPaymentsProvider(),
      mockPayments: isMockPayments(),
    });
  }
  res.type('text/plain').send('OK');
});

/** Grand audit: registered on app (not orderRoutes) so path is exactly /api/test/final-grand-audit — before /api/test router gate. */
async function finalGrandAuditHandler(req, res) {
  try {
    const { runFinalGrandAudit } = require('./scripts/finalGrandAudit');
    const reportCard = await runFinalGrandAudit();
    res.json(reportCard);
  } catch (err) {
    res.status(500).json({
      overall: 'ERROR',
      message: err.message || 'Final grand audit failed',
    });
  }
}
app.get('/api/test/final-grand-audit', finalGrandAuditHandler);

/** Socket.io integration test (dev or ENABLE_TEST_ROUTES=true) */
async function socketIntegrationTestHandler(req, res) {
  const enabled = process.env.ENABLE_TEST_ROUTES === 'true' || process.env.NODE_ENV !== 'production';
  if (!enabled) {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const { runSocketIntegrationTest } = require('./scripts/socketIntegrationTest');
    const report = await runSocketIntegrationTest(req);
    res.status(report.ok ? 200 : 500).json(report);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || 'Socket integration test failed' });
  }
}
console.log('✅ Socket integration test at GET /api/test/sockets');
app.get('/api/test/sockets', socketIntegrationTestHandler);

/** Manual socket event triggers for public/socket-test.html (dev or ENABLE_TEST_ROUTES=true) */
function triggerSocketTestHandler(req, res) {
  const enabled = process.env.ENABLE_TEST_ROUTES === 'true' || process.env.NODE_ENV !== 'production';
  if (!enabled) {
    return res.status(404).json({ message: 'Not found' });
  }
  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ ok: false, message: 'Socket.io not available' });
  }
  const type = String(req.query.type || 'all').toLowerCase();
  const userId = String(req.query.userId || '').trim();
  const districtRaw = String(req.query.district || 'Larnaca').trim();
  const { CYPRUS_DISTRICTS } = require('./constants/cyprusDistricts');
  const district = CYPRUS_DISTRICTS.includes(districtRaw) ? districtRaw : 'Larnaca';
  const fired = [];

  if (type === 'all' || type === 'order' || type === 'new_order') {
    const { emitNewOrderAvailable } = require('./services/realtimeService');
    emitNewOrderAvailable(io, district, {
      _id: `trigger-${Date.now()}`,
      pickupDistrict: district,
      status: 'pending',
      source: 'trigger-socket',
    });
    fired.push(`new_order_available:${district}`);
  }

  if (type === 'all' || type === 'verify' || type === 'account_verified') {
    if (userId) {
      const room = String(userId);
      console.log(`[Socket emit] event=account_verified room=${room} (trigger-socket)`);
      io.to(room).emit('account_verified', { userId, verified: true, source: 'trigger-socket' });
      fired.push('account_verified');
    } else if (type === 'verify' || type === 'account_verified') {
      return res.status(400).json({
        ok: false,
        message: 'Query userId is required for type=verify or account_verified',
      });
    }
  }

  /** Same event as real license uploads — Admin Dashboard shows "New driver license uploaded!" toast */
  if (
    type === 'all' ||
    type === 'admin' ||
    type === 'admin_toast' ||
    type === 'new_verification' ||
    type === 'new_verification_request'
  ) {
    const { emitToAdmins } = require('./services/realtimeService');
    const testUserId = userId || '507f1f77bcf86cd799439011';
    emitToAdmins(io, 'new_verification_request', {
      userId: testUserId,
      firstName: 'Diagnostic',
      lastName: 'Socket',
      email: 'diagnostic@movingmate.test',
      phoneNumber: '',
      licenseUrl: '',
      createdAt: new Date().toISOString(),
      source: 'trigger-socket-diagnostic',
    });
    fired.push('new_verification_request:admin_room');
  }

  res.json({
    ok: true,
    fired,
    type,
    district:
      type === 'all' || type === 'order' || type === 'new_order' ? district : undefined,
    note:
      (type === 'all' || type === 'verify') && !userId
        ? 'account_verified skipped: add userId query param to include it.'
        : undefined,
  });
}
console.log('✅ Socket triggers at GET /api/test/trigger-socket');
app.get('/api/test/trigger-socket', triggerSocketTestHandler);

/** Fully automated socket test: DB driver, JWT, client, rooms, new_order_available */
async function socketAutoTestHandler(req, res) {
  const enabled = process.env.ENABLE_TEST_ROUTES === 'true' || process.env.NODE_ENV !== 'production';
  if (!enabled) {
    return res.status(404).json({ message: 'Not found' });
  }
  try {
    const { runSocketAutoTest } = require('./scripts/socketAutoTest');
    const report = await runSocketAutoTest(req);
    const ok = report.ok === true;
    delete report.ok;
    res.status(ok ? 200 : 500).json(report);
  } catch (err) {
    res.status(500).json({
      connection: 'FAIL',
      authentication: 'FAIL',
      roomJoined: 'FAIL',
      messageReceived: 'FAIL',
      error: err.message || 'socket-auto failed',
    });
  }
}
console.log('✅ Socket auto test at GET /api/test/socket-auto');
app.get('/api/test/socket-auto', socketAutoTestHandler);

// Test suite routes: /api/test/* (router enforces dev or ENABLE_TEST_ROUTES) — must be before 404
app.use('/api/test', require('./routes/test.routes'));

if (testRoutesEnabled) {
  app.get('/api/test-email', async (req, res) => {
    try {
      const info = await NotificationService.sendTestEmail('test@example.com');
      res.json({
        message: 'Email sent successfully',
        preview: nodemailer.getTestMessageUrl(info),
      });
    } catch (err) {
      res.status(500).json({ message: err.message || 'Failed to send test email' });
    }
  });

  /** Manual flow: scripts/fullNotificationFlowTest.js — duplicate path under /api/orders for convenience */
  const fullNotificationFlowHandler = async (req, res) => {
    try {
      const { runFullNotificationFlow } = require('./scripts/fullNotificationFlowTest');
      const report = await runFullNotificationFlow();
      res.json(report);
    } catch (err) {
      res.status(500).json({ ok: false, message: err.message || 'Full notification flow failed' });
    }
  };
  app.get('/api/orders/test/full-notification-flow', fullNotificationFlowHandler);

  app.get('/api/test-push-notification', async (req, res) => {
    try {
      const tokenParam = String(req.query?.token || '').trim();
      const userId = String(req.query?.userId || '').trim();
      let pushTokens;
      let debugUserId;

      if (!tokenParam && userId) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ message: 'Invalid userId' });
        }
        const User = require('./models/User');
        const u = await User.findById(userId).select('fcmTokens').lean();
        pushTokens = activeFcmTokens(u?.fcmTokens || []);
        debugUserId = userId;
        if (!pushTokens.length) {
          return res.status(400).json({
            message: 'No fcmTokens on this user. Open the app, allow notifications, then retry.',
          });
        }
      } else if (tokenParam) {
        pushTokens = activeFcmTokens([tokenParam]);
        if (!pushTokens.length) {
          return res.status(400).json({
            message: 'Invalid token query parameter (too short or empty).',
          });
        }
      } else {
        return res.status(400).json({
          message: 'Provide query "token" (FCM string) or "userId" (Mongo id with fcmTokens).',
        });
      }

      const response = await PushNotificationService.sendPush(
        pushTokens,
        'FCM Test',
        'Push notification test from Moving Mate backend.',
        { type: 'push_test' },
        { fcmDebugUserId: debugUserId }
      );
      if (!response) {
        return res.status(400).json({
          message: 'Push not sent. Token may be invalid or push service unavailable.',
        });
      }
      res.json({ message: 'Push sent', messageId: response });
    } catch (err) {
      res.status(500).json({ message: err.message || 'Push test failed' });
    }
  });

  app.post('/api/test-email', async (req, res, next) => {
    try {
      const to = req.body?.to || 'test@example.com';
      const template = String(req.body?.template || 'order-confirmation').toLowerCase();

      if (template === 'driver-approved' || template === 'account-verified') {
        const { clientBaseUrl } = NotificationService;
        const firstName = req.body?.firstName || 'Driver';
        const dashboardUrl = String(req.body?.dashboardUrl || clientBaseUrl()).replace(/\/$/, '');
        await NotificationService.sendTemplateEmail({
          to,
          subject: req.body?.subject || 'Account Verified - Moving Mate',
          template: 'account-verified',
          data: {
            firstName,
            dashboardUrl,
          },
          text: `Hello ${firstName}, test email (account-verified template).`,
        });
        return res.json({ message: `Test email (account-verified) sent to ${to}`, template: 'account-verified' });
      }

      const subject = req.body?.subject || 'Moving Mate Test Email';
      const orderId = req.body?.orderId || 'TEST-ORDER-001';
      const driverName = req.body?.driverName || 'Test Driver';
      const price = req.body?.price || '49.90';
      await NotificationService.sendTemplateEmail({
        to,
        subject,
        template: 'order-confirmation',
        data: {
          firstName: req.body?.firstName || 'Customer',
          orderId,
          pickupAddress: req.body?.pickupAddress || 'Demo Pickup Address',
          dropoffAddress: req.body?.dropoffAddress || 'Demo Dropoff Address',
          smallBoxes: Number(req.body?.smallBoxes ?? 2),
          mediumBoxes: Number(req.body?.mediumBoxes ?? 1),
          largeBoxes: Number(req.body?.largeBoxes ?? 0),
          totalBoxes:
            Number(req.body?.smallBoxes ?? 2) +
            Number(req.body?.mediumBoxes ?? 1) +
            Number(req.body?.largeBoxes ?? 0),
          price,
          driverName,
        },
        text: `Test email for order ${orderId}. Driver ${driverName}. Price ${price}.`,
      });
      res.json({ message: `Test email sent to ${to}`, template: 'order-confirmation' });
    } catch (err) {
      next(err);
    }
  });
}

// API routes — must be AFTER body-parser/json and BEFORE 404/wildcard
const authRoutes = require('./routes/auth.routes');
const ordersRoutes = require('./routes/orders');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat.routes');
const reviewsRoutes = require('./routes/reviews.routes');
const adminRoutes = require('./routes/admin.routes');
const { authMiddleware } = require('./middleware/auth');
const { adminMiddleware } = require('./middleware/admin');
const { postNotificationTest, postDeepLinkTest } = require('./controllers/notificationSettingsController');

app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/wallet', require('./routes/wallet.routes'));
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/contact', require('./routes/contact.routes'));
/** Explicit POST so path is always POST /api/admin/notifications/test (auth + admin, same as admin router). */
app.post('/api/admin/notifications/test', authMiddleware, adminMiddleware, postNotificationTest);
/** Temporary deep-link test endpoint — sends a push with an arbitrary url to the admin's own devices. */
app.post('/api/admin/notifications/deep-link-test', authMiddleware, adminMiddleware, postDeepLinkTest);
app.use('/api/admin', adminRoutes);

// Development tools routes (theme editor, etc.) - only enabled in dev mode
const devtoolsRoutes = require('./routes/devtools.routes');
app.use('/api/devtools', devtoolsRoutes);

const spaEnabled = registerClientStatic(app);
registerSpaFallback(app, spaEnabled);

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.status(404).type('text/plain').send('Not found');
});

// Global error handler – returns consistent { message } for all errors
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Not allowed by CORS' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ message: 'Unexpected field. Use the field name "license".' });
  }
  if (err.message === 'Invalid file type. Only PDF, JPG and PNG are allowed.') {
    return res.status(400).json({ message: err.message });
  }
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  if (status === 500) console.error(err.stack);
  res.status(status).json({ message });
});

async function bootstrap() {
  try {
    await mongoose.connection.asPromise();

    try {
      const notificationSettingsService = require('./services/notificationSettingsService');
      await notificationSettingsService.ensureDefaultSettings();
      console.log('[Server] Notification settings defaults ensured (MongoDB).');
    } catch (e) {
      console.warn('[Server] ensureDefaultSettings skipped or failed:', e.message);
    }

    SchedulerService.initSchedulerService();

    server.listen(PORT, () => {
      const port = Number(PORT) || 3000;
      console.log(`Server running on http://127.0.0.1:${port} (PORT=${process.env.PORT ?? 'unset'}; default 3000)`);
      console.log(`[Server] Payments provider: ${getPaymentsProvider()}${isMockPayments() ? ' (mock — no real charges)' : ''}`);
    });

    void NotificationService.initNotificationService().catch((err) => {
      console.warn('[Notifications] Background SMTP init failed:', err.message);
    });
    void Promise.resolve(PushNotificationService.initPushNotificationService())
      .then(() => PushNotificationService.dedupeFcmTokensOnStartup())
      .catch((err) => {
        console.warn('[Notifications] Push init skipped:', err.message);
      });
  } catch (err) {
    console.error('[Server] Bootstrap failed:', err.message);
    process.exit(1);
  }
}

void bootstrap();
