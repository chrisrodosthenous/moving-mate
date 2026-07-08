const PaymentIntent = require('../models/PaymentIntent');
const Payout = require('../models/Payout');
const WalletLedger = require('../models/WalletLedger');
const TransportOrder = require('../models/TransportOrder');
const User = require('../models/User');
const mongoose = require('mongoose');
const { roundMoney } = require('../utils/orderPricing');
const { computeOrderCommission } = require('../utils/orderCommission');
const { sendWithdrawalCompletedEmail } = require('./notificationService');

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

const ORDER_PAYMENT_STATUS = {
  requires_payment: 'unpaid',
  authorized: 'authorized',
  captured: 'captured',
  cancelled: 'unpaid',
  refunded: 'refunded',
};

function mapIntentStatusToOrderPayment(intentStatus) {
  return ORDER_PAYMENT_STATUS[intentStatus] ?? 'unpaid';
}

async function syncOrderPaymentStatus(orderId, intentStatus) {
  const paymentStatus = mapIntentStatusToOrderPayment(intentStatus);
  await TransportOrder.updateOne({ _id: orderId }, { $set: { paymentStatus } });
  return paymentStatus;
}

async function ensurePaymentIntentForOrder(orderDoc) {
  const orderId = orderDoc._id;
  let intent = await PaymentIntent.findOne({ orderId });
  if (intent) return intent;

  intent = await PaymentIntent.create({
    orderId,
    customerId: orderDoc.customerId,
    amount: roundMoney(orderDoc.price),
    currency: 'EUR',
    provider: 'mock',
    status: 'requires_payment',
    checkoutSessionId: `mock_cs_${String(orderId)}_${Date.now()}`,
  });
  await syncOrderPaymentStatus(orderId, intent.status);
  return intent;
}

/**
 * Customer opens mock checkout — returns session metadata (future: Stripe Checkout URL).
 */
async function createCheckoutSession(orderId, customerId) {
  const order = await TransportOrder.findById(orderId).lean();
  if (!order) return { ok: false, status: 404, message: 'Order not found' };
  if (String(order.customerId) !== String(customerId)) {
    return { ok: false, status: 403, message: 'Not your order' };
  }
  if (order.status !== 'pending') {
    return { ok: false, status: 400, message: 'Only pending orders can be paid' };
  }

  const intent = await ensurePaymentIntentForOrder(order);
  if (intent.status === 'authorized') {
    return {
      ok: true,
      intent,
      alreadyAuthorized: true,
      redirectPath: `/customer/orders/${orderId}/checkout`,
    };
  }
  if (intent.status === 'captured' || intent.status === 'refunded') {
    return { ok: false, status: 400, message: 'Payment already processed for this order' };
  }
  if (intent.status === 'cancelled') {
    intent.status = 'requires_payment';
    intent.cancelledAt = null;
    await intent.save();
    await syncOrderPaymentStatus(orderId, intent.status);
  }

  return {
    ok: true,
    intent,
    alreadyAuthorized: false,
    redirectPath: `/customer/orders/${orderId}/checkout`,
  };
}

/** Simulates successful payment-provider authorization (no platform wallet top-up). */
async function confirmMockCheckout(orderId, customerId) {
  const order = await TransportOrder.findById(orderId).lean();
  if (!order) return { ok: false, status: 404, message: 'Order not found' };
  if (String(order.customerId) !== String(customerId)) {
    return { ok: false, status: 403, message: 'Not your order' };
  }
  if (order.status !== 'pending') {
    return { ok: false, status: 400, message: 'Order is no longer payable' };
  }

  const intent = await ensurePaymentIntentForOrder(order);
  if (intent.status === 'authorized') {
    return { ok: true, intent, paymentStatus: 'authorized' };
  }
  if (intent.status !== 'requires_payment') {
    return { ok: false, status: 400, message: `Payment cannot be authorized from status: ${intent.status}` };
  }

  intent.status = 'authorized';
  intent.authorizedAt = new Date();
  await intent.save();
  const paymentStatus = await syncOrderPaymentStatus(orderId, intent.status);
  return { ok: true, intent, paymentStatus };
}

/** Capture customer funds when a driver accepts (mock charge). */
async function captureForOrderAccept(orderId) {
  const order = await TransportOrder.findById(orderId).lean();
  if (!order) return { ok: false, status: 404, message: 'Order not found' };
  if (order.status !== 'pending') {
    return { ok: false, status: 409, message: 'Order no longer available.' };
  }

  const intent = await PaymentIntent.findOne({ orderId });
  if (!intent) {
    return {
      ok: false,
      status: 402,
      message: 'Payment required. Customer must complete checkout before you can accept this job.',
    };
  }
  if (intent.status === 'captured') {
    return { ok: true, intent, paymentStatus: 'captured' };
  }
  if (intent.status !== 'authorized') {
    return {
      ok: false,
      status: 402,
      message: 'Payment required. Customer must complete checkout before you can accept this job.',
    };
  }

  intent.status = 'captured';
  intent.capturedAt = new Date();
  await intent.save();
  const paymentStatus = await syncOrderPaymentStatus(orderId, intent.status);
  return { ok: true, intent, paymentStatus };
}

/** Roll back capture if atomic accept lost the race. */
async function refundCaptureAfterFailedAccept(orderId) {
  const intent = await PaymentIntent.findOne({ orderId });
  if (!intent || intent.status !== 'captured') return { ok: true };
  intent.status = 'authorized';
  intent.capturedAt = null;
  await intent.save();
  await syncOrderPaymentStatus(orderId, intent.status);
  return { ok: true, intent };
}

/** Cancel authorization before driver accept. */
async function cancelPaymentForOrder(orderId) {
  const intent = await PaymentIntent.findOne({ orderId });
  if (!intent) return { ok: true };
  if (intent.status === 'requires_payment' || intent.status === 'authorized') {
    intent.status = 'cancelled';
    intent.cancelledAt = new Date();
    await intent.save();
    await syncOrderPaymentStatus(orderId, intent.status);
  } else if (intent.status === 'captured') {
    intent.status = 'refunded';
    intent.refundedAt = new Date();
    await intent.save();
    await syncOrderPaymentStatus(orderId, intent.status);
  }
  return { ok: true, intent };
}

async function getPaymentStatusForOrder(orderId, customerId) {
  const order = await TransportOrder.findById(orderId).select('customerId paymentStatus price status').lean();
  if (!order) return { ok: false, status: 404, message: 'Order not found' };
  if (customerId && String(order.customerId) !== String(customerId)) {
    return { ok: false, status: 403, message: 'Not your order' };
  }
  const intent = await PaymentIntent.findOne({ orderId }).lean();
  return {
    ok: true,
    order,
    intent,
    paymentStatus: order.paymentStatus ?? mapIntentStatusToOrderPayment(intent?.status),
  };
}

async function sumLedgerCredits(recipientType, userId = null) {
  const filter = { recipientType, entryType: 'delivery_credit' };
  if (recipientType === 'driver' && userId) filter.userId = toObjectId(userId);
  const rows = await WalletLedger.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return roundMoney(rows[0]?.total ?? 0);
}

async function sumLedgerWithdrawals(recipientType, userId = null) {
  const filter = { recipientType, entryType: 'withdrawal' };
  if (recipientType === 'driver' && userId) filter.userId = toObjectId(userId);
  const rows = await WalletLedger.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return roundMoney(rows[0]?.total ?? 0);
}

async function getDriverWalletSummary(driverId) {
  const [credits, withdrawn] = await Promise.all([
    sumLedgerCredits('driver', driverId),
    sumLedgerWithdrawals('driver', driverId),
  ]);
  const availableBalance = roundMoney(Math.max(0, credits - withdrawn));
  return { availableBalance, totalEarned: credits, totalWithdrawn: withdrawn, currency: 'EUR' };
}

async function getPlatformWalletSummary() {
  const [credits, withdrawn] = await Promise.all([
    sumLedgerCredits('platform'),
    sumLedgerWithdrawals('platform'),
  ]);
  const availableBalance = roundMoney(Math.max(0, credits - withdrawn));
  return { availableBalance, totalRevenue: credits, totalWithdrawn: withdrawn, currency: 'EUR' };
}

/** Credit driver + platform internal balances when a delivery completes. Idempotent per order. */
async function creditBalancesOnDelivery(orderDoc) {
  const orderId = orderDoc._id;
  const driverId = orderDoc.driverId;
  if (!driverId) return { ok: false, message: 'No driver on order' };

  const driverCredit = roundMoney(
    orderDoc.driverEarnings ?? computeOrderCommission(orderDoc.price, orderDoc.commissionRate).driverEarnings,
  );
  const platformCredit = roundMoney(
    orderDoc.platformCommission ?? computeOrderCommission(orderDoc.price, orderDoc.commissionRate).platformCommission,
  );

  if (driverCredit > 0) {
    await WalletLedger.updateOne(
      { orderId, recipientType: 'driver', entryType: 'delivery_credit' },
      {
        $setOnInsert: {
          userId: toObjectId(driverId),
          amount: driverCredit,
          currency: 'EUR',
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  if (platformCredit > 0) {
    await WalletLedger.updateOne(
      { orderId, recipientType: 'platform', entryType: 'delivery_credit' },
      {
        $setOnInsert: {
          userId: null,
          amount: platformCredit,
          currency: 'EUR',
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  return { ok: true, driverCredit, platformCredit };
}

async function requestDriverWithdrawal(driverId, amount, note = '') {
  const parsed = roundMoney(amount);
  if (parsed < 0.01) return { ok: false, status: 400, message: 'Minimum withdrawal is €0.01' };

  const wallet = await getDriverWalletSummary(driverId);
  if (parsed > wallet.availableBalance) {
    return {
      ok: false,
      status: 400,
      message: `Insufficient balance. Available: €${wallet.availableBalance.toFixed(2)}`,
    };
  }

  const payout = await Payout.create({
    userId: toObjectId(driverId),
    recipientType: 'driver',
    amount: parsed,
    currency: 'EUR',
    status: 'completed',
    provider: 'mock',
    note: note || 'Mock bank withdrawal',
    completedAt: new Date(),
  });

  await WalletLedger.create({
    recipientType: 'driver',
    userId: toObjectId(driverId),
    payoutId: payout._id,
    entryType: 'withdrawal',
    amount: parsed,
    currency: 'EUR',
  });

  const updatedWallet = await getDriverWalletSummary(driverId);
  const user = await User.findById(driverId).select('email firstName').lean();
  if (user?.email) {
    void sendWithdrawalCompletedEmail({
      to: user.email,
      firstName: user.firstName,
      amount: parsed,
      remainingBalance: updatedWallet.availableBalance,
      payoutId: payout._id,
      recipientLabel: 'driver wallet',
    }).catch((err) => {
      console.warn('[Notifications] driver withdrawal email failed:', err.message);
    });
  }
  return { ok: true, payout, wallet: updatedWallet };
}

async function requestPlatformWithdrawal(adminUserId, amount, note = '') {
  const parsed = roundMoney(amount);
  if (parsed < 0.01) return { ok: false, status: 400, message: 'Minimum withdrawal is €0.01' };

  const wallet = await getPlatformWalletSummary();
  if (parsed > wallet.availableBalance) {
    return {
      ok: false,
      status: 400,
      message: `Insufficient platform balance. Available: €${wallet.availableBalance.toFixed(2)}`,
    };
  }

  const payout = await Payout.create({
    userId: adminUserId,
    recipientType: 'platform',
    amount: parsed,
    currency: 'EUR',
    status: 'completed',
    provider: 'mock',
    note: note || 'Mock platform withdrawal',
    completedAt: new Date(),
  });

  await WalletLedger.create({
    recipientType: 'platform',
    userId: null,
    payoutId: payout._id,
    entryType: 'withdrawal',
    amount: parsed,
    currency: 'EUR',
  });

  const updatedWallet = await getPlatformWalletSummary();
  if (adminUserId) {
    const adminUser = await User.findById(adminUserId).select('email firstName').lean();
    if (adminUser?.email) {
      void sendWithdrawalCompletedEmail({
        to: adminUser.email,
        firstName: adminUser.firstName,
        amount: parsed,
        remainingBalance: updatedWallet.availableBalance,
        payoutId: payout._id,
        recipientLabel: 'platform wallet',
      }).catch((err) => {
        console.warn('[Notifications] platform withdrawal email failed:', err.message);
      });
    }
  }
  return { ok: true, payout, wallet: updatedWallet };
}

module.exports = {
  ensurePaymentIntentForOrder,
  createCheckoutSession,
  confirmMockCheckout,
  captureForOrderAccept,
  refundCaptureAfterFailedAccept,
  cancelPaymentForOrder,
  getPaymentStatusForOrder,
  creditBalancesOnDelivery,
  getDriverWalletSummary,
  getPlatformWalletSummary,
  requestDriverWithdrawal,
  requestPlatformWithdrawal,
};
