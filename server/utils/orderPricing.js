/**
 * Hybrid tier-based order pricing — single source of truth for server-side validation.
 * Total = BaseFee + (DistanceKm × RatePerKm) + LaborFee + FloorFee
 */

const { ORDER_VEHICLE_TYPES } = require('./orderCargoScoring');

/** Max allowed delta between client-submitted price and server calculation (rounding). */
const PRICE_TOLERANCE_EUR = 0.05;

const LABOR_ASSISTANCE_FEE_EUR = 20;
const FLOOR_CARRYING_FEE_PER_FLOOR_EUR = 5;

/** @type {Record<string, { baseFee: number, ratePerKm: number }>} */
const VEHICLE_PRICING = {
  pickup: { baseFee: 10, ratePerKm: 1.5 },
  minivan: { baseFee: 15, ratePerKm: 2.0 },
  van: { baseFee: 25, ratePerKm: 2.5 },
  truck: { baseFee: 40, ratePerKm: 3.5 },
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

function hasDriverAssistance(laborRequired) {
  return laborRequired === 'driver' || laborRequired === 'driver_plus_helper';
}

/** €5 per floor when floor > 0 and no elevator (pickup + destination summed). */
function computeFloorCarryingFee({ pickupFloor, destinationFloor, hasElevator }) {
  if (hasElevator === true) return 0;
  const pickup = parseFloorValue(pickupFloor);
  const destination = parseFloorValue(destinationFloor);
  let fee = 0;
  if (pickup > 0) fee += pickup * FLOOR_CARRYING_FEE_PER_FLOOR_EUR;
  if (destination > 0) fee += destination * FLOOR_CARRYING_FEE_PER_FLOOR_EUR;
  return roundMoney(fee);
}

function computeLaborFee(laborRequired) {
  return hasDriverAssistance(laborRequired) ? LABOR_ASSISTANCE_FEE_EUR : 0;
}

function getVehiclePricing(vehicleType) {
  const vt = typeof vehicleType === 'string' ? vehicleType.trim() : '';
  if (ORDER_VEHICLE_TYPES.has(vt)) {
    return VEHICLE_PRICING[vt];
  }
  return VEHICLE_PRICING.pickup;
}

/**
 * @param {{
 *   vehicleType: string,
 *   distanceKm: number,
 *   pickupFloor?: string | number,
 *   destinationFloor?: string | number,
 *   hasElevator?: boolean,
 *   laborRequired?: string,
 * }} input
 */
function calculateOrderPrice(input) {
  const distanceKm = Math.max(0, Number(input?.distanceKm) || 0);
  const tier = getVehiclePricing(input?.vehicleType);
  const baseFee = tier.baseFee;
  const ratePerKm = tier.ratePerKm;
  const distanceCost = roundMoney(distanceKm * ratePerKm);
  const laborFee = computeLaborFee(input?.laborRequired);
  const floorFee = computeFloorCarryingFee({
    pickupFloor: input?.pickupFloor,
    destinationFloor: input?.destinationFloor,
    hasElevator: input?.hasElevator,
  });
  const addonsTotal = roundMoney(laborFee + floorFee);
  const total = roundMoney(baseFee + distanceCost + addonsTotal);

  return {
    vehicleType: typeof input?.vehicleType === 'string' ? input.vehicleType.trim() : 'pickup',
    baseFee,
    ratePerKm,
    distanceKm: roundMoney(distanceKm),
    distanceCost,
    laborFee,
    floorFee,
    addonsTotal,
    total,
  };
}

function pricesMatch(clientPrice, serverTotal, tolerance = PRICE_TOLERANCE_EUR) {
  const client = roundMoney(clientPrice);
  const server = roundMoney(serverTotal);
  return Math.abs(client - server) <= tolerance;
}

module.exports = {
  PRICE_TOLERANCE_EUR,
  LABOR_ASSISTANCE_FEE_EUR,
  FLOOR_CARRYING_FEE_PER_FLOOR_EUR,
  VEHICLE_PRICING,
  roundMoney,
  calculateOrderPrice,
  pricesMatch,
  hasDriverAssistance,
  computeFloorCarryingFee,
  computeLaborFee,
};
