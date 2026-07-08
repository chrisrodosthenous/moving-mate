/**
 * Strict driver ↔ order vehicle tier matching.
 *
 * Rules:
 * - pickup  → orders: pickup only
 * - minivan → orders: minivan only
 * - van     → orders: van only
 * - truck   → orders: van OR truck
 *
 * Legacy order types `small` / `large` are mapped for reads on older documents.
 */

const { canonicalCyprusDistrict, normalizedDriverDistricts } = require('../constants/cyprusDistricts');

const TIER_VEHICLE_TYPES = new Set(['pickup', 'minivan', 'van', 'truck']);

/** Legacy customer order vehicle values still present in older MongoDB docs. */
const LEGACY_ORDER_VEHICLE_MAP = {
  small: 'pickup',
  large: 'van',
};

function normalizeOrderVehicleType(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (TIER_VEHICLE_TYPES.has(v)) return v;
  if (LEGACY_ORDER_VEHICLE_MAP[v]) return LEGACY_ORDER_VEHICLE_MAP[v];
  return 'pickup';
}

function normalizeDriverVehicleType(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (TIER_VEHICLE_TYPES.has(v)) return v;
  return null;
}

/**
 * Order vehicleType values a driver is allowed to see/accept.
 * Unverified or unknown drivers fall back to pickup-only (safest default).
 */
function orderVehicleTypesVisibleToDriver(driverVehicleRaw) {
  const driverVehicle = normalizeDriverVehicleType(driverVehicleRaw);
  if (driverVehicle === 'pickup') return ['pickup', 'small'];
  if (driverVehicle === 'minivan') return ['minivan'];
  if (driverVehicle === 'van') return ['van', 'large'];
  if (driverVehicle === 'truck') return ['van', 'truck', 'large'];
  return ['pickup', 'small'];
}

/** MongoDB filter fragment for pending-order queries. */
function buildVehicleFilterForDriver(driverVehicleRaw) {
  const types = orderVehicleTypesVisibleToDriver(driverVehicleRaw);
  if (types.length === 1) return { vehicleType: types[0] };
  return { vehicleType: { $in: types } };
}

function driverCanFulfillOrderVehicle(driverVehicleRaw, orderVehicleRaw) {
  const allowed = orderVehicleTypesVisibleToDriver(driverVehicleRaw);
  const orderType = String(orderVehicleRaw ?? '').trim().toLowerCase();
  if (!orderType) return allowed.includes('pickup');
  return allowed.includes(orderType);
}

function driverMatchesPickupDistrict(user, districtRaw) {
  const canon = canonicalCyprusDistrict(districtRaw);
  if (!canon || !user) return false;
  const scope = normalizedDriverDistricts(user);
  return scope.includes(canon);
}

/**
 * Verified drivers in district whose vehicle tier can fulfill the order.
 */
function filterDriversEligibleForOrder(drivers, pickupDistrict, orderVehicleRaw) {
  const canon = canonicalCyprusDistrict(pickupDistrict);
  if (!canon) return [];
  return (drivers || []).filter(
    (u) =>
      u &&
      u.role === 'driver' &&
      u.isVerified === true &&
      driverMatchesPickupDistrict(u, canon) &&
      driverCanFulfillOrderVehicle(u.vehicleType, orderVehicleRaw),
  );
}

module.exports = {
  TIER_VEHICLE_TYPES,
  normalizeOrderVehicleType,
  normalizeDriverVehicleType,
  orderVehicleTypesVisibleToDriver,
  buildVehicleFilterForDriver,
  driverCanFulfillOrderVehicle,
  driverMatchesPickupDistrict,
  filterDriversEligibleForOrder,
};
