const PaymentIntent = require('../models/PaymentIntent');
const WalletLedger = require('../models/WalletLedger');
const TransportOrder = require('../models/TransportOrder');
const mongoose = require('mongoose');
const { roundMoney } = require('../utils/orderPricing');
const { computeOrderCommission } = require('../utils/orderCommission');

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
    return { ok: true, intent, paymentStatus: 'authorized', newlyAuthorized: false };
  }
  if (intent.status !== 'requires_payment') {
    return { ok: false, status: 400, message: `Payment cannot be authorized from status: ${intent.status}` };
  }

  intent.status = 'authorized';
  intent.authorizedAt = new Date();
  await intent.save();
  const paymentStatus = await syncOrderPaymentStatus(orderId, intent.status);
  return { ok: true, intent, paymentStatus, newlyAuthorized: true };
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

async function getDriverWalletSummary(driverId) {
  const credits = await sumLedgerCredits('driver', driverId);
  return { availableBalance: credits, totalEarned: credits, currency: 'EUR' };
}

async function getPlatformWalletSummary() {
  const credits = await sumLedgerCredits('platform');
  return { availableBalance: credits, totalRevenue: credits, currency: 'EUR' };
}

/** Credit driver + platform internal balances when a delivery completes. Idempotent per order. */
async function creditBalancesOnDelivery(orderDoc) {
  const orderId = orderDoc._id;
  const driverId = orderDoc.driverId;
  if (!driverId) return { ok: false, message: 'No driver on order' };

  const split = computeOrderCommission(orderDoc.price);
  const driverCredit = roundMoney(
    Number(orderDoc.driverEarnings) > 0 ? orderDoc.driverEarnings : split.driverEarnings,
  );
  const platformCredit = roundMoney(
    Number(orderDoc.platformCommission) > 0 ? orderDoc.platformCommission : split.platformCommission,
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
};
