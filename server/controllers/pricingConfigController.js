const {
  getPricingConfigForAdmin,
  updatePricingConfig,
} = require('../services/pricingConfigService');
const { calculateOrderPrice } = require('../utils/orderPricing');
const { computeOrderCommission } = require('../utils/orderCommission');
const { normalizePricingConfig, mergePricingConfig } = require('../config/pricingDefaults');

/**
 * Representative jobs priced alongside the config so an admin can see the effect of an
 * edit before saving it. These are the shapes the business actually sells.
 */
const PREVIEW_JOBS = [
  {
    label: 'Single box, 4 km',
    vehicleType: 'pickup',
    distanceKm: 4,
    cargoInventory: { boxes: 1, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
    pickupFloor: '0',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'none',
  },
  {
    label: '1-bedroom, 2nd floor, 18 km',
    vehicleType: 'van',
    distanceKm: 18,
    cargoInventory: { boxes: 10, mediumItems: 3, largeFurniture: 1, heavyAppliances: 0 },
    pickupFloor: '2',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'driver',
  },
  {
    label: '2-bedroom with helper, 18 km',
    vehicleType: 'truck',
    distanceKm: 18,
    cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
    pickupFloor: '3',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'driver_plus_helper',
  },
  {
    label: 'Intercity, 120 km',
    vehicleType: 'truck',
    distanceKm: 120,
    cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
    pickupFloor: '0',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'driver',
  },
];

function buildPreview(config) {
  return PREVIEW_JOBS.map(({ label, ...job }) => {
    const breakdown = calculateOrderPrice(job, config);
    const split = computeOrderCommission(breakdown.total, undefined, config);
    return {
      label,
      vehicleType: job.vehicleType,
      distanceKm: job.distanceKm,
      total: breakdown.total,
      pricingBasis: breakdown.pricingBasis,
      driverEarnings: split.driverEarnings,
      platformCommission: split.platformCommission,
      commissionRate: split.commissionRate,
    };
  });
}

async function getPricingConfig(req, res, next) {
  try {
    const result = await getPricingConfigForAdmin();
    return res.json({ ...result, preview: buildPreview(result.config) });
  } catch (err) {
    return next(err);
  }
}

async function putPricingConfig(req, res, next) {
  try {
    const patch = req.body?.config ?? req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ message: 'A pricing config object is required' });
    }
    const result = await updatePricingConfig(patch, req.user?.userId ?? null);
    return res.json({ ...result, preview: buildPreview(result.config) });
  } catch (err) {
    return next(err);
  }
}

/** Price the sample jobs against an unsaved edit, so admins can check before committing. */
async function postPricingConfigPreview(req, res, next) {
  try {
    const patch = req.body?.config ?? req.body;
    const current = await getPricingConfigForAdmin();
    const candidate = normalizePricingConfig(mergePricingConfig(current.config, patch));
    return res.json({ config: candidate, preview: buildPreview(candidate) });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  PREVIEW_JOBS,
  getPricingConfig,
  putPricingConfig,
  postPricingConfigPreview,
};
