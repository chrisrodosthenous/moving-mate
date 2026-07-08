/**
 * Short-lived in-memory dedupe for push/socket notifications.
 * Prevents duplicate alerts when the same event fires twice within milliseconds
 * (e.g. double API call, race between channels).
 */

const DEFAULT_TTL_MS = 30_000;

/** @type {Map<string, { expiresAt: number }>} */
const cache = new Map();

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

/**
 * Build a stable dedupe key from parts.
 * @param {...string} parts
 */
function buildDedupeKey(...parts) {
  return parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(':');
}

/**
 * Returns true if this key was not seen recently (caller should proceed).
 * Returns false if a duplicate within TTL — caller should skip.
 * @param {string} key
 * @param {number} [ttlMs]
 */
function tryAcquireNotification(key, ttlMs = DEFAULT_TTL_MS) {
  const k = String(key || '').trim();
  if (!k) return true;

  const now = Date.now();
  pruneExpired(now);

  const existing = cache.get(k);
  if (existing && existing.expiresAt > now) {
    return false;
  }

  cache.set(k, { expiresAt: now + ttlMs });
  return true;
}

/** Test helper — clear all entries. */
function _resetNotificationDedupeForTests() {
  cache.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  buildDedupeKey,
  tryAcquireNotification,
  _resetNotificationDedupeForTests,
};
