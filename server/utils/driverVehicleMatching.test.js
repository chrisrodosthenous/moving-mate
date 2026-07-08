/**
 * Unit tests for strict driver ↔ order vehicle tier matching (M8).
 * Run: npm test (from server/) or npm run test:server (from repo root).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeOrderVehicleType,
  normalizeDriverVehicleType,
  orderVehicleTypesVisibleToDriver,
  buildVehicleFilterForDriver,
  driverCanFulfillOrderVehicle,
  filterDriversEligibleForOrder,
} = require('./driverVehicleMatching');

const ORDER_TIERS = ['pickup', 'minivan', 'van', 'truck'];
const LEGACY_ORDERS = ['small', 'large'];

describe('normalizeOrderVehicleType', () => {
  it('passes through current tier values', () => {
    for (const t of ORDER_TIERS) {
      assert.equal(normalizeOrderVehicleType(t), t);
      assert.equal(normalizeOrderVehicleType(t.toUpperCase()), t);
    }
  });

  it('maps legacy order values', () => {
    assert.equal(normalizeOrderVehicleType('small'), 'pickup');
    assert.equal(normalizeOrderVehicleType('large'), 'van');
  });

  it('defaults unknown values to pickup', () => {
    assert.equal(normalizeOrderVehicleType(''), 'pickup');
    assert.equal(normalizeOrderVehicleType(null), 'pickup');
    assert.equal(normalizeOrderVehicleType('suv'), 'pickup');
  });
});

describe('normalizeDriverVehicleType', () => {
  it('accepts valid driver tiers only', () => {
    for (const t of ORDER_TIERS) {
      assert.equal(normalizeDriverVehicleType(t), t);
    }
  });

  it('rejects invalid driver values', () => {
    assert.equal(normalizeDriverVehicleType('small'), null);
    assert.equal(normalizeDriverVehicleType('large'), null);
    assert.equal(normalizeDriverVehicleType(''), null);
    assert.equal(normalizeDriverVehicleType(undefined), null);
  });
});

describe('orderVehicleTypesVisibleToDriver', () => {
  it('pickup driver sees pickup + legacy small', () => {
    assert.deepEqual(orderVehicleTypesVisibleToDriver('pickup'), ['pickup', 'small']);
  });

  it('minivan driver sees minivan only', () => {
    assert.deepEqual(orderVehicleTypesVisibleToDriver('minivan'), ['minivan']);
  });

  it('van driver sees van + legacy large', () => {
    assert.deepEqual(orderVehicleTypesVisibleToDriver('van'), ['van', 'large']);
  });

  it('truck driver sees van, truck, and legacy large', () => {
    assert.deepEqual(orderVehicleTypesVisibleToDriver('truck'), ['van', 'truck', 'large']);
  });

  it('unknown driver tier falls back to pickup-only', () => {
    assert.deepEqual(orderVehicleTypesVisibleToDriver('invalid'), ['pickup', 'small']);
    assert.deepEqual(orderVehicleTypesVisibleToDriver(undefined), ['pickup', 'small']);
  });
});

describe('buildVehicleFilterForDriver', () => {
  it('uses equality for single-type drivers', () => {
    assert.deepEqual(buildVehicleFilterForDriver('minivan'), { vehicleType: 'minivan' });
  });

  it('uses $in for multi-type drivers', () => {
    assert.deepEqual(buildVehicleFilterForDriver('truck'), {
      vehicleType: { $in: ['van', 'truck', 'large'] },
    });
  });
});

describe('driverCanFulfillOrderVehicle — full matrix', () => {
  /** driver → order → expected */
  const matrix = [
    // pickup driver
    ['pickup', 'pickup', true],
    ['pickup', 'small', true],
    ['pickup', 'minivan', false],
    ['pickup', 'van', false],
    ['pickup', 'truck', false],
    ['pickup', 'large', false],
    // minivan driver
    ['minivan', 'pickup', false],
    ['minivan', 'minivan', true],
    ['minivan', 'van', false],
    ['minivan', 'truck', false],
    // van driver
    ['van', 'pickup', false],
    ['van', 'minivan', false],
    ['van', 'van', true],
    ['van', 'large', true],
    ['van', 'truck', false],
    // truck driver
    ['truck', 'pickup', false],
    ['truck', 'minivan', false],
    ['truck', 'van', true],
    ['truck', 'truck', true],
    ['truck', 'large', true],
    // unknown driver → pickup-only fallback
    [undefined, 'pickup', true],
    [undefined, 'small', true],
    [undefined, 'minivan', false],
    ['invalid', 'van', false],
    // empty order type → treat as pickup tier
    ['pickup', '', true],
    ['pickup', null, true],
    ['minivan', '', false],
  ];

  for (const [driver, order, expected] of matrix) {
    it(`${driver ?? 'unknown'} driver vs ${order ?? 'empty'} order → ${expected}`, () => {
      assert.equal(driverCanFulfillOrderVehicle(driver, order), expected);
    });
  }
});

describe('filterDriversEligibleForOrder', () => {
  const drivers = [
    {
      _id: '1',
      role: 'driver',
      isVerified: true,
      vehicleType: 'pickup',
      districts: ['Nicosia'],
    },
    {
      _id: '2',
      role: 'driver',
      isVerified: true,
      vehicleType: 'minivan',
      districts: ['Nicosia'],
    },
    {
      _id: '3',
      role: 'driver',
      isVerified: true,
      vehicleType: 'van',
      districts: ['Larnaca'],
    },
    {
      _id: '4',
      role: 'driver',
      isVerified: true,
      vehicleType: 'truck',
      districts: ['Nicosia'],
    },
    {
      _id: '5',
      role: 'driver',
      isVerified: false,
      vehicleType: 'pickup',
      districts: ['Nicosia'],
    },
  ];

  it('returns pickup driver for pickup order in matching district', () => {
    const eligible = filterDriversEligibleForOrder(drivers, 'Nicosia', 'pickup');
    assert.deepEqual(eligible.map((d) => d._id), ['1']);
  });

  it('returns minivan driver for minivan order in district', () => {
    const eligible = filterDriversEligibleForOrder(drivers, 'Nicosia', 'minivan');
    assert.deepEqual(eligible.map((d) => d._id), ['2']);
  });

  it('returns truck driver (not van-only driver) for van order when both in district', () => {
    const mixed = [
      ...drivers.filter((d) => d._id !== '3'),
      { _id: '6', role: 'driver', isVerified: true, vehicleType: 'van', districts: ['Nicosia'] },
    ];
    const eligible = filterDriversEligibleForOrder(mixed, 'Nicosia', 'van');
    assert.deepEqual(eligible.map((d) => d._id).sort(), ['4', '6']);
  });

  it('excludes drivers outside pickup district', () => {
    const eligible = filterDriversEligibleForOrder(drivers, 'Nicosia', 'van');
    assert.ok(!eligible.some((d) => d._id === '3'));
  });

  it('excludes unverified drivers', () => {
    const eligible = filterDriversEligibleForOrder(drivers, 'Nicosia', 'pickup');
    assert.ok(!eligible.some((d) => d._id === '5'));
  });

  it('returns empty list for invalid district', () => {
    assert.deepEqual(filterDriversEligibleForOrder(drivers, 'InvalidPlace', 'pickup'), []);
  });

  it('truck driver eligible for truck order', () => {
    const eligible = filterDriversEligibleForOrder(drivers, 'Nicosia', 'truck');
    assert.deepEqual(eligible.map((d) => d._id), ['4']);
  });
});
