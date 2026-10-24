const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCargoInventory,
  cargoInventoryScore,
  vehicleTypeFromScore,
} = require('./orderCargoScoring');

describe('parseCargoInventory', () => {
  it('accepts a complete non-negative integer inventory', () => {
    assert.deepEqual(parseCargoInventory({ boxes: 2, mediumItems: 0, largeFurniture: 1, heavyAppliances: 0 }), {
      boxes: 2,
      mediumItems: 0,
      largeFurniture: 1,
      heavyAppliances: 0,
    });
  });

  it('rejects missing, negative, or fractional quantities', () => {
    assert.equal(parseCargoInventory(null), null);
    assert.equal(parseCargoInventory({ boxes: 1 }), null);
    assert.equal(parseCargoInventory({ boxes: -1, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 }), null);
    assert.equal(parseCargoInventory({ boxes: 1.5, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 }), null);
  });
});

describe('vehicleTypeFromScore', () => {
  it('uses the published band edges', () => {
    assert.equal(vehicleTypeFromScore(0), 'pickup');
    assert.equal(vehicleTypeFromScore(5), 'pickup');
    assert.equal(vehicleTypeFromScore(6), 'minivan');
    assert.equal(vehicleTypeFromScore(15), 'minivan');
    assert.equal(vehicleTypeFromScore(16), 'van');
    assert.equal(vehicleTypeFromScore(35), 'van');
    assert.equal(vehicleTypeFromScore(36), 'truck');
  });

  it('maps the 2-bedroom reference load to truck', () => {
    const inv = { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 };
    assert.equal(cargoInventoryScore(inv), 118);
    assert.equal(vehicleTypeFromScore(118), 'truck');
  });
});
