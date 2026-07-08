const mongoose = require('mongoose');

/** Withdrawal request — driver or platform (mock provider; instant complete in dev). */
const payoutSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recipientType: {
      type: String,
      enum: ['driver', 'platform'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'EUR', trim: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
    },
    provider: { type: String, enum: ['mock', 'stripe'], default: 'mock' },
    note: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

payoutSchema.index({ userId: 1, createdAt: -1 });
payoutSchema.index({ recipientType: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
