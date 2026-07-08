const mongoose = require('mongoose');

/** Order-scoped chat; read = recipient has seen the message (WhatsApp-style delivery/read). */
const messageSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportOrder',
      required: [true, 'Order is required'],
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required'],
    },
    text: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true,
    },
    /** Read receipt (Mongo field name `read`). APIs also expose `isRead` for clients. */
    read: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

/** Primary read path: list messages for one order in chronological order. */
messageSchema.index({ orderId: 1, createdAt: 1 });
messageSchema.index({ orderId: 1, receiverId: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);
