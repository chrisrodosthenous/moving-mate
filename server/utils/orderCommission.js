const { roundMoney } = require('./orderPricing');
const { DEFAULT_PRICING_CONFIG } = require('../config/pricingDefaults');

/** First-band rate — used as a conservative floor in the pricing engine. */
const DEFAULT_COMMISSION_RATE_PERCENT = DEFAULT_PRICING_CONFIG.commissionTiers[0].ratePercent;

function resolveTiers(config) {
  const tiers = config?.commissionTiers;
  if (Array.isArray(tiers) && tiers.length > 0) return tiers;
  return DEFAULT_PRICING_CONFIG.commissionTiers;
}

/**
 * Walk the gross amount through successive bands.
 *
 * A €247.44 job is not taxed at a single rate: the first €100 is at 20%, the rest at 15%.
 * That is what "drivers keep more on large jobs" actually means, and why a lookup of
 * "which band does the total fall in" would be the wrong model.
 */
function computeMarginalCommission(gross, tiers) {
  let remaining = Math.max(0, Number(gross) || 0);
  let prevCap = 0;
  let commission = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const cap = tier.upToEur == null || !Number.isFinite(Number(tier.upToEur))
      ? Number.POSITIVE_INFINITY
      : Number(tier.upToEur);
    const bandWidth = Math.max(0, cap - prevCap);
    const slice = Math.min(remaining, bandWidth);
    commission += slice * (Number(tier.ratePercent) / 100);
    remaining -= slice;
    prevCap = cap;
  }
  return roundMoney(commission);
}

function effectiveRatePercent(gross, platformCommission) {
  if (!(gross > 0)) return DEFAULT_COMMISSION_RATE_PERCENT;
  return roundMoney((platformCommission / gross) * 100);
}

function hasPersistedSplit(orderDoc) {
  return Number(orderDoc?.driverEarnings) > 0 || Number(orderDoc?.platformCommission) > 0;
}

/**
 * Split a gross order price between driver and platform.
 *
 * Pass `commissionRatePercent` only to replay a locked flat rate (legacy orders).
 * Otherwise the split is the marginal walk over `config.commissionTiers`, falling
 * back to the seed bands. Callers that have a live config (admin preview) pass it
 * as the third argument; production order creation uses the seed until PR 3 wires
 * the stored document through.
 *
 * @param {number} price
 * @param {number} [commissionRatePercent]
 * @param {{ commissionTiers?: Array<{ upToEur: number|null, ratePercent: number }> }} [config]
 */
function computeOrderCommission(price, commissionRatePercent, config) {
  const gross = Math.max(0, Number(price) || 0);
  const explicit = commissionRatePercent != null && Number.isFinite(Number(commissionRatePercent));

  if (explicit) {
    const rate = Math.max(0, Math.min(100, Number(commissionRatePercent)));
    const platformCommission = roundMoney(gross * (rate / 100));
    return {
      commissionRate: rate,
      platformCommission,
      driverEarnings: roundMoney(gross - platformCommission),
    };
  }

  const platformCommission = computeMarginalCommission(gross, resolveTiers(config));
  const driverEarnings = roundMoney(gross - platformCommission);
  return {
    commissionRate: effectiveRatePercent(gross, platformCommission),
    platformCommission,
    driverEarnings,
  };
}

/**
 * Persist the split on an order. If the order was already stamped at creation, leave
 * those figures alone so a later config edit cannot change a deal already shown to
 * the customer and the driver.
 *
 * @param {import('mongoose').Document | object} orderDoc
 * @param {number} [commissionRatePercent]
 * @param {object} [config]
 */
function applyCompletionCommission(orderDoc, commissionRatePercent, config) {
  if (!orderDoc) {
    return computeOrderCommission(0, commissionRatePercent, config);
  }
  if (hasPersistedSplit(orderDoc) && commissionRatePercent == null) {
    return {
      commissionRate: Number(orderDoc.commissionRate) || DEFAULT_COMMISSION_RATE_PERCENT,
      platformCommission: roundMoney(orderDoc.platformCommission),
      driverEarnings: roundMoney(orderDoc.driverEarnings),
    };
  }
  const split = computeOrderCommission(orderDoc.price, commissionRatePercent, config);
  orderDoc.commissionRate = split.commissionRate;
  orderDoc.platformCommission = split.platformCommission;
  orderDoc.driverEarnings = split.driverEarnings;
  return split;
}

module.exports = {
  DEFAULT_COMMISSION_RATE_PERCENT,
  computeMarginalCommission,
  computeOrderCommission,
  applyCompletionCommission,
  hasPersistedSplit,
};
