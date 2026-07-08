'use strict';

/**
 * Google Maps / Geocoding API key from environment.
 * Supports GOOGLE_MAPS_API_KEY (preferred) or MAPS_API_KEY as an alias.
 * The key value must never be logged — only presence/length checks.
 */

const MIN_KEY_LENGTH = 20;

/**
 * @returns {string} Trimmed key or empty string if unset.
 */
function getGoogleMapsApiKey() {
  const primary = process.env.GOOGLE_MAPS_API_KEY;
  const alias = process.env.MAPS_API_KEY;
  const raw =
    (typeof primary === 'string' && primary.trim()) ||
    (typeof alias === 'string' && alias.trim()) ||
    '';
  return raw;
}

/**
 * @returns {boolean} True if a non-empty key string is present.
 */
function isGoogleMapsApiKeyPresent() {
  return getGoogleMapsApiKey().length > 0;
}

/**
 * True if key looks plausibly valid (Google browser/server keys are typically long).
 * Does not verify the key with Google.
 */
function isGoogleMapsApiKeyPlausible() {
  const k = getGoogleMapsApiKey();
  return k.length >= MIN_KEY_LENGTH;
}

/**
 * Fail-fast in production/staging if geocoding cannot run; warn in development.
 * Call once after dotenv in server.js (before listening).
 */
function validateGoogleMapsApiKeyAtStartup() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const strictEnv = nodeEnv === 'production' || nodeEnv === 'staging';

  if (!isGoogleMapsApiKeyPresent()) {
    const msg =
      '[Server] CRITICAL: Geocoding API key is missing. Set GOOGLE_MAPS_API_KEY or MAPS_API_KEY in the environment.';
    if (strictEnv) {
      console.error(msg);
      console.error(
        '[Server] Refusing to start: automatic pickupDistrict derivation requires this key in production/staging.',
      );
      process.exit(1);
    }
    console.warn(msg);
    console.warn(
      '[Server] Development mode: server will start, but pickup district derivation will be disabled until the key is set.',
    );
    return;
  }

  if (!isGoogleMapsApiKeyPlausible()) {
    const msg =
      '[Server] CRITICAL: GOOGLE_MAPS_API_KEY / MAPS_API_KEY appears too short to be a valid Google API key.';
    if (strictEnv) {
      console.error(msg);
      console.error('[Server] Refusing to start: fix the key or unset NODE_ENV=staging|production to run locally.');
      process.exit(1);
    }
    console.warn(msg);
    console.warn('[Server] Geocoding requests may fail until a valid key is configured.');
  }
}

module.exports = {
  getGoogleMapsApiKey,
  isGoogleMapsApiKeyPresent,
  isGoogleMapsApiKeyPlausible,
  validateGoogleMapsApiKeyAtStartup,
  MIN_KEY_LENGTH,
};
