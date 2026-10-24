const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PRICING_CONFIG,
  normalizePricingConfig,
  mergePricingConfig,
} = require('./pricingDefaults');
const { calculateOrderPrice } = require('../utils/orderPricing');

describe('normalizePricingConfig', () => {
  it('returns the defaults for missing or junk input', () => {
    for (const bad of [undefined, null, 'nonsense', 42, {}]) {
      const c = normalizePricingConfig(bad);
      assert.equal(c.dieselPricePerLitreEur, DEFAULT_PRICING_CONFIG.dieselPricePerLitreEur);
      assert.equal(c.vehicles.van.baseFee, DEFAULT_PRICING_CONFIG.vehicles.van.baseFee);
      assert.equal(c.commissionTiers.length, DEFAULT_PRICING_CONFIG.commissionTiers.length);
    }
  });

  it('keeps valid stored values', () => {
    const c = normalizePricingConfig({ dieselPricePerLitreEur: 2.1, driverHourlyTargetEur: 22 });
    assert.equal(c.dieselPricePerLitreEur, 2.1);
    assert.equal(c.driverHourlyTargetEur, 22);
  });

  it('falls back per field rather than rejecting the whole document', () => {
    const c = normalizePricingConfig({
      dieselPricePerLitreEur: -5,
      driverHourlyTargetEur: 'twenty',
      helperHourlyRateEur: 16,
    });
    assert.equal(c.dieselPricePerLitreEur, DEFAULT_PRICING_CONFIG.dieselPricePerLitreEur);
    assert.equal(c.driverHourlyTargetEur, DEFAULT_PRICING_CONFIG.driverHourlyTargetEur);
    assert.equal(c.helperHourlyRateEur, 16);
  });

  it('never leaves averageSpeedKmh at zero, which would divide by zero', () => {
    const c = normalizePricingConfig({ averageSpeedKmh: 0 });
    assert.ok(c.averageSpeedKmh > 0);
  });

  it('rejects commission bands that are unordered or not open-ended', () => {
    const cases = [
      [{ upToEur: 300, ratePercent: 20 }, { upToEur: 100, ratePercent: 10 }],
      [{ upToEur: 100, ratePercent: 20 }, { upToEur: 300, ratePercent: 10 }],
      [{ upToEur: null, ratePercent: 20 }, { upToEur: null, ratePercent: 10 }],
      [{ upToEur: 100, ratePercent: 150 }],
      [],
    ];
    for (const tiers of cases) {
      const c = normalizePricingConfig({ commissionTiers: tiers });
      assert.deepEqual(c.commissionTiers, DEFAULT_PRICING_CONFIG.commissionTiers.map((t) => ({ ...t })));
    }
  });

  it('accepts a well-formed band list', () => {
    const tiers = [
      { upToEur: 150, ratePercent: 22 },
      { upToEur: null, ratePercent: 11 },
    ];
    assert.deepEqual(normalizePricingConfig({ commissionTiers: tiers }).commissionTiers, tiers);
  });
});

describe('mergePricingConfig', () => {
  it('patches one vehicle without dropping the others', () => {
    const merged = mergePricingConfig(normalizePricingConfig(null), {
      vehicles: { van: { baseFee: 25 } },
    });
    assert.equal(merged.vehicles.van.baseFee, 25);
    assert.equal(merged.vehicles.van.rateNear, DEFAULT_PRICING_CONFIG.vehicles.van.rateNear);
    assert.equal(merged.vehicles.truck.baseFee, DEFAULT_PRICING_CONFIG.vehicles.truck.baseFee);
    assert.equal(merged.vehicles.pickup.minFare, DEFAULT_PRICING_CONFIG.vehicles.pickup.minFare);
  });

  it('patches one handling figure without dropping the others', () => {
    const merged = mergePricingConfig(normalizePricingConfig(null), {
      handlingMinutesPerItem: { boxes: 3 },
    });
    assert.equal(merged.handlingMinutesPerItem.boxes, 3);
    assert.equal(merged.handlingMinutesPerItem.heavyAppliances, 14);
  });

  it('replaces the band list wholesale', () => {
    const tiers = [{ upToEur: null, ratePercent: 15 }];
    const merged = mergePricingConfig(normalizePricingConfig(null), { commissionTiers: tiers });
    assert.deepEqual(merged.commissionTiers, tiers);
  });
});

describe('config actually drives the price', () => {
  const job = {
    vehicleType: 'van',
    distanceKm: 40,
    cargoInventory: { boxes: 10, mediumItems: 3, largeFurniture: 1, heavyAppliances: 0 },
    pickupFloor: '2',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'driver',
  };

  it('raising the driver hourly target raises the floor', () => {
    const base = calculateOrderPrice(job, normalizePricingConfig(null));
    const raised = calculateOrderPrice(
      job,
      normalizePricingConfig({ driverHourlyTargetEur: 40 }),
    );
    assert.ok(raised.driverCostFloor > base.driverCostFloor);
    assert.ok(raised.total > base.total);
  });

  it('raising the handling rate raises the rate card', () => {
    const base = calculateOrderPrice(job, normalizePricingConfig(null));
    const raised = calculateOrderPrice(
      job,
      normalizePricingConfig({ handlingRatePerMinuteEur: 0.8 }),
    );
    assert.equal(raised.handlingCost, base.handlingCost * 2);
    assert.ok(raised.total > base.total);
  });

  it('labour always outweighs fuel, which is why fuel needs no auto-refresh', () => {
    // Fuel only reaches the price through the driver cost floor; the rate card has no fuel
    // term. Labour reaches it through both. So the same percentage move in wages can never
    // matter less than the equivalent move in diesel.
    const jobs = [
      job,
      { ...job, distanceKm: 40 },
      { ...job, vehicleType: 'truck', distanceKm: 120, laborRequired: 'driver' },
    ];
    const base = normalizePricingConfig(null);
    const fuelSpike = normalizePricingConfig({ dieselPricePerLitreEur: 1.783 * 1.25 });
    const wageRise = normalizePricingConfig({ driverHourlyTargetEur: 18 * 1.25 });

    for (const j of jobs) {
      const b = calculateOrderPrice(j, base).total;
      const fuelShift = calculateOrderPrice(j, fuelSpike).total / b - 1;
      const wageShift = calculateOrderPrice(j, wageRise).total / b - 1;
      assert.ok(fuelShift <= wageShift + 1e-9, `fuel outweighed labour on ${JSON.stringify(j.distanceKm)} km`);
      assert.ok(fuelShift < 0.1, `a 25% diesel spike moved the price ${(fuelShift * 100).toFixed(1)}%`);
    }
  });

  it('leaves fuel out of the price entirely while the rate card governs', () => {
    const localJob = { ...job, distanceKm: 18 };
    const base = calculateOrderPrice(localJob, normalizePricingConfig(null));
    assert.equal(base.pricingBasis, 'rate_card');

    const spiked = calculateOrderPrice(
      localJob,
      normalizePricingConfig({ dieselPricePerLitreEur: 1.783 * 1.25 }),
    );
    assert.equal(spiked.pricingBasis, 'rate_card');
    assert.equal(spiked.total, base.total);
  });

  it('switches a job onto the cost floor once fuel makes it unprofitable', () => {
    // The floor is the safety net: an extreme fuel price must still leave the driver whole.
    const localJob = { ...job, distanceKm: 18 };
    const extreme = calculateOrderPrice(
      localJob,
      normalizePricingConfig({ dieselPricePerLitreEur: 1.783 * 4 }),
    );
    assert.equal(extreme.pricingBasis, 'cost_floor');
    assert.ok(extreme.total > calculateOrderPrice(localJob, normalizePricingConfig(null)).total);
  });

  it('defaults produce the same figures as passing no config at all', () => {
    assert.deepEqual(calculateOrderPrice(job), calculateOrderPrice(job, normalizePricingConfig(null)));
  });
});
