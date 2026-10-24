const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeOrderCommission,
  applyCompletionCommission,
  computeMarginalCommission,
  DEFAULT_COMMISSION_RATE_PERCENT,
} = require('./orderCommission');
const { DEFAULT_PRICING_CONFIG } = require('../config/pricingDefaults');

const TIERS = DEFAULT_PRICING_CONFIG.commissionTiers;

describe('orderCommission — first band is still 80/20', () => {
  it('splits a €100 job at 20%', () => {
    const r = computeOrderCommission(100);
    assert.equal(DEFAULT_COMMISSION_RATE_PERCENT, 20);
    assert.equal(r.commissionRate, 20);
    assert.equal(r.platformCommission, 20);
    assert.equal(r.driverEarnings, 80);
  });

  it('driver + platform equals gross price on an awkward remainder', () => {
    const r = computeOrderCommission(16.75);
    assert.equal(r.platformCommission + r.driverEarnings, 16.75);
    assert.equal(r.platformCommission, 3.35);
  });
});

describe('orderCommission — marginal bands', () => {
  it('taxes only the slice inside each band, not the whole job at the last rate', () => {
    // €247.44: €100 @ 20% + €147.44 @ 15%
    const r = computeOrderCommission(247.44);
    assert.equal(r.platformCommission, 42.12);
    assert.equal(r.driverEarnings, 205.32);
    assert.equal(r.commissionRate, 17.02);
  });

  it('walks into the third band above €300', () => {
    // €400: €100 @ 20% + €200 @ 15% + €100 @ 10% = 60
    const r = computeOrderCommission(400);
    assert.equal(r.platformCommission, 60);
    assert.equal(r.driverEarnings, 340);
    assert.equal(r.commissionRate, 15);
  });

  it('a job just over the first band is only a little cheaper for the driver than 20%', () => {
    const r = computeOrderCommission(145);
    // €100 @ 20% + €45 @ 15% = 26.75  (flat 20% would have been 29)
    assert.equal(r.platformCommission, 26.75);
    assert.equal(r.driverEarnings, 118.25);
  });

  it('uses a live config when one is passed, which is what the admin preview needs', () => {
    const config = {
      commissionTiers: [
        { upToEur: 50, ratePercent: 25 },
        { upToEur: null, ratePercent: 5 },
      ],
    };
    const r = computeOrderCommission(150, undefined, config);
    // €50 @ 25% + €100 @ 5% = 17.50
    assert.equal(r.platformCommission, 17.5);
    assert.equal(r.driverEarnings, 132.5);
  });

  it('replays a locked flat rate when one is supplied', () => {
    const r = computeOrderCommission(400, 20);
    assert.equal(r.commissionRate, 20);
    assert.equal(r.platformCommission, 80);
    assert.equal(r.driverEarnings, 320);
  });

  it('computeMarginalCommission matches the seed bands by hand', () => {
    assert.equal(computeMarginalCommission(0, TIERS), 0);
    assert.equal(computeMarginalCommission(100, TIERS), 20);
    assert.equal(computeMarginalCommission(300, TIERS), 50);
  });
});

describe('applyCompletionCommission', () => {
  it('stamps a new order from the bands', () => {
    const doc = { price: 145 };
    applyCompletionCommission(doc);
    assert.equal(doc.platformCommission, 26.75);
    assert.equal(doc.driverEarnings, 118.25);
  });

  it('does not rewrite a split that was already locked at creation', () => {
    const doc = { price: 400, driverEarnings: 320, platformCommission: 80, commissionRate: 20 };
    const returned = applyCompletionCommission(doc);
    assert.equal(returned.driverEarnings, 320);
    assert.equal(doc.driverEarnings, 320);
    assert.equal(doc.platformCommission, 80);
  });
});
