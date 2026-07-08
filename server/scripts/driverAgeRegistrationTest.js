/**
 * Standalone: node server/scripts/driverAgeRegistrationTest.js
 * Verifies driver age rules (18–65) with fixed reference date.
 */
const { runDriverAgeUnitTests, DRIVER_AGE_REGISTRATION_MESSAGE } = require('../utils/driverAge');

function main() {
  const out = runDriverAgeUnitTests();
  console.log(JSON.stringify({ ...out, expectedMessage: DRIVER_AGE_REGISTRATION_MESSAGE }, null, 2));
  process.exit(out.passed ? 0 : 1);
}

main();
