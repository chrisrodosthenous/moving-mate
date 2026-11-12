const {
  getPricingConfigForAdmin,
  updatePricingConfig,
} = require('../services/pricingConfigService');
const {
  calculateOrderPrice,
  roundMoney,
  computeHandlingMinutes,
  computeHandlingCost,
  computeCrewCost,
  computeAccessCost,
  computeDistanceCost,
  computeCostPerKm,
  computeJobHours,
} = require('../utils/orderPricing');
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
    laborRequired: 'none',
  },
  {
    label: '2-bedroom, 18 km',
    vehicleType: 'truck',
    distanceKm: 18,
    cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
    pickupFloor: '3',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'none',
  },
  {
    label: 'Intercity, 120 km',
    vehicleType: 'truck',
    distanceKm: 120,
    cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
    pickupFloor: '0',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'none',
  },
];

const VEHICLE_LABELS = {
  pickup: 'Pick up',
  minivan: 'Mini van',
  van: 'Van',
  truck: 'Truck',
};

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

/** One sample move, with every intermediate the formula uses, so the page can show the working. */
function buildExample(config) {
  const job = PREVIEW_JOBS[1];
  const c = normalizePricingConfig(config);
  const tier = c.vehicles[job.vehicleType] ?? c.vehicles.van;
  const km = job.distanceKm;
  const handlingMinutes = computeHandlingMinutes(job.cargoInventory, c.handlingMinutesPerItem);
  const handlingCost = computeHandlingCost(handlingMinutes, c.handlingRatePerMinuteEur);
  const crewCost = computeCrewCost(handlingCost, job.laborRequired, c.crewMultiplier);
  const accessCost = computeAccessCost(handlingCost, job, c.stairsSurchargePerFloor);
  const nearKm = Math.min(km, c.distanceTaperThresholdKm);
  const farKm = Math.max(0, km - c.distanceTaperThresholdKm);
  const distanceCost = computeDistanceCost(km, tier, c.distanceTaperThresholdKm);
  const breakdown = calculateOrderPrice(job, c);
  const split = computeOrderCommission(breakdown.total, undefined, c);
  const jobHours = computeJobHours(
    { handlingMinutes, distanceKm: km, laborRequired: job.laborRequired },
    { averageSpeedKmh: c.averageSpeedKmh, setupHours: c.setupHours },
  );
  const costPerKm = computeCostPerKm(tier, c.dieselPricePerLitreEur);
  const chargedKm = km * 2 + c.deadheadKm;
  const stairFloors = (Number(job.pickupFloor) || 0) + (Number(job.destinationFloor) || 0);
  return {
    label: job.label,
    vehicleLabel: VEHICLE_LABELS[job.vehicleType] ?? job.vehicleType,
    distanceKm: km,
    boxes: job.cargoInventory.boxes,
    mediumItems: job.cargoInventory.mediumItems,
    largeFurniture: job.cargoInventory.largeFurniture,
    heavyAppliances: job.cargoInventory.heavyAppliances,
    pickupFloor: Number(job.pickupFloor) || 0,
    destinationFloor: Number(job.destinationFloor) || 0,
    stairFloors,
    minutesBoxes: c.handlingMinutesPerItem.boxes,
    minutesMedium: c.handlingMinutesPerItem.mediumItems,
    minutesLarge: c.handlingMinutesPerItem.largeFurniture,
    minutesHeavy: c.handlingMinutesPerItem.heavyAppliances,
    oneWayMinutes: roundMoney(handlingMinutes / 2),
    handlingMinutes,
    handlingRatePerMinuteEur: c.handlingRatePerMinuteEur,
    handlingCost,
    crewMultiplier: c.crewMultiplier.none,
    crewCost,
    stairsSurchargePerFloor: c.stairsSurchargePerFloor,
    accessCost,
    nearKm,
    farKm,
    rateNear: tier.rateNear,
    rateFar: tier.rateFar,
    distanceCost,
    baseFee: tier.baseFee,
    rateCardTotal: breakdown.rateCardTotal,
    consumptionLPer100Km: tier.consumptionLPer100Km,
    dieselPricePerLitreEur: c.dieselPricePerLitreEur,
    wearPerKm: tier.wearPerKm,
    costPerKm: roundMoney(costPerKm * 10000) / 10000,
    deadheadKm: c.deadheadKm,
    chargedKm,
    vehicleCost: roundMoney(costPerKm * chargedKm),
    averageSpeedKmh: c.averageSpeedKmh,
    setupHours: c.setupHours,
    jobHours: Math.round(jobHours * 10000) / 10000,
    driverHourlyTargetEur: c.driverHourlyTargetEur,
    driverCost: roundMoney(jobHours * c.driverHourlyTargetEur),
    driverCostFloor: breakdown.driverCostFloor,
    firstCommissionPercent: Number(c.commissionTiers[0]?.ratePercent) || 20,
    floorPrice: breakdown.floorPrice,
    minFare: tier.minFare,
    total: breakdown.total,
    pricingBasis: breakdown.pricingBasis,
    driverEarnings: split.driverEarnings,
    platformCommission: split.platformCommission,
    commissionTiers: c.commissionTiers,
  };
}

function withPricingViews(result) {
  return {
    ...result,
    preview: buildPreview(result.config),
    example: buildExample(result.config),
  };
}

async function getPricingConfig(req, res, next) {
  try {
    const result = await getPricingConfigForAdmin();
    return res.json(withPricingViews(result));
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
    return res.json(withPricingViews(result));
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
    return res.json(withPricingViews({ config: candidate, version: current.version }));
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
