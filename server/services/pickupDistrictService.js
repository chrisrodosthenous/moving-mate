const https = require('https');
const { CYPRUS_DISTRICTS, isValidCyprusDistrict } = require('../constants/cyprusDistricts');

/** Rough centroids for mock / fallback (lat, lng). */
const DISTRICT_CENTROIDS = {
  Nicosia: [35.1753, 33.3642],
  Limassol: [34.6841, 33.0379],
  Larnaca: [34.9165, 33.6231],
  Paphos: [34.7745, 32.4233],
  Famagusta: [35.1149, 33.9192],
};

// Greek-script alternatives are intentional: users may type addresses in Greek.
// e.g. Greek district names ("Λευκωσία", "Λεμεσός") must still resolve to the correct district.
const ADDRESS_KEYWORDS = [
  [/nicosia|lefkosia|lefko|\u03bb\u03b5\u03c5\u03ba\u03c9\u03c3\u03af\u03b1/i, 'Nicosia'],
  [/limassol|lemesos|lemes|\u03bb\u03b5\u03bc\u03b5\u03c3\u03cc\u03c2/i, 'Limassol'],
  [/larnaca|larnaka|\u03bb\u03ac\u03c1\u03bd\u03b1\u03ba\u03b1/i, 'Larnaca'],
  [/paphos|\u03c0\u03ac\u03c6\u03bf\u03c2/i, 'Paphos'],
  [/famagusta|ammochostos|paralimni|ayia napa|agia napa|\u03b1\u03bc\u03bc\u03cc\u03c7\u03c9\u03c3\u03c4\u03bf\u03c2|\u03c0\u03b1\u03c1\u03b1\u03bb\u03af\u03bc\u03bd\u03b9|\u03ac\u03b3\u03b9\u03b1 \u03bd\u03ac\u03c0\u03b1/i, 'Famagusta'],
];

function districtFromAddressKeywords(address) {
  if (!address || typeof address !== 'string') return null;
  const a = address.trim();
  if (!a) return null;
  for (const [re, name] of ADDRESS_KEYWORDS) {
    if (re.test(a)) return name;
  }
  return null;
}

function districtFromNearestCentroid(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  let best = null;
  let bestSq = Infinity;
  for (const name of CYPRUS_DISTRICTS) {
    const [clat, clng] = DISTRICT_CENTROIDS[name];
    const sq = (lat - clat) ** 2 + (lng - clng) ** 2;
    if (sq < bestSq) {
      bestSq = sq;
      best = name;
    }
  }
  return best;
}

function mapGoogleTextToDistrict(text) {
  if (!text || typeof text !== 'string') return null;
  const n = text.toLowerCase();
  const pairs = [
    ['nicosia', 'Nicosia'],
    ['lefkosia', 'Nicosia'],
    ['limassol', 'Limassol'],
    ['lemesos', 'Limassol'],
    ['larnaca', 'Larnaca'],
    ['larnaka', 'Larnaca'],
    ['paphos', 'Paphos'],
    ['famagusta', 'Famagusta'],
    ['ammochostos', 'Famagusta'],
    ['paralimni', 'Famagusta'],
    ['ayia napa', 'Famagusta'],
    ['agia napa', 'Famagusta'],
  ];
  for (const [needle, district] of pairs) {
    if (n.includes(needle)) return district;
  }
  return null;
}

function districtFromGoogleComponents(components) {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    const longName = c.long_name || '';
    const shortName = c.short_name || '';
    const fromLong = mapGoogleTextToDistrict(longName);
    if (fromLong) return fromLong;
    const fromShort = mapGoogleTextToDistrict(shortName);
    if (fromShort) return fromShort;
  }
  return null;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Reverse-geocode lat/lng with Google Geocoding API when GOOGLE_MAPS_API_KEY (or GOOGLE_GEOCODING_API_KEY) is set.
 * @returns {Promise<string|null>}
 */
async function districtFromGoogleGeocode(lat, lng) {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_GEOCODING_API_KEY?.trim() || '';
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}`;
  try {
    const json = await httpGetJson(url);
    if (json.status !== 'OK' || !json.results?.length) return null;
    for (const result of json.results) {
      const d = districtFromGoogleComponents(result.address_components);
      if (d) return d;
    }
  } catch (err) {
    console.warn('[pickupDistrictService] Google geocode failed:', err.message);
  }
  return null;
}

/**
 * Resolve Cyprus district for an order pickup (address + coordinates).
 * Order: address keywords → Google (if key) → nearest centroid mock.
 * @param {{ address: string, lat: number, lng: number }} pickupLocation
 * @returns {Promise<string|null>} One of CYPRUS_DISTRICTS or null if unknown.
 */
async function extractPickupDistrict(pickupLocation) {
  const addr = pickupLocation?.address;
  const lat = pickupLocation?.lat;
  const lng = pickupLocation?.lng;

  const fromAddr = districtFromAddressKeywords(addr);
  if (fromAddr) return fromAddr;

  const fromGoogle = await districtFromGoogleGeocode(lat, lng);
  if (fromGoogle && isValidCyprusDistrict(fromGoogle)) return fromGoogle;

  return districtFromNearestCentroid(lat, lng);
}

module.exports = {
  extractPickupDistrict,
  districtFromAddressKeywords,
  districtFromNearestCentroid,
};
