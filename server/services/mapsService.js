'use strict';

/**
 * Google Maps Geocoding helpers: reverse/forward geocode to resolve a Cyprus pickup district.
 * API key: use getGoogleMapsApiKey() from config/mapsEnv.js (never log the key).
 */

const https = require('https');
const { URL } = require('url');
const { canonicalCyprusDistrict, isValidCyprusDistrict } = require('../constants/cyprusDistricts');
const {
  getGoogleMapsApiKey,
  isGoogleMapsApiKeyPlausible,
} = require('../config/mapsEnv');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
/** Skip forward-geocode when address is too short to be useful. */
const MIN_ADDRESS_LEN = 10;
/** Rough bounding box for Cyprus (reject obvious bad coords without calling Google). */
const CY_BOUNDS = { minLat: 34.45, maxLat: 35.85, minLng: 32.0, maxLng: 34.75 };

const districtCache = new Map();

function inCyprusBounds(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  return (
    lat >= CY_BOUNDS.minLat &&
    lat <= CY_BOUNDS.maxLat &&
    lng >= CY_BOUNDS.minLng &&
    lng <= CY_BOUNDS.maxLng
  );
}

function httpsGetJson(urlString) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      reject(new Error('Invalid geocode URL'));
      return;
    }
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': 'MovingMate-Server/1.0' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch {
            reject(new Error('Geocoding API returned non-JSON'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy();
      reject(new Error('Geocoding request timeout'));
    });
    req.end();
  });
}

/**
 * Map Google long/short names or formatted text to canonical CYPRUS_DISTRICTS entry.
 * @param {string} text
 * @returns {string|null}
 */
function mapGoogleTextToDistrict(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fromCanon = canonicalCyprusDistrict(trimmed);
  if (fromCanon) return fromCanon;

  const lower = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const rules = [
    { keys: ['nicosia', 'lefkosia', 'lefkosia municipality'], district: 'Nicosia' },
    { keys: ['limassol', 'lemesos', 'limassol municipality'], district: 'Limassol' },
    { keys: ['larnaca', 'larnaka'], district: 'Larnaca' },
    { keys: ['paphos', 'pafos'], district: 'Paphos' },
    { keys: ['famagusta', 'ammochostos', 'gazimagusa', 'magusa', 'ammochostos municipality'], district: 'Famagusta' },
  ];

  for (const { keys, district } of rules) {
    for (const k of keys) {
      if (lower.includes(k)) {
        return district;
      }
    }
  }
  return null;
}

/**
 * Safely parse Geocoding JSON and extract a Cyprus district from results[0].address_components.
 * @param {unknown} data
 * @returns {string|null}
 */
function extractDistrictFromGeocodeResponse(data) {
  if (!data || typeof data !== 'object') return null;
  const status = data.status;
  if (status !== 'OK') return null;
  if (!Array.isArray(data.results) || data.results.length === 0) return null;

  const candidateStrings = [];

  for (let i = 0; i < data.results.length; i++) {
    const result = data.results[i];
    if (!result || typeof result !== 'object') continue;
    if (typeof result.formatted_address === 'string' && result.formatted_address.trim()) {
      candidateStrings.push(result.formatted_address);
    }
    const components = result.address_components;
    if (!Array.isArray(components)) continue;
    for (let j = 0; j < components.length; j++) {
      const comp = components[j];
      if (!comp || typeof comp !== 'object') continue;
      const types = comp.types;
      if (!Array.isArray(types)) continue;
      const relevant =
        types.includes('administrative_area_level_1') ||
        types.includes('administrative_area_level_2') ||
        types.includes('locality') ||
        types.includes('sublocality') ||
        types.includes('neighborhood');
      if (!relevant) continue;
      if (typeof comp.long_name === 'string' && comp.long_name.trim()) {
        candidateStrings.push(comp.long_name);
      }
      if (typeof comp.short_name === 'string' && comp.short_name.trim() && comp.short_name !== comp.long_name) {
        candidateStrings.push(comp.short_name);
      }
    }
  }

  for (let k = 0; k < candidateStrings.length; k++) {
    const mapped = mapGoogleTextToDistrict(candidateStrings[k]);
    if (mapped && isValidCyprusDistrict(mapped)) return mapped;
  }
  return null;
}

async function reverseGeocodeLatLng(lat, lng, apiKey) {
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
    language: 'en',
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const data = await httpsGetJson(url);
  return extractDistrictFromGeocodeResponse(data);
}

async function forwardGeocodeAddress(address, apiKey) {
  if (typeof address !== 'string' || address.trim().length < MIN_ADDRESS_LEN) {
    return null;
  }
  const params = new URLSearchParams({
    address: address.trim(),
    key: apiKey,
    region: 'cy',
    language: 'en',
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const data = await httpsGetJson(url);
  return extractDistrictFromGeocodeResponse(data);
}

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function cacheSetSuccess(key, district) {
  if (districtCache.size >= MAX_CACHE_ENTRIES) {
    const first = districtCache.keys().next().value;
    if (first !== undefined) districtCache.delete(first);
  }
  districtCache.set(key, { district, expires: Date.now() + CACHE_TTL_MS });
}

/** @returns {string|null|undefined} undefined = cache miss */
function cacheGet(key) {
  const hit = districtCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    districtCache.delete(key);
    return undefined;
  }
  return hit.district;
}

/**
 * Derive canonical pickup district from coordinates (and optionally address) using Google Geocoding.
 * Never throws to callers: returns null and logs a short message (never the API key or full request URL).
 *
 * @param {{ lat: number, lng: number, address?: string }} loc
 * @returns {Promise<string|null>}
 */
async function derivePickupDistrictFromLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = loc.lat;
  const lng = loc.lng;
  const address = typeof loc.address === 'string' ? loc.address : '';

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    console.warn(
      '[mapsService] Geocoding skipped: no API key (set GOOGLE_MAPS_API_KEY or MAPS_API_KEY).',
    );
    return null;
  }
  if (!isGoogleMapsApiKeyPlausible()) {
    console.warn(
      '[mapsService] Geocoding skipped: API key appears invalid (length). Configure a valid Google Maps API key.',
    );
    return null;
  }

  if (!inCyprusBounds(lat, lng)) {
    console.warn('[mapsService] Skipping geocoding: coordinates outside Cyprus bounds.');
    return null;
  }

  const ck = cacheKey(lat, lng);
  const cached = cacheGet(ck);
  if (cached !== undefined) {
    return cached && isValidCyprusDistrict(cached) ? cached : null;
  }

  let district = null;
  try {
    district = await reverseGeocodeLatLng(lat, lng, apiKey);
    if (!district && address.trim().length >= MIN_ADDRESS_LEN) {
      district = await forwardGeocodeAddress(address, apiKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[mapsService] Geocoding request failed:', msg);
    return null;
  }

  const canonical =
    district && isValidCyprusDistrict(district) ? district : district ? canonicalCyprusDistrict(district) : null;

  const result = canonical && isValidCyprusDistrict(canonical) ? canonical : null;
  if (result) {
    cacheSetSuccess(ck, result);
  }
  return result;
}

module.exports = {
  derivePickupDistrictFromLocation,
};
