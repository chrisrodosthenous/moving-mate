import type { OrderLaborRequired, OrderVehicleType } from '../../core/models/order.model';

/** Max allowed delta between client-submitted price and server calculation (rounding). */
export const PRICE_TOLERANCE_EUR = 0.05;

export const LABOR_ASSISTANCE_FEE_EUR = 20;
export const FLOOR_CARRYING_FEE_PER_FLOOR_EUR = 5;

export interface OrderPriceBreakdown {
  vehicleType: OrderVehicleType;
  baseFee: number;
  ratePerKm: number;
  distanceKm: number;
  distanceCost: number;
  laborFee: number;
  floorFee: number;
  addonsTotal: number;
  total: number;
}

export interface OrderPriceInput {
  vehicleType: OrderVehicleType;
  distanceKm: number;
  pickupFloor?: string;
  destinationFloor?: string;
  hasElevator?: boolean;
  laborRequired?: OrderLaborRequired;
}

const VEHICLE_PRICING: Record<OrderVehicleType, { baseFee: number; ratePerKm: number }> = {
  pickup: { baseFee: 10, ratePerKm: 1.5 },
  minivan: { baseFee: 15, ratePerKm: 2.0 },
  van: { baseFee: 25, ratePerKm: 2.5 },
  truck: { baseFee: 40, ratePerKm: 3.5 },
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseFloorValue(floor: string | number | undefined): number {
  const n = Number.parseInt(String(floor ?? '0'), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function hasDriverAssistance(laborRequired: OrderLaborRequired | undefined): boolean {
  return laborRequired === 'driver' || laborRequired === 'driver_plus_helper';
}

export function computeFloorCarryingFee(input: {
  pickupFloor?: string;
  destinationFloor?: string;
  hasElevator?: boolean;
}): number {
  if (input.hasElevator === true) return 0;
  const pickup = parseFloorValue(input.pickupFloor);
  const destination = parseFloorValue(input.destinationFloor);
  let fee = 0;
  if (pickup > 0) fee += pickup * FLOOR_CARRYING_FEE_PER_FLOOR_EUR;
  if (destination > 0) fee += destination * FLOOR_CARRYING_FEE_PER_FLOOR_EUR;
  return roundMoney(fee);
}

export function computeLaborFee(laborRequired: OrderLaborRequired | undefined): number {
  return hasDriverAssistance(laborRequired) ? LABOR_ASSISTANCE_FEE_EUR : 0;
}

function getVehiclePricing(vehicleType: OrderVehicleType) {
  return VEHICLE_PRICING[vehicleType] ?? VEHICLE_PRICING.pickup;
}

/** Mirrors `server/utils/orderPricing.js` — keep in sync. */
export function calculateOrderPrice(input: OrderPriceInput): OrderPriceBreakdown {
  const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
  const tier = getVehiclePricing(input.vehicleType);
  const baseFee = tier.baseFee;
  const ratePerKm = tier.ratePerKm;
  const distanceCost = roundMoney(distanceKm * ratePerKm);
  const laborFee = computeLaborFee(input.laborRequired);
  const floorFee = computeFloorCarryingFee({
    pickupFloor: input.pickupFloor,
    destinationFloor: input.destinationFloor,
    hasElevator: input.hasElevator,
  });
  const addonsTotal = roundMoney(laborFee + floorFee);
  const total = roundMoney(baseFee + distanceCost + addonsTotal);

  return {
    vehicleType: input.vehicleType,
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
