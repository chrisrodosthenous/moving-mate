import type {
  OrderCargoInventory,
  OrderLaborRequired,
  OrderVehicleType,
} from '../../core/models/order.model';

/** Max allowed delta between client-submitted price and server calculation (rounding). */
export const PRICE_TOLERANCE_EUR = 0.05;

/* ── Volatile inputs (review annually; keep in sync with server) ─────────── */
const DIESEL_PRICE_PER_LITRE_EUR = 1.783;
const DRIVER_HOURLY_TARGET_EUR = 18;
const HELPER_HOURLY_RATE_EUR = 15;

/* ── Stable model parameters ─────────────────────────────────────────────── */
const COMMISSION_RATE = 0.2;
export const HANDLING_RATE_PER_MINUTE_EUR = 0.4;
export const STAIRS_SURCHARGE_PER_FLOOR = 0.08;
export const DISTANCE_TAPER_THRESHOLD_KM = 30;
const AVERAGE_SPEED_KMH = 50;
const DEADHEAD_KM = 15;
const SETUP_HOURS = 0.3;

/** Handling minutes for one worker moving one item one direction. */
const HANDLING_MINUTES_PER_ITEM: Record<keyof OrderCargoInventory, number> = {
  boxes: 2.5,
  mediumItems: 5,
  largeFurniture: 10,
  heavyAppliances: 14,
};

/** `none` still bills waiting time; `driver_plus_helper` adds a second wage. */
const CREW_MULTIPLIER: Record<OrderLaborRequired, number> = {
  none: 0.3,
  driver: 1,
  driver_plus_helper: 1.25,
};

const CREW_SIZE: Record<OrderLaborRequired, number> = {
  none: 1,
  driver: 1,
  driver_plus_helper: 2,
};

interface VehicleTier {
  baseFee: number;
  rateNear: number;
  rateFar: number;
  minFare: number;
  consumptionLPer100Km: number;
  wearPerKm: number;
}

const VEHICLE_PRICING: Record<OrderVehicleType, VehicleTier> = {
  pickup: { baseFee: 14, rateNear: 1.3, rateFar: 0.85, minFare: 45, consumptionLPer100Km: 9.5, wearPerKm: 0.13 },
  minivan: { baseFee: 15, rateNear: 1.25, rateFar: 0.8, minFare: 50, consumptionLPer100Km: 8.5, wearPerKm: 0.12 },
  van: { baseFee: 18, rateNear: 1.5, rateFar: 1.15, minFare: 60, consumptionLPer100Km: 11.5, wearPerKm: 0.17 },
  truck: { baseFee: 24, rateNear: 1.95, rateFar: 1.3, minFare: 90, consumptionLPer100Km: 19, wearPerKm: 0.28 },
};

export type OrderPricingBasis = 'rate_card' | 'cost_floor' | 'minimum_fare';

export interface OrderPriceBreakdown {
  vehicleType: OrderVehicleType;
  baseFee: number;
  rateNearPerKm: number;
  rateFarPerKm: number;
  ratePerKm: number;
  distanceKm: number;
  distanceCost: number;
  handlingMinutes: number;
  handlingCost: number;
  crewCost: number;
  accessCost: number;
  addonsTotal: number;
  rateCardTotal: number;
  driverCostFloor: number;
  floorPrice: number;
  minFare: number;
  pricingBasis: OrderPricingBasis;
  total: number;
}

export interface OrderPriceInput {
  vehicleType: OrderVehicleType;
  distanceKm: number;
  cargoInventory?: Partial<OrderCargoInventory>;
  pickupFloor?: string;
  destinationFloor?: string;
  hasElevator?: boolean;
  laborRequired?: OrderLaborRequired;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseFloorValue(floor: string | number | undefined): number {
  const n = Number.parseInt(String(floor ?? '0'), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeQuantity(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function hasDriverAssistance(laborRequired: OrderLaborRequired | undefined): boolean {
  return laborRequired === 'driver' || laborRequired === 'driver_plus_helper';
}

function usesHelper(laborRequired: OrderLaborRequired | undefined): boolean {
  return laborRequired === 'driver_plus_helper';
}

function crewMultiplier(laborRequired: OrderLaborRequired | undefined): number {
  return laborRequired ? (CREW_MULTIPLIER[laborRequired] ?? CREW_MULTIPLIER.none) : CREW_MULTIPLIER.none;
}

function crewSize(laborRequired: OrderLaborRequired | undefined): number {
  return laborRequired ? (CREW_SIZE[laborRequired] ?? 1) : 1;
}

function getVehiclePricing(vehicleType: OrderVehicleType): VehicleTier {
  return VEHICLE_PRICING[vehicleType] ?? VEHICLE_PRICING.pickup;
}

/** Total handling minutes for one worker, counting both the load and the unload. */
export function computeHandlingMinutes(cargoInventory: Partial<OrderCargoInventory> | undefined): number {
  if (!cargoInventory) return 0;
  const oneWay =
    normalizeQuantity(cargoInventory.boxes) * HANDLING_MINUTES_PER_ITEM.boxes +
    normalizeQuantity(cargoInventory.mediumItems) * HANDLING_MINUTES_PER_ITEM.mediumItems +
    normalizeQuantity(cargoInventory.largeFurniture) * HANDLING_MINUTES_PER_ITEM.largeFurniture +
    normalizeQuantity(cargoInventory.heavyAppliances) * HANDLING_MINUTES_PER_ITEM.heavyAppliances;
  return Math.round(oneWay * 2 * 100) / 100;
}

export function computeHandlingCost(handlingMinutes: number): number {
  return roundMoney(Math.max(0, handlingMinutes) * HANDLING_RATE_PER_MINUTE_EUR);
}

export function computeCrewCost(
  handlingCost: number,
  laborRequired: OrderLaborRequired | undefined,
): number {
  return roundMoney(handlingCost * crewMultiplier(laborRequired));
}

/** Stairs scale with the load being carried, not with a flat per-floor fee. */
export function computeAccessCost(
  handlingCost: number,
  input: { pickupFloor?: string; destinationFloor?: string; hasElevator?: boolean },
): number {
  if (input.hasElevator === true) return 0;
  const floors = parseFloorValue(input.pickupFloor) + parseFloorValue(input.destinationFloor);
  if (floors <= 0) return 0;
  return roundMoney(handlingCost * STAIRS_SURCHARGE_PER_FLOOR * floors);
}

function computeDistanceCost(distanceKm: number, tier: VehicleTier): number {
  const km = Math.max(0, distanceKm);
  const near = Math.min(km, DISTANCE_TAPER_THRESHOLD_KM);
  const far = Math.max(0, km - DISTANCE_TAPER_THRESHOLD_KM);
  return roundMoney(near * tier.rateNear + far * tier.rateFar);
}

/** Fuel + wear per kilometre actually driven, derived so a fuel change reprices every tier. */
function computeCostPerKm(tier: VehicleTier): number {
  return (tier.consumptionLPer100Km / 100) * DIESEL_PRICE_PER_LITRE_EUR + tier.wearPerKm;
}

/** Elapsed hours the driver is committed: handling (split across the crew), both legs, setup. */
export function computeJobHours(input: {
  handlingMinutes: number;
  distanceKm: number;
  laborRequired?: OrderLaborRequired;
}): number {
  const handlingHours = Math.max(0, input.handlingMinutes) / 60 / crewSize(input.laborRequired);
  const drivingHours = (Math.max(0, input.distanceKm) * 2) / AVERAGE_SPEED_KMH;
  return handlingHours + drivingHours + SETUP_HOURS;
}

/** What the job costs the driver: fuel and wear over the real distance, their time, the helper. */
export function computeDriverCostFloor(input: {
  vehicleType: OrderVehicleType;
  distanceKm: number;
  handlingMinutes: number;
  laborRequired?: OrderLaborRequired;
}): number {
  const tier = getVehiclePricing(input.vehicleType);
  const km = Math.max(0, input.distanceKm);
  const vehicleCost = computeCostPerKm(tier) * (km * 2 + DEADHEAD_KM);
  const jobHours = computeJobHours({
    handlingMinutes: input.handlingMinutes,
    distanceKm: km,
    laborRequired: input.laborRequired,
  });
  const driverCost = jobHours * DRIVER_HOURLY_TARGET_EUR;
  const helperHours = usesHelper(input.laborRequired)
    ? Math.max(0, input.handlingMinutes) / 60 / CREW_SIZE.driver_plus_helper
    : 0;
  const helperCost = helperHours * HELPER_HOURLY_RATE_EUR;
  return roundMoney(vehicleCost + driverCost + helperCost);
}

/** Mirrors `server/utils/orderPricing.js` — keep in sync. */
export function calculateOrderPrice(input: OrderPriceInput): OrderPriceBreakdown {
  const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
  const laborRequired = input.laborRequired;
  const tier = getVehiclePricing(input.vehicleType);

  const handlingMinutes = computeHandlingMinutes(input.cargoInventory);
  const handlingCost = computeHandlingCost(handlingMinutes);
  const crewCost = computeCrewCost(handlingCost, laborRequired);
  const accessCost = computeAccessCost(handlingCost, {
    pickupFloor: input.pickupFloor,
    destinationFloor: input.destinationFloor,
    hasElevator: input.hasElevator,
  });
  const distanceCost = computeDistanceCost(distanceKm, tier);
  const addonsTotal = roundMoney(crewCost + accessCost);
  const rateCardTotal = roundMoney(tier.baseFee + distanceCost + addonsTotal);

  const driverCostFloor = computeDriverCostFloor({
    vehicleType: input.vehicleType,
    distanceKm,
    handlingMinutes,
    laborRequired,
  });
  const floorPrice = roundMoney(driverCostFloor / (1 - COMMISSION_RATE));

  let total = rateCardTotal;
  let pricingBasis: OrderPricingBasis = 'rate_card';
  if (floorPrice > total) {
    total = floorPrice;
    pricingBasis = 'cost_floor';
  }
  if (tier.minFare > total) {
    total = tier.minFare;
    pricingBasis = 'minimum_fare';
  }

  return {
    vehicleType: input.vehicleType,
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
