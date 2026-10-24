const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAge, isDriverAgeEligible, runDriverAgeUnitTests } = require('./driverAge');

describe('driver age eligibility', () => {
  it('runs the built-in calendar fixtures', () => {
    const report = runDriverAgeUnitTests();
    assert.equal(report.passed, true, JSON.stringify(report.results, null, 2));
  });

  it('treats the 18th and 66th birthdays as the inclusive edges', () => {
    const asOf = new Date(2026, 2, 25);
    assert.equal(isDriverAgeEligible(new Date(2008, 2, 25), asOf), true);
    assert.equal(isDriverAgeEligible(new Date(2008, 2, 26), asOf), false);
    assert.equal(isDriverAgeEligible(new Date(1961, 2, 25), asOf), true);
    assert.equal(isDriverAgeEligible(new Date(1960, 2, 25), asOf), false);
    assert.equal(calculateAge(new Date(2008, 2, 25), asOf), 18);
    assert.equal(calculateAge('not-a-date'), null);
  });
});
