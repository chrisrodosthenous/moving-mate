const { roundMoney } = require('./orderPricing');

/** Platform flat fee percentage (driver receives the remainder). */
const DEFAULT_COMMISSION_RATE_PERCENT = 20;

/**
 * Compute 80/20 split from gross order price.
 * @param {number} price
 * @param {number} [commissionRatePercent]
 */
function computeOrderCommission(price, commissionRatePercent = DEFAULT_COMMISSION_RATE_PERCENT) {
  const gross = Math.max(0, Number(price) || 0);
  const rate = Math.max(0, Math.min(100, Number(commissionRatePercent) || DEFAULT_COMMISSION_RATE_PERCENT));
  const platformCommission = roundMoney(gross * (rate / 100));
  const driverEarnings = roundMoney(gross - platformCommission);
  return {
    commissionRate: rate,
    platformCommission,
    driverEarnings,
  };
}

/**
 * Persist commission fields on a Mongoose order document (mutates in place).
 * @param {import('mongoose').Document} orderDoc
 * @param {number} [commissionRatePercent]
 */
function applyCompletionCommission(orderDoc, commissionRatePercent = DEFAULT_COMMISSION_RATE_PERCENT) {
  const { commissionRate, platformCommission, driverEarnings } = computeOrderCommission(
    orderDoc?.price,
    commissionRatePercent,
  );
  orderDoc.commissionRate = commissionRate;
  orderDoc.platformCommission = platformCommission;
  orderDoc.driverEarnings = driverEarnings;
  return { commissionRate, platformCommission, driverEarnings };
}

module.exports = {
  DEFAULT_COMMISSION_RATE_PERCENT,
  computeOrderCommission,
  applyCompletionCommission,
};
