const mongoose = require('mongoose');
const { CYPRUS_DISTRICTS } = require('../constants/cyprusDistricts');

/** Nested schema for pickup/dropoff location with address and coordinates */
const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: [true, 'Address is required'], trim: true },
    lat: { type: Number, required: [true, 'Latitude is required'] },
    lng: { type: Number, required: [true, 'Longitude is required'] },
  },
  { _id: false }
);

/** Transport order: customer request, optional driver assignment, status, price, optional scheduled time */

const transportOrderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pickupLocation: {
      type: locationSchema,
      required: true,
    },
    /** Cyprus district for pickup (where the job belongs); from client and/or derived via geocoding. */
    pickupDistrict: {
      type: String,
      enum: CYPRUS_DISTRICTS,
      required: false,
    },
    dropoffLocation: {
      type: locationSchema,
      required: true,
    },
    status: {
      type: String,
      // Full lifecycle:
      // pending -> accepted -> driver_is_on_the_way -> delivered (legacy DB may contain picked_up)
      enum: ['pending', 'accepted', 'picked_up', 'driver_is_on_the_way', 'delivered', 'cancelled'],
      default: 'pending',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be zero or positive'],
    },
    /** Driver net payout (80% of price) — set when status → delivered. */
    driverEarnings: { type: Number, default: 0, min: 0 },
    /** Platform commission (20% of price) — set when status → delivered. */
    platformCommission: { type: Number, default: 0, min: 0 },
    /** Commission percentage applied at completion (default 20). */
    commissionRate: { type: Number, default: 20, min: 0, max: 100 },
    /** Customer payment lifecycle (mirrors PaymentIntent for list UI). */
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'authorized', 'captured', 'refunded'],
      default: 'unpaid',
    },
    distanceKm: {
      type: Number,
      default: null,
      min: [0, 'Distance must be zero or positive'],
    },
    insuranceStatus: {
      type: Boolean,
      default: false,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    smallBoxes: { type: Number, default: 0, min: 0 },
    mediumBoxes: { type: Number, default: 0, min: 0 },
    largeBoxes: { type: Number, default: 0, min: 0 },
    /** Customer cargo inventory at booking (drives automatic vehicle tier). */
    cargoInventory: {
      boxes: { type: Number, default: 0, min: 0 },
      mediumItems: { type: Number, default: 0, min: 0 },
      largeFurniture: { type: Number, default: 0, min: 0 },
      heavyAppliances: { type: Number, default: 0, min: 0 },
    },
    /** Customer item selection snapshot (JSON / mixed — mirrors cargoInventory on new orders). */
    inventory: { type: mongoose.Schema.Types.Mixed, default: {} },
    cargoImageUrl: { type: String, default: '' },
    /** Vehicle tier required for this job (strict enum for new orders). */
    vehicleType: {
      type: String,
      enum: ['pickup', 'minivan', 'van', 'truck'],
      default: 'pickup',
    },
    /** Floor level at pickup: 0 = ground, 1–3 = numbered, 4 = 4th+. */
    pickupFloor: { type: String, default: '0' },
    destinationFloor: { type: String, default: '0' },
    hasElevator: { type: Boolean, default: false },
    /** Loading/unloading assistance: none | driver | driver_plus_helper */
    laborRequired: {
      type: String,
      enum: ['none', 'driver', 'driver_plus_helper'],
      default: 'none',
    },
    rating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      default: null,
      trim: true,
    },
    remindersSent: {
      type: [String],
      default: [],
    },
    /** When a driver accepts the job (status → accepted). */
    acceptedAt: { type: Date, default: null },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    /** Last persisted driver ping (mirror of realtime `driver_location_update`). */
    driverLocation: {
      type: new mongoose.Schema(
        {
          lat: { type: Number },
          lng: { type: Number },
          heading: { type: Number },
          updatedAt: { type: Date },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: false }
);

// Indexes for querying orders by customer or driver
transportOrderSchema.index({ customerId: 1 });
transportOrderSchema.index({ driverId: 1 });
transportOrderSchema.index({ status: 1 });
transportOrderSchema.index({ status: 1, driverId: 1, pickupDistrict: 1, vehicleType: 1 });
// Scheduler: range queries on scheduledAt scoped by status
transportOrderSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('TransportOrder', transportOrderSchema);
