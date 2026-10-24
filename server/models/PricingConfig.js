const mongoose = require('mongoose');

/** Single active document; `key` is fixed so upserts always target the same row. */
const SINGLETON_KEY = 'active';

const vehicleTierSchema = new mongoose.Schema(
  {
    baseFee: { type: Number, min: 0 },
    rateNear: { type: Number, min: 0 },
    rateFar: { type: Number, min: 0 },
    minFare: { type: Number, min: 0 },
    consumptionLPer100Km: { type: Number, min: 0 },
    wearPerKm: { type: Number, min: 0 },
  },
  { _id: false },
);

const commissionTierSchema = new mongoose.Schema(
  {
    /** `null` marks the final unbounded band. */
    upToEur: { type: Number, default: null, min: 0 },
    ratePercent: { type: Number, min: 0, max: 100 },
  },
  { _id: false },
);

const pricingConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: SINGLETON_KEY, unique: true, immutable: true },

    dieselPricePerLitreEur: { type: Number, min: 0 },
    driverHourlyTargetEur: { type: Number, min: 0 },
    helperHourlyRateEur: { type: Number, min: 0 },

    handlingRatePerMinuteEur: { type: Number, min: 0 },
    stairsSurchargePerFloor: { type: Number, min: 0 },
    distanceTaperThresholdKm: { type: Number, min: 0 },
    averageSpeedKmh: { type: Number, min: 1 },
    deadheadKm: { type: Number, min: 0 },
    setupHours: { type: Number, min: 0 },

    handlingMinutesPerItem: {
      boxes: { type: Number, min: 0 },
      mediumItems: { type: Number, min: 0 },
      largeFurniture: { type: Number, min: 0 },
      heavyAppliances: { type: Number, min: 0 },
    },

    crewMultiplier: {
      none: { type: Number, min: 0 },
      driver: { type: Number, min: 0 },
      driver_plus_helper: { type: Number, min: 0 },
    },

    vehicles: {
      pickup: vehicleTierSchema,
      minivan: vehicleTierSchema,
      van: vehicleTierSchema,
      truck: vehicleTierSchema,
    },

    commissionTiers: [commissionTierSchema],

    /** Bumped on every admin save; recorded on quotes for traceability. */
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PricingConfig', pricingConfigSchema);
module.exports.SINGLETON_KEY = SINGLETON_KEY;
