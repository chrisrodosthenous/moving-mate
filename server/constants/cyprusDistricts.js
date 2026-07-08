/** Cyprus districts: pickup “home” for orders and driver job scope. */
const CYPRUS_DISTRICTS = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'];

function isValidCyprusDistrict(value) {
  return typeof value === 'string' && CYPRUS_DISTRICTS.includes(value);
}

/** Map any casing (e.g. "nicosia") to canonical enum string ("Nicosia"). */
function canonicalCyprusDistrict(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return CYPRUS_DISTRICTS.find((d) => d.toLowerCase() === t.toLowerCase()) || null;
}

/**
 * Normalize `districts` from request body: array of strings, deduped, trimmed.
 * Accepts a JSON array or a single string (wrapped as one element).
 */
function normalizeDistrictsInput(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return normalizeDistrictsInput(p);
    } catch {
      /* single district string */
    }
    return [t];
  }
  return [];
}

/** Registration: at least one district, each must be enum. Returns error message or null. */
function validateDriverDistrictsForRegister(districts) {
  if (!districts.length) {
    return `districts is required for drivers: select at least one of ${CYPRUS_DISTRICTS.join(', ')}`;
  }
  const bad = districts.find((d) => !CYPRUS_DISTRICTS.includes(d));
  if (bad) return `Invalid district: ${bad}. Allowed: ${CYPRUS_DISTRICTS.join(', ')}`;
  return null;
}

/**
 * Profile update: each entry must be enum; empty array = see all provinces.
 * Returns error message or null.
 */
function validateDriverDistrictsForProfile(districts) {
  if (!districts.length) return null;
  const bad = districts.find((d) => !CYPRUS_DISTRICTS.includes(d));
  if (bad) return `Invalid district: ${bad}. Allowed: ${CYPRUS_DISTRICTS.join(', ')}`;
  return null;
}

/**
 * PATCH /profile/districts: at least one valid Cyprus district required.
 * Returns error message or null.
 */
function validateDriverDistrictsRequired(districts) {
  if (!Array.isArray(districts) || districts.length === 0) {
    return `Select at least one district: ${CYPRUS_DISTRICTS.join(', ')}`;
  }
  const bad = districts.find((d) => !CYPRUS_DISTRICTS.includes(d));
  if (bad) return `Invalid district: ${bad}. Allowed: ${CYPRUS_DISTRICTS.join(', ')}`;
  return null;
}

/**
 * Resolve driver's scope from `districts` or legacy `district` string (Mongo lean doc).
 * @returns {string[]} Empty = no filter (see all pending jobs).
 */
function normalizedDriverDistricts(me) {
  if (!me) return [];
  const fromArr = Array.isArray(me.districts)
    ? [...new Set(me.districts.filter((x) => typeof x === 'string' && CYPRUS_DISTRICTS.includes(x)))]
    : [];
  if (fromArr.length > 0) return fromArr;
  const legacy = me.district;
  if (typeof legacy === 'string' && CYPRUS_DISTRICTS.includes(legacy)) return [legacy];
  return [];
}

module.exports = {
  CYPRUS_DISTRICTS,
  isValidCyprusDistrict,
  canonicalCyprusDistrict,
  normalizeDistrictsInput,
  validateDriverDistrictsForRegister,
  validateDriverDistrictsForProfile,
  validateDriverDistrictsRequired,
  normalizedDriverDistricts,
};
