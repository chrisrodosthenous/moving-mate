/**
 * Manual / dev-only: full order lifecycle + notifications.
 * Registered when NODE_ENV=development or ENABLE_TEST_ROUTES=true (see server.js).
 * Run: GET /api/orders/test/full-notification-flow (or /api/test/full-notification-flow)
 */
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const {
  runDriverAcceptedNotifications,
  runInTransitNotifications,
  runOrderCompletedNotifications,
} = require('../controllers/orderController');

const DUMMY_FCM_CLIENT = 'test-full-flow-client-fcm-token-placeholder';
const DUMMY_FCM_DRIVER = 'test-full-flow-driver-fcm-token-placeholder';

const TEST_CUSTOMER_EMAIL = 'flow-test-customer@movingmate.test';
const TEST_DRIVER_EMAIL = 'flow-test-driver@movingmate.test';

async function findOrCreateTestUser(role) {
  const isDriver = role === 'driver';
  const email = isDriver ? TEST_DRIVER_EMAIL : TEST_CUSTOMER_EMAIL;
  let user = await User.findOne({ email });
  const fcmToken = isDriver ? DUMMY_FCM_DRIVER : DUMMY_FCM_CLIENT;

  if (!user) {
    const hashedPassword = await bcrypt.hash('FlowTest123!', 10);
    user = await User.create({
      firstName: 'FlowTest',
      lastName: isDriver ? 'Driver' : 'Customer',
      dateOfBirth: new Date('1990-06-15'),
      phoneNumber: isDriver ? '+35700009902' : '+35700009901',
      email,
      password: hashedPassword,
      role,
      isVerified: true,
      verificationStatus: isDriver ? 'approved' : 'none',
      fcmToken,
      ...(isDriver ? { districts: ['Nicosia'] } : {}),
    });
  } else {
    user.fcmToken = fcmToken;
    if (isDriver) {
      user.verificationStatus = 'approved';
      user.isVerified = true;
      if (!user.districts?.length) {
        user.districts = ['Nicosia'];
      }
    }
    await user.save();
  }
  return user;
}

async function runFullNotificationFlow() {
  const report = {
    ok: true,
    steps: [],
    etherealEmailPreviews: [],
    orderId: null,
    testCustomerEmail: TEST_CUSTOMER_EMAIL,
    testDriverEmail: TEST_DRIVER_EMAIL,
  };

  try {
    const customer = await findOrCreateTestUser('customer');
    const driver = await findOrCreateTestUser('driver');
    report.steps.push({
      name: 'setup',
      status: 'ok',
      customerId: String(customer._id),
      driverId: String(driver._id),
      message: 'Test users ensured with dummy fcmTokens',
    });

    const order = await TransportOrder.create({
      customerId: customer._id,
      driverId: null,
      status: 'pending',
      pickupDistrict: 'Nicosia',
      pickupLocation: { address: 'Flow Test Pickup', lat: 35.1856, lng: 33.3823 },
      dropoffLocation: { address: 'Flow Test Dropoff', lat: 35.1753, lng: 33.3642 },
      price: 59.99,
      smallBoxes: 1,
      mediumBoxes: 0,
      largeBoxes: 0,
    });
    report.orderId = String(order._id);
    report.steps.push({
      name: 'create_order',
      status: 'ok',
      orderId: report.orderId,
      message: 'Pending order created',
    });

    order.driverId = driver._id;
    order.status = 'accepted';
    await order.save();
    const afterAccept = await TransportOrder.findById(order._id).lean();
    const acceptResult = await runDriverAcceptedNotifications(afterAccept);
    if (acceptResult.emailPreviewUrl) {
      report.etherealEmailPreviews.push({ step: 'acceptance', url: acceptResult.emailPreviewUrl });
    }
    report.steps.push({
      name: 'acceptance',
      status: acceptResult.errors.length ? 'partial' : 'ok',
      notifications: acceptResult,
      message: 'Driver assigned; driver-accepted email + push',
    });

    order.status = 'picked_up';
    await order.save();
    const afterStart = await TransportOrder.findById(order._id).lean();
    const startResult = await runInTransitNotifications(afterStart);
    report.steps.push({
      name: 'start_trip',
      status: startResult.errors.length ? 'partial' : 'ok',
      notifications: startResult,
      message:
        'Status picked_up; in-transit push (“Driver is on the way!” + “… is heading to your location.”)',
    });

    order.status = 'delivered';
    await order.save();
    const afterComplete = await TransportOrder.findById(order._id).lean();
    const completeResult = await runOrderCompletedNotifications(afterComplete);
    if (completeResult.emailPreviewUrl) {
      report.etherealEmailPreviews.push({ step: 'completion', url: completeResult.emailPreviewUrl });
    }
    report.steps.push({
      name: 'completion',
      status: completeResult.errors.length ? 'partial' : 'ok',
      notifications: completeResult,
      message: 'Delivered; order-completed email + push',
    });
  } catch (err) {
    report.ok = false;
    report.error = err.message;
    report.steps.push({ name: 'fatal', status: 'error', message: err.message });
  }

  return report;
}

module.exports = { runFullNotificationFlow };
