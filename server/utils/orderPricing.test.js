const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateOrderPrice,
  pricesMatch,
  computeHandlingMinutes,
  computeHandlingCost,
  computeCrewCost,
  computeAccessCost,
  computeDriverCostFloor,
  computeJobHours,
  roundMoney,
} = require('./orderPricing');
const { cargoInventoryScore, vehicleTypeFromScore } = require('./orderCargoScoring');

const EMPTY_CARGO = { boxes: 0, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 };

/**
 * 2-bedroom reference job. Cargo scoring assigns this load the truck tier
 * (score 118), so the vehicle here matches what the API would accept.
 */
const TWO_BED_CARGO = { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 };

/** Largest load that still scores into the van tier (score 32). */
const VAN_TIER_CARGO = { boxes: 10, mediumItems: 3, largeFurniture: 1, heavyAppliances: 0 };

describe('computeHandlingMinutes', () => {
  it('counts both the load and the unload', () => {
    // (20×2.5 + 6×5 + 5×10 + 2×14) = 158 one way
    assert.equal(computeHandlingMinutes(TWO_BED_CARGO), 316);
  });

  it('returns 0 for missing or empty inventory', () => {
    assert.equal(computeHandlingMinutes(undefined), 0);
    assert.equal(computeHandlingMinutes(EMPTY_CARGO), 0);
  });

  it('ignores negative and non-numeric quantities', () => {
    assert.equal(computeHandlingMinutes({ boxes: -5, mediumItems: 'x', largeFurniture: 1 }), 20);
  });
});

describe('handling, crew and access costs', () => {
  it('prices handling at €0.40 per minute', () => {
    assert.equal(computeHandlingCost(316), 126.4);
  });

  it('charges a helper more than a lone driver', () => {
    const handling = computeHandlingCost(316);
    assert.equal(computeCrewCost(handling, 'none'), 37.92);
    assert.equal(computeCrewCost(handling, 'driver'), 126.4);
    assert.equal(computeCrewCost(handling, 'driver_plus_helper'), 158);
  });

  it('scales stairs with the load being carried', () => {
    const handling = computeHandlingCost(316);
    // 3 floors at pickup, ground floor destination, no lift → 126.40 × 0.08 × 3
    assert.equal(
      computeAccessCost(handling, { pickupFloor: '3', destinationFloor: '0', hasElevator: false }),
      30.34,
    );
  });

  it('skips the stairs surcharge when there is a lift', () => {
    const handling = computeHandlingCost(316);
    assert.equal(
      computeAccessCost(handling, { pickupFloor: '3', destinationFloor: '2', hasElevator: true }),
      0,
    );
  });

  it('sums floors at both ends', () => {
    assert.equal(
      computeAccessCost(100, { pickupFloor: '2', destinationFloor: '1', hasElevator: false }),
      24,
    );
  });
});

describe('calculateOrderPrice — rate card', () => {
  it('prices the 2-bedroom reference job from its breakdown', () => {
    const r = calculateOrderPrice({
      vehicleType: 'truck',
      distanceKm: 18,
      cargoInventory: TWO_BED_CARGO,
      pickupFloor: '3',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'driver_plus_helper',
    });

    // (20×2.5 + 6×5 + 5×10 + 2×14) × 2 = 316 min → €126.40 handling
    assert.equal(r.handlingMinutes, 316);
    assert.equal(r.handlingCost, 126.4);
    assert.equal(r.baseFee, 24);
    assert.equal(r.distanceCost, 35.1); // 18 × 1.95, all within the taper threshold
    assert.equal(r.crewCost, 158); // 126.40 × 1.25
    assert.equal(r.accessCost, 30.34); // 126.40 × 0.08 × 3 floors
    assert.equal(r.rateCardTotal, 247.44);
    assert.equal(r.pricingBasis, 'rate_card');
    assert.equal(r.total, 247.44);
  });

  it('prices a van-tier job without over-charging a small load', () => {
    const r = calculateOrderPrice({
      vehicleType: 'van',
      distanceKm: 18,
      cargoInventory: VAN_TIER_CARGO,
      pickupFloor: '0',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'driver',
    });

    // (10×2.5 + 3×5 + 1×10) × 2 = 100 min → €40.00 handling
    assert.equal(r.handlingMinutes, 100);
    assert.equal(r.crewCost, 40);
    assert.equal(r.accessCost, 0);
    assert.equal(r.total, 85); // 18 base + 27 route + 40 handling
  });

  it('tapers the per-km rate beyond 30 km', () => {
    const r = calculateOrderPrice({
      vehicleType: 'van',
      distanceKm: 85,
      cargoInventory: EMPTY_CARGO,
      laborRequired: 'none',
    });
    // 30 × 1.50 + 55 × 1.15
    assert.equal(r.distanceCost, 108.25);
    assert.equal(r.rateNearPerKm, 1.5);
    assert.equal(r.rateFarPerKm, 1.15);
  });

  it('falls back to the pickup tier for an unknown vehicle type', () => {
    const r = calculateOrderPrice({ vehicleType: 'spaceship', distanceKm: 10 });
    assert.equal(r.baseFee, 14);
    assert.equal(r.minFare, 45);
  });
});

describe('calculateOrderPrice — driver cost floor', () => {
  it('lifts a long intercity job above the rate card', () => {
    const r = calculateOrderPrice({
      vehicleType: 'van',
      distanceKm: 85,
      cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 10, heavyAppliances: 0 },
      pickupFloor: '0',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'driver',
    });

    assert.equal(r.pricingBasis, 'cost_floor');
    assert.ok(r.floorPrice > r.rateCardTotal, 'floor should exceed the rate card here');
    assert.equal(r.total, r.floorPrice);
  });

  it('never pays the driver below the hourly target', () => {
    const r = calculateOrderPrice({
      vehicleType: 'truck',
      distanceKm: 120,
      cargoInventory: { boxes: 0, mediumItems: 0, largeFurniture: 20, heavyAppliances: 0 },
      laborRequired: 'driver',
    });
    // Driver keeps 80% of the price, which must cover their full cost of doing the job.
    assert.ok(roundMoney(r.total * 0.8) >= r.driverCostFloor - 0.01);
  });

  it('splits handling across the crew so a helper halves the elapsed hours', () => {
    const solo = computeJobHours({ handlingMinutes: 316, distanceKm: 20, laborRequired: 'driver' });
    const withHelper = computeJobHours({
      handlingMinutes: 316,
      distanceKm: 20,
      laborRequired: 'driver_plus_helper',
    });
    // Only the handling portion is shared; driving and setup are unchanged.
    assert.equal(roundMoney(solo - withHelper), roundMoney(316 / 60 / 2));
  });

  it('prices the helper into the floor at their own wage', () => {
    const base = { vehicleType: 'van', distanceKm: 20, handlingMinutes: 316 };
    const solo = computeDriverCostFloor({ ...base, laborRequired: 'driver' });
    const withHelper = computeDriverCostFloor({ ...base, laborRequired: 'driver_plus_helper' });
    // A €15/h helper doing half the handling costs less than the €18/h driver doing all of it.
    assert.ok(withHelper < solo, 'blended crew labour should cost less than a lone driver');
    assert.ok(withHelper > 0);
  });
});

describe('crew pricing', () => {
  it('charges more for a helper than for a lone driver — the helper is not free', () => {
    const job = {
      vehicleType: 'truck',
      distanceKm: 18,
      cargoInventory: TWO_BED_CARGO,
      pickupFloor: '3',
      destinationFloor: '0',
      hasElevator: false,
    };
    const solo = calculateOrderPrice({ ...job, laborRequired: 'driver' });
    const withHelper = calculateOrderPrice({ ...job, laborRequired: 'driver_plus_helper' });
    assert.equal(solo.total, 215.84); // 24 + 35.10 + 126.40 + 30.34
    assert.equal(withHelper.total, 247.44);
    assert.ok(withHelper.total > solo.total);
  });
});

describe('cargo scoring alignment', () => {
  it('reference loads map to the vehicle tier the API would accept', () => {
    assert.equal(vehicleTypeFromScore(cargoInventoryScore(TWO_BED_CARGO)), 'truck');
    assert.equal(vehicleTypeFromScore(cargoInventoryScore(VAN_TIER_CARGO)), 'van');
  });
});

describe('calculateOrderPrice — minimum fare', () => {
  it('applies the vehicle minimum to a trivial job', () => {
    const r = calculateOrderPrice({
      vehicleType: 'pickup',
      distanceKm: 1,
      cargoInventory: EMPTY_CARGO,
      laborRequired: 'none',
    });
    assert.equal(r.pricingBasis, 'minimum_fare');
    assert.equal(r.total, 45);
  });
});

describe('helpers', () => {
  it('roundMoney handles floating point', () => {
    assert.equal(roundMoney(10.005), 10.01);
    assert.equal(roundMoney(1.005), 1.01);
  });

  it('pricesMatch within tolerance', () => {
    assert.equal(pricesMatch(25.0, 25.03), true);
    assert.equal(pricesMatch(25.0, 25.1), false);
  });
});
