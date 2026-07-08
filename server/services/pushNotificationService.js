const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { isNotificationEnabled } = require('./notificationSettingsService');
const { canonicalCyprusDistrict } = require('../constants/cyprusDistricts');
const {
  filterDriversEligibleForOrder,
  normalizeOrderVehicleType,
} = require('../utils/driverVehicleMatching');
const User = require('../models/User');
const { sanitizeFcmTokens, activeFcmTokens, logFcmDebug } = require('../utils/fcmTokens');
const { buildDedupeKey, tryAcquireNotification } = require('../utils/notificationDedupe');
const { isUserSocketConnected } = require('./socketPresenceService');

let initialized = false;
let missingConfigWarned = false;
let resolvedPathLogged = false;

function resolveServiceAccountPath() {
  const fromServerConfig = path.join(__dirname, '..', 'config', 'firebase-service-account.json');
  const isDev = process.env.NODE_ENV === 'development';
  if (!resolvedPathLogged) {
    if (isDev) {
      console.log(
        `[PushNotificationService] Resolving service account (primary candidate): ${fromServerConfig}`
      );
    }
    resolvedPathLogged = true;
  }
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : null;
  const candidates = [
    envPath,
    fromServerConfig,
    // Common mis-name: duplicate `.json` extension (still valid for Admin SDK)
    path.join(__dirname, '..', 'config', 'firebase-service-account.json.json'),
    path.join(__dirname, '..', '..', 'backend', 'config', 'firebase-service-account.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function initPushNotificationService() {
  try {
    if (initialized || admin.apps.length) {
      initialized = true;
      return true;
    }

    const serviceAccountPath = resolveServiceAccountPath();
    if (!serviceAccountPath) {
      if (!missingConfigWarned) {
        console.warn('[PushNotificationService] Service account JSON not found. Push notifications remain disabled.');
        missingConfigWarned = true;
      }
      return false;
    }

    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PushNotificationService] Firebase Admin initialized. path=${serviceAccountPath}`);
    } else {
      console.log('[PushNotificationService] Firebase Admin initialized.');
    }
    return true;
  } catch (err) {
    console.warn('[PushNotificationService] Initialization failed. Push disabled.', err.message);
    return false;
  }
}

/** Strip HTML tags and trim to prevent script injection in notification text. */
function sanitizeText(value, maxLen) {
  return String(value || '').replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

/**
 * Build the platform blocks shared by every message (no token/tokens field).
 * No root `notification` key: on Web, FCM + the browser would show a system notification and our
 * firebase-messaging-sw.js `push` handler would call showNotification() again → duplicates.
 * Android/iOS use platform-specific notification blocks; Web relies on `data` + SW / foreground onMessage.
 */
function buildMessagePayload(safeTitle, safeBody, safeData) {
  const TTL_SECONDS = 4 * 7 * 24 * 60 * 60; // 2 419 200 s — 4 weeks
  return {
    android: {
      priority: 'high', // wakes device immediately, even in Doze mode
      ttl: TTL_SECONDS * 1000, // Firebase Admin SDK expects milliseconds
      notification: {
        title: safeTitle,
        body: safeBody,
      },
    },
    apns: {
      headers: {
        'apns-priority': '10', // 10 = deliver immediately
        'apns-expiration': String(Math.floor(Date.now() / 1000) + TTL_SECONDS),
      },
      payload: {
        aps: {
          alert: {
            title: safeTitle,
            body: safeBody,
          },
          sound: 'default',
        },
      },
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: String(TTL_SECONDS),
      },
      fcm_options: { link: safeData.url || '/' },
    },
    data: { ...safeData, title: safeTitle, body: safeBody },
  };
}

/**
 * Error codes returned by Firebase that mean the token is permanently dead.
 * Any token that triggers one of these is safe to remove from the DB immediately.
 *
 * NOTE: messaging/invalid-argument is intentionally excluded — Firebase can
 * return it for payload issues unrelated to the token, and purging a valid
 * token on that error silently kills delivery to real devices.
 */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Remove a single dead token from every user's fcmTokens array. */
async function purgeInvalidToken(token) {
  try {
    await User.updateMany({ fcmTokens: token }, { $pull: { fcmTokens: token } });
    console.warn(`[Push] Purged invalid token from DB: …${String(token).slice(-10)}`);
  } catch (err) {
    console.error('[Push] Failed to purge token:', err.message);
  }
}

/**
 * Send a push notification to one OR multiple FCM tokens.
 * @param {string|string[]} tokenOrTokens - single token or array of tokens
 */
async function sendPush(tokenOrTokens, title, body, data = {}, options = {}) {
  const rawInput = Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens];
  const uniqueTokens = activeFcmTokens(rawInput);

  if (options.fcmDebugUserId) {
    logFcmDebug(options.fcmDebugUserId, rawInput, uniqueTokens);
  }

  if (rawInput.length !== uniqueTokens.length) {
    console.log(`[Push] Token list normalized: ${rawInput.length} entries → ${uniqueTokens.length} usable (non-empty, length>10)`);
  }

  if (!uniqueTokens.length) {
    console.warn('[Push] No valid FCM tokens provided; skipping push.');
    return null;
  }

  console.log(`[Push] ── Token inventory (${uniqueTokens.length} token${uniqueTokens.length === 1 ? '' : 's'}) ──`);
  uniqueTokens.forEach((t, i) => console.log(`[Push]   [${i}] …${t.slice(-12)}`));

  const eventKey = options.eventKey;
  if (eventKey) {
    const ok = await isNotificationEnabled(eventKey);
    if (!ok) {
      console.warn(
        `[Push] BLOCKED by admin notification toggle: eventKey="${eventKey}" title="${String(title || '').slice(0, 100)}" — enable in Admin → Notification settings (real pushes respect toggles; admin simulator tests omit eventKey and bypass this).`
      );
      return null;
    }
  }

  const dedupeKey = options.dedupeKey;
  if (dedupeKey && !tryAcquireNotification(dedupeKey, options.dedupeTtlMs)) {
    console.log(`[Push] Dedupe skip (already sent recently): key="${dedupeKey}"`);
    return null;
  }

  if (!initialized && !initPushNotificationService()) return null;

  const safeTitle = sanitizeText(title, 100);
  const safeBody  = sanitizeText(body,  300);
  const safeData  = Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [String(k), String(v ?? '')])
  );
  const payload = buildMessagePayload(safeTitle, safeBody, safeData);

  // Single token → admin.messaging().send() (simpler, better error object).
  // Multiple tokens → sendEachForMulticast() so all devices receive the push.
  // `uniqueTokens` is already filtered (activeFcmTokens); [0] is only used when length === 1.
  if (uniqueTokens.length === 1) {
    const token = uniqueTokens[0];
    const hint  = `${token.slice(0, 20)}…${token.slice(-10)}`;
    console.log(`[Push] ▶ Sending (1 token) | title="${safeTitle}" | token=${hint}`);
    try {
      const response = await admin.messaging().send({ ...payload, token });
      console.log(`[Push] ✓ ${response}`);
      return response;
    } catch (err) {
      const code = err.errorInfo?.code || err.code || '';
      console.error(`[Push] ✗ ${code} — ${err.message}`);
      console.error('[Push]   Full error:', JSON.stringify(err.errorInfo || err, null, 2));
      if (INVALID_TOKEN_CODES.has(code)) {
        console.warn(`[Push] Token will be purged (matched ${code})`);
        await purgeInvalidToken(token);
      }
      return null;
    }
  }

  // Multicast path (`uniqueTokens` guarantees no duplicate registrations in one request).
  console.log(`[Push] ▶ Sending (${uniqueTokens.length} tokens) | title="${safeTitle}"`);
  try {
    const response = await admin.messaging().sendEachForMulticast({ ...payload, tokens: uniqueTokens });
    console.log(`[Push] ✓ Multicast: ${response.successCount} sent, ${response.failureCount} failed`);

    // Log per-token results so we can diagnose delivery issues.
    response.responses.forEach((r, i) => {
      const hint = `…${uniqueTokens[i].slice(-12)}`;
      if (r.success) {
        console.log(`[Push]   [${i}] ${hint} → OK (${r.messageId})`);
      } else {
        console.warn(`[Push]   [${i}] ${hint} → FAIL ${r.error?.code} — ${r.error?.message}`);
      }
    });

    // Purge only tokens that Firebase permanently rejected.
    if (response.failureCount > 0) {
      const purgePromises = response.responses
        .map((r, i) => ({ r, token: uniqueTokens[i] }))
        .filter(({ r }) => !r.success && INVALID_TOKEN_CODES.has(r.error?.code))
        .map(({ token }) => purgeInvalidToken(token));
      if (purgePromises.length) {
        console.warn(`[Push] Purging ${purgePromises.length} dead token(s) from DB…`);
        await Promise.allSettled(purgePromises);
      }
    }

    return response.successCount > 0 ? response : null;
  } catch (err) {
    const code = err.errorInfo?.code || err.code || '';
    console.error(`[Push] ✗ admin.messaging().sendEachForMulticast threw: ${code} — ${err.message}`);
    console.error('[Push]   Full error:', err.errorInfo || err);
    return null;
  }
}

async function sendOrderAcceptedPush(orderData) {
  const orderId = String(orderData?.orderId || '');
  const customerUserId = String(orderData?.customerUserId || '');
  if (customerUserId && isUserSocketConnected(customerUserId)) {
    console.log(
      `[Push] Suppressed order_accepted for online customer ${customerUserId} orderId=${orderId} (socket handles in-app)`,
    );
    return null;
  }
  const title = 'Order accepted';
  const body = 'Your order has been accepted by a driver.';
  return sendPush(
    orderData?.customerFcmToken,
    title,
    body,
    { orderId, type: 'order_accepted', url: '/my-orders' },
    {
      eventKey: 'push_order_accepted',
      fcmDebugUserId: customerUserId || undefined,
      dedupeKey: buildDedupeKey('push', 'order_accepted', orderId, customerUserId),
    },
  );
}

async function send30MinReminderPush(orderData) {
  const payload = { title: 'Upcoming Order', body: 'Your order starts in 30 minutes. Please be ready!' };
  const oid = orderData?.orderId || '';
  const [customerResult, driverResult] = await Promise.all([
    sendPush(orderData?.customerFcmToken, payload.title, payload.body, {
      orderId: oid, type: 'reminder_30m', role: 'customer', url: '/my-orders',
    }, { fcmDebugUserId: orderData?.customerUserId }),
    sendPush(orderData?.driverFcmToken, payload.title, payload.body, {
      orderId: oid, type: 'reminder_30m', role: 'driver', url: '/driver/my-tasks',
    }, { fcmDebugUserId: orderData?.driverUserId }),
  ]);
  return { customerMessageId: customerResult, driverMessageId: driverResult };
}

async function sendStartTripPush(orderData) {
  const orderId = String(orderData?.orderId || '');
  const customerUserId = String(orderData?.customerUserId || '');
  if (customerUserId && isUserSocketConnected(customerUserId)) {
    console.log(
      `[Push] Suppressed order_in_transit for online customer ${customerUserId} orderId=${orderId} (socket handles in-app)`,
    );
    return null;
  }
  const title = 'Driver on the way';
  const body = 'The driver is now on the way to your location.';
  return sendPush(
    orderData?.customerFcmToken,
    title,
    body,
    { orderId, type: 'order_in_transit', url: '/my-orders' },
    {
      eventKey: 'push_in_transit',
      fcmDebugUserId: customerUserId || undefined,
      dedupeKey: buildDedupeKey('push', 'order_in_transit', orderId, customerUserId),
    },
  );
}

async function sendRatingRequestPush(orderData) {
  const oid = String(orderData?.orderId || '');
  const customerUserId = String(orderData?.customerUserId || '');
  if (customerUserId && isUserSocketConnected(customerUserId)) {
    console.log(
      `[Push] Suppressed rating_request for online customer ${customerUserId} orderId=${oid} (socket handles in-app)`,
    );
    return null;
  }
  return sendPush(
    orderData?.customerFcmToken,
    'Order Completed',
    'How was your experience? Tap here to rate your driver.',
    { orderId: oid, type: 'rating_request', url: `/rate-driver/${oid}` },
    {
      eventKey: 'push_order_delivered',
      fcmDebugUserId: customerUserId || undefined,
      dedupeKey: buildDedupeKey('push', 'rating_request', oid, customerUserId),
    },
  );
}

async function sendChatMessagePush({ receiverFcmToken, senderName, orderId, recipientUserId }) {
  const name = String(senderName || '').trim() || 'Someone';
  const oid  = String(orderId || '');
  return sendPush(
    receiverFcmToken,
    `New message from ${name}`,
    'Open the app to read and reply.',
    { orderId: oid, type: 'chat_message', url: `/chat/${oid}` },
    { eventKey: 'push_new_chat_message', fcmDebugUserId: recipientUserId }
  );
}

/**
 * Notify verified drivers whose district AND vehicle tier match the order.
 */
async function sendNewOrderToDriversPush({ orderId, district, vehicleType }) {
  const oid = String(orderId || '');
  const raw = district == null ? '' : String(district);
  const canon = canonicalCyprusDistrict(raw);
  const orderVehicle = normalizeOrderVehicleType(vehicleType);

  console.log(
    `[Push][NewOrder] trigger orderId=${oid} pickupDistrictRaw=${JSON.stringify(raw)} pickupDistrictCanonical=${canon ? JSON.stringify(canon) : 'null'} orderVehicle=${orderVehicle}`,
  );

  if (!canon) {
    console.warn(`[Push][NewOrder] skip — invalid or unknown pickup district (cannot match drivers)`);
    return [];
  }

  const candidates = await User.find({
    role: 'driver',
    isVerified: true,
    fcmTokens: { $exists: true, $not: { $size: 0 } },
  })
    .select('fcmTokens districts district vehicleType isVerified role')
    .lean();

  const drivers = filterDriversEligibleForOrder(candidates, canon, orderVehicle);

  const offlineDrivers = [];
  let onlineSuppressed = 0;
  for (const driver of drivers) {
    const driverId = String(driver._id);
    if (isUserSocketConnected(driverId)) {
      onlineSuppressed += 1;
      console.log(
        `[Push][NewOrder] skip FCM for online driver ${driverId} orderId=${oid} (socket already delivered)`,
      );
      continue;
    }
    offlineDrivers.push(driver);
  }

  const tokenList = activeFcmTokens(offlineDrivers.flatMap((d) => d.fcmTokens || []));

  console.log(
    `[Push][NewOrder] after district+vehicle filter: driversMatched=${drivers.length} onlineSuppressed=${onlineSuppressed} offlineWithTokens=${offlineDrivers.length} uniqueFcmTokens=${tokenList.length} orderVehicle=${orderVehicle}`,
  );
  tokenList.forEach((t, i) => console.log(`[Push][NewOrder]   token[${i}] …${t.slice(-12)}`));

  if (!tokenList.length) {
    console.log(
      `[Push][NewOrder] no offline eligible drivers with FCM tokens in district "${canon}" for order ${oid} (vehicle=${orderVehicle})`,
    );
    return null;
  }

  const result = await sendPush(
    tokenList,
    'New Order Available!',
    'A new job is available in your area. Tap to view.',
    { orderId: oid, type: 'new_order', url: '/available-orders' },
    {
      eventKey: 'push_new_order',
      dedupeKey: buildDedupeKey('push', 'new_order', oid),
    },
  );

  if (result) {
    console.log(`[Push][NewOrder] sendPush finished for orderId=${oid} district=${canon}`);
  } else {
    console.warn(
      `[Push][NewOrder] sendPush returned null for orderId=${oid} (no tokens, Firebase off, admin toggle off, or all sends failed — see logs above)`,
    );
  }

  return result;
}

/**
 * Notify all admin users that a driver has uploaded documents for verification.
 */
async function sendVerificationRequestToAdminsPush({ driverName, driverId }) {
  const admins = await User.find({
    role: 'admin',
    fcmTokens: { $exists: true, $not: { $size: 0 } },
  }).select('fcmTokens').lean();

  if (!admins.length) {
    console.log('[Push] No admin users with FCM tokens for verification push');
    return [];
  }

  const name = String(driverName || 'A driver').trim();
  const results = await Promise.allSettled(
    admins.map((a) =>
      sendPush(
        a.fcmTokens,
        'New Verification Request',
        `${name} has submitted documents for review.`,
        { driverId: String(driverId || ''), type: 'verification_request', url: '/admin/verify-drivers' },
        { eventKey: 'push_verification_request', fcmDebugUserId: String(a._id) }
      )
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  console.log(`[Push] Verification push sent to ${sent}/${admins.length} admins`);
  return results;
}

/**
 * One-time cleanup on server boot: remove duplicate strings from User.fcmTokens (historical $push bugs, etc.).
 */
async function dedupeFcmTokensOnStartup() {
  try {
    const cursor = User.find({
      fcmTokens: { $exists: true, $type: 'array', $not: { $size: 0 } },
    })
      .select('_id fcmTokens')
      .cursor();

    let fixed = 0;
    for await (const doc of cursor) {
      const arr = Array.isArray(doc.fcmTokens) ? doc.fcmTokens : [];
      const unique = activeFcmTokens(arr);
      if (unique.length !== arr.length) {
        await User.updateOne({ _id: doc._id }, { $set: { fcmTokens: unique } });
        fixed += 1;
      }
    }
    if (fixed > 0) {
      console.log(`[FCM] Startup dedupe: normalized fcmTokens on ${fixed} user document(s).`);
    } else {
      console.log('[FCM] Startup dedupe: no duplicate fcmTokens found.');
    }
  } catch (err) {
    console.warn('[FCM] Startup dedupe failed (non-fatal):', err.message);
  }
}

module.exports = {
  initPushNotificationService,
  dedupeFcmTokensOnStartup,
  sendPush,
  sendOrderAcceptedPush,
  send30MinReminderPush,
  sendStartTripPush,
  sendRatingRequestPush,
  sendChatMessagePush,
  sendNewOrderToDriversPush,
  sendVerificationRequestToAdminsPush,
};
