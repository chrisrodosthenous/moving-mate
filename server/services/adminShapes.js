const { normalizedDriverDistricts } = require('../constants/cyprusDistricts');

function shapeUserForOrder(u) {
  if (!u || typeof u !== 'object') return null;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  const phone = u.phoneNumber != null ? String(u.phoneNumber) : '';
  return {
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: fullName || '—',
    email: u.email || '',
    phone,
    phoneNumber: u.phoneNumber,
    carModel: u.carModel,
    plateNumber: u.plateNumber,
  };
}

function shapeOrderDocForClient(o) {
  const cust = shapeUserForOrder(o.customerId && typeof o.customerId === 'object' ? o.customerId : null);
  const drv = shapeUserForOrder(o.driverId && typeof o.driverId === 'object' ? o.driverId : null);
  return {
    _id: o._id,
    customerId: o.customerId,
    driverId: o.driverId,
    customer: cust,
    driver: drv,
    pickupDistrict: o.pickupDistrict,
    pickupLocation: o.pickupLocation,
    dropoffLocation: o.dropoffLocation,
    status: o.status,
    paymentStatus: o.paymentStatus || 'unpaid',
    price: o.price,
    driverEarnings: o.driverEarnings != null ? Number(o.driverEarnings) : 0,
    platformCommission: o.platformCommission != null ? Number(o.platformCommission) : 0,
    commissionRate: o.commissionRate != null ? Number(o.commissionRate) : 20,
    scheduledAt: o.scheduledAt,
    distanceKm: o.distanceKm,
    insuranceStatus: o.insuranceStatus,
    smallBoxes: o.smallBoxes,
    mediumBoxes: o.mediumBoxes,
    largeBoxes: o.largeBoxes,
    cargoImageUrl: o.cargoImageUrl,
    createdAt: o.createdAt,
    submittedAt: o.createdAt,
    driverLocation:
      o.driverLocation?.lat != null && o.driverLocation?.lng != null
        ? {
            lat: o.driverLocation.lat,
            lng: o.driverLocation.lng,
            heading: typeof o.driverLocation.heading === 'number' ? o.driverLocation.heading : undefined,
          }
        : null,
    vehicleType: o.vehicleType || 'pickup',
    pickupFloor: o.pickupFloor != null && o.pickupFloor !== '' ? String(o.pickupFloor) : '0',
    destinationFloor: o.destinationFloor != null && o.destinationFloor !== '' ? String(o.destinationFloor) : '0',
    ...(o.hasElevator != null ? { hasElevator: Boolean(o.hasElevator) } : {}),
    ...(o.pickupHasElevator != null ? { pickupHasElevator: Boolean(o.pickupHasElevator) } : {}),
    ...(o.dropoffHasElevator != null ? { dropoffHasElevator: Boolean(o.dropoffHasElevator) } : {}),
    laborRequired:
      o.laborRequired === 'driver' || o.laborRequired === 'driver_plus_helper' ? o.laborRequired : 'none',
  };
}

function shapeDriverForAdmin(u) {
  return {
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phoneNumber: u.phoneNumber,
    dateOfBirth: u.dateOfBirth,
    role: u.role,
    district: u.district || null,
    isVerified: u.isVerified,
    verificationStatus: u.verificationStatus,
    isSuspended: u.isSuspended === true,
    rejectionReason: u.rejectionReason || '',
    licenseUrl: u.licenseUrl || '',
    idCardPath: u.idCardPath || '',
    licensePath: u.licensePath || '',
    vehicleType: u.vehicleType || '',
    vehiclePhotoUrl: u.vehiclePhotoUrl || '',
    districts: normalizedDriverDistricts(u),
    carModel: u.carModel || '',
    plateNumber: u.plateNumber || '',
    averageRating: u.averageRating != null ? Number(u.averageRating) : null,
    reviewCount:
      typeof u.reviewCount === 'number'
        ? u.reviewCount
        : typeof u.totalReviews === 'number'
          ? u.totalReviews
          : 0,
    createdAt: u.createdAt,
  };
}

module.exports = { shapeOrderDocForClient, shapeDriverForAdmin };
