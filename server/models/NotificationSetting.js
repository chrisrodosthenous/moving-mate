const mongoose = require('mongoose');

const notificationSettingSchema = new mongoose.Schema(
  {
    eventName: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['email', 'push'],
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

/** Single unique index on eventName (schema `unique: true` on field would duplicate this). */
notificationSettingSchema.index({ eventName: 1 }, { unique: true });
notificationSettingSchema.index({ type: 1 });

module.exports = mongoose.model('NotificationSetting', notificationSettingSchema);
