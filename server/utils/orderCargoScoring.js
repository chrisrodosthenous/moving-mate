const CARGO_SCORES = {
  boxes: 1,
  mediumItems: 4,
  largeFurniture: 10,
  heavyAppliances: 12,
};

const ORDER_VEHICLE_TYPES = new Set(['pickup', 'minivan', 'van', 'truck']);

function normalizeQty(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseCargoInventory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const boxes = normalizeQty(raw.boxes);
  const mediumItems = normalizeQty(raw.mediumItems);
  const largeFurniture = normalizeQty(raw.largeFurniture);
  const heavyAppliances = normalizeQty(raw.heavyAppliances);
  if (
    boxes == null ||
    mediumItems == null ||
    largeFurniture == null ||
    heavyAppliances == null
  ) {
    return null;
  }
  return { boxes, mediumItems, largeFurniture, heavyAppliances };
}

function cargoInventoryScore(inv) {
  return (
    inv.boxes * CARGO_SCORES.boxes +
    inv.mediumItems * CARGO_SCORES.mediumItems +
    inv.largeFurniture * CARGO_SCORES.largeFurniture +
    inv.heavyAppliances * CARGO_SCORES.heavyAppliances
  );
}

function vehicleTypeFromScore(score) {
  if (score <= 5) return 'pickup';
  if (score <= 15) return 'minivan';
  if (score <= 35) return 'van';
  return 'truck';
}

module.exports = {
  ORDER_VEHICLE_TYPES,
  parseCargoInventory,
  cargoInventoryScore,
  vehicleTypeFromScore,
};
