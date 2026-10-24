const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { buildQuoteInputs, signOrderQuote, verifyOrderQuote } = require('./orderQuote');
const { getJwtSecret } = require('../config/env');

const RAW_REQUEST = {
  vehicleType: 'van',
  distanceKm: 18.004,
  cargoInventory: { boxes: 10, mediumItems: 3, largeFurniture: 1, heavyAppliances: 0 },
  pickupFloor: 2,
  destinationFloor: '0',
  hasElevator: false,
  laborRequired: 'driver',
};

function issue(overrides = {}) {
  const inputs = buildQuoteInputs({ ...RAW_REQUEST, ...overrides });
  return { inputs, ...signOrderQuote({ inputs, total: 91.4, configVersion: 3 }) };
}

describe('buildQuoteInputs', () => {
  it('coerces mixed types into a stable shape', () => {
    const inputs = buildQuoteInputs(RAW_REQUEST);
    assert.equal(inputs.pickupFloor, '2');
    assert.equal(inputs.distanceKm, 18);
    assert.equal(inputs.hasElevator, false);
    assert.equal(inputs.cargoInventory.heavyAppliances, 0);
  });

  it('fills sane defaults for an empty request', () => {
    const inputs = buildQuoteInputs({});
    assert.equal(inputs.distanceKm, 0);
    assert.equal(inputs.laborRequired, 'none');
    assert.equal(inputs.pickupFloor, '0');
  });

  it('treats equivalent representations as the same quote', () => {
    const a = buildQuoteInputs({ ...RAW_REQUEST, pickupFloor: 2, hasElevator: false });
    const b = buildQuoteInputs({ ...RAW_REQUEST, pickupFloor: '2', hasElevator: undefined });
    assert.deepEqual(a, b);
  });
});

describe('verifyOrderQuote', () => {
  it('accepts a quote replayed with the same inputs', () => {
    const { token } = issue();
    const result = verifyOrderQuote(token, RAW_REQUEST);
    assert.equal(result.ok, true);
    assert.equal(result.total, 91.4);
    assert.equal(result.configVersion, 3);
  });

  it('accepts inputs that differ only in formatting', () => {
    const { token } = issue();
    const result = verifyOrderQuote(token, { ...RAW_REQUEST, pickupFloor: '2', distanceKm: 18 });
    assert.equal(result.ok, true);
  });

  it('rejects a changed job', () => {
    const { token } = issue();
    const changes = [
      { laborRequired: 'driver_plus_helper' },
      { hasElevator: true },
      { distanceKm: 40 },
      { pickupFloor: '4' },
      { vehicleType: 'truck' },
      { cargoInventory: { boxes: 40, mediumItems: 3, largeFurniture: 1, heavyAppliances: 0 } },
    ];
    for (const change of changes) {
      const result = verifyOrderQuote(token, { ...RAW_REQUEST, ...change });
      assert.equal(result.ok, false, `should reject ${JSON.stringify(change)}`);
      assert.match(result.reason, /changed/i);
    }
  });

  it('rejects a missing or malformed token', () => {
    for (const bad of [undefined, null, '', 'not-a-jwt', 123]) {
      assert.equal(verifyOrderQuote(bad, RAW_REQUEST).ok, false);
    }
  });

  it('rejects a token signed with a different secret', () => {
    const inputs = buildQuoteInputs(RAW_REQUEST);
    const forged = jwt.sign({ fp: 'anything', total: 5 }, 'someone-elses-secret', {
      expiresIn: 600,
      audience: 'moving-mate/order-quote',
    });
    assert.equal(verifyOrderQuote(forged, inputs).ok, false);
  });

  it('rejects a token issued for another purpose', () => {
    const authLikeToken = jwt.sign({ userId: 'abc', role: 'admin' }, getJwtSecret(), {
      expiresIn: 600,
    });
    assert.equal(verifyOrderQuote(authLikeToken, RAW_REQUEST).ok, false);
  });

  it('rejects an expired quote with a message the customer can act on', () => {
    const inputs = buildQuoteInputs(RAW_REQUEST);
    const stale = jwt.sign(
      { fp: 'x', total: 10, iat: Math.floor(Date.now() / 1000) - 7200 },
      getJwtSecret(),
      { expiresIn: -60, audience: 'moving-mate/order-quote' },
    );
    const result = verifyOrderQuote(stale, inputs);
    assert.equal(result.ok, false);
    assert.match(result.reason, /expired/i);
  });

  it('cannot be edited to a cheaper price', () => {
    const { token } = issue();
    const [header, , signature] = token.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ fp: 'x', total: 1, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');
    assert.equal(verifyOrderQuote(`${header}.${tampered}.${signature}`, RAW_REQUEST).ok, false);
  });
});
