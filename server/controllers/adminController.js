const { sendDriverWelcome, sendDriverVerificationEmail, clientBaseUrl } = require('../services/notificationService');
const { emitVerificationStatusUpdated } = require('../services/realtimeService');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const mongoose = require('mongoose');
const { createImpersonationGrant, redeemImpersonationGrant } = require('../services/impersonationService');
const { shapeOrderDocForClient, shapeDriverForAdmin } = require('../services/adminShapes');
const { computeOrderCommission } = require('../utils/orderCommission');

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
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

async function getCustomerDirectory(req, res, next) {
  try {
    return res.json(await listCustomers(req.query));
  } catch (err) {
    return next(err);
  }
}

async function getDriverDirectory(req, res, next) {
  try {
    return res.json(await listDrivers(req.query));
  } catch (err) {
    return next(err);
  }
}

async function getOrderDirectory(req, res, next) {
  try {
    return res.json(await listOrders(req.query));
  } catch (err) {
    return next(err);
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
 * GET /api/admin/orders/:id — Full order detail for the admin modal.
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
    res.json({
      success: true,
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
    if (!['id-card', 'license', 'vehicle-photo'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    const user = await User.findById(toObjectId(id)).select('idCardPath licensePath licenseUrl vehiclePhotoUrl').lean();
    if (!user) return res.status(404).json({ message: 'Driver not found' });

    const relPath =
      docType === 'id-card'
        ? user.idCardPath || ''
        : docType === 'vehicle-photo'
          ? user.vehiclePhotoUrl || ''
          : user.licenseUrl || user.licensePath || '';
    if (!relPath) {
      return res.status(404).json({ message: 'Document not uploaded' });
    }

    const sent = await sendPublicUpload(res, relPath);
    if (!sent) {
      return res.status(404).json({ message: 'Document file not found' });
    }
    return undefined;
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

function lastNMonthBuckets(count) {
  const buckets = [];
  const now = new Date();
  const span = Math.max(1, Math.floor(count));
  for (let offset = span - 1; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    });
  }
  return buckets;
}

function trendWindow(range) {
  if (range === 'week') return { buckets: lastNDayBuckets(7), byMonth: false };
  if (range === 'thisMonth') {
    const today = new Date();
    return { buckets: lastNDayBuckets(today.getDate()), byMonth: false };
  }
  if (range === 'threeMonths') return { buckets: lastNMonthBuckets(3), byMonth: true };
  if (range === 'sixMonths') return { buckets: lastNMonthBuckets(6), byMonth: true };
  if (range === 'year') return { buckets: lastNMonthBuckets(12), byMonth: true };
  return { buckets: lastNDayBuckets(CHART_TREND_DAYS), byMonth: false };
}

async function analyticsSummary() {
  const [
    clients,
    driversAll,
    driversVerified,
    driversPending,
    driversNotVerified,
    statusGroups,
    completed,
  ] = await Promise.all([
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'driver' }),
    User.countDocuments({
      role: 'driver',
      $or: [{ isVerified: true }, { verificationStatus: 'approved' }],
    }),
    User.countDocuments({ role: 'driver', verificationStatus: 'pending' }),
    User.countDocuments({ role: 'driver', verificationStatus: { $in: ['none', 'rejected'] } }),
    TransportOrder.aggregate([
      {
        $group: {
          _id: { status: '$status', paymentStatus: { $ifNull: ['$paymentStatus', 'unpaid'] } },
          count: { $sum: 1 },
        },
      },
    ]),
    TransportOrder.find({ status: { $in: COMPLETED_ORDER_STATUSES } })
      .select('price driverEarnings platformCommission')
      .lean(),
  ]);

  const orders = {
    all: 0,
    pending_payment: 0,
    pending_driver: 0,
    accepted: 0,
    on_the_way: 0,
    picked_up: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of statusGroups) {
    const status = String(row._id?.status ?? '').toLowerCase();
    const payment = String(row._id?.paymentStatus ?? 'unpaid').toLowerCase();
    const count = row.count || 0;
    orders.all += count;
    if (status === 'cancelled' || status === 'canceled') orders.cancelled += count;
    else if (status === 'pending') {
      if (payment === 'authorized' || payment === 'captured') orders.pending_driver += count;
      else orders.pending_payment += count;
    } else if (status === 'accepted') orders.accepted += count;
    else if (status === 'driver_is_on_the_way') orders.on_the_way += count;
    else if (status === 'picked_up' || status === 'in_progress' || status === 'delivery_in_progress') {
      orders.picked_up += count;
    } else if (status === 'delivered' || status === 'completed') orders.delivered += count;
  }

  let grossTurnover = 0;
  let platformRevenue = 0;
  let driverEarnings = 0;
  for (const order of completed) {
    const price = Number(order.price) || 0;
    grossTurnover += price;
    const stored = Number(order.driverEarnings) > 0 || Number(order.platformCommission) > 0;
    if (stored) {
      platformRevenue += Number(order.platformCommission) || 0;
      driverEarnings += Number(order.driverEarnings) || 0;
    } else {
      const split = computeOrderCommission(price);
      platformRevenue += split.platformCommission;
      driverEarnings += split.driverEarnings;
    }
  }

  return {
    clients,
    drivers: {
      all: driversAll,
      verified: driversVerified,
      not_verified: driversNotVerified,
      pending: driversPending,
    },
    orders,
    ledger: {
      grossTurnover: Math.round(grossTurnover * 100) / 100,
      platformRevenue: Math.round(platformRevenue * 100) / 100,
      driverEarnings: Math.round(driverEarnings * 100) / 100,
      completedCount: completed.length,
    },
  };
}

/**
 * GET /api/admin/analytics — chart buckets plus counts. Does not return order documents.
 */
async function getAnalytics(req, res, next) {
  try {
    const { buckets, byMonth } = trendWindow(String(req.query.range || 'month'));
    const oldest = buckets[0]?.key;
    const rangeStart = byMonth
      ? new Date(`${oldest}-01T00:00:00`)
      : new Date(`${oldest}T00:00:00`);

    const recentOrders = await TransportOrder.find({ createdAt: { $gte: rangeStart } })
      .select('createdAt price')
      .lean();

    const ordersByBucket = Object.fromEntries(buckets.map((b) => [b.key, 0]));
    const revenueByBucket = Object.fromEntries(buckets.map((b) => [b.key, 0]));
    for (const o of recentOrders) {
      const created = new Date(o.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      const key = byMonth
        ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
        : localDateKey(created);
      if (!(key in ordersByBucket)) continue;
      ordersByBucket[key]++;
      revenueByBucket[key] += Number(o.price) || 0;
    }

    const districtAgg = await TransportOrder.aggregate([
      { $match: { pickupDistrict: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$pickupDistrict', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const driverAgg = await TransportOrder.aggregate([
      { $match: { status: { $in: COMPLETED_ORDER_STATUSES }, driverId: { $ne: null } } },
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
        labels: buckets.map((b) => b.label),
        orders: buckets.map((b) => ordersByBucket[b.key] ?? 0),
        revenue: buckets.map((b) => Math.round((revenueByBucket[b.key] ?? 0) * 100) / 100),
      },
      districts: {
        labels: districtAgg.map((r) => String(r._id)),
        counts: districtAgg.map((r) => r.count),
      },
      topDrivers: {
        labels: driverLabels,
        trips: driverAgg.map((r) => r.trips),
      },
      summary: await analyticsSummary(),
    });
  } catch (err) {
    next(err);
  }
}

exports.getOverview = getOverview;
exports.getCustomerDirectory = getCustomerDirectory;
exports.getDriverDirectory = getDriverDirectory;
exports.getOrderDirectory = getOrderDirectory;
exports.getAnalytics = getAnalytics;
exports.getPendingVerifications = getPendingVerifications;
exports.verifyUser = verifyUser;
exports.getDriverDocument = getDriverDocument;
exports.getAdminOrderDetail = getAdminOrderDetail;
exports.setCustomerSuspension = setCustomerSuspension;
exports.impersonateUser = impersonateUser;
exports.redeemImpersonation = redeemImpersonation;

/** POST /api/admin/impersonate/:id — returns a one-time code, not a login token. */
async function impersonateUser(req, res, next) {
  try {
    const userId = toObjectId(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Invalid account id' });
    }
    const user = await User.findById(userId);
    if (!user || (user.role !== 'customer' && user.role !== 'driver')) {
      return res.status(404).json({ message: 'Account not found' });
    }
    if (String(user._id) === String(req.user?.userId)) {
      return res.status(400).json({ message: 'You are already signed in as this account' });
    }
    if (user.isSuspended) {
      return res.status(400).json({
        message: 'This account is suspended. Unsuspend it before signing in as this user.',
      });
    }
    const code = await createImpersonationGrant({ adminId: req.user.userId, user });
    console.log(`[admin] impersonate admin=${req.user?.userId ?? 'unknown'} target=${user._id} role=${user.role}`);
    return res.json({ code, role: user.role });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/admin/impersonate/redeem — exchanges a one-time code for an 8-hour session. */
async function redeemImpersonation(req, res, next) {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code) {
      return res.status(400).json({ message: 'A sign-in code is required' });
    }
    const session = await redeemImpersonationGrant({ adminId: req.user.userId, code });
    if (!session) {
      return res.status(400).json({ message: 'This sign-in link has expired. Click Impersonate again.' });
    }
    return res.json({ message: 'Signed in', token: session.token, user: session.user });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/admin/customers/:id/suspension
 * Body: { suspended: boolean }
 * Suspended customers and drivers cannot sign in.
 */
async function setCustomerSuspension(req, res, next) {
  try {
    const userId = toObjectId(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }
    const user = await User.findById(userId);
    if (!user || (user.role !== 'customer' && user.role !== 'driver')) {
      return res.status(404).json({ message: 'Account not found' });
    }
    user.isSuspended = req.body?.suspended === true;
    await user.save();
    return res.json({ success: true, user: shapeDriverForAdmin(user) });
  } catch (err) {
    next(err);
  }
}
