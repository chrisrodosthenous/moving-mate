#!/usr/bin/env node
/**
 * End-to-end lifecycle test using real MongoDB models and production notification helpers.
 *
 * Prerequisites:
 *   - `.env` in this folder with MONGODB_URI / MONGO_URI (and SMTP_* for email; dev may use Ethereal).
 *   - Firebase service account JSON (same paths as pushNotificationService) for real FCM sends.
 *   - Optional: set E2E_CUSTOMER_ID and E2E_DRIVER_ID to existing user ObjectIds; otherwise
 *     temporary users are created (unique phones/emails per run).
 *   - For Firebase success:true on pushes, users need valid device tokens in `fcmTokens`, or set
 *     E2E_CUSTOMER_FCM_TOKEN / E2E_DRIVER_FCM_TOKEN (long registration strings) before running.
 *
 * Run from repository root:
 *   node server/full-flow-test.js
 *
 * Or from server folder:
 *   node full-flow-test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { getMongoUri } = require('./config/env');
const User = require('./models/User');
const TransportOrder = require('./models/TransportOrder');
const Message = require('./models/Message');
const NotificationService = require('./services/notificationService');
const PushNotificationService = require('./services/pushNotificationService');
const { sendNewOrderToDriversPush, sendChatMessagePush } = PushNotificationService;
const {
  runDriverAcceptedNotifications,
  runInTransitNotifications,
  runOrderCompletedNotifications,
} = require('./controllers/orderController');
const { activeFcmTokens } = require('./utils/fcmTokens');
const { ensureDefaultSettings } = require('./services/notificationSettingsService');

const TEST_EMAIL_CUSTOMER = process.env.E2E_CUSTOMER_EMAIL || 'e2e-fullflow-customer@movingmate.local';
const TEST_EMAIL_DRIVER = process.env.E2E_DRIVER_EMAIL || 'e2e-fullflow-driver@movingmate.local';

/** Long synthetic token so activeFcmTokens() accepts it; Firebase may reject unless it is a real registration ID. */
function makePlaceholderFcmToken(role) {
  const extra = process.env[`E2E_${role === 'customer' ? 'CUSTOMER' : 'DRIVER'}_FCM_TOKEN`];
  if (extra && String(extra).trim().length > 10) return String(extra).trim();
  return `e2e-placeholder-${role}-${crypto.randomBytes(80).toString('hex')}`;
}

function randomCyprusPhone() {
  const eight = String(Math.floor(10000000 + Math.random() * 90000000));
  return `+357${eight}`;
}

function serializeFcmResult(result) {
  if (result == null) {
    return { success: false, detail: null, note: 'null (no Firebase response — missing tokens, disabled toggle, or init failure)' };
  }
  if (typeof result === 'string') {
    return { success: true, detail: { firebaseMessageId: result } };
  }
  if (typeof result === 'object' && result.successCount !== undefined) {
    const ok = result.successCount > 0;
    const per = Array.isArray(result.responses)
      ? result.responses.map((r, i) => ({
          index: i,
          ok: Boolean(r.success),
          messageId: r.messageId || null,
          error: r.error ? { code: r.error.code, message: r.error.message } : null,
        }))
      : undefined;
    return {
      success: ok,
      detail: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        responses: per,
      },
    };
  }
  return { success: true, detail: result };
}

function serializeEmailResult(info) {
  if (info == null) {
    return { success: false, detail: null, note: 'skipped (no email or admin toggle off)' };
  }
  return {
    success: true,
    detail: {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      envelope: info.envelope,
    },
  };
}

async function connectDb() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('[E2E] Connected to MongoDB');
}

async function ensureSmtp() {
  try {
    await NotificationService.initNotificationService();
    console.log('[E2E] SMTP transporter verified');
  } catch (e) {
    console.warn('[E2E] SMTP init warning (emails may fail):', e.message);
  }
}

async function resolveParticipants() {
  const cid = process.env.E2E_CUSTOMER_ID?.trim();
  const did = process.env.E2E_DRIVER_ID?.trim();

  if (cid && did) {
    const customer = await User.findById(cid);
    const driver = await User.findById(did);
    if (!customer || !driver) {
      throw new Error('E2E_CUSTOMER_ID / E2E_DRIVER_ID must exist in MongoDB');
    }
    if (customer.role !== 'customer') throw new Error('E2E_CUSTOMER_ID must be a customer');
    if (driver.role !== 'driver') throw new Error('E2E_DRIVER_ID must be a driver');
    await ensureUserFcmTokens(customer, 'customer');
    await ensureUserFcmTokens(driver, 'driver');
    return { customer: await User.findById(customer._id), driver: await User.findById(driver._id) };
  }

  let customer = await User.findOne({ email: TEST_EMAIL_CUSTOMER });
  let driver = await User.findOne({ email: TEST_EMAIL_DRIVER });

  const hashed = await bcrypt.hash('E2EFlowTest123!', 10);

  if (!customer) {
    customer = await User.create({
      firstName: 'E2E',
      lastName: 'Customer',
      dateOfBirth: new Date('1992-01-15'),
      phoneNumber: randomCyprusPhone(),
      email: TEST_EMAIL_CUSTOMER,
      password: hashed,
      role: 'customer',
      isVerified: true,
      fcmTokens: [makePlaceholderFcmToken('customer')],
    });
  } else {
    await ensureUserFcmTokens(customer, 'customer');
  }

  if (!driver) {
    driver = await User.create({
      firstName: 'E2E',
      lastName: 'Driver',
      dateOfBirth: new Date('1991-05-20'),
      phoneNumber: randomCyprusPhone(),
      email: TEST_EMAIL_DRIVER,
      password: hashed,
      role: 'driver',
      isVerified: true,
      verificationStatus: 'approved',
      districts: ['Nicosia'],
      fcmTokens: [makePlaceholderFcmToken('driver')],
    });
  } else {
    driver.isVerified = true;
    driver.verificationStatus = 'approved';
    if (!driver.districts?.length) driver.districts = ['Nicosia'];
    await ensureUserFcmTokens(driver, 'driver');
    await driver.save();
  }

  return { customer: await User.findById(customer._id), driver: await User.findById(driver._id) };
}

async function ensureUserFcmTokens(user, role) {
  const existing = activeFcmTokens(user.fcmTokens || []);
  if (existing.length > 0) return;
  const tok = makePlaceholderFcmToken(role);
  user.fcmTokens = [...(user.fcmTokens || []), tok];
  await user.save();
}

async function main() {
  const report = { ok: true, steps: [] };

  await connectDb();
  await ensureDefaultSettings();
  PushNotificationService.initPushNotificationService();
  await ensureSmtp();

  const { customer, driver } = await resolveParticipants();
  console.log('[E2E] Customer:', String(customer._id), customer.email, 'fcmTokens:', activeFcmTokens(customer.fcmTokens || []).length);
  console.log('[E2E] Driver:  ', String(driver._id), driver.email, 'fcmTokens:', activeFcmTokens(driver.fcmTokens || []).length);

  const order = await TransportOrder.create({
    customerId: customer._id,
    driverId: null,
    status: 'pending',
    pickupDistrict: 'Nicosia',
    pickupLocation: { address: 'E2E Pickup — Full Flow Test', lat: 35.1856, lng: 33.3823 },
    dropoffLocation: { address: 'E2E Dropoff — Full Flow Test', lat: 35.1753, lng: 33.3642 },
    price: 88.5,
    smallBoxes: 2,
    mediumBoxes: 0,
    largeBoxes: 0,
  });

  // —— Step 1 ——
  const step1 = { name: 'Step 1 — Order creation (email + driver push)', email: null, fcm: null };
  try {
    const emailInfo = await NotificationService.sendOrderConfirmationEmail({
      to: customer.email,
      firstName: customer.firstName || 'Customer',
      orderId: String(order._id),
      pickupAddress: order.pickupLocation.address,
      dropoffAddress: order.dropoffLocation.address,
      smallBoxes: order.smallBoxes,
      mediumBoxes: order.mediumBoxes,
      largeBoxes: order.largeBoxes,
      price: order.price,
    });
    const ser = serializeEmailResult(emailInfo);
    step1.email = ser;
    if (!ser.success) report.ok = false;
  } catch (e) {
    step1.email = { success: false, error: e.message };
    report.ok = false;
  }

  try {
    const pushRes = await sendNewOrderToDriversPush({
      orderId: String(order._id),
      district: order.pickupDistrict,
    });
    step1.fcm = serializeFcmResult(pushRes);
    if (!step1.fcm.success) report.ok = false;
  } catch (e) {
    step1.fcm = { success: false, error: e.message };
    report.ok = false;
  }
  step1.success = Boolean(step1.email?.success && step1.fcm?.success);
  report.steps.push(step1);
  console.log('\n[E2E] Step 1 result:', JSON.stringify(step1, null, 2));

  // —— Step 2 ——
  order.driverId = driver._id;
  order.status = 'accepted';
  await order.save();
  const afterAccept = await TransportOrder.findById(order._id).lean();
  const step2 = { name: 'Step 2 — Acceptance (driver-accepted email + order accepted push)' };
  try {
    const n = await runDriverAcceptedNotifications(afterAccept);
    const emailOk = Boolean(n.emailSent);
    step2.email = {
      success: emailOk,
      detail: {
        emailSent: n.emailSent,
        etherealPreviewUrl: n.emailPreviewUrl || null,
        errors: n.errors || [],
      },
    };
    if (!emailOk && customer.email) report.ok = false;
    step2.fcm = serializeFcmResult(n.pushMessageId);
    if (!step2.fcm.success && n.pushSkippedReason) step2.fcm.note = n.pushSkippedReason;
    if (!step2.fcm.success) report.ok = false;
  } catch (e) {
    step2.error = e.message;
    step2.success = false;
    report.ok = false;
  }
  if (step2.success === undefined) {
    step2.success = Boolean(step2.email?.success && step2.fcm?.success);
  }
  report.steps.push(step2);
  console.log('\n[E2E] Step 2 result:', JSON.stringify(step2, null, 2));

  // —— Step 3 ——
  const step3 = { name: 'Step 3 — Chat message push (driver → customer)' };
  const chatDoc = await Message.create({
    orderId: order._id,
    senderId: driver._id,
    receiverId: customer._id,
    text: '[E2E] Test message from driver to customer',
    read: false,
  });
  step3.messageId = String(chatDoc._id);
  const custFresh = await User.findById(customer._id).select('fcmTokens').lean();
  const customerTokens = activeFcmTokens(custFresh?.fcmTokens || []);
  step3.targetCustomerTokenCount = customerTokens.length;
  try {
    const pushRes = await sendChatMessagePush({
      receiverFcmToken: custFresh?.fcmTokens || [],
      senderName: `${driver.firstName} ${driver.lastName}`.trim() || 'Driver',
      orderId: String(order._id),
      recipientUserId: String(customer._id),
    });
    step3.fcm = serializeFcmResult(pushRes);
    step3.verifyTargetsCustomer = customerTokens.length > 0;
    if (!step3.fcm.success) report.ok = false;
  } catch (e) {
    step3.error = e.message;
    step3.success = false;
    report.ok = false;
  }
  if (step3.success === undefined) step3.success = Boolean(step3.fcm?.success);
  report.steps.push(step3);
  console.log('\n[E2E] Step 3 result:', JSON.stringify(step3, null, 2));

  // —— Step 4 ——
  order.status = 'picked_up';
  await order.save();
  const afterTransit = await TransportOrder.findById(order._id).lean();
  const step4 = { name: 'Step 4 — In transit (start trip push)' };
  try {
    const n = await runInTransitNotifications(afterTransit);
    step4.fcm = serializeFcmResult(n.pushMessageId);
    if (!step4.fcm.success) {
      step4.fcm.note = n.pushSkippedReason || step4.fcm.note;
      report.ok = false;
    }
  } catch (e) {
    step4.error = e.message;
    step4.success = false;
    report.ok = false;
  }
  if (step4.success === undefined) step4.success = Boolean(step4.fcm?.success);
  report.steps.push(step4);
  console.log('\n[E2E] Step 4 result:', JSON.stringify(step4, null, 2));

  // —— Step 5 ——
  order.status = 'delivered';
  await order.save();
  const afterDone = await TransportOrder.findById(order._id).lean();
  const step5 = { name: 'Step 5 — Completed (order completed email + rating push)' };
  try {
    const n = await runOrderCompletedNotifications(afterDone);
    const emailOk = Boolean(n.emailSent);
    step5.email = {
      success: emailOk,
      detail: {
        emailSent: n.emailSent,
        etherealPreviewUrl: n.emailPreviewUrl || null,
        errors: n.errors || [],
      },
    };
    if (!emailOk && customer.email) report.ok = false;
    step5.fcm = serializeFcmResult(n.pushMessageId);
    if (!step5.fcm.success) {
      step5.fcm.note = n.pushSkippedReason || step5.fcm.note;
      report.ok = false;
    }
  } catch (e) {
    step5.error = e.message;
    step5.success = false;
    report.ok = false;
  }
  if (step5.success === undefined) {
    step5.success = Boolean(step5.email?.success && step5.fcm?.success);
  }
  report.steps.push(step5);
  console.log('\n[E2E] Step 5 result:', JSON.stringify(step5, null, 2));

  console.log('\n======== E2E SUMMARY ========');
  console.log(JSON.stringify({ overallSuccess: report.ok, orderId: String(order._id), steps: report.steps }, null, 2));
  console.log('[E2E] Order id (for manual cleanup if needed):', String(order._id));

  await mongoose.disconnect();
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[E2E] Fatal:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
