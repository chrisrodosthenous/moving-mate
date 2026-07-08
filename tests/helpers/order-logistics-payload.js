/** Default logistics fields required by POST /api/orders (matches Angular CreateOrderPayload). */
const { calculateOrderPrice } = require('../../server/utils/orderPricing');

const DEFAULT_LOGISTICS_PAYLOAD = {
  vehicleType: 'pickup',
  cargoInventory: {
    boxes: 1,
    mediumItems: 0,
    largeFurniture: 0,
    heavyAppliances: 0,
  },
  pickupFloor: '0',
  destinationFloor: '0',
  hasElevator: false,
  laborRequired: 'none',
};

/** Score-aligned presets for multi-tier E2E / API tests. */
const TIER_LOGISTICS_PRESETS = {
  pickup: {
    vehicleType: 'pickup',
    cargoInventory: { boxes: 1, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
  },
  minivan: {
    vehicleType: 'minivan',
    cargoInventory: { boxes: 0, mediumItems: 2, largeFurniture: 0, heavyAppliances: 0 },
  },
  van: {
    vehicleType: 'van',
    cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 2, heavyAppliances: 0 },
  },
  truck: {
    vehicleType: 'truck',
    cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 0, heavyAppliances: 4 },
  },
};

function logisticsPayloadForTier(tier = 'pickup') {
  const preset = TIER_LOGISTICS_PRESETS[tier] ?? TIER_LOGISTICS_PRESETS.pickup;
  return {
    vehicleType: preset.vehicleType,
    cargoInventory: { ...preset.cargoInventory },
    pickupFloor: '0',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'none',
  };
}

/** Server-valid price for API-created test orders (matches tier-based pricing engine). */
function testOrderPrice(distanceKm, tier = 'pickup', opts = {}) {
  return calculateOrderPrice({
    vehicleType: tier,
    distanceKm,
    pickupFloor: opts.pickupFloor ?? '0',
    destinationFloor: opts.destinationFloor ?? '0',
    hasElevator: opts.hasElevator ?? false,
    laborRequired: opts.laborRequired ?? 'none',
  }).total;
}

module.exports = {
  DEFAULT_LOGISTICS_PAYLOAD,
  TIER_LOGISTICS_PRESETS,
  logisticsPayloadForTier,
  testOrderPrice,
};
