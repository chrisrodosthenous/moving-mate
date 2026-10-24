/**
 * Work-based order pricing — single source of truth for server-side validation.
 *
 * Moving is a labour business, so the price is driven by handling time derived from the
 * cargo inventory, not by distance alone:
 *
 *   rateCard = BaseFee + TaperedDistance + CrewCost + AccessCost
 *   floor    = (vehicle cost + driver hours + helper wage) / (1 - commission)
 *   total    = max(rateCard, floor, MinFare)
 *
 * The floor guarantees a job is never published below what it costs the driver to perform.
 */

const { ORDER_VEHICLE_TYPES } = require('./orderCargoScoring');
const { normalizePricingConfig } = require('../config/pricingDefaults');

/** Max allowed delta between client-submitted price and server calculation (rounding). */
const PRICE_TOLERANCE_EUR = 0.05;

/* ── Volatile inputs (review annually; see docs) ─────────────────────────── */
const DIESEL_PRICE_PER_LITRE_EUR = 1.783;
const DRIVER_HOURLY_TARGET_EUR = 18;
const HELPER_HOURLY_RATE_EUR = 15;

/* ── Stable model parameters ─────────────────────────────────────────────── */
const COMMISSION_RATE = 0.2;
const HANDLING_RATE_PER_MINUTE_EUR = 0.4;
const STAIRS_SURCHARGE_PER_FLOOR = 0.08;
const DISTANCE_TAPER_THRESHOLD_KM = 30;
const AVERAGE_SPEED_KMH = 50;
const DEADHEAD_KM = 15;
const SETUP_HOURS = 0.3;

/** Handling minutes for one worker moving one item one direction. */
const HANDLING_MINUTES_PER_ITEM = {
  boxes: 2.5,
  mediumItems: 5,
  largeFurniture: 10,
  heavyAppliances: 14,
};

/** `none` still bills waiting time; `driver_plus_helper` adds a second wage. */
const CREW_MULTIPLIER = {
  none: 0.3,
  driver: 1,
  driver_plus_helper: 1.25,
};

const CREW_SIZE = {
  none: 1,
  driver: 1,
  driver_plus_helper: 2,
};

/**
 * baseFee covers the driver reaching the pickup (DEADHEAD_KM + SETUP_HOURS).
 * rateFar applies beyond DISTANCE_TAPER_THRESHOLD_KM, where fixed costs are already recovered.
 * @type {Record<string, {
 *   baseFee: number, rateNear: number, rateFar: number, minFare: number,
 *   consumptionLPer100Km: number, wearPerKm: number
 * }>}
 */
const VEHICLE_PRICING = {
  pickup: { baseFee: 14, rateNear: 1.3, rateFar: 0.85, minFare: 45, consumptionLPer100Km: 9.5, wearPerKm: 0.13 },
  minivan: { baseFee: 15, rateNear: 1.25, rateFar: 0.8, minFare: 50, consumptionLPer100Km: 8.5, wearPerKm: 0.12 },
  van: { baseFee: 18, rateNear: 1.5, rateFar: 1.15, minFare: 60, consumptionLPer100Km: 11.5, wearPerKm: 0.17 },
  truck: { baseFee: 24, rateNear: 1.95, rateFar: 1.3, minFare: 90, consumptionLPer100Km: 19, wearPerKm: 0.28 },
};

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseFloorValue(floor) {
  const n = Number.parseInt(String(floor ?? '0'), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function hasDriverAssistance(laborRequired) {
  return laborRequired === 'driver' || laborRequired === 'driver_plus_helper';
}

function usesHelper(laborRequired) {
  return laborRequired === 'driver_plus_helper';
}

function crewMultiplier(laborRequired) {
  return CREW_MULTIPLIER[laborRequired] ?? CREW_MULTIPLIER.none;
}

function crewSize(laborRequired) {
  return CREW_SIZE[laborRequired] ?? 1;
}

function getVehiclePricing(vehicleType) {
  const vt = typeof vehicleType === 'string' ? vehicleType.trim() : '';
  if (ORDER_VEHICLE_TYPES.has(vt)) return VEHICLE_PRICING[vt];
  return VEHICLE_PRICING.pickup;
}

/** Total handling minutes for one worker, counting both the load and the unload. */
function computeHandlingMinutes(cargoInventory, perItem = HANDLING_MINUTES_PER_ITEM) {
  if (!cargoInventory || typeof cargoInventory !== 'object') return 0;
  const oneWay =
    normalizeQuantity(cargoInventory.boxes) * perItem.boxes +
    normalizeQuantity(cargoInventory.mediumItems) * perItem.mediumItems +
    normalizeQuantity(cargoInventory.largeFurniture) * perItem.largeFurniture +
    normalizeQuantity(cargoInventory.heavyAppliances) * perItem.heavyAppliances;
  return Math.round(oneWay * 2 * 100) / 100;
}

function computeHandlingCost(handlingMinutes, ratePerMinute = HANDLING_RATE_PER_MINUTE_EUR) {
  return roundMoney(Math.max(0, handlingMinutes) * ratePerMinute);
}

function computeCrewCost(handlingCost, laborRequired, multipliers = CREW_MULTIPLIER) {
  const multiplier = multipliers[laborRequired] ?? multipliers.none ?? CREW_MULTIPLIER.none;
  return roundMoney(handlingCost * multiplier);
}

/** Stairs scale with the load being carried, not with a flat per-floor fee. */
function computeAccessCost(handlingCost, { pickupFloor, destinationFloor, hasElevator }, surcharge = STAIRS_SURCHARGE_PER_FLOOR) {
  if (hasElevator === true) return 0;
  const floors = parseFloorValue(pickupFloor) + parseFloorValue(destinationFloor);
  if (floors <= 0) return 0;
  return roundMoney(handlingCost * surcharge * floors);
}

function computeDistanceCost(distanceKm, tier, thresholdKm = DISTANCE_TAPER_THRESHOLD_KM) {
  const km = Math.max(0, distanceKm);
  const near = Math.min(km, thresholdKm);
  const far = Math.max(0, km - thresholdKm);
  return roundMoney(near * tier.rateNear + far * tier.rateFar);
}

/** Fuel + wear per kilometre actually driven, derived so a fuel change reprices every tier. */
function computeCostPerKm(tier, dieselPrice = DIESEL_PRICE_PER_LITRE_EUR) {
  return (tier.consumptionLPer100Km / 100) * dieselPrice + tier.wearPerKm;
}

/** Elapsed hours the driver is committed: handling (split across the crew), both legs, setup. */
function computeJobHours({ handlingMinutes, distanceKm, laborRequired }, timing = {}) {
  const speed = timing.averageSpeedKmh || AVERAGE_SPEED_KMH;
  const setup = timing.setupHours ?? SETUP_HOURS;
  const handlingHours = Math.max(0, handlingMinutes) / 60 / crewSize(laborRequired);
  const drivingHours = (Math.max(0, distanceKm) * 2) / speed;
  return handlingHours + drivingHours + setup;
}

/** What the job costs the driver: fuel and wear over the real distance, their time, the helper. */
function computeDriverCostFloor({ vehicleType, distanceKm, handlingMinutes, laborRequired }, config) {
  const c = config ? normalizePricingConfig(config) : null;
  const tier = c ? (c.vehicles[vehicleType] ?? c.vehicles.pickup) : getVehiclePricing(vehicleType);
  const km = Math.max(0, distanceKm);
  const vehicleCost = computeCostPerKm(tier, c?.dieselPricePerLitreEur) * (km * 2 + (c?.deadheadKm ?? DEADHEAD_KM));
  const jobHours = computeJobHours(
    { handlingMinutes, distanceKm: km, laborRequired },
    c ? { averageSpeedKmh: c.averageSpeedKmh, setupHours: c.setupHours } : {},
  );
  const driverCost = jobHours * (c?.driverHourlyTargetEur ?? DRIVER_HOURLY_TARGET_EUR);
  const helperHours = usesHelper(laborRequired) ? Math.max(0, handlingMinutes) / 60 / CREW_SIZE.driver_plus_helper : 0;
  const helperCost = helperHours * (c?.helperHourlyRateEur ?? HELPER_HOURLY_RATE_EUR);
  return roundMoney(vehicleCost + driverCost + helperCost);
}

/**
 * @param {{
 *   vehicleType: string,
 *   distanceKm: number,
 *   cargoInventory?: { boxes?: number, mediumItems?: number, largeFurniture?: number, heavyAppliances?: number },
 *   pickupFloor?: string | number,
 *   destinationFloor?: string | number,
 *   hasElevator?: boolean,
 *   laborRequired?: string,
 * }} input
 */
function calculateOrderPrice(input, config) {
  const c = normalizePricingConfig(config);
  const distanceKm = Math.max(0, Number(input?.distanceKm) || 0);
  const laborRequired = input?.laborRequired;
  const vehicleKey = ORDER_VEHICLE_TYPES.has(String(input?.vehicleType ?? '').trim())
    ? String(input.vehicleType).trim()
    : 'pickup';
  const tier = c.vehicles[vehicleKey] ?? c.vehicles.pickup;

  const handlingMinutes = computeHandlingMinutes(input?.cargoInventory, c.handlingMinutesPerItem);
  const handlingCost = computeHandlingCost(handlingMinutes, c.handlingRatePerMinuteEur);
  const crewCost = computeCrewCost(handlingCost, laborRequired, c.crewMultiplier);
  const accessCost = computeAccessCost(
    handlingCost,
    {
      pickupFloor: input?.pickupFloor,
      destinationFloor: input?.destinationFloor,
      hasElevator: input?.hasElevator,
    },
    c.stairsSurchargePerFloor,
  );
  const distanceCost = computeDistanceCost(distanceKm, tier, c.distanceTaperThresholdKm);
  const addonsTotal = roundMoney(crewCost + accessCost);
  const rateCardTotal = roundMoney(tier.baseFee + distanceCost + addonsTotal);

  const driverCostFloor = computeDriverCostFloor(
    {
      vehicleType: vehicleKey,
      distanceKm,
      handlingMinutes,
      laborRequired,
    },
    c,
  );
  const commissionRate = (Number(c.commissionTiers[0]?.ratePercent) || 20) / 100;
  const floorPrice = roundMoney(driverCostFloor / (1 - commissionRate));

  let total = rateCardTotal;
  let pricingBasis = 'rate_card';
  if (floorPrice > total) {
    total = floorPrice;
    pricingBasis = 'cost_floor';
  }
  if (tier.minFare > total) {
    total = tier.minFare;
    pricingBasis = 'minimum_fare';
  }

  return {
    vehicleType: typeof input?.vehicleType === 'string' ? input.vehicleType.trim() : 'pickup',
    baseFee: tier.baseFee,
    rateNearPerKm: tier.rateNear,
    rateFarPerKm: tier.rateFar,
    ratePerKm: distanceKm > 0 ? roundMoney(distanceCost / distanceKm) : tier.rateNear,
    distanceKm: roundMoney(distanceKm),
    distanceCost,
    handlingMinutes,
    handlingCost,
    crewCost,
    accessCost,
    addonsTotal,
    rateCardTotal,
    driverCostFloor,
    floorPrice,
    minFare: tier.minFare,
    pricingBasis,
    total: roundMoney(total),
  };
}

function pricesMatch(clientPrice, serverTotal, tolerance = PRICE_TOLERANCE_EUR) {
  const client = roundMoney(clientPrice);
  const server = roundMoney(serverTotal);
  return Math.abs(client - server) <= tolerance;
}

module.exports = {
  PRICE_TOLERANCE_EUR,
  DIESEL_PRICE_PER_LITRE_EUR,
  DRIVER_HOURLY_TARGET_EUR,
  HELPER_HOURLY_RATE_EUR,
  COMMISSION_RATE,
  HANDLING_RATE_PER_MINUTE_EUR,
  STAIRS_SURCHARGE_PER_FLOOR,
  DISTANCE_TAPER_THRESHOLD_KM,
  HANDLING_MINUTES_PER_ITEM,
  CREW_MULTIPLIER,
  VEHICLE_PRICING,
  roundMoney,
  hasDriverAssistance,
  computeHandlingMinutes,
  computeHandlingCost,
  computeCrewCost,
  computeAccessCost,
  computeDistanceCost,
  computeCostPerKm,
  computeJobHours,
  computeDriverCostFloor,
  calculateOrderPrice,
  pricesMatch,
};
