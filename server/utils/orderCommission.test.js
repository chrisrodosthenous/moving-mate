const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeOrderCommission, applyCompletionCommission } = require('./orderCommission');

describe('orderCommission', () => {
  it('splits 80/20 with clean rounding', () => {
    const r = computeOrderCommission(100);
    assert.equal(r.commissionRate, 20);
    assert.equal(r.platformCommission, 20);
    assert.equal(r.driverEarnings, 80);
  });

  it('driver + platform equals gross price', () => {
    const r = computeOrderCommission(16.75);
    assert.equal(r.platformCommission + r.driverEarnings, 16.75);
  });

  it('applyCompletionCommission mutates order document', () => {
    const doc = { price: 145 };
    applyCompletionCommission(doc);
    assert.equal(doc.commissionRate, 20);
    assert.equal(doc.platformCommission, 29);
    assert.equal(doc.driverEarnings, 116);
  });
});
