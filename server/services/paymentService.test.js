/**
 * Unit tests for mock PaymentIntent + wallet ledger flows.
 * Run: node --test server/services/paymentService.test.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const TransportOrder = require('../models/TransportOrder');
const PaymentIntent = require('../models/PaymentIntent');
const User = require('../models/User');
const {
  ensurePaymentIntentForOrder,
  confirmMockCheckout,
  captureForOrderAccept,
  cancelPaymentForOrder,
  creditBalancesOnDelivery,
  getDriverWalletSummary,
  getPlatformWalletSummary,
  requestDriverWithdrawal,
} = require('../services/paymentService');
const { applyCompletionCommission } = require('../utils/orderCommission');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/movingmate_payment_test';

describe('paymentService', () => {
  let customerId;
  let driverId;
  let orderId;

  before(async () => {
    await mongoose.connect(MONGODB_URI);
    await Promise.all([
      TransportOrder.deleteMany({}),
      PaymentIntent.deleteMany({}),
      User.deleteMany({ email: /@payment-test\.local$/ }),
      mongoose.connection.collection('walletledgers').deleteMany({}),
      mongoose.connection.collection('payouts').deleteMany({}),
    ]);

    const customer = await User.create({
      firstName: 'Pay',
      lastName: 'Customer',
      email: 'customer@payment-test.local',
      phoneNumber: '+35799000001',
      password: 'hashed',
      role: 'customer',
      isVerified: true,
    });
    const driver = await User.create({
      firstName: 'Pay',
      lastName: 'Driver',
      email: 'driver@payment-test.local',
      phoneNumber: '+35799000002',
      password: 'hashed',
      role: 'driver',
      dateOfBirth: new Date('1990-01-01'),
      isVerified: true,
      vehicleType: 'pickup',
      districts: ['Nicosia'],
    });
    customerId = customer._id;
    driverId = driver._id;

    const order = await TransportOrder.create({
      customerId,
      pickupLocation: { address: 'A', lat: 35.1, lng: 33.3 },
      dropoffLocation: { address: 'B', lat: 35.2, lng: 33.4 },
      pickupDistrict: 'Nicosia',
      price: 50,
      distanceKm: 10,
      vehicleType: 'pickup',
      status: 'pending',
    });
    orderId = order._id;
    await ensurePaymentIntentForOrder(order);
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it('creates payment intent in requires_payment state', async () => {
    const intent = await PaymentIntent.findOne({ orderId }).lean();
    assert.equal(intent.status, 'requires_payment');
    assert.equal(intent.amount, 50);
  });

  it('authorizes payment via mock checkout', async () => {
    const result = await confirmMockCheckout(orderId, customerId);
    assert.equal(result.ok, true);
    assert.equal(result.paymentStatus, 'authorized');
    const order = await TransportOrder.findById(orderId).lean();
    assert.equal(order.paymentStatus, 'authorized');
  });

  it('captures payment on driver accept', async () => {
    const result = await captureForOrderAccept(orderId);
    assert.equal(result.ok, true);
    assert.equal(result.paymentStatus, 'captured');
  });

  it('blocks capture when not authorized (new order)', async () => {
    const order2 = await TransportOrder.create({
      customerId,
      pickupLocation: { address: 'C', lat: 35.1, lng: 33.3 },
      dropoffLocation: { address: 'D', lat: 35.2, lng: 33.4 },
      pickupDistrict: 'Nicosia',
      price: 30,
      distanceKm: 5,
      vehicleType: 'pickup',
      status: 'pending',
    });
    await ensurePaymentIntentForOrder(order2);
    const blocked = await captureForOrderAccept(order2._id);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 402);
  });

  it('credits driver and platform wallets on delivery', async () => {
    const order = await TransportOrder.findById(orderId);
    order.driverId = driverId;
    order.status = 'accepted';
    applyCompletionCommission(order);
    order.status = 'delivered';
    await creditBalancesOnDelivery(order);
    await order.save();

    const driverWallet = await getDriverWalletSummary(driverId);
    const platformWallet = await getPlatformWalletSummary();
    assert.equal(driverWallet.availableBalance, 40);
    assert.equal(platformWallet.availableBalance, 10);
  });

  it('allows driver withdrawal up to available balance', async () => {
    const wd = await requestDriverWithdrawal(driverId, 15);
    assert.equal(wd.ok, true);
    assert.equal(wd.wallet.availableBalance, 25);
  });

  it('cancels authorization and refunds capture on customer cancel flow', async () => {
    const order3 = await TransportOrder.create({
      customerId,
      pickupLocation: { address: 'E', lat: 35.1, lng: 33.3 },
      dropoffLocation: { address: 'F', lat: 35.2, lng: 33.4 },
      pickupDistrict: 'Nicosia',
      price: 20,
      distanceKm: 3,
      vehicleType: 'pickup',
      status: 'pending',
    });
    await ensurePaymentIntentForOrder(order3);
    await confirmMockCheckout(order3._id, customerId);
    await cancelPaymentForOrder(order3._id);
    const intent = await PaymentIntent.findOne({ orderId: order3._id }).lean();
    assert.equal(intent.status, 'cancelled');
  });
});
