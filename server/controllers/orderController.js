const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const TransportOrder = require('../models/TransportOrder');
const Message = require('../models/Message');
const Review = require('../models/Review');
const User = require('../models/User');
const { sendOrderConfirmation, sendDriverAcceptedEmail, sendOrderCompletedEmail, sendPaymentCapturedEmail } = require('../services/notificationService');
const {
  sendOrderAcceptedPush,
  sendStartTripPush,
  sendRatingRequestPush,
  sendNewOrderToDriversPush,
} = require('../services/pushNotificationService');
const {
  normalizedDriverDistricts,
  isValidCyprusDistrict,
  canonicalCyprusDistrict,
} = require('../constants/cyprusDistricts');
const { derivePickupDistrictFromLocation } = require('../services/mapsService');
const {
  emitNewOrderAvailable,
  emitToUser,
  emitToAdmins,
  orderPayloadForEmit,
} = require('../services/realtimeService');
const { activeFcmTokens, logFcmDebug } = require('../utils/fcmTokens');
const { strictMongoObjectIdString } = require('../utils/objectId');
const {
  ORDER_VEHICLE_TYPES,
  parseCargoInventory,
  cargoInventoryScore,
  vehicleTypeFromScore,
} = require('../utils/orderCargoScoring');
const {
  buildVehicleFilterForDriver,
  driverCanFulfillOrderVehicle,
} = require('../utils/driverVehicleMatching');
const { calculateOrderPrice, pricesMatch } = require('../utils/orderPricing');
const { applyCompletionCommission } = require('../utils/orderCommission');
const {
  ensurePaymentIntentForOrder,
  captureForOrderAccept,
  refundCaptureAfterFailedAccept,
  cancelPaymentForOrder,
  creditBalancesOnDelivery,
} = require('../services/paymentService');

/** Realtime: delivery started (status → picked_up / in-transit). Same payload shape as order_updated. */
function emitStartDelivery(io, payload, customerId, driverId) {
  if (!io || !payload) return;
  const did = driverId?.toString?.() ?? driverId;
  if (customerId) emitToUser(io, customerId, 'start_delivery', payload);
  if (did) emitToUser(io, did, 'start_delivery', payload);
}

/** Safely convert string id to MongoDB ObjectId. */
function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

/** Mark order delivered, persist commission split, and credit internal wallet balances. */
async function finalizeOrderDelivery(order) {
  order.status = 'delivered';
  applyCompletionCommission(order);
  await creditBalancesOnDelivery(order);
}

/** Validate pickup/dropoff location object; returns error string or null. */
function validateLocation(loc, name) {
  if (!loc || typeof loc !== 'object') return `${name} is required`;
  if (!loc.address || typeof loc.address !== 'string' || !loc.address.trim()) {
    return `${name}.address is required`;
  }
  if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return `${name} must have valid lat and lng numbers`;
  }
  return null;
}

/** Normalize FCM token strings from a User doc or populated ref (non-empty, length > 10). */
function fcmTokensFromUserLike(ref) {
  if (!ref || typeof ref !== 'object') return [];
  return activeFcmTokens(ref.fcmTokens);
}

function customerUserIdForPush(ctx, orderDoc) {
  if (ctx.customerUser?._id != null) return String(ctx.customerUser._id);
  const c = orderDoc.customerId?._id ?? orderDoc.customerId;
  return c != null ? String(c) : undefined;
}

/**
 * Load latest client + driver (fcmTokens, email, names) before sending pushes.
 * Merges tokens from populated `orderDoc` + fresh DB read so pushes always see tokens
 * registered after the order was loaded (Angular often registers FCM post-login).
 */
async function loadUsersForOrderNotifications(orderDoc) {
  const cid = orderDoc.customerId?._id ?? orderDoc.customerId;
  const did = orderDoc.driverId?._id ?? orderDoc.driverId;
  const cidStr = cid != null ? strictMongoObjectIdString(cid) : null;
  const didStr = did != null ? strictMongoObjectIdString(did) : null;

  const [customerUser, driverUser] = await Promise.all([
    cidStr ? User.findById(cidStr).select('email firstName lastName fcmTokens').lean() : null,
    didStr ? User.findById(didStr).select('email firstName lastName fcmTokens').lean() : null,
  ]);

  const fromPopCustomer = fcmTokensFromUserLike(
    typeof orderDoc.customerId === 'object' && orderDoc.customerId ? orderDoc.customerId : null
  );
  const fromPopDriver = fcmTokensFromUserLike(
    typeof orderDoc.driverId === 'object' && orderDoc.driverId ? orderDoc.driverId : null
  );
  const fromDbCustomer = fcmTokensFromUserLike(customerUser);
  const fromDbDriver = fcmTokensFromUserLike(driverUser);

  const customerFcm = [...new Set([...fromPopCustomer, ...fromDbCustomer])];
  const driverFcm = [...new Set([...fromPopDriver, ...fromDbDriver])];

  console.log(
    `[Notifications] loadUsersForOrderNotifications orderId=${String(orderDoc._id)} customerId=${cidStr ?? 'none'} customerFcm=${customerFcm.length} (pop=${fromPopCustomer.length} db=${fromDbCustomer.length}) driverId=${didStr ?? 'none'} driverFcm=${driverFcm.length} (pop=${fromPopDriver.length} db=${fromDbDriver.length})`
  );

  if (cidStr && customerUser) {
    logFcmDebug(cidStr, customerUser.fcmTokens || [], customerFcm);
  }
  if (didStr && driverUser) {
    logFcmDebug(didStr, driverUser.fcmTokens || [], driverFcm);
  }

  return {
    customerUser: customerUser || null,
    driverUser: driverUser || null,
    customerFcm,
    driverFcm,
  };
}

function driverFirstLastName(driverUser) {
  if (!driverUser) return 'Your driver';
  const n = [driverUser.firstName, driverUser.lastName].filter(Boolean).join(' ').trim();
  return n || 'Your driver';
}

/** Driver display name for customer messages, or null if unknown (use generic sentence). */
function driverNameForCustomer(driverUser) {
  if (!driverUser) return null;
  const n = [driverUser.firstName, driverUser.lastName].filter(Boolean).join(' ').trim();
  return n || null;
}

function etherealPreviewFromMailInfo(info) {
  if (!info) return null;
  return nodemailer.getTestMessageUrl(info) || null;
}

/**
 * Awaitable runners (used by HTTP handlers + full-flow test). Same side effects as production.
 */
async function runDriverAcceptedNotifications(orderDoc) {
  const orderId = String(orderDoc._id || '');
  const out = {
    orderId,
    emailSent: false,
    emailPreviewUrl: null,
    pushMessageId: null,
    pushSkippedReason: null,
    errors: [],
  };
  let ctx;
  try {
    ctx = await loadUsersForOrderNotifications(orderDoc);
  } catch (err) {
    out.errors.push({ phase: 'loadUsers', message: err.message });
    console.warn(`[Automation] Failed to load users for notifications for Order ${orderId}:`, err.message);
    return out;
  }

  const name = driverNameForCustomer(ctx.driverUser);

  if (ctx.customerUser?.email) {
    try {
      const info = await sendDriverAcceptedEmail(orderDoc, ctx.customerUser, ctx.driverUser, 'Not provided');
      out.emailSent = true;
      out.emailPreviewUrl = etherealPreviewFromMailInfo(info);
      console.log(`[Automation] Sent email (order-accepted) notification for Order ${orderId}`);
    } catch (err) {
      out.errors.push({ phase: 'email', message: err.message });
      console.warn(`[Automation] Email (order-accepted) failed for Order ${orderId}:`, err.message);
    }

    try {
      await sendPaymentCapturedEmail({
        to: ctx.customerUser.email,
        firstName: ctx.customerUser.firstName,
        orderId,
        amount: Number(orderDoc.price ?? 0),
        driverName: name,
      });
      console.log(`[Automation] Sent email (payment-captured) notification for Order ${orderId}`);
    } catch (err) {
      out.errors.push({ phase: 'paymentCapturedEmail', message: err.message });
      console.warn(`[Automation] Email (payment-captured) failed for Order ${orderId}:`, err.message);
    }
  }

  if (ctx.customerFcm.length) {
    try {
      out.pushMessageId = await sendOrderAcceptedPush({
        customerFcmToken: ctx.customerFcm,
        driverName: name,
        orderId,
        customerUserId: customerUserIdForPush(ctx, orderDoc),
      });
      if (out.pushMessageId) {
        console.log(`[Automation] Sent push (order-accepted) notification for Order ${orderId}`);
      } else {
        out.pushSkippedReason = 'sendPush returned null (invalid token, push disabled, or admin toggle off)';
        console.warn(`[Automation] Push (order-accepted) not delivered for Order ${orderId}`);
      }
    } catch (err) {
      out.errors.push({ phase: 'push', message: err.message });
      console.warn(`[Automation] Push (order-accepted) failed for Order ${orderId}:`, err.message);
    }
  } else {
    out.pushSkippedReason = 'no client fcmTokens';
    const cid = orderDoc.customerId?._id ?? orderDoc.customerId;
    console.warn(
      `[Automation] Skipped push (order-accepted): no customer fcmTokens for Order ${orderId} customerId=${cid != null ? String(cid) : 'none'}`
    );
  }
  return out;
}

async function runInTransitNotifications(orderDoc) {
  const orderId = String(orderDoc._id || '');
  const out = {
    orderId,
    pushMessageId: null,
    pushSkippedReason: null,
    errors: [],
  };
  let ctx;
  try {
    ctx = await loadUsersForOrderNotifications(orderDoc);
  } catch (err) {
    out.errors.push({ phase: 'loadUsers', message: err.message });
    console.warn(`[Automation] Failed to load users for notifications for Order ${orderId}:`, err.message);
    return out;
  }

  const name = driverNameForCustomer(ctx.driverUser);

  if (ctx.customerFcm.length) {
    try {
      out.pushMessageId = await sendStartTripPush({
        customerFcmToken: ctx.customerFcm,
        driverName: name,
        orderId,
        customerUserId: customerUserIdForPush(ctx, orderDoc),
      });
      if (out.pushMessageId) {
        console.log(`[Automation] Sent push (in-transit) notification for Order ${orderId}`);
      } else {
        out.pushSkippedReason = 'sendPush returned null (invalid token or push disabled)';
      }
    } catch (err) {
      out.errors.push({ phase: 'push', message: err.message });
      console.warn(`[Automation] Push (in-transit) failed for Order ${orderId}:`, err.message);
    }
  } else {
    out.pushSkippedReason = 'no client fcmTokens';
    const cid = orderDoc.customerId?._id ?? orderDoc.customerId;
    console.warn(
      `[Automation] Skipped push (in-transit): no customer fcmTokens for Order ${orderId} customerId=${cid != null ? String(cid) : 'none'}`
    );
  }
  return out;
}

async function runOrderCompletedNotifications(orderDoc) {
  const orderId = String(orderDoc._id || '');
  const out = {
    orderId,
    emailSent: false,
    emailPreviewUrl: null,
    pushMessageId: null,
    pushSkippedReason: null,
    errors: [],
  };
  let ctx;
  try {
    ctx = await loadUsersForOrderNotifications(orderDoc);
  } catch (err) {
    out.errors.push({ phase: 'loadUsers', message: err.message });
    console.warn(`[Automation] Failed to load users for notifications for Order ${orderId}:`, err.message);
    return out;
  }

  if (ctx.customerUser?.email) {
    try {
      const info = await sendOrderCompletedEmail(orderDoc, ctx.customerUser);
      out.emailSent = true;
      out.emailPreviewUrl = etherealPreviewFromMailInfo(info);
      console.log(`[Automation] Sent email (order-completed) notification for Order ${orderId}`);
    } catch (err) {
      out.errors.push({ phase: 'email', message: err.message });
      console.warn(`[Automation] Email (order-completed) failed for Order ${orderId}:`, err.message);
    }
  }

  if (ctx.customerFcm.length) {
    try {
      out.pushMessageId = await sendRatingRequestPush({
        customerFcmToken: ctx.customerFcm,
        orderId,
        customerUserId: customerUserIdForPush(ctx, orderDoc),
      });
      if (out.pushMessageId) {
        console.log(`[Automation] Sent push (order-completed) notification for Order ${orderId}`);
      } else {
        out.pushSkippedReason = 'sendPush returned null (invalid token or push disabled)';
      }
    } catch (err) {
      out.errors.push({ phase: 'push', message: err.message });
      console.warn(`[Automation] Push (order-completed) failed for Order ${orderId}:`, err.message);
    }
  } else {
    out.pushSkippedReason = 'no client fcmTokens';
    const cid = orderDoc.customerId?._id ?? orderDoc.customerId;
    console.warn(
      `[Automation] Skipped push (order-completed): no customer fcmTokens for Order ${orderId} customerId=${cid != null ? String(cid) : 'none'}`
    );
  }
  return out;
}

function notifyOrderCompleted(orderDoc) {
  void runOrderCompletedNotifications(orderDoc).catch((err) => {
    console.warn('[Notifications] notifyOrderCompleted unexpected:', err.message);
  });
}

function notifyInTransit(orderDoc) {
  void runInTransitNotifications(orderDoc).catch((err) => {
    console.warn('[Notifications] notifyInTransit unexpected:', err.message);
  });
}

function notifyDriverAccepted(orderDoc) {
  void runDriverAcceptedNotifications(orderDoc).catch((err) => {
    console.warn('[Notifications] notifyDriverAccepted unexpected:', err.message);
  });
}

/**
 * POST /api/orders - Create a new transport order (customer).
 * Body: { pickupLocation, dropoffLocation, pickupDistrict, price, distanceKm?, insuranceStatus?, scheduledAt?, cargoInventory, vehicleType, pickupFloor, destinationFloor, hasElevator, laborRequired, smallBoxes?, mediumBoxes?, largeBoxes? }
 * cargoInventory required with non-negative integer counts; total items must be > 0.
 * vehicleType must match the score-derived tier (pickup | minivan | van | truck).
 */
async function createOrder(req, res, next) {
  try {
    const {
      pickupLocation,
      dropoffLocation,
      pickupDistrict,
      price,
      distanceKm,
      insuranceStatus,
      scheduledAt,
      smallBoxes,
      mediumBoxes,
      largeBoxes,
      cargoInventory: cargoInventoryRaw,
      vehicleType,
      pickupFloor,
      destinationFloor,
      hasElevator,
      laborRequired,
    } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const customerId = toObjectId(userId);

    const pickupErr = validateLocation(pickupLocation, 'pickupLocation');
    if (pickupErr) return res.status(400).json({ message: pickupErr });

    const dropoffErr = validateLocation(dropoffLocation, 'dropoffLocation');
    if (dropoffErr) return res.status(400).json({ message: dropoffErr });

    if (price == null || typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: 'Valid price is required' });
    }
    if (distanceKm == null || typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) {
      return res.status(400).json({ message: 'distanceKm is required and must be a non-negative number' });
    }

    const cargoInventory = parseCargoInventory(cargoInventoryRaw);
    if (!cargoInventory) {
      return res.status(400).json({
        message:
          'cargoInventory is required with non-negative integer fields: boxes, mediumItems, largeFurniture, heavyAppliances',
      });
    }
    const inventoryTotal =
      cargoInventory.boxes +
      cargoInventory.mediumItems +
      cargoInventory.largeFurniture +
      cargoInventory.heavyAppliances;
    if (inventoryTotal <= 0) {
      return res.status(400).json({ message: 'At least one cargo item is required.' });
    }

    const score = cargoInventoryScore(cargoInventory);
    const expectedVehicleType = vehicleTypeFromScore(score);
    const vt = typeof vehicleType === 'string' ? vehicleType.trim() : '';
    if (!vt || !ORDER_VEHICLE_TYPES.has(vt)) {
      return res.status(400).json({
        message: 'vehicleType must be pickup, minivan, van, or truck',
      });
    }
    if (vt !== expectedVehicleType) {
      return res.status(400).json({
        message: `vehicleType must be ${expectedVehicleType} for the selected cargo (score ${score})`,
      });
    }

    /** Legacy box columns — derived from inventory for emails and older UIs. */
    const s = cargoInventory.boxes;
    const m = cargoInventory.mediumItems;
    const l = cargoInventory.largeFurniture + cargoInventory.heavyAppliances;

    const rawDistrict = typeof pickupDistrict === 'string' ? pickupDistrict.trim() : '';
    const clientCanonical = rawDistrict ? canonicalCyprusDistrict(rawDistrict) : null;

    let district = null;
    if (clientCanonical) {
      district = clientCanonical;
    } else if (rawDistrict !== '') {
      return res.status(400).json({
        message: `pickupDistrict must be one of: Nicosia, Limassol, Larnaca, Paphos, Famagusta (or omit to derive from location)`,
      });
    } else {
      try {
        const derived = await derivePickupDistrictFromLocation({
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          address: pickupLocation.address,
        });
        if (derived && isValidCyprusDistrict(derived)) {
          district = derived;
        } else {
          console.warn(
            '[createOrder] pickupDistrict omitted and geocoding did not resolve a district; order will be saved without pickupDistrict.',
          );
        }
      } catch (geoErr) {
        console.warn('[createOrder] Geocoding error (non-fatal):', geoErr?.message || geoErr);
      }
    }

    const orderData = {
      customerId,
      pickupLocation: {
        address: pickupLocation.address.trim(),
        lat: pickupLocation.lat,
        lng: pickupLocation.lng,
      },
      dropoffLocation: {
        address: dropoffLocation.address.trim(),
        lat: dropoffLocation.lat,
        lng: dropoffLocation.lng,
      },
      price,
      distanceKm,
      insuranceStatus: Boolean(insuranceStatus),
      smallBoxes: s,
      mediumBoxes: m,
      largeBoxes: l,
    };
    if (scheduledAt != null && scheduledAt !== '') {
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ message: 'scheduledAt must be a valid date and time' });
      }
      const minFuture = Date.now() + 60 * 60 * 1000;
      if (date.getTime() < minFuture) {
        return res.status(400).json({ message: 'Scheduled time must be at least 1 hour in the future' });
      }
      orderData.scheduledAt = date;
    }

    if (district && isValidCyprusDistrict(district)) {
      orderData.pickupDistrict = district;
    }

    const LOGISTICS_FLOORS = new Set(['0', '1', '2', '3', '4']);
    const LOGISTICS_LABOR = new Set(['none', 'driver', 'driver_plus_helper']);

    if (pickupFloor == null || !LOGISTICS_FLOORS.has(String(pickupFloor))) {
      return res.status(400).json({ message: 'pickupFloor must be 0, 1, 2, 3, or 4' });
    }
    if (destinationFloor == null || !LOGISTICS_FLOORS.has(String(destinationFloor))) {
      return res.status(400).json({ message: 'destinationFloor must be 0, 1, 2, 3, or 4' });
    }
    if (hasElevator == null || typeof hasElevator !== 'boolean') {
      return res.status(400).json({ message: 'hasElevator must be a boolean' });
    }
    if (!laborRequired || !LOGISTICS_LABOR.has(laborRequired)) {
      return res.status(400).json({ message: 'laborRequired must be none, driver, or driver_plus_helper' });
    }

    orderData.vehicleType = vt;
    orderData.cargoInventory = cargoInventory;
    orderData.inventory = cargoInventory;
    orderData.smallBoxes = s;
    orderData.mediumBoxes = m;
    orderData.largeBoxes = l;
    orderData.pickupFloor = String(pickupFloor);
    orderData.destinationFloor = String(destinationFloor);
    orderData.hasElevator = Boolean(hasElevator);
    orderData.laborRequired = laborRequired;

    const serverPricing = calculateOrderPrice({
      vehicleType: vt,
      distanceKm,
      pickupFloor,
      destinationFloor,
      hasElevator,
      laborRequired,
    });
    if (!pricesMatch(price, serverPricing.total)) {
      return res.status(400).json({
        message: `Price mismatch: expected €${serverPricing.total.toFixed(2)} (received €${Number(price).toFixed(2)})`,
      });
    }
    orderData.price = serverPricing.total;
    orderData.distanceKm = serverPricing.distanceKm;

    const order = await TransportOrder.create(orderData);
    await ensurePaymentIntentForOrder(order);

    const populated = await TransportOrder.findById(order._id).populate('customerId', 'firstName lastName phoneNumber email fcmTokens');
    const customer = populated?.customerId && typeof populated.customerId === 'object' ? populated.customerId : null;
    if (customer?.email) {
      sendOrderConfirmation({
        to: customer.email,
        firstName: customer.firstName || 'Customer',
        orderId: String(populated._id),
        pickupAddress: populated.pickupLocation?.address || '',
        dropoffAddress: populated.dropoffLocation?.address || '',
        smallBoxes: populated.smallBoxes || 0,
        mediumBoxes: populated.mediumBoxes || 0,
        largeBoxes: populated.largeBoxes || 0,
        price: populated.price || 0,
      })
        .then(() => {
          console.log(`[Notifications] order confirmation email queued for orderId=${populated._id} email=${customer.email}`);
        })
        .catch((emailErr) => {
        console.error('Order confirmation email failed:', emailErr.message);
      });
    }

    const io = req.app.get('io');
    const districtForEvents = populated.pickupDistrict || district || '';
    if (io) {
      await emitNewOrderAvailable(io, districtForEvents, populated);
      emitToAdmins(io, 'order_updated', orderPayloadForEmit(populated));
    }

    // Push: verified drivers whose districts + vehicle tier match this order only.
    sendNewOrderToDriversPush({
      orderId: String(populated._id),
      district: districtForEvents,
      vehicleType: populated.vehicleType,
    }).catch((err) =>
      console.warn('[Push] sendNewOrderToDriversPush failed:', err.message)
    );

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/orders - Pending unassigned orders.
 * Drivers: scoped by districts AND strict vehicleType matching against their profile tier.
 */
async function getOrders(req, res, next) {
  try {
    const role = req.user?.role;
    if (role !== 'driver' && role !== 'admin') {
      return res.status(403).json({ message: 'Only drivers can list available orders' });
    }
    const query = { status: 'pending', driverId: null };

    if (role === 'driver') {
      const userId = req.user?.userId ?? req.user?._id;
      const me = await User.findById(userId).select('isVerified districts district vehicleType').lean();
      if (me?.isVerified !== true) {
        return res.status(403).json({ message: 'Driver not verified' });
      }
      const scope = normalizedDriverDistricts(me);
      if (scope.length > 0) {
        query.pickupDistrict = { $in: scope };
      }
      Object.assign(query, buildVehicleFilterForDriver(me?.vehicleType));
    }

    const total = await TransportOrder.countDocuments(query);

    const limitRaw =
      req.query.limit != null && req.query.limit !== '' ? Number.parseInt(String(req.query.limit), 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : null;
    const offsetRaw =
      req.query.offset != null && req.query.offset !== '' ? Number.parseInt(String(req.query.offset), 10) : 0;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    let listQuery = TransportOrder.find(query)
      .populate('customerId', 'firstName lastName phoneNumber')
      .sort({ createdAt: -1 });

    if (limit != null) {
      listQuery = listQuery.skip(offset).limit(limit);
    }

    const orders = await listQuery.lean();

    if (limit != null) {
      return res.json({ orders, total });
    }
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/orders/:id - Update order status by driver.
 * Body: { status: 'accepted' | 'picked_up' | 'delivered' }.
 * Backwards compatible with legacy names: 'in_progress' (-> picked_up), 'completed' (-> delivered).
 */
async function updateOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const driverId = req.user?.userId ?? req.user?._id;

    const allowed = ['accepted', 'picked_up', 'delivered', 'in_progress', 'completed', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${allowed.join(', ')}`,
      });
    }

    if (status === 'accepted') {
      if (req.user?.role !== 'driver') {
        return res.status(403).json({ message: 'Only drivers can accept orders' });
      }
      const driverUser = await User.findById(driverId)
        .select('isVerified districts district vehicleType')
        .lean();
      if (driverUser?.isVerified !== true) {
        return res.status(403).json({ message: 'Driver not verified' });
      }

      const preOrder = await TransportOrder.findById(id)
        .select('pickupDistrict vehicleType status driverId customerId')
        .lean();
      if (!preOrder) return res.status(404).json({ message: 'Order not found' });
      if (preOrder.status !== 'pending' || preOrder.driverId) {
        return res.status(409).json({ message: 'Order no longer available.' });
      }

      const scope = normalizedDriverDistricts(driverUser);
      if (scope.length > 0) {
        if (!preOrder.pickupDistrict) {
          return res.status(403).json({
            message: 'This order has no pickup district; only drivers with no district filter can accept it.',
          });
        }
        if (!scope.includes(preOrder.pickupDistrict)) {
          return res.status(403).json({ message: 'You can only accept jobs in your selected districts.' });
        }
      }
      if (!driverCanFulfillOrderVehicle(driverUser?.vehicleType, preOrder.vehicleType)) {
        return res.status(403).json({
          message: 'Your vehicle type cannot fulfill this order tier.',
        });
      }

      const captureResult = await captureForOrderAccept(id);
      if (!captureResult.ok) {
        return res.status(captureResult.status).json({ message: captureResult.message });
      }

      const atomicFilter = {
        _id: id,
        status: 'pending',
        driverId: null,
        ...buildVehicleFilterForDriver(driverUser?.vehicleType),
      };
      if (scope.length > 0 && preOrder.pickupDistrict) {
        atomicFilter.pickupDistrict = preOrder.pickupDistrict;
      }

      const acceptedOrder = await TransportOrder.findOneAndUpdate(
        atomicFilter,
        {
          $set: {
            driverId: toObjectId(driverId),
            status: 'accepted',
            acceptedAt: new Date(),
          },
        },
        { new: true },
      )
        .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
        .populate('driverId', 'firstName lastName phoneNumber email fcmTokens');

      if (!acceptedOrder) {
        await refundCaptureAfterFailedAccept(id);
        return res.status(409).json({ message: 'Order no longer available.' });
      }

      const io = req.app.get('io');
      const customerId =
        acceptedOrder.customerId?._id?.toString?.() ??
        acceptedOrder.customerId?.toString?.() ??
        acceptedOrder.customerId;
      const payload = orderPayloadForEmit(acceptedOrder);
      if (io) {
        emitToAdmins(io, 'order_updated', payload);
        if (acceptedOrder.driverId) emitToUser(io, acceptedOrder.driverId, 'order_updated', payload);
        if (customerId) {
          emitToUser(io, customerId, 'order_updated', payload);
          emitToUser(io, customerId, 'order_accepted', payload);
          emitToUser(io, customerId, 'order_status_changed', payload);
        }
      }
      notifyDriverAccepted(acceptedOrder);
      return res.json(acceptedOrder);
    }

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (status === 'in_progress' || status === 'picked_up') {
      if (order.driverId?.toString() !== driverId) {
        return res.status(403).json({ message: 'Only the assigned driver can update this order' });
      }
      if (order.status !== 'accepted') {
        return res.status(400).json({ message: 'Order must be accepted before starting the trip' });
      }
      order.status = 'driver_is_on_the_way';
    } else if (status === 'completed' || status === 'delivered') {
      if (order.driverId?.toString() !== driverId) {
        return res.status(403).json({ message: 'Only the assigned driver can complete this order' });
      }
      if (!['accepted', 'picked_up', 'driver_is_on_the_way'].includes(order.status)) {
        return res.status(400).json({ message: 'Order cannot be completed from current status' });
      }
      await finalizeOrderDelivery(order);
    } else if (status === 'cancelled') {
      const customerId = order.customerId?.toString?.() ?? String(order.customerId ?? '');
      if (customerId !== driverId) {
        return res.status(403).json({ message: 'Only the order customer can cancel this order' });
      }
      if (order.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending orders can be cancelled' });
      }
      order.status = 'cancelled';
      await cancelPaymentForOrder(order._id);
    }

    await order.save();
    const updated = await TransportOrder.findById(order._id)
    .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
    .populate('driverId', 'firstName lastName phoneNumber email fcmTokens');

    const io = req.app.get('io');
    const customerId = order.customerId?.toString?.() ?? order.customerId;
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      if (customerId) emitToUser(io, customerId, 'order_updated', payload);
      if (status === 'accepted' && customerId) {
        emitToUser(io, customerId, 'order_accepted', payload);
      }
      if ((status === 'completed' || status === 'delivered') && customerId) {
        emitToUser(io, customerId, 'order_completed', payload);
      }

      // Unified status lifecycle updates for Customer UI.
      if (
        customerId &&
        ['accepted', 'picked_up', 'driver_is_on_the_way', 'delivered'].includes(updated?.status)
      ) {
        emitToUser(io, customerId, 'order_status_changed', payload);
      }
      if (status === 'in_progress' || status === 'picked_up') {
        emitStartDelivery(io, payload, customerId, order.driverId);
      }
    }

    if (status === 'accepted') {
      notifyDriverAccepted(updated);
    }
    if (status === 'in_progress' || status === 'picked_up') {
      notifyInTransit(updated);
    }
    if (status === 'completed' || status === 'delivered') {
      notifyOrderCompleted(updated);
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/orders/mine - Get orders for the current user (as customer or driver).
 * Always returns `{ orders: [...], total }` where `total` matches the filtered count (before limit).
 *
 * Query:
 * - `view=summary` — lean projection (drops heavy/unused fields like `remindersSent` bulk array).
 * - `limit` + `offset` — pagination (`limit` max 100).
 * - `scope=completed` — only `delivered` + `cancelled` (same customer/driver filter).
 * - `scope=active` — exclude terminal statuses (useful for driver tooling); default omits scope (all orders).
 */
async function getMyOrders(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userRoleFilter = {
      $or: [{ customerId: userObjectId }, { driverId: userObjectId }],
    };

    /** `scope=completed` / `scope=active` — tab-specific lists (default: all orders). */
    const scope = req.query.scope;
    let baseFilter;
    if (scope === 'completed') {
      baseFilter = {
        $and: [userRoleFilter, { status: { $in: ['delivered', 'completed', 'cancelled', 'canceled'] } }],
      };
    } else if (scope === 'active') {
      baseFilter = {
        $and: [
          userRoleFilter,
          { status: { $nin: ['delivered', 'completed', 'cancelled', 'canceled'] } },
        ],
      };
    } else {
      baseFilter = userRoleFilter;
    }

    const total = await TransportOrder.countDocuments(baseFilter);

    const view = req.query.view === 'summary' ? 'summary' : 'full';
    const limitRaw =
      req.query.limit != null && req.query.limit !== '' ? Number.parseInt(String(req.query.limit), 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : null;
    const offsetRaw =
      req.query.offset != null && req.query.offset !== '' ? Number.parseInt(String(req.query.offset), 10) : 0;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    let query = TransportOrder.find(baseFilter).sort({ createdAt: -1 });

    if (view === 'summary') {
      query = query.select(
        '_id status price paymentStatus driverEarnings platformCommission commissionRate createdAt customerId driverId pickupLocation dropoffLocation pickupDistrict distanceKm insuranceStatus scheduledAt smallBoxes mediumBoxes largeBoxes cargoInventory cargoImageUrl rating review driverLocation vehicleType pickupFloor destinationFloor hasElevator laborRequired',
      );
    }

    if (limit != null) {
      query = query.skip(offset).limit(limit);
    }

    const orders = await query
      .populate('customerId', 'firstName lastName phoneNumber')
      .populate('driverId', 'firstName lastName phoneNumber averageRating totalReviews reviewCount')
      .lean();

    const orderIds = orders.map((o) => o._id).filter(Boolean);

    const reviewedOrderIds = new Set();
    if (orderIds.length > 0) {
      const revDocs = await Review.find({ orderId: { $in: orderIds } }).select('orderId').lean();
      for (const r of revDocs) {
        reviewedOrderIds.add(String(r.orderId));
      }
    }

    const unreadMap = new Map();
    if (orderIds.length > 0) {
      const agg = await Message.aggregate([
        {
          $match: {
            orderId: { $in: orderIds },
            receiverId: userObjectId,
            read: false,
          },
        },
        { $group: { _id: '$orderId', count: { $sum: 1 } } },
      ]);
      for (const row of agg) {
        unreadMap.set(String(row._id), row.count);
      }
    }

    const ordersWithUnread = orders.map((o) => {
      const driverRef = o.driverId && typeof o.driverId === 'object' ? o.driverId : null;
      const assignedDriverName = driverRef
        ? [driverRef.firstName, driverRef.lastName].filter(Boolean).join(' ').trim() || undefined
        : undefined;
      return {
        ...o,
        unreadCount: unreadMap.get(String(o._id)) ?? 0,
        hasReview: reviewedOrderIds.has(String(o._id)),
        submittedAt: o.createdAt,
        assignedDriverName,
      };
    });

    res.json({ orders: ordersWithUnread, total });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/:id/status - Driver updates status.
 * Body: { status: 'in-transit' | 'completed' }.
 * Maps to new lifecycle statuses:
 * - 'in-transit' -> 'driver_is_on_the_way'
 * - 'completed' -> 'delivered'
 */
async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status: requestedStatus } = req.body;
    const driverId = req.user?.userId ?? req.user?._id;
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers can update delivery status' });
    }
    if (!id) {
      return res.status(400).json({ message: 'Order ID is required in the URL (PATCH /api/orders/:id/status)' });
    }

    if (!requestedStatus || !['in-transit', 'completed'].includes(requestedStatus)) {
      return res.status(400).json({
        message: "status must be 'in-transit' or 'completed'",
      });
    }

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.driverId?.toString() !== driverId) {
      return res.status(403).json({ message: 'Only the assigned driver can update this order' });
    }

    const statusToSet = requestedStatus === 'in-transit' ? 'driver_is_on_the_way' : 'delivered';

    if (statusToSet === 'driver_is_on_the_way') {
      if (order.status !== 'accepted') {
        return res.status(400).json({ message: 'Order must be accepted before starting the trip' });
      }
      order.status = 'driver_is_on_the_way';
    } else {
      if (!['accepted', 'picked_up', 'driver_is_on_the_way'].includes(order.status)) {
        return res.status(400).json({ message: 'Order cannot be completed from current status' });
      }
      await finalizeOrderDelivery(order);
    }

    await order.save();
    const updated = await TransportOrder.findById(order._id)
    .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
    .populate('driverId', 'firstName lastName phoneNumber email fcmTokens');

    const io = req.app.get('io');
    const customerId = order.customerId?.toString?.() ?? order.customerId;
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      if (customerId) {
        emitToUser(io, customerId, 'order_updated', payload);
        if (statusToSet === 'delivered') emitToUser(io, customerId, 'order_completed', payload);
        emitToUser(io, customerId, 'order_status_changed', payload);
      }
      if (statusToSet === 'driver_is_on_the_way') {
        emitStartDelivery(io, payload, customerId, order.driverId);
      }
    }
    if (statusToSet === 'driver_is_on_the_way') notifyInTransit(updated);
    if (statusToSet === 'delivered') notifyOrderCompleted(updated);

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/:id/pickup - Mark order as picked up (driver only).
 */
async function pickupOrder(req, res, next) {
  try {
    const { id } = req.params;
    const driverId = req.user?.userId;
    if (!id) return res.status(400).json({ message: 'Order ID is required' });
    if (!driverId) return res.status(401).json({ message: 'User not authenticated' });

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.driverId?.toString() !== driverId) {
      return res.status(403).json({ message: 'Only the assigned driver can update this order' });
    }
    if (order.status !== 'accepted') {
      return res.status(400).json({ message: 'Order must be accepted before starting the trip' });
    }

    order.status = 'driver_is_on_the_way';
    await order.save();

    const updated = await TransportOrder.findById(order._id)
    .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
    .populate('driverId', 'firstName lastName phoneNumber email fcmTokens');

    const io = req.app.get('io');
    const customerId = order.customerId?.toString?.() ?? order.customerId;
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      if (customerId) {
        emitToUser(io, customerId, 'order_updated', payload);
        emitToUser(io, customerId, 'order_status_changed', payload);
      }
      emitStartDelivery(io, payload, customerId, order.driverId);
    }

    notifyInTransit(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/:id/deliver - Mark order as delivered (driver only).
 */
async function deliverOrder(req, res, next) {
  try {
    const { id } = req.params;
    const driverId = req.user?.userId;
    if (!id) return res.status(400).json({ message: 'Order ID is required' });
    if (!driverId) return res.status(401).json({ message: 'User not authenticated' });

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.driverId?.toString() !== driverId) {
      return res.status(403).json({ message: 'Only the assigned driver can update this order' });
    }
    if (!['accepted', 'picked_up', 'driver_is_on_the_way'].includes(order.status)) {
      return res.status(400).json({ message: 'Order cannot be delivered from current status' });
    }

    await finalizeOrderDelivery(order);
    await order.save();

    const updated = await TransportOrder.findById(order._id)
    .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
    .populate('driverId', 'firstName lastName phoneNumber email fcmTokens');

    const io = req.app.get('io');
    const customerId = order.customerId?.toString?.() ?? order.customerId;
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      if (customerId) {
        emitToUser(io, customerId, 'order_updated', payload);
        emitToUser(io, customerId, 'order_completed', payload);
        emitToUser(io, customerId, 'order_status_changed', payload);
      }
    }

    notifyOrderCompleted(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/:id/cancel - Customer cancels own pending order.
 */
async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!id) return res.status(400).json({ message: 'Order ID is required' });
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.customerId?.toString() !== userId) {
      return res.status(403).json({ message: 'Only the order customer can cancel this order' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }

    order.status = 'cancelled';
    await cancelPaymentForOrder(order._id);
    await order.save();

    const updated = await TransportOrder.findById(order._id)
      .populate('customerId', 'firstName lastName phoneNumber email')
      .populate('driverId', 'firstName lastName phoneNumber email');

    const io = req.app.get('io');
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      emitToUser(io, order.customerId, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
    }

    return res.json(updated);
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/orders/:id/complete - Mark order as completed (driver only).
 */
async function completeOrder(req, res, next) {
  try {
    const { id } = req.params;
    const driverId = req.user?.userId;
    if (!driverId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const order = await TransportOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.driverId?.toString() !== driverId) {
      return res.status(403).json({ message: 'Only the assigned driver can complete this order' });
    }
    if (!['accepted', 'picked_up', 'driver_is_on_the_way'].includes(order.status)) {
      return res
        .status(400)
        .json({ message: 'Order can only be completed from accepted or in-trip status' });
    }

    await finalizeOrderDelivery(order);
    await order.save();
    const updated = await TransportOrder.findById(order._id)
      .populate('customerId', 'firstName lastName phoneNumber email fcmTokens')
      .populate('driverId', 'firstName lastName phoneNumber email fcmTokens')
      .lean();

    const io = req.app.get('io');
    const customerId = order.customerId?.toString?.() ?? order.customerId;
    const payload = orderPayloadForEmit(updated);
    if (io) {
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      if (customerId) {
        emitToUser(io, customerId, 'order_completed', payload);
        emitToUser(io, customerId, 'order_updated', payload);
        emitToUser(io, customerId, 'order_status_changed', payload);
      }
    }
    notifyOrderCompleted(updated);

    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/orders/summary - Get order counts for the current user.
 * Customers: total active, pending (waiting for driver), accepted/picked_up (driver assigned).
 * Drivers: available (pending) count, active (accepted + picked_up) count.
 */
async function getOrderSummary(req, res, next) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const userObjectId = toObjectId(userId);

    if (role === 'customer') {
      const [total, pending, accepted] = await Promise.all([
        TransportOrder.countDocuments({
          customerId: userObjectId,
          status: { $in: ['pending', 'accepted', 'picked_up', 'driver_is_on_the_way'] },
        }),
        TransportOrder.countDocuments({
          customerId: userObjectId,
          status: 'pending',
        }),
        TransportOrder.countDocuments({
          customerId: userObjectId,
          status: { $in: ['accepted', 'picked_up', 'driver_is_on_the_way'] },
        }),
      ]);
      return res.json({
        total,
        pending,
        accepted,
      });
    }

    if (role === 'driver') {
      const me = await User.findById(userObjectId).select('isVerified districts district vehicleType').lean();
      if (me?.isVerified !== true) {
        return res.status(403).json({ message: 'Driver not verified' });
      }
      const scope = normalizedDriverDistricts(me);
      const availableQuery = { status: 'pending', driverId: null };
      if (scope.length > 0) {
        availableQuery.pickupDistrict = { $in: scope };
      }
      Object.assign(availableQuery, buildVehicleFilterForDriver(me?.vehicleType));
      const [available, accepted] = await Promise.all([
        TransportOrder.countDocuments(availableQuery),
        TransportOrder.countDocuments({
          driverId: userObjectId,
          status: { $in: ['accepted', 'picked_up', 'driver_is_on_the_way'] },
        }),
      ]);
      return res.json({
        available,
        accepted,
      });
    }

    return res.status(400).json({ message: 'Invalid role for summary' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/rate - Customer submits rating (1-5) and optional review. Order must be completed.
 * Body: { rating: number (1-5), review?: string }
 */
async function rateOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const order = await TransportOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Order must be delivered before you can rate it' });
    }

    const customerId = toObjectId(userId);
    if (order.customerId?.toString() !== customerId.toString()) {
      return res.status(403).json({ message: 'Only the customer of this order can submit a rating' });
    }

    const numRating = typeof rating === 'string' ? parseInt(rating, 10) : Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: 'Rating must be a number between 1 and 5' });
    }
    order.rating = numRating;
    order.review = review != null ? String(review).trim() || null : null;
    await order.save();
    const updated = await TransportOrder.findById(order._id)
      .populate('customerId', 'firstName lastName phoneNumber')
      .populate('driverId', 'firstName lastName phoneNumber');
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/cargo - Upload cargo photo for an order (customer, order must be pending).
 * Expects multipart with field "cargo". Sets order.cargoImageUrl.
 */
async function uploadOrderCargo(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded. Use field name "cargo".' });

    const order = await TransportOrder.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.customerId?.toString() !== userId) {
      return res.status(403).json({ message: 'Only the order customer can upload cargo photo.' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Cargo photo can only be added to pending orders.' });
    }

    const cargoImageUrl = `/uploads/cargo/${req.file.filename}`;
    order.cargoImageUrl = cargoImageUrl;
    await order.save();

    const updated = await TransportOrder.findById(order._id).populate('customerId', 'firstName lastName phoneNumber email');
    try {
      const io = req.app.get('io');
      const payload = orderPayloadForEmit(updated);
      emitToAdmins(io, 'order_updated', payload);
      if (order.driverId) emitToUser(io, order.driverId, 'order_updated', payload);
      emitToUser(io, order.customerId, 'order_updated', payload);
    } catch (_) {
      // Do not fail cargo upload response if socket broadcast fails.
    }
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  getOrders,
  updateOrder,
  pickupOrder,
  deliverOrder,
  cancelOrder,
  getMyOrders,
  completeOrder,
  getOrderSummary,
  updateOrderStatus,
  rateOrder,
  uploadOrderCargo,
  runDriverAcceptedNotifications,
  runInTransitNotifications,
  runOrderCompletedNotifications,
};
