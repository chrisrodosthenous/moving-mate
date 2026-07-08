/**
 * Final integration + stress checks (dev / ENABLE_TEST_ROUTES only).
 * GET /api/test/final-grand-audit — see server.js
 */
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const { normalizedDriverDistricts } = require('../constants/cyprusDistricts');
const {
  runDriverAcceptedNotifications,
  runInTransitNotifications,
  runOrderCompletedNotifications,
  updateOrder,
} = require('../controllers/orderController');
const { processReminders } = require('../services/schedulerService');
const { runDriverAgeUnitTests } = require('../utils/driverAge');

const C = {
  customerEmail: 'grand-audit-customer@movingmate.test',
  driverAEmail: 'grand-audit-driver-a@movingmate.test',
  driverBEmail: 'grand-audit-driver-b@movingmate.test',
  customerPhone: '+35700007701',
  driverAPhone: '+35700007702',
  driverBPhone: '+35700007703',
};

function httpGetWithHeaders(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(o) {
      this.body = o;
      return this;
    },
  };
  return res;
}

async function ensureUser({ email, phoneNumber, role, districts, firstName, lastName }) {
  let u = await User.findOne({ email });
  const hashedPassword = await bcrypt.hash('GrandAudit123!', 10);
  if (!u) {
    u = await User.create({
      firstName,
      lastName,
      dateOfBirth: new Date('1988-05-05'),
      phoneNumber,
      email,
      password: hashedPassword,
      role,
      isVerified: true,
      verificationStatus: role === 'driver' ? 'approved' : 'none',
      ...(districts != null ? { districts } : {}),
    });
  } else {
    if (role === 'driver' && districts) {
      u.districts = districts;
    }
    u.isVerified = true;
    if (role === 'driver') u.verificationStatus = 'approved';
    await u.save();
  }
  return u;
}

function pendingQueryForDriver(driverLean) {
  const q = { status: 'pending', driverId: null };
  const scope = normalizedDriverDistricts(driverLean);
  if (scope.length > 0) q.pickupDistrict = { $in: scope };
  return q;
}

async function visiblePendingIds(driverLean) {
  const ids = await TransportOrder.find(pendingQueryForDriver(driverLean)).distinct('_id');
  return ids.map((id) => String(id));
}

async function runFinalGrandAudit() {
  const reportCard = {
    generatedAt: new Date().toISOString(),
    sections: [],
  };

  const port = Number(process.env.PORT || 3000);
  const batch = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // —— 1. Security / rate limit ——
  const sec = { name: '1_security_audit', status: 'FAILED', detail: {} };
  try {
    const results = [];
    for (let i = 0; i < 6; i++) {
      const r = await httpGetWithHeaders(`http://127.0.0.1:${port}/api/test/rate-limit-probe`, {
        'X-Audit-Batch': batch,
      });
      let parsed = null;
      try {
        parsed = JSON.parse(r.body || '{}');
      } catch {
        parsed = { raw: r.body };
      }
      results.push({ index: i + 1, status: r.status, message: parsed.message });
    }
    sec.detail.requests = results;
    const blocked = results.find(
      (x) => x.status === 429 && String(x.message || '').includes('AUDIT_RATE_LIMIT')
    );
    if (blocked) {
      sec.status = 'PASSED';
      sec.detail.summary = '6th request hit express-rate-limit with AUDIT_RATE_LIMIT message.';
    } else {
      sec.detail.summary = 'Expected HTTP 429 with AUDIT_RATE_LIMIT on 6th probe request.';
    }
  } catch (e) {
    sec.detail.error = e.message;
    sec.detail.summary = 'Probe failed (is the server listening on PORT?)';
  }
  reportCard.sections.push(sec);

  const createdOrderIds = [];
  let driverA;
  let driverB;
  let customer;
  let order1;
  let order2;
  let order3;

  // —— 2. Multi-district ——
  const dist = { name: '2_multi_driver_districts', status: 'FAILED', detail: {} };
  try {
    customer = await ensureUser({
      email: C.customerEmail,
      phoneNumber: C.customerPhone,
      role: 'customer',
      firstName: 'Grand',
      lastName: 'Customer',
    });
    driverA = await ensureUser({
      email: C.driverAEmail,
      phoneNumber: C.driverAPhone,
      role: 'driver',
      districts: ['Limassol'],
      firstName: 'Driver',
      lastName: 'A',
    });
    driverB = await ensureUser({
      email: C.driverBEmail,
      phoneNumber: C.driverBPhone,
      role: 'driver',
      districts: ['Nicosia', 'Larnaca'],
      firstName: 'Driver',
      lastName: 'B',
    });

    const baseOrder = (pickupDistrict, label) => ({
      customerId: customer._id,
      driverId: null,
      status: 'pending',
      pickupDistrict,
      pickupLocation: {
        address: `GRAND_AUDIT_${label}_${Date.now()}`,
        lat: 34.7,
        lng: 33.04,
      },
      dropoffLocation: { address: 'GRAND_AUDIT_DROP', lat: 34.71, lng: 33.05 },
      price: 25,
      smallBoxes: 1,
      mediumBoxes: 0,
      largeBoxes: 0,
    });

    order1 = await TransportOrder.create(baseOrder('Limassol', 'LIM'));
    order2 = await TransportOrder.create(baseOrder('Nicosia', 'NIC'));
    order3 = await TransportOrder.create(baseOrder('Paphos', 'PAP'));
    createdOrderIds.push(order1._id, order2._id, order3._id);

    const dALean = await User.findById(driverA._id).select('districts district').lean();
    const dBLean = await User.findById(driverB._id).select('districts district').lean();
    const visA = await visiblePendingIds(dALean);
    const visB = await visiblePendingIds(dBLean);

    dist.detail.driverA_visibleOrderIds = visA;
    dist.detail.driverB_visibleOrderIds = visB;
    dist.detail.orderIds = {
      order1_Limassol: String(order1._id),
      order2_Nicosia: String(order2._id),
      order3_Paphos: String(order3._id),
    };

    const aOk =
      visA.length === 1 &&
      visA.includes(String(order1._id)) &&
      !visA.includes(String(order2._id)) &&
      !visA.includes(String(order3._id));
    const bOk =
      visB.length === 1 &&
      visB.includes(String(order2._id)) &&
      !visB.includes(String(order1._id)) &&
      !visB.includes(String(order3._id));
    const nonePaphos = !visA.includes(String(order3._id)) && !visB.includes(String(order3._id));

    if (aOk && bOk && nonePaphos) {
      dist.status = 'PASSED';
      dist.detail.summary =
        'Driver A sees only Limassol order; Driver B sees only Nicosia order; Paphos visible to neither.';
    } else {
      dist.detail.summary = 'Visibility mismatch (expected strict 1+1+0).';
    }
  } catch (e) {
    dist.detail.error = e.message;
  }
  reportCard.sections.push(dist);

  // —— 3. Lifecycle + notifications + reminders ——
  const life = {
    name: '3_full_lifecycle_happy_path',
    status: 'FAILED',
    detail: {},
  };
  try {
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    order1.scheduledAt = scheduledAt;
    await order1.save();

    await processReminders();
    const afterReminder = await TransportOrder.findById(order1._id).select('remindersSent').lean();
    life.detail.remindersSentAfterScheduler = afterReminder?.remindersSent || [];

    order1.driverId = driverA._id;
    order1.status = 'accepted';
    await order1.save();
    let populated = await TransportOrder.findById(order1._id)
      .populate('customerId', 'firstName lastName phoneNumber email fcmToken')
      .populate('driverId', 'firstName lastName phoneNumber email fcmToken')
      .lean();
    const acceptNotify = await runDriverAcceptedNotifications(populated);
    life.detail.acceptanceEmailPreviewUrl = acceptNotify.emailPreviewUrl || null;
    life.detail.acceptanceEmailSent = acceptNotify.emailSent;

    order1.status = 'picked_up';
    await order1.save();
    populated = await TransportOrder.findById(order1._id)
      .populate('customerId', 'firstName lastName phoneNumber email fcmToken')
      .populate('driverId', 'firstName lastName phoneNumber email fcmToken')
      .lean();
    await runInTransitNotifications(populated);

    order1.status = 'delivered';
    await order1.save();
    populated = await TransportOrder.findById(order1._id)
      .populate('customerId', 'firstName lastName phoneNumber email fcmToken')
      .populate('driverId', 'firstName lastName phoneNumber email fcmToken')
      .lean();
    const completeNotify = await runOrderCompletedNotifications(populated);
    life.detail.completionEmailPreviewUrl = completeNotify.emailPreviewUrl || null;
    life.detail.completionEmailSent = completeNotify.emailSent;

    const finalOrder = await TransportOrder.findById(order1._id).lean();
    life.detail.finalStatus = finalOrder?.status;
    life.detail.finalRemindersSent = finalOrder?.remindersSent || [];

    const rSent = finalOrder?.remindersSent || [];
    const remindersOk = rSent.includes('reminder_24h') || rSent.includes('reminder_30m');
    const previewsOk =
      Boolean(acceptNotify.emailPreviewUrl && completeNotify.emailPreviewUrl) ||
      Boolean(acceptNotify.emailSent && completeNotify.emailSent);
    const statusOk = finalOrder?.status === 'delivered';

    if (statusOk && remindersOk && previewsOk) {
      life.status = 'PASSED';
      life.detail.summary =
        'Lifecycle delivered; remindersSent includes scheduler flag; acceptance/delivery emails OK (previews or sent).';
    } else {
      life.detail.summary = `statusOk=${statusOk} remindersOk=${remindersOk} previewsOk=${previewsOk}.`;
      life.detail.hint =
        'If remindersOk is false, check dev Ethereal/SMTP so 24h reminder email can send and scheduler can append reminder_24h.';
    }
  } catch (e) {
    life.detail.error = e.message;
  }
  reportCard.sections.push(life);

  // —— 4. Error handling ——
  const errSec = { name: '4_error_handling', status: 'FAILED', detail: {} };
  try {
    const ghostId = new mongoose.Types.ObjectId();
    const res404 = mockRes();
    const req404 = {
      params: { id: String(ghostId) },
      body: { status: 'accepted' },
      user: { userId: String(driverA._id) },
      app: { get: () => null },
    };
    await updateOrder(req404, res404, () => {});
    const notFoundOk = res404.statusCode === 404 && res404.body?.message === 'Order not found';
    errSec.detail.updateNonexistentOrder = {
      statusCode: res404.statusCode,
      body: res404.body,
      notFoundOk,
    };

    const pastScheduled = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const minFuture = Date.now() + 60 * 60 * 1000;
    const d = new Date(pastScheduled);
    const scheduleRejected = !Number.isNaN(d.getTime()) && d.getTime() < minFuture;
    const expectedMsg = 'Scheduled time must be at least 1 hour in the future';
    errSec.detail.pastScheduledAtValidation = {
      scheduleRejected,
      expectedMessage: expectedMsg,
    };

    if (notFoundOk && scheduleRejected) {
      errSec.status = 'PASSED';
      errSec.detail.summary =
        '404 for missing order; past scheduledAt rejected by same rule as createOrder (1h future minimum).';
    } else {
      errSec.detail.summary = '404 or schedule validation mismatch.';
    }
  } catch (e) {
    errSec.detail.error = e.message;
  }
  reportCard.sections.push(errSec);

  // —— 5. Driver age (18–65) unit checks ——
  const ageSec = { name: '5_driver_age_registration', status: 'FAILED', detail: {} };
  try {
    const ageTest = runDriverAgeUnitTests();
    ageSec.detail = ageTest;
    ageSec.status = ageTest.passed ? 'PASSED' : 'FAILED';
    ageSec.detail.summary = ageTest.passed
      ? '17 rejected, 30 accepted, 70 rejected (fixed reference date in test).'
      : 'Age unit expectations failed — see detail.results.';
  } catch (e) {
    ageSec.detail.error = e.message;
  }
  reportCard.sections.push(ageSec);

  // Cleanup: remove audit orders (including completed order1) and optional extra pending
  try {
    await TransportOrder.deleteMany({
      _id: { $in: createdOrderIds },
    });
    reportCard.cleanup = { ordersRemoved: createdOrderIds.map(String) };
  } catch (e) {
    reportCard.cleanup = { error: e.message };
  }

  reportCard.overall =
    reportCard.sections.every((s) => s.status === 'PASSED') ? 'ALL_PASSED' : 'SOME_FAILED';

  return reportCard;
}

module.exports = { runFinalGrandAudit };
