/**
 * Driver registration age: 18–65 inclusive (calendar age in full years).
 */

const DRIVER_MIN_AGE = 18;
const DRIVER_MAX_AGE = 65;

const DRIVER_AGE_REGISTRATION_MESSAGE =
  'Registration failed: Driver must be between 18 and 65 years old.';

/**
 * Full years between dateOfBirth and asOf (default: now).
 * Uses calendar comparison (year, then month, then day) so leap years and time-of-day
 * do not skew the age (same approach as typical ID checks).
 *
 * @param {Date|string} dateOfBirth
 * @param {Date} [asOf=new Date()]
 * @returns {number|null} integer age, or null if DOB invalid
 */
function calculateAge(dateOfBirth, asOf = new Date()) {
  const birth = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const t = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(t.getTime())) return null;

  let age = t.getFullYear() - birth.getFullYear();
  const monthDiff = t.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && t.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * @param {Date|string} dateOfBirth
 * @param {Date} [asOf=new Date()]
 */
function isDriverAgeEligible(dateOfBirth, asOf = new Date()) {
  const age = calculateAge(dateOfBirth, asOf);
  if (age === null) return false;
  return age >= DRIVER_MIN_AGE && age <= DRIVER_MAX_AGE;
}

/**
 * Deterministic unit checks (fixed "today" for stable CI).
 * @returns {{ passed: boolean, asOf: string, results: Array<{ label: string, age: number|null, eligible: boolean, expectEligible: boolean, pass: boolean }> }}
 */
function runDriverAgeUnitTests() {
  const asOf = new Date(2026, 2, 25); // 25 Mar 2026 (local)
  const cases = [
    {
      label: '17-year-old (not yet 18th birthday)',
      dob: new Date(2008, 2, 26), // 26 Mar 2008 → 17 on 25 Mar 2026
      expectEligible: false,
    },
    {
      label: '30-year-old',
      dob: new Date(1996, 2, 25), // 25 Mar 1996 → 30
      expectEligible: true,
    },
    {
      label: '70-year-old',
      dob: new Date(1955, 11, 1), // 1 Dec 1955 → 70 on 25 Mar 2026
      expectEligible: false,
    },
  ];

  const results = cases.map((c) => {
    const age = calculateAge(c.dob, asOf);
    const eligible = isDriverAgeEligible(c.dob, asOf);
    return {
      label: c.label,
      dob: c.dob.toISOString().slice(0, 10),
      age,
      eligible,
      expectEligible: c.expectEligible,
      pass: eligible === c.expectEligible,
    };
  });

  return {
    passed: results.every((r) => r.pass),
    asOf: asOf.toISOString(),
    results,
  };
}

module.exports = {
  DRIVER_MIN_AGE,
  DRIVER_MAX_AGE,
  DRIVER_AGE_REGISTRATION_MESSAGE,
  calculateAge,
  isDriverAgeEligible,
  runDriverAgeUnitTests,
};
