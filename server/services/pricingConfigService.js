const PricingConfig = require('../models/PricingConfig');
const {
  DEFAULT_PRICING_CONFIG,
  normalizePricingConfig,
  mergePricingConfig,
} = require('../config/pricingDefaults');

const SINGLETON_KEY = PricingConfig.SINGLETON_KEY;
const CACHE_MS = 5000;

let cachedConfig = null;
let cachedVersion = 1;
let cachedAt = 0;

function invalidatePricingConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

/** Insert the seed document on first boot; never overwrites values an admin has changed. */
async function ensureDefaultPricingConfig() {
  await PricingConfig.updateOne(
    { key: SINGLETON_KEY },
    { $setOnInsert: { ...DEFAULT_PRICING_CONFIG, key: SINGLETON_KEY, version: 1 } },
    { upsert: true },
  );
}

/**
 * Active pricing config, normalised and cached briefly.
 *
 * Falls back to the seed values if the database is unreachable or the stored document is
 * unusable — mispricing against known-good defaults is far better than failing to quote.
 */
async function getActivePricingConfig() {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_MS) {
    return { config: cachedConfig, version: cachedVersion };
  }
  try {
    const doc = await PricingConfig.findOne({ key: SINGLETON_KEY }).lean();
    if (!doc) {
      await ensureDefaultPricingConfig();
      cachedConfig = normalizePricingConfig(DEFAULT_PRICING_CONFIG);
      cachedVersion = 1;
    } else {
      cachedConfig = normalizePricingConfig(doc);
      cachedVersion = Number(doc.version) || 1;
    }
    cachedAt = now;
    return { config: cachedConfig, version: cachedVersion };
  } catch (err) {
    console.error('[pricingConfig] falling back to defaults:', err?.message || err);
    return { config: normalizePricingConfig(DEFAULT_PRICING_CONFIG), version: 0 };
  }
}

/** The stored document as an admin should see it, with defaults filled in. */
async function getPricingConfigForAdmin() {
  await ensureDefaultPricingConfig();
  const doc = await PricingConfig.findOne({ key: SINGLETON_KEY }).lean();
  return {
    config: normalizePricingConfig(doc),
    version: Number(doc?.version) || 1,
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
}

/**
 * Replace the active config. The patch is normalised first, so a partial or invalid
 * submission resolves to the current defaults for those fields rather than being rejected.
 */
async function updatePricingConfig(patch, adminUserId = null) {
  await ensureDefaultPricingConfig();
  const current = await PricingConfig.findOne({ key: SINGLETON_KEY }).lean();
  const merged = normalizePricingConfig(mergePricingConfig(normalizePricingConfig(current), patch));
  const nextVersion = (Number(current?.version) || 1) + 1;

  const saved = await PricingConfig.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { ...merged, version: nextVersion, updatedBy: adminUserId } },
    { returnDocument: 'after', runValidators: true },
  ).lean();

  invalidatePricingConfigCache();
  return {
    config: normalizePricingConfig(saved),
    version: Number(saved?.version) || nextVersion,
    updatedAt: saved?.updatedAt ?? null,
    updatedBy: saved?.updatedBy ?? null,
  };
}

module.exports = {
  SINGLETON_KEY,
  ensureDefaultPricingConfig,
  getActivePricingConfig,
  getPricingConfigForAdmin,
  updatePricingConfig,
  invalidatePricingConfigCache,
};
