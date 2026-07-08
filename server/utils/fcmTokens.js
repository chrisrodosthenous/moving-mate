/**
 * Non-empty trimmed FCM registration token strings (deduped).
 * Filters null, undefined, "", and whitespace-only entries.
 */
function sanitizeFcmTokens(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    if (t == null) continue;
    const s = String(t).trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Tokens safe to send to FCM: non-empty, deduped, and longer than 10 chars (drops "", junk, wrong index[0] empties).
 */
function activeFcmTokens(arr) {
  return sanitizeFcmTokens(arr).filter((t) => t && t.length > 10);
}

/**
 * @param {string} userId
 * @param {unknown[]} rawArr  Raw `user.fcmTokens` from MongoDB (any length / may include "").
 * @param {string[]} activeArr  Result of {@link activeFcmTokens}(rawArr).
 */
function logFcmDebug(userId, rawArr, activeArr) {
  const raw = Array.isArray(rawArr) ? rawArr : [];
  const uid = userId != null ? String(userId) : '';
  if (!uid) return;
  console.log(
    `[FCM Debug] Found ${activeArr.length} valid tokens for user ${uid} out of ${raw.length} total entries.`
  );
}

module.exports = { sanitizeFcmTokens, activeFcmTokens, logFcmDebug };
