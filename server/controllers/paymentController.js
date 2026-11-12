const {
  createCheckoutSession,
  confirmMockCheckout,
  getPaymentStatusForOrder,
} = require('../services/paymentService');
const { isMockPayments } = require('../config/env');
const TransportOrder = require('../models/TransportOrder');
const { sendNewOrderToDriversPush } = require('../services/pushNotificationService');
const {
  emitNewOrderAvailable,
  emitToUser,
  emitToAdmins,
  orderPayloadForEmit,
} = require('../services/realtimeService');

function mockPaymentsOnly(res) {
  if (isMockPayments()) return false;
  res.status(503).json({
    message: 'Live payment provider is not configured. Set PAYMENTS_PROVIDER=mock for testing or integrate Stripe.',
  });
  return true;
}

/** POST /api/payments/checkout/:orderId — start mock provider checkout session. */
async function postCheckoutSession(req, res, next) {
  try {
    if (mockPaymentsOnly(res)) return;
    const customerId = req.user?.userId ?? req.user?._id;
    if (!customerId) return res.status(401).json({ message: 'User not authenticated' });
    if (req.user?.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can pay for orders' });
    }

    const result = await createCheckoutSession(req.params.orderId, customerId);
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({
      ok: true,
      orderId: req.params.orderId,
      amount: result.intent.amount,
      currency: result.intent.currency,
      status: result.intent.status,
      checkoutSessionId: result.intent.checkoutSessionId,
      redirectPath: result.redirectPath,
      alreadyAuthorized: result.alreadyAuthorized === true,
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/payments/confirm/:orderId — mock payment provider success callback. */
async function postConfirmPayment(req, res, next) {
  try {
    if (mockPaymentsOnly(res)) return;
    const customerId = req.user?.userId ?? req.user?._id;
    if (!customerId) return res.status(401).json({ message: 'User not authenticated' });
    if (req.user?.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can pay for orders' });
    }

    const result = await confirmMockCheckout(req.params.orderId, customerId);
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    if (result.newlyAuthorized) {
      const order = await TransportOrder.findById(req.params.orderId)
        .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
        .lean();
      const io = req.app.get('io');
      if (order && io) {
        await emitNewOrderAvailable(io, order.pickupDistrict, order);
        const payload = orderPayloadForEmit(order);
        emitToAdmins(io, 'order_updated', payload);
        emitToUser(io, customerId, 'order_updated', payload);
      }
      if (order) {
        sendNewOrderToDriversPush({
          orderId: String(order._id),
          district: order.pickupDistrict,
          vehicleType: order.vehicleType,
        }).catch((err) => console.warn('[Push] sendNewOrderToDriversPush failed:', err.message));
      }
    }

    return res.json({
      ok: true,
      orderId: req.params.orderId,
      paymentStatus: result.paymentStatus,
      intentStatus: result.intent.status,
      amount: result.intent.amount,
      currency: result.intent.currency,
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/payments/status/:orderId */
async function getPaymentStatus(req, res, next) {
  try {
    const customerId = req.user?.userId ?? req.user?._id;
    const result = await getPaymentStatusForOrder(req.params.orderId, customerId);
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({
      ok: true,
      orderId: req.params.orderId,
      orderStatus: result.order.status,
      paymentStatus: result.paymentStatus,
      intentStatus: result.intent?.status ?? null,
      amount: result.intent?.amount ?? result.order.price,
      currency: result.intent?.currency ?? 'EUR',
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  postCheckoutSession,
  postConfirmPayment,
  getPaymentStatus,
};
