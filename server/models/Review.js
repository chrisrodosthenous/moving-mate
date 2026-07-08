const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
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
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

reviewSchema.index({ driverId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
