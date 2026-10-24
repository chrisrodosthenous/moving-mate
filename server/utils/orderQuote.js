/**
 * Signed price quotes.
 *
 * The customer is shown a price before they commit, and that price must survive an admin
 * changing the pricing config mid-session. Rather than recomputing at submit time and
 * hoping the two agree, the quote endpoint signs the inputs together with the total; order
 * creation verifies the signature and honours the price the customer actually saw.
 *
 * This also removes the need to mirror the pricing formula in the browser at all.
 */

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');

/** Long enough to fill in a move, short enough that stale config cannot be replayed for days. */
const QUOTE_TTL_SECONDS = 30 * 60;

const QUOTE_AUDIENCE = 'moving-mate/order-quote';

function normalizeQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Reduce a request to exactly the fields that affect price, in a stable shape.
 * Signing and verification must both go through this, or a harmless formatting
 * difference would read as tampering.
 */
function buildQuoteInputs(raw) {
  const inv = raw?.cargoInventory ?? {};
  return {
    vehicleType: String(raw?.vehicleType ?? '').trim(),
    distanceKm: Math.round((Number(raw?.distanceKm) || 0) * 100) / 100,
    cargoInventory: {
      boxes: normalizeQuantity(inv.boxes),
      mediumItems: normalizeQuantity(inv.mediumItems),
      largeFurniture: normalizeQuantity(inv.largeFurniture),
      heavyAppliances: normalizeQuantity(inv.heavyAppliances),
    },
    pickupFloor: String(raw?.pickupFloor ?? '0'),
    destinationFloor: String(raw?.destinationFloor ?? '0'),
    hasElevator: Boolean(raw?.hasElevator),
    laborRequired: String(raw?.laborRequired ?? 'none'),
  };
}

/** Stable serialisation for equality checks — key order is fixed by `buildQuoteInputs`. */
function fingerprint(inputs) {
  const i = inputs;
  return [
    i.vehicleType,
    i.distanceKm,
    i.cargoInventory.boxes,
    i.cargoInventory.mediumItems,
    i.cargoInventory.largeFurniture,
    i.cargoInventory.heavyAppliances,
    i.pickupFloor,
    i.destinationFloor,
    i.hasElevator ? '1' : '0',
    i.laborRequired,
  ].join('|');
}

/**
 * @param {{ inputs: object, total: number, configVersion?: number }} args
 * @returns {{ token: string, expiresAt: string }}
 */
function signOrderQuote({ inputs, total, configVersion = 0, split }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      fp: fingerprint(inputs),
      total: Math.round((Number(total) || 0) * 100) / 100,
      cv: configVersion,
      de: split?.driverEarnings ?? null,
      pc: split?.platformCommission ?? null,
      cr: split?.commissionRate ?? null,
      iat: issuedAt,
    },
    getJwtSecret(),
    { expiresIn: QUOTE_TTL_SECONDS, audience: QUOTE_AUDIENCE },
  );
  return {
    token,
    expiresAt: new Date((issuedAt + QUOTE_TTL_SECONDS) * 1000).toISOString(),
  };
}

/**
 * Verify a quote against the logistics actually submitted.
 * @returns {{ ok: true, total: number, configVersion: number } | { ok: false, reason: string }}
 */
function verifyOrderQuote(token, submittedInputs) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'Quote token is missing' };
  }
  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret(), { audience: QUOTE_AUDIENCE });
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return {
      ok: false,
      reason: expired ? 'Quote has expired — please review the price again' : 'Quote token is invalid',
    };
  }
  if (payload?.fp !== fingerprint(buildQuoteInputs(submittedInputs))) {
    return { ok: false, reason: 'Order details changed after the quote was issued' };
  }
  return {
    ok: true,
    total: Math.round((Number(payload.total) || 0) * 100) / 100,
    configVersion: Number(payload.cv) || 0,
    driverEarnings: payload.de == null ? null : Math.round((Number(payload.de) || 0) * 100) / 100,
    platformCommission: payload.pc == null ? null : Math.round((Number(payload.pc) || 0) * 100) / 100,
    commissionRate: payload.cr == null ? null : Math.round((Number(payload.cr) || 0) * 100) / 100,
  };
}

module.exports = {
  QUOTE_TTL_SECONDS,
  buildQuoteInputs,
  signOrderQuote,
  verifyOrderQuote,
};
