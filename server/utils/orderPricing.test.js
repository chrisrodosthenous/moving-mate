const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateOrderPrice,
  pricesMatch,
  computeFloorCarryingFee,
  computeLaborFee,
  roundMoney,
} = require('./orderPricing');

describe('orderPricing', () => {
  it('pickup tier: base + distance only', () => {
    const r = calculateOrderPrice({
      vehicleType: 'pickup',
      distanceKm: 10,
      pickupFloor: '0',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'none',
    });
    assert.equal(r.baseFee, 10);
    assert.equal(r.ratePerKm, 1.5);
    assert.equal(r.distanceCost, 15);
    assert.equal(r.laborFee, 0);
    assert.equal(r.floorFee, 0);
    assert.equal(r.total, 25);
  });

  it('truck tier with labor and floor fees', () => {
    const r = calculateOrderPrice({
      vehicleType: 'truck',
      distanceKm: 20,
      pickupFloor: '3',
      destinationFloor: '0',
      hasElevator: false,
      laborRequired: 'driver',
    });
    assert.equal(r.baseFee, 40);
    assert.equal(r.distanceCost, 70);
    assert.equal(r.laborFee, 20);
    assert.equal(r.floorFee, 15);
    assert.equal(r.total, 145);
  });

  it('elevator skips floor carrying fee', () => {
    assert.equal(
      computeFloorCarryingFee({ pickupFloor: '3', destinationFloor: '2', hasElevator: true }),
      0,
    );
  });

  it('labor fee for driver assistance variants', () => {
    assert.equal(computeLaborFee('none'), 0);
    assert.equal(computeLaborFee('driver'), 20);
    assert.equal(computeLaborFee('driver_plus_helper'), 20);
  });

  it('roundMoney handles floating point', () => {
    assert.equal(roundMoney(10.005), 10.01);
    assert.equal(roundMoney(1.005), 1.01);
  });

  it('pricesMatch within tolerance', () => {
    assert.equal(pricesMatch(25.0, 25.03), true);
    assert.equal(pricesMatch(25.0, 25.1), false);
  });
});
