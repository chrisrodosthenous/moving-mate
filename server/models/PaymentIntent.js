const mongoose = require('mongoose');

/** Stripe-shaped payment intent — one per order. Provider-agnostic for mock / future Stripe. */
const paymentIntentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportOrder',
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EUR', trim: true },
    provider: { type: String, enum: ['mock', 'stripe'], default: 'mock' },
    status: {
      type: String,
      enum: ['requires_payment', 'authorized', 'captured', 'cancelled', 'refunded'],
      default: 'requires_payment',
    },
    checkoutSessionId: { type: String, default: '' },
    authorizedAt: { type: Date, default: null },
    capturedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

paymentIntentSchema.index({ customerId: 1, status: 1 });

module.exports = mongoose.model('PaymentIntent', paymentIntentSchema);
