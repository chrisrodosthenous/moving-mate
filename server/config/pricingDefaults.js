/**
 * Seed values and normalisation for the money parameters behind order pricing.
 *
 * These are the numbers an operator may need to change without a deploy — fuel, wages,
 * per-vehicle rates and the commission bands. Everything structural (how the formula
 * combines them) stays in `server/utils/orderPricing.js`.
 *
 * `normalizePricingConfig` is deliberately forgiving: a partial or partly corrupt stored
 * document falls back to the default for each individual field rather than failing the
 * whole request, because a broken config must never take order creation down.
 */

const VEHICLE_TYPES = ['pickup', 'minivan', 'van', 'truck'];
const CARGO_KEYS = ['boxes', 'mediumItems', 'largeFurniture', 'heavyAppliances'];
const LABOR_KEYS = ['none', 'driver', 'driver_plus_helper'];

const DEFAULT_PRICING_CONFIG = Object.freeze({
  /* Volatile inputs — review at least annually. */
  dieselPricePerLitreEur: 1.783,
  driverHourlyTargetEur: 18,
  helperHourlyRateEur: 15,

  /* Model parameters. */
  handlingRatePerMinuteEur: 0.4,
  stairsSurchargePerFloor: 0.08,
  distanceTaperThresholdKm: 30,
  averageSpeedKmh: 50,
  deadheadKm: 15,
  setupHours: 0.3,

  /** Minutes for one worker to move one item one direction. */
  handlingMinutesPerItem: { boxes: 2.5, mediumItems: 5, largeFurniture: 10, heavyAppliances: 14 },

  /** `none` still bills waiting time; `driver_plus_helper` charges the market crew premium. */
  crewMultiplier: { none: 0.3, driver: 1, driver_plus_helper: 1.25 },

  vehicles: {
    pickup: { baseFee: 14, rateNear: 1.3, rateFar: 0.85, minFare: 45, consumptionLPer100Km: 9.5, wearPerKm: 0.13 },
    minivan: { baseFee: 15, rateNear: 1.25, rateFar: 0.8, minFare: 50, consumptionLPer100Km: 8.5, wearPerKm: 0.12 },
    van: { baseFee: 18, rateNear: 1.5, rateFar: 1.15, minFare: 60, consumptionLPer100Km: 11.5, wearPerKm: 0.17 },
    truck: { baseFee: 24, rateNear: 1.95, rateFar: 1.3, minFare: 90, consumptionLPer100Km: 19, wearPerKm: 0.28 },
  },

  /** Marginal bands; `upToEur: null` marks the final unbounded band (Infinity is not BSON-safe). */
  commissionTiers: [
    { upToEur: 100, ratePercent: 20 },
    { upToEur: 300, ratePercent: 15 },
    { upToEur: null, ratePercent: 10 },
  ],
});

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeTiers(raw, fallback) {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((t) => ({ ...t }));
  const tiers = [];
  for (const entry of raw) {
    const ratePercent = Number(entry?.ratePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return fallback.map((t) => ({ ...t }));
    const rawUpTo = entry?.upToEur;
    const upToEur = rawUpTo == null || !Number.isFinite(Number(rawUpTo)) ? null : Number(rawUpTo);
    tiers.push({ upToEur, ratePercent });
  }
  // Bands must ascend and the last one must be unbounded, or the walk would leave money unbilled.
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1].upToEur;
    const curr = tiers[i].upToEur;
    if (prev == null) return fallback.map((t) => ({ ...t }));
    if (curr != null && curr <= prev) return fallback.map((t) => ({ ...t }));
  }
  if (tiers.at(-1).upToEur != null) return fallback.map((t) => ({ ...t }));
  return tiers;
}

/** Merge a stored document over the defaults, field by field. */
function normalizePricingConfig(raw) {
  const d = DEFAULT_PRICING_CONFIG;
  const src = raw && typeof raw === 'object' ? raw : {};

  const handlingMinutesPerItem = {};
  for (const key of CARGO_KEYS) {
    handlingMinutesPerItem[key] = positiveNumber(
      src.handlingMinutesPerItem?.[key],
      d.handlingMinutesPerItem[key],
    );
  }

  const crewMultiplier = {};
  for (const key of LABOR_KEYS) {
    crewMultiplier[key] = positiveNumber(src.crewMultiplier?.[key], d.crewMultiplier[key]);
  }

  const vehicles = {};
  for (const type of VEHICLE_TYPES) {
    const fallback = d.vehicles[type];
    const stored = src.vehicles?.[type];
    vehicles[type] = {
      baseFee: positiveNumber(stored?.baseFee, fallback.baseFee),
      rateNear: positiveNumber(stored?.rateNear, fallback.rateNear),
      rateFar: positiveNumber(stored?.rateFar, fallback.rateFar),
      minFare: positiveNumber(stored?.minFare, fallback.minFare),
      consumptionLPer100Km: positiveNumber(stored?.consumptionLPer100Km, fallback.consumptionLPer100Km),
      wearPerKm: positiveNumber(stored?.wearPerKm, fallback.wearPerKm),
    };
  }

  return {
    dieselPricePerLitreEur: positiveNumber(src.dieselPricePerLitreEur, d.dieselPricePerLitreEur),
    driverHourlyTargetEur: positiveNumber(src.driverHourlyTargetEur, d.driverHourlyTargetEur),
    helperHourlyRateEur: positiveNumber(src.helperHourlyRateEur, d.helperHourlyRateEur),
    handlingRatePerMinuteEur: positiveNumber(src.handlingRatePerMinuteEur, d.handlingRatePerMinuteEur),
    stairsSurchargePerFloor: positiveNumber(src.stairsSurchargePerFloor, d.stairsSurchargePerFloor),
    distanceTaperThresholdKm: positiveNumber(src.distanceTaperThresholdKm, d.distanceTaperThresholdKm),
    averageSpeedKmh: positiveNumber(src.averageSpeedKmh, d.averageSpeedKmh) || d.averageSpeedKmh,
    deadheadKm: positiveNumber(src.deadheadKm, d.deadheadKm),
    setupHours: positiveNumber(src.setupHours, d.setupHours),
    handlingMinutesPerItem,
    crewMultiplier,
    vehicles,
    commissionTiers: normalizeTiers(src.commissionTiers, d.commissionTiers),
  };
}

const NESTED_GROUPS = {
  handlingMinutesPerItem: CARGO_KEYS,
  crewMultiplier: LABOR_KEYS,
};

/**
 * Deep-merge a partial patch over an existing config.
 *
 * A shallow spread would be wrong here: patching one vehicle's base fee would drop the
 * other three vehicles, and normalisation would then silently restore them to seed values.
 * `commissionTiers` is replaced wholesale, since a band list only makes sense as a unit.
 */
function mergePricingConfig(base, patch) {
  const merged = { ...base };
  const src = patch && typeof patch === 'object' ? patch : {};

  for (const [key, value] of Object.entries(src)) {
    if (key in NESTED_GROUPS) {
      merged[key] = { ...base[key], ...(value ?? {}) };
    } else if (key === 'vehicles') {
      const vehicles = { ...base.vehicles };
      for (const type of VEHICLE_TYPES) {
        if (value?.[type]) vehicles[type] = { ...base.vehicles[type], ...value[type] };
      }
      merged.vehicles = vehicles;
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

module.exports = {
  VEHICLE_TYPES,
  CARGO_KEYS,
  LABOR_KEYS,
  DEFAULT_PRICING_CONFIG,
  normalizePricingConfig,
  mergePricingConfig,
};
