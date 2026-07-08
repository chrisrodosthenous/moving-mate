/** User model: firstName, lastName, dateOfBirth, phoneNumber (+357 + 8 digits), email, password, role. */
const mongoose = require('mongoose');
const { CYPRUS_DISTRICTS } = require('../constants/cyprusDistricts');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_NUMBER_REGEX = /^\+357\d{8}$/;

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: function requiredDob() {
        return this.role === 'driver';
      },
      default: null,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: (v) => PHONE_NUMBER_REGEX.test(v),
        message: 'Phone number must be +357 followed by exactly 8 digits',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => EMAIL_REGEX.test(v),
        message: 'Invalid email format',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'driver', 'admin'],
      required: [true, 'Role is required'],
    },
    district: {
      type: String,
      enum: CYPRUS_DISTRICTS,
      default: null,
    },
    homeAddress: {
      type: String,
      default: '',
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    /** Driving license number (drivers submit for admin verification). */
    licenseNumber: {
      type: String,
      default: '',
      trim: true,
    },
    licenseUrl: {
      type: String,
      default: '',
    },
    idCardPath: {
      type: String,
      default: '',
    },
    licensePath: {
      type: String,
      default: '',
    },
    // Top-level field (not nested). Used by upload-license and admin verification.
    verificationStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    /** Set when admin rejects license verification; cleared on approve or new upload. */
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    stripeAccountId: {
      type: String,
      default: undefined,
    },
    /** All registered push-notification tokens for this user (one per device/browser). */
    fcmTokens: {
      type: [String],
      default: [],
    },
    /** Drivers: districts where they can take jobs; empty/omit = see all provinces (fallback). */
    districts: {
      type: [{ type: String, enum: CYPRUS_DISTRICTS }],
      default: undefined,
    },
    /** Drivers: vehicle info (optional; collected at registration or profile). */
    vehicleType: {
      type: String,
      enum: ['pickup', 'minivan', 'van', 'truck'],
      default: undefined,
    },
    vehiclePhotoUrl: {
      type: String,
      default: '',
    },
    carModel: {
      type: String,
      default: '',
      trim: true,
    },
    plateNumber: {
      type: String,
      default: '',
      trim: true,
    },
    /** Drivers: rolling average from Review documents; updated when a review is submitted. */
    averageRating: {
      type: Number,
      default: null,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Same value as totalReviews; preferred name for new code. */
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    /** SHA-256(hex) of raw token; used with {@link passwordResetExpires} for forgot-password flow. */
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: false }
);

userSchema.virtual('name').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});
userSchema.virtual('phone').get(function () {
  return this.phoneNumber;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// No extra indexes: email and phoneNumber already use unique: true in the schema (Mongoose creates unique indexes for them).

module.exports = mongoose.model('User', userSchema);
