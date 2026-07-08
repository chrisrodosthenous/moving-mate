const mongoose = require('mongoose');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const { normalizedDriverDistricts, isValidCyprusDistrict } = require('../constants/cyprusDistricts');
const {
  filterDriversEligibleForOrder,
  normalizeOrderVehicleType,
} = require('../utils/driverVehicleMatching');
const { buildDedupeKey, tryAcquireNotification } = require('../utils/notificationDedupe');

/** Room prefix for live driver → customer map updates: `order:<mongoOrderId>`. */
const ORDER_TRACKING_ROOM_PREFIX = 'order:';

/** Driver GPS + customer map marker only after the trip is in progress (not while merely accepted). */
const DRIVER_MAP_IN_PROGRESS_STATUSES = new Set([
  'picked_up',
  'driver_is_on_the_way',
  'in_progress',
  'delivery_in_progress',
]);

const DRIVER_LOCATION_ALLOWED_STATUSES = DRIVER_MAP_IN_PROGRESS_STATUSES;
const CUSTOMER_JOIN_ORDER_TRACKING_STATUSES = DRIVER_MAP_IN_PROGRESS_STATUSES;

function isDevEnv() {
  return process.env.NODE_ENV !== 'production';
}

function devLogLocation(...args) {
  if (isDevEnv()) {
    console.log('[driver_location_update]', ...args);
  }
}

/** Degrees 0–360 from first defined of heading | bearing | course. */
function pickDriverHeading(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  for (const key of ['heading', 'bearing', 'course']) {
    const v = Number(payload[key]);
    if (Number.isFinite(v)) {
      return ((v % 360) + 360) % 360;
    }
  }
  return undefined;
}

/** Admins join this room; license / registration notifications go here only (not broadcast). */
const ADMIN_ROOM = 'admin_room';

function districtRoomName(district) {
  return `district:${district}`;
}

function joinRoomLogged(socket, room) {
  console.log(
    `[Socket] join socket.id=${socket.id} userId=${socket.userId} role=${socket.role ?? ''} room=${room}`
  );
  socket.join(room);
}

/**
 * Per-socket rooms:
 * - <mongoId> — private room (same string as user id); orders, verification_status_updated, etc.
 * - admin_room — connected admin dashboards (license uploads, admin-only events)
 * - driver_<mongoId> — per-driver room (legacy / tooling)
 * - district:<Nicosia|...> — district scope (legacy tooling; new orders use targeted driver rooms)
 *
 * `new_order_available` is emitted only to verified drivers whose vehicle tier matches the order
 * (see driverVehicleMatching.js) — not broadcast to the whole district room.
 */
async function joinUserSocketRooms(socket) {
  const uid = String(socket.userId);
  const role = socket.role;
  joinRoomLogged(socket, uid);
  if (role === 'admin') {
    joinRoomLogged(socket, ADMIN_ROOM);
  }
  if (role === 'driver') {
    joinRoomLogged(socket, `driver_${uid}`);
    let user = null;
    try {
      user = await User.findById(uid).select('districts district').lean();
    } catch {
      user = null;
    }
    const scope = normalizedDriverDistricts(user);
      for (const d of scope) {
        joinRoomLogged(socket, districtRoomName(d));
    }
  }
}

function orderPayloadForEmit(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: true });
  }
  return doc;
}

async function emitNewOrderAvailable(io, pickupDistrict, orderDoc) {
  if (!io) return;
  const d = typeof pickupDistrict === 'string' ? pickupDistrict.trim() : '';
  if (!isValidCyprusDistrict(d)) {
    console.warn(`[Socket emit] new_order_available skipped: invalid pickupDistrict (${pickupDistrict})`);
    return;
  }
  const payload = orderPayloadForEmit(orderDoc);
  const orderVehicle = normalizeOrderVehicleType(orderDoc?.vehicleType);

  let candidates = [];
  try {
    candidates = await User.find({
      role: 'driver',
      isVerified: true,
    })
      .select('_id vehicleType districts district isVerified role')
      .lean();
  } catch (err) {
    console.warn('[Socket emit] new_order_available driver lookup failed:', err?.message || err);
    return;
  }

  const eligible = filterDriversEligibleForOrder(candidates, d, orderVehicle);
  if (!eligible.length) {
    console.log(
      `[Socket emit] new_order_available: no eligible drivers for district=${d} vehicleType=${orderVehicle}`,
    );
    return;
  }

  const orderId = String(orderDoc?._id || orderDoc?.id || '');
  for (const driver of eligible) {
    const room = String(driver._id);
    const dedupeKey = buildDedupeKey('socket', 'new_order_available', orderId, room);
    if (!tryAcquireNotification(dedupeKey)) {
      console.log(`[Socket emit] dedupe skip new_order_available room=${room} orderId=${orderId}`);
      continue;
    }
    console.log(
      `[Socket emit] event=new_order_available room=${room} driverVehicle=${driver.vehicleType || 'pickup'} orderVehicle=${orderVehicle}`,
    );
    io.to(room).emit('new_order_available', payload);
  }
}

function emitToUser(io, userId, event, payload) {
  if (!io || userId == null) return;
  const room = String(userId);
  console.log(`[Socket emit] event=${event} room=${room}`);
  io.to(room).emit(event, payload);
}

function emitToAdmins(io, event, payload) {
  if (!io) return;
  console.log(`[Socket emit] event=${event} room=${ADMIN_ROOM}`);
  io.to(ADMIN_ROOM).emit(event, payload);
}

/** Driver verification only — never broadcast; targets the driver's private room by user id. */
function emitVerificationStatusUpdated(io, userId, data) {
  if (!io || userId == null) return;
  const room = String(userId);
  console.log(`[Socket emit] event=verification_status_updated room=${room} (targeted)`);
  io.to(room).emit('verification_status_updated', data);
}

/**
 * Driver emits `{ orderId, lat, lng }`. Server verifies JWT user is the assigned driver and order is trackable,
 * then broadcasts `customer_location_update` { lat, lng } to room `order:<orderId>` (customers should join that room).
 *
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
function attachDriverLocationHandlers(socket, io) {
  /** Customers join `order:<orderId>` so they receive `customer_location_update` (verified against order). */
  socket.on('join_order_tracking', async (payload) => {
    try {
      if (socket.role !== 'customer') {
        devLogLocation('join_order_tracking ignored: not a customer');
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      const raw = payload.orderId;
      const orderIdStr =
        raw == null ? '' : typeof raw === 'string' ? raw.trim() : String(raw).trim();
      if (!orderIdStr || !mongoose.Types.ObjectId.isValid(orderIdStr)) return;

      const customerId = String(socket.userId ?? '');
      if (!customerId) return;

      let order;
      try {
        order = await TransportOrder.findById(orderIdStr).select('customerId status').lean();
      } catch (dbErr) {
        if (isDevEnv()) {
          console.error('[join_order_tracking] DB error:', dbErr?.message ?? dbErr);
        }
        return;
      }
      if (!order) {
        devLogLocation('join_order_tracking skipped: order not found');
        return;
      }
      if (String(order.customerId) !== customerId) {
        devLogLocation('join_order_tracking skipped: not the customer on this order');
        return;
      }
      if (!CUSTOMER_JOIN_ORDER_TRACKING_STATUSES.has(order.status)) {
        devLogLocation('join_order_tracking skipped: order not in tracking window');
        return;
      }
      const room = `${ORDER_TRACKING_ROOM_PREFIX}${orderIdStr}`;
      socket.join(room);
      devLogLocation('customer joined room ' + room);
    } catch (err) {
      if (isDevEnv()) {
        console.error('[join_order_tracking] unexpected:', err?.message ?? err);
      }
    }
  });

  /** Customer leaves `order:<orderId>` when closing the tracking UI (optional cleanup). */
  socket.on('leave_order_tracking', (payload) => {
    try {
      if (socket.role !== 'customer') return;
      if (!payload || typeof payload !== 'object') return;
      const raw = payload.orderId;
      const orderIdStr =
        raw == null ? '' : typeof raw === 'string' ? raw.trim() : String(raw).trim();
      if (!orderIdStr || !mongoose.Types.ObjectId.isValid(orderIdStr)) return;
      const room = `${ORDER_TRACKING_ROOM_PREFIX}${orderIdStr}`;
      socket.leave(room);
      devLogLocation('customer left room ' + room);
    } catch (err) {
      if (isDevEnv()) {
        console.error('[leave_order_tracking] unexpected:', err?.message ?? err);
      }
    }
  });

  socket.on('driver_location_update', async (payload) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      if (socket.role !== 'driver') {
        devLogLocation('ignored: socket is not a driver');
        return;
      }

      const driverId = String(socket.userId ?? '');
      if (!driverId) return;

      const orderIdRaw = payload.orderId;
      const orderIdStr =
        orderIdRaw == null
          ? ''
          : typeof orderIdRaw === 'string'
            ? orderIdRaw.trim()
            : String(orderIdRaw).trim();
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      const heading = pickDriverHeading(payload);

      if (!orderIdStr || !mongoose.Types.ObjectId.isValid(orderIdStr)) {
        devLogLocation('skipped: invalid orderId');
        return;
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        devLogLocation('skipped: invalid lat/lng');
        return;
      }

      let order;
      try {
        order = await TransportOrder.findById(orderIdStr).select('driverId status').lean();
      } catch (dbErr) {
        if (isDevEnv()) {
          console.error('[driver_location_update] DB error:', dbErr?.message ?? dbErr);
        }
        return;
      }

      if (!order) {
        devLogLocation('skipped: order not found', orderIdStr);
        return;
      }

      const assigned =
        order.driverId != null
          ? String(order.driverId)
          : '';
      if (!assigned || assigned !== driverId) {
        devLogLocation('skipped: driver not assigned to order');
        return;
      }

      if (!DRIVER_LOCATION_ALLOWED_STATUSES.has(order.status)) {
        devLogLocation('skipped: order not trackable (status=' + order.status + ')');
        return;
      }

      const room = `${ORDER_TRACKING_ROOM_PREFIX}${orderIdStr}`;
      const out = { lat, lng };
      if (Number.isFinite(heading) && heading >= 0 && heading <= 360) {
        out.heading = heading;
      }
      io.to(room).emit('customer_location_update', out);
      devLogLocation('emitted customer_location_update → room=' + room);

      try {
        await TransportOrder.findByIdAndUpdate(orderIdStr, {
          $set: {
            driverLocation: {
              lat,
              lng,
              ...(Number.isFinite(heading) && heading >= 0 && heading <= 360 ? { heading } : {}),
              updatedAt: new Date(),
            },
          },
        });
      } catch (persistErr) {
        if (isDevEnv()) {
          console.error('[driver_location_update] persist failed:', persistErr?.message ?? persistErr);
        }
      }
    } catch (err) {
      if (isDevEnv()) {
        console.error('[driver_location_update] unexpected:', err?.message ?? err);
      }
    }
  });
}

module.exports = {
  ADMIN_ROOM,
  ORDER_TRACKING_ROOM_PREFIX,
  joinUserSocketRooms,
  attachDriverLocationHandlers,
  emitNewOrderAvailable,
  emitToUser,
  emitToAdmins,
  emitVerificationStatusUpdated,
  orderPayloadForEmit,
  districtRoomName,
};
