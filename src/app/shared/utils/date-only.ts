const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date `YYYY-MM-DD` (avoids UTC shift from `toISOString().slice(0, 10)`). */
export function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calendarDate(year: number, monthIndex: number, day: number): Date | null {
  const dt = new Date(year, monthIndex, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== monthIndex || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

/** Parse `<input type="date">` value (`YYYY-MM-DD`) as a local calendar date. */
export function parseDateOfBirthInput(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = ISO_DATE.exec(s);
  if (!iso) return null;

  return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
}

/** Full years between DOB and `asOf` (calendar comparison, local timezone). */
export function calculateAgeYears(dateOfBirth: Date, asOf = new Date()): number | null {
  if (Number.isNaN(dateOfBirth.getTime()) || Number.isNaN(asOf.getTime())) return null;

  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = asOf.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAtLeastAge(dateOfBirth: Date, minAge: number, asOf = new Date()): boolean {
  const age = calculateAgeYears(dateOfBirth, asOf);
  return age !== null && age >= minAge;
}

/** Latest allowed DOB for `minAge` (inclusive), as `YYYY-MM-DD` for `<input type="date">`. */
export function maxDateOfBirthYearsAgo(minAge: number, asOf = new Date()): string {
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  today.setFullYear(today.getFullYear() - minAge);
  return formatLocalDateKey(today);
}
