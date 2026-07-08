const { sendDriverWelcome, sendDriverVerificationEmail, clientBaseUrl } = require('../services/notificationService');
const { emitVerificationStatusUpdated } = require('../services/realtimeService');
const { normalizedDriverDistricts } = require('../constants/cyprusDistricts');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

/** Populated User subdoc for orders — matches Angular `customer` / `driver` + `fullName` / `phone`. */
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
  const cust = shapeUserForOrder(
    o.customerId && typeof o.customerId === 'object' ? o.customerId : null
  );
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
    /** Same semantics as customer/driver APIs: when the order was submitted (mirrors createdAt). */
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
    destinationFloor:
      o.destinationFloor != null && o.destinationFloor !== '' ? String(o.destinationFloor) : '0',
    ...(o.hasElevator != null ? { hasElevator: Boolean(o.hasElevator) } : {}),
    laborRequired:
      o.laborRequired === 'driver' || o.laborRequired === 'driver_plus_helper'
        ? o.laborRequired
        : 'none',
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

/**
 * GET /api/admin/pending-verifications - Only users with verificationStatus 'pending' and isVerified false (admin only).
 */
async function getPendingVerifications(req, res, next) {
  try {
    const users = await User.find({ verificationStatus: 'pending', isVerified: false })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      users: users.map((u) => ({
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        dateOfBirth: u.dateOfBirth,
        licenseUrl: u.licenseUrl || '',
        vehicleType: u.vehicleType || '',
        vehiclePhotoUrl: u.vehiclePhotoUrl || '',
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/verify-user/:id - Set verification status (admin only).
 * Body: { status: 'approved' | 'rejected', reason?: string }
 * Reject sets verificationStatus to 'rejected' (and isVerified false), so getPendingVerifications no longer returns them.
 */
async function verifyUser(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Body must include status: "approved" or "rejected"' });
    }

    if (status === 'rejected' && !reasonRaw) {
      return res.status(400).json({ message: 'Rejection reason is required when status is "rejected"' });
    }

    const userId = toObjectId(id);
    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const doc = await User.findById(userId).select('-password');
    if (!doc) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (doc.role !== 'driver') {
      return res.status(404).json({ message: 'User not found or not a driver' });
    }

    if (status === 'approved' && (!doc.licenseUrl?.trim() || !doc.vehiclePhotoUrl?.trim())) {
      return res.status(400).json({
        message: 'Both driving license and vehicle photo are required before approval.',
      });
    }

    if (status === 'rejected') {
      doc.verificationStatus = 'rejected';
      doc.isVerified = false;
      doc.rejectionReason = reasonRaw;
    } else {
      doc.verificationStatus = 'approved';
      doc.isVerified = true;
      doc.rejectionReason = '';
    }
    await doc.save({ validateBeforeSave: false });
    const user = doc.toObject();

    const dashboardUrl = clientBaseUrl();
    if (status === 'approved' && user.email) {
      try {
        await sendDriverWelcome({
          to: user.email,
          firstName: user.firstName || 'Driver',
          dashboardUrl,
        });
        console.log(`[Notifications] driver welcome email queued for driverId=${user._id} email=${user.email}`);
      } catch (error) {
        console.error('Driver welcome email failed to send:', error.message);
      }
    } else if (status === 'rejected' && user.email) {
      try {
        await sendDriverVerificationEmail({
          to: user.email,
          firstName: user.firstName || 'Driver',
          status: 'rejected',
          rejectionReason: reasonRaw,
          dashboardUrl,
        });
        console.log(`[Notifications] driver rejection email queued for driverId=${user._id} email=${user.email}`);
      } catch (error) {
        console.error('Driver rejection email failed to send:', error.message);
      }
    }

    const io = req.app.get('io');
    if (io) {
      emitVerificationStatusUpdated(io, user._id, {
        userId: user._id,
        verificationStatus: user.verificationStatus,
        licenseStatus: user.verificationStatus,
        rejectionReason: status === 'rejected' ? reasonRaw : '',
        isVerified: user.isVerified,
      });
    }

    res.status(200).json({
      success: true,
      message: status === 'rejected' ? 'User rejected successfully' : 'Driver approved',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        rejectionReason: status === 'rejected' ? reasonRaw : '',
        vehicleType: user.vehicleType || '',
        vehiclePhotoUrl: user.vehiclePhotoUrl || '',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/overview - All users and all orders (admin only).
 */
async function getOverview(req, res, next) {
  try {
    const [users, orders] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }).lean(),
      TransportOrder.find()
        .populate('customerId', 'firstName lastName email phoneNumber')
        .populate('driverId', 'firstName lastName email phoneNumber carModel plateNumber')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      success: true,
      users: users.map((u) => shapeDriverForAdmin(u)),
      orders: orders.map((o) => shapeOrderDocForClient(o)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/orders/:id — Full order detail for admin modal (message count included).
 * Populates ref fields `customerId` & `driverId` on TransportOrder (aliases `customer` / `driver` in JSON).
 */
async function getAdminOrderDetail(req, res, next) {
  try {
    const rawId = req.params.id ?? req.params.orderId;
    const orderId = toObjectId(rawId);
    if (!orderId) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await TransportOrder.findById(orderId)
      .populate('customerId', 'firstName lastName email phoneNumber')
      .populate('driverId', 'firstName lastName email phoneNumber carModel plateNumber')
      .lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    const messageCount = await Message.countDocuments({ orderId: orderId });
    res.json({
      success: true,
      messageCount,
      order: shapeOrderDocForClient(order),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/driver-documents/:id/:docType - Secure file serving for admin.
 * docType: id-card | license
 */
async function getDriverDocument(req, res, next) {
  try {
    const { id, docType } = req.params;
    if (!['id-card', 'license'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    const user = await User.findById(toObjectId(id)).select('idCardPath licensePath licenseUrl').lean();
    if (!user) return res.status(404).json({ message: 'Driver not found' });

    const relPath =
      docType === 'id-card' ? user.idCardPath : user.licensePath || user.licenseUrl || '';
    if (!relPath) {
      return res.status(404).json({ message: 'Document not uploaded' });
    }

    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const absolute = path.join(__dirname, '..', relPath.replace(/^\//, ''));
    const safeRoot = path.resolve(uploadsRoot);
    const safeAbsolute = path.resolve(absolute);
    if (!safeAbsolute.startsWith(safeRoot)) {
      return res.status(400).json({ message: 'Invalid file path' });
    }
    if (!fs.existsSync(safeAbsolute)) {
      return res.status(404).json({ message: 'Document file not found' });
    }

    return res.sendFile(safeAbsolute);
  } catch (err) {
    next(err);
  }
}

const COMPLETED_ORDER_STATUSES = ['delivered', 'completed'];

const CHART_TREND_DAYS = 30;

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastNDayBuckets(days) {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const span = Math.max(1, Math.floor(days));
  for (let offset = span - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    buckets.push({
      key: localDateKey(d),
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    });
  }
  return buckets;
}

/**
 * GET /api/admin/analytics — aggregates for admin dashboard charts (30-day trend, districts, top drivers).
 */
async function getAnalytics(req, res, next) {
  try {
    const dayBuckets = lastNDayBuckets(CHART_TREND_DAYS);
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - (CHART_TREND_DAYS - 1));

    const recentOrders = await TransportOrder.find({ createdAt: { $gte: rangeStart } })
      .select('createdAt price')
      .lean();

    const ordersByDay = Object.fromEntries(dayBuckets.map((b) => [b.key, 0]));
    const revenueByDay = Object.fromEntries(dayBuckets.map((b) => [b.key, 0]));
    for (const o of recentOrders) {
      const created = new Date(o.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      const key = localDateKey(created);
      if (!(key in ordersByDay)) continue;
      ordersByDay[key]++;
      revenueByDay[key] += Number(o.price) || 0;
    }

    const districtAgg = await TransportOrder.aggregate([
      { $match: { pickupDistrict: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$pickupDistrict', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const driverAgg = await TransportOrder.aggregate([
      {
        $match: {
          status: { $in: COMPLETED_ORDER_STATUSES },
          driverId: { $ne: null },
        },
      },
      { $group: { _id: '$driverId', trips: { $sum: 1 } } },
      { $sort: { trips: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'driver',
        },
      },
      { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
    ]);

    const driverLabels = driverAgg.map((row) => {
      const d = row.driver;
      if (!d) return 'Driver';
      const name = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
      return name || d.email || 'Driver';
    });

    res.json({
      success: true,
      trend: {
        labels: dayBuckets.map((b) => b.label),
        orders: dayBuckets.map((b) => ordersByDay[b.key] ?? 0),
        revenue: dayBuckets.map((b) => Math.round((revenueByDay[b.key] ?? 0) * 100) / 100),
      },
      districts: {
        labels: districtAgg.map((r) => String(r._id)),
        counts: districtAgg.map((r) => r.count),
      },
      topDrivers: {
        labels: driverLabels,
        trips: driverAgg.map((r) => r.trips),
      },
    });
  } catch (err) {
    next(err);
  }
}

exports.getOverview = getOverview;
exports.getAnalytics = getAnalytics;
exports.getPendingVerifications = getPendingVerifications;
exports.verifyUser = verifyUser;
exports.getDriverDocument = getDriverDocument;
exports.getAdminOrderDetail = getAdminOrderDetail;
