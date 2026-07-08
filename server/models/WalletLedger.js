const mongoose = require('mongoose');

/** Internal balance movements (delivery credits + withdrawal debits). */
const walletLedgerSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ['driver', 'platform'],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportOrder',
      default: null,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payout',
      default: null,
    },
    entryType: {
      type: String,
      enum: ['delivery_credit', 'withdrawal'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EUR', trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

walletLedgerSchema.index(
  { orderId: 1, recipientType: 1, entryType: 1 },
  { unique: true, partialFilterExpression: { entryType: 'delivery_credit' } },
);
walletLedgerSchema.index({ userId: 1, recipientType: 1, entryType: 1 });
walletLedgerSchema.index({ recipientType: 1, entryType: 1 });

module.exports = mongoose.model('WalletLedger', walletLedgerSchema);
