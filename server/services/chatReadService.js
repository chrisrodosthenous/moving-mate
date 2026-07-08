const Message = require('../models/Message');
const TransportOrder = require('../models/TransportOrder');
const mongoose = require('mongoose');
const { strictMongoObjectIdString } = require('../utils/objectId');

function toObjectId(id) {
  if (id == null) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'object' && id._id != null) return toObjectId(id._id);
  const s = String(id).trim();
  if (!s || s === '[object Object]') return null;
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  const oid = new mongoose.Types.ObjectId(s);
  if (String(oid) !== s) return null;
  return oid;
}

function normalizeOrderIdParam(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw._id != null) return String(raw._id).trim();
  const s = String(raw).trim();
  return s === '[object Object]' ? '' : s;
}

/**
 * Marks messages for this order where the viewer is the receiver as read.
 * If `io` is set and at least one doc was updated, emits `chat_messages_read` to both participants' rooms.
 */
async function markMessagesReadForUser(io, userId, orderIdParam) {
  const viewerStr = strictMongoObjectIdString(userId);
  if (!viewerStr) {
    const err = new Error('Invalid user id');
    err.status = 400;
    throw err;
  }

  const orderObjId = toObjectId(normalizeOrderIdParam(orderIdParam) || String(orderIdParam || '').trim());
  if (!orderObjId) {
    const err = new Error('Invalid order id');
    err.status = 400;
    throw err;
  }

  const order = await TransportOrder.findById(orderObjId).lean();
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  const custId = strictMongoObjectIdString(order.customerId);
  const driverId = order.driverId != null ? strictMongoObjectIdString(order.driverId) : null;
  if (!custId) {
    const err = new Error('Invalid order or user id');
    err.status = 400;
    throw err;
  }
  if (custId !== viewerStr && driverId !== viewerStr) {
    const err = new Error('You are not part of this order');
    err.status = 403;
    throw err;
  }

  if (order.status !== 'accepted' && order.status !== 'picked_up') {
    const err = new Error('Chat is only available for accepted or in-progress orders');
    err.status = 400;
    throw err;
  }

  const receiverObjId = toObjectId(viewerStr);
  if (!receiverObjId) {
    const err = new Error('Invalid user id');
    err.status = 400;
    throw err;
  }

  const result = await Message.updateMany(
    { orderId: orderObjId, receiverId: receiverObjId, read: false },
    { $set: { read: true } }
  );

  const modifiedCount = result.modifiedCount ?? 0;

  if (io && modifiedCount > 0) {
    const payload = { orderId: String(orderObjId), readByUserId: viewerStr };
    for (const uid of [custId, driverId]) {
      if (uid) io.to(String(uid)).emit('chat_messages_read', payload);
    }
  }

  return { modifiedCount, orderId: String(orderObjId) };
}

async function countUnreadMessagesForViewer(viewerStr, orderObjId) {
  const receiverObjId = toObjectId(viewerStr);
  if (!receiverObjId) return 0;
  return Message.countDocuments({
    orderId: orderObjId,
    receiverId: receiverObjId,
    read: false,
  });
}

/** Per-order counts of messages where this user is receiver and read === false. */
async function getUnreadCountsByOrderForUser(userId) {
  const viewerStr = strictMongoObjectIdString(userId);
  if (!viewerStr) return {};
  const receiverObjId = toObjectId(viewerStr);
  if (!receiverObjId) return {};

  const agg = await Message.aggregate([
    { $match: { receiverId: receiverObjId, read: false } },
    { $group: { _id: '$orderId', count: { $sum: 1 } } },
  ]);

  const counts = {};
  for (const row of agg) {
    if (row._id) counts[String(row._id)] = row.count;
  }
  return counts;
}

module.exports = {
  markMessagesReadForUser,
  countUnreadMessagesForViewer,
  getUnreadCountsByOrderForUser,
  toObjectId,
  normalizeOrderIdParam,
};
