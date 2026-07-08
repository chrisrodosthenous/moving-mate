/**
 * Dev-only: verify driver `districts` + `pickupDistrict` job filtering ($in query).
 * Registered in server.js when NODE_ENV=development or ENABLE_TEST_ROUTES=true.
 * Run: GET /api/test/districts-flow
 */
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const { normalizedDriverDistricts } = require('../constants/cyprusDistricts');

const DRIVER_EMAIL = 'districts-flow-driver@movingmate.test';
const CUSTOMER_EMAIL = 'districts-flow-customer@movingmate.test';

async function ensureUser(role, districtsForDriver) {
  const isDriver = role === 'driver';
  const email = isDriver ? DRIVER_EMAIL : CUSTOMER_EMAIL;
  let user = await User.findOne({ email });
  if (!user) {
    const hashedPassword = await bcrypt.hash('DistrictsFlow123!', 10);
    user = await User.create({
      firstName: 'DistrictsFlow',
      lastName: isDriver ? 'Driver' : 'Customer',
      dateOfBirth: new Date('1990-01-01'),
      phoneNumber: isDriver ? '+35700008802' : '+35700008801',
      email,
      password: hashedPassword,
      role,
      isVerified: true,
      verificationStatus: isDriver ? 'approved' : 'none',
      ...(isDriver ? { districts: districtsForDriver } : {}),
    });
  } else if (isDriver) {
    user.districts = districtsForDriver;
    user.verificationStatus = 'approved';
    user.isVerified = true;
    await user.save();
  }
  return user;
}

async function runDistrictsFlowTest() {
  const report = {
    ok: true,
    endpoint: 'GET /api/test/districts-flow',
    steps: [],
    queryUsed: null,
    driverDistricts: null,
    normalizedScope: null,
    visibleOrderIds: [],
    createdOrderIds: [],
  };

  try {
    const driverDistricts = ['Limassol', 'Larnaca'];
    const driver = await ensureUser('driver', driverDistricts);
    const customer = await ensureUser('customer', null);

    report.driverDistricts = driverDistricts;
    report.normalizedScope = normalizedDriverDistricts(driver);
    report.steps.push({
      name: 'setup_users',
      status: 'ok',
      driverId: String(driver._id),
      customerId: String(customer._id),
      message: `Driver has districts: ${driverDistricts.join(', ')}`,
    });

    const ts = Date.now();
    const orderLimassol = await TransportOrder.create({
      customerId: customer._id,
      driverId: null,
      status: 'pending',
      pickupDistrict: 'Limassol',
      pickupLocation: { address: `Districts flow Limassol ${ts}`, lat: 34.68, lng: 33.04 },
      dropoffLocation: { address: 'Drop', lat: 34.7, lng: 33.05 },
      price: 10,
      smallBoxes: 1,
      mediumBoxes: 0,
      largeBoxes: 0,
    });
    const orderNicosia = await TransportOrder.create({
      customerId: customer._id,
      driverId: null,
      status: 'pending',
      pickupDistrict: 'Nicosia',
      pickupLocation: { address: `Districts flow Nicosia ${ts}`, lat: 35.18, lng: 33.38 },
      dropoffLocation: { address: 'Drop', lat: 35.17, lng: 33.37 },
      price: 10,
      smallBoxes: 1,
      mediumBoxes: 0,
      largeBoxes: 0,
    });
    report.createdOrderIds = [String(orderLimassol._id), String(orderNicosia._id)];

    const scope = normalizedDriverDistricts(driver);
    const query = { status: 'pending', driverId: null, pickupDistrict: { $in: scope } };
    report.queryUsed = query;

    const visible = await TransportOrder.find(query)
      .select('_id pickupDistrict')
      .lean();

    report.visibleOrderIds = visible.map((o) => String(o._id));

    const sawLimassol = visible.some((o) => String(o._id) === String(orderLimassol._id));
    const sawNicosia = visible.some((o) => String(o._id) === String(orderNicosia._id));

    report.steps.push({
      name: 'filter_assertions',
      status: sawLimassol && !sawNicosia ? 'ok' : 'error',
      sawLimassolOrder: sawLimassol,
      sawNicosiaOrder: sawNicosia,
      message:
        sawLimassol && !sawNicosia
          ? 'Driver sees Limassol job, not Nicosia (pickupDistrict $in scope).'
          : 'Expected Limassol visible and Nicosia hidden for this driver.',
    });

    if (!sawLimassol || sawNicosia) {
      report.ok = false;
    }

    await TransportOrder.deleteMany({ _id: { $in: [orderLimassol._id, orderNicosia._id] } });
    report.steps.push({
      name: 'cleanup',
      status: 'ok',
      message: 'Removed temporary test orders.',
    });
  } catch (err) {
    report.ok = false;
    report.error = err.message;
    report.steps.push({ name: 'fatal', status: 'error', message: err.message });
  }

  return report;
}

module.exports = { runDistrictsFlowTest };
