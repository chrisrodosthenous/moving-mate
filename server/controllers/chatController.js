const Message = require('../models/Message');
const TransportOrder = require('../models/TransportOrder');
const User = require('../models/User');
const { sendChatMessagePush } = require('../services/pushNotificationService');
const { isUserViewingChatOrder } = require('../services/chatPresenceService');
const {
  markMessagesReadForUser,
  countUnreadMessagesForViewer,
  getUnreadCountsByOrderForUser,
  toObjectId,
  normalizeOrderIdParam,
} = require('../services/chatReadService');
const { activeFcmTokens } = require('../utils/fcmTokens');
const { strictMongoObjectIdString } = require('../utils/objectId');

/** Order must be in one of these strings for messaging (frontend uses several “in progress” aliases). */
const CHAT_ALLOWED_STATUSES = new Set([
  'accepted',
  'picked_up',
  'in_progress',
  'driver_is_on_the_way',
  'delivery_in_progress',
]);

function isChatAllowedStatus(status) {
  return typeof status === 'string' && CHAT_ALLOWED_STATUSES.has(status);
}

/**
 * POST /api/chat/send
 * Body: { orderId, text }
 * Sender = JWT user. Only the order's customer or assigned driver may post.
 */
async function sendMessage(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { text } = req.body;
    const orderIdStr = normalizeOrderIdParam(req.body.orderId);
    if (!orderIdStr || text == null || String(text).trim() === '') {
      return res.status(400).json({
        message: 'orderId and non-empty text are required',
      });
    }

    const orderObjId = toObjectId(orderIdStr);
    if (!orderObjId) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await TransportOrder.findById(orderObjId).lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const custId = strictMongoObjectIdString(order.customerId);
    const driverId = order.driverId != null ? strictMongoObjectIdString(order.driverId) : null;
    if (!custId) {
      return res.status(400).json({ message: 'Order has invalid customer id' });
    }
    const senderStr = strictMongoObjectIdString(userId);
    if (!senderStr) {
      return res.status(400).json({ message: 'Invalid sender id' });
    }
    if (custId !== senderStr && driverId !== senderStr) {
      return res.status(403).json({ message: 'You are not part of this order' });
    }
    if (!isChatAllowedStatus(order.status)) {
      return res.status(400).json({ message: 'Chat is only available for active orders (accepted / in progress)' });
    }

    const senderObjId = toObjectId(senderStr);
    if (!senderObjId) {
      return res.status(400).json({ message: 'Invalid sender id' });
    }

    const receiverIdStr = custId === senderStr ? driverId : custId;
    if (!receiverIdStr) {
      return res.status(400).json({ message: 'Receiver could not be determined for this order' });
    }
    const receiverObjId = toObjectId(receiverIdStr);
    if (!receiverObjId) {
      return res.status(400).json({ message: 'Invalid receiver id' });
    }

    const message = new Message({
      orderId: orderObjId,
      senderId: senderObjId,
      receiverId: receiverObjId,
      text: String(text).trim(),
      read: false,
    });
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName')
      .lean();

    const io = req.app.get('io');
    const receiverRoom = String(receiverObjId);
    let receiverOnline = false;
    if (io) {
      const room = io.sockets.adapter.rooms.get(receiverRoom);
      receiverOnline = room ? room.size > 0 : false;
    }

    const senderRole = custId === senderStr ? 'customer' : 'driver';
    const recipientId = String(receiverObjId);
    console.log(
      `[Chat] Attempting push from ${senderRole} to ${recipientId} orderId=${orderIdStr} receiverOnline=${receiverOnline}`
    );

    const receiverUser = await User.findById(receiverObjId).select('fcmTokens').lean();
    const dbTokenCount = Array.isArray(receiverUser?.fcmTokens) ? receiverUser.fcmTokens.length : 0;
    console.log(`[Chat] Recipient ID: ${recipientId}, Tokens found in DB: ${dbTokenCount}`);
    const toks = activeFcmTokens(receiverUser?.fcmTokens || []);

    if (toks.length) {
      if (isUserViewingChatOrder(recipientId, orderIdStr)) {
        console.log(`[Chat] Recipient ${recipientId} is viewing order ${orderIdStr}. Push suppressed.`);
      } else {
        const sender = populated.senderId;
        const senderName =
          sender && typeof sender === 'object'
            ? [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || 'Someone'
            : 'Someone';
        try {
          const messageId = await sendChatMessagePush({
            receiverFcmToken: receiverUser?.fcmTokens || [],
            senderName,
            orderId: orderIdStr,
            recipientUserId: recipientId,
          });
          if (messageId) {
            console.log(`[Chat] Push sent tokens=${toks.length} messageId=${String(messageId)}`);
          } else {
            console.warn('[Chat] sendChatMessagePush returned null (toggle off, no Firebase, or send failed)');
          }
        } catch (pushErr) {
          console.warn('[Chat] Push failed:', pushErr.message);
        }
      }
    } else {
      console.warn(`[Chat] No fcmTokens for recipient ${recipientId} — skipping FCM`);
    }

    const readVal = populated.read === true;
    res.status(201).json({
      message: 'Message sent',
      data: {
        _id: populated._id,
        orderId: populated.orderId,
        senderId: populated.senderId,
        receiverId: populated.receiverId,
        text: populated.text,
        createdAt: populated.createdAt,
        read: readVal,
        isRead: readVal,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/chat/unread-counts
 * Per-order counts of messages where current user is receiver and read is false.
 */
async function getUnreadCounts(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const counts = await getUnreadCountsByOrderForUser(userId);
    res.json({ counts });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/chat/:orderId
 * Message history. Only customer or assigned driver of the order.
 */
async function getChatByOrderId(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const orderIdParam = normalizeOrderIdParam(req.params.orderId) || String(req.params.orderId || '').trim();
    const orderObjId = toObjectId(orderIdParam);
    if (!orderObjId) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await TransportOrder.findById(orderObjId).lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const custId = strictMongoObjectIdString(order.customerId);
    const driverId = order.driverId != null ? strictMongoObjectIdString(order.driverId) : null;
    const viewerStr = strictMongoObjectIdString(userId);
    if (!custId || !viewerStr) {
      return res.status(400).json({ message: 'Invalid order or user id' });
    }
    if (custId !== viewerStr && driverId !== viewerStr) {
      return res.status(403).json({ message: 'You are not part of this order' });
    }

    if (!isChatAllowedStatus(order.status)) {
      return res.status(400).json({ message: 'Chat is only available for active orders (accepted / in progress)' });
    }

    const unreadCount = await countUnreadMessagesForViewer(viewerStr, orderObjId);

    const raw = await Message.find({ orderId: orderObjId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'firstName lastName')
      .lean();

    const messages = raw.filter((m) => m.senderId != null && m.text != null);

    res.json({
      orderId: String(orderObjId),
      unreadCount,
      messages: messages.map((m) => {
        const r = m.read === true;
        return {
          _id: m._id,
          orderId: m.orderId,
          senderId: m.senderId,
          receiverId: m.receiverId,
          text: m.text,
          createdAt: m.createdAt,
          read: r,
          isRead: r,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/chat/mark-read/:orderId
 * Marks all messages in the order where the current user is the receiver as read.
 * Broadcasts `chat_messages_read` over socket.io when any document changes.
 */
async function markMessagesRead(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const io = req.app.get('io');
    const result = await markMessagesReadForUser(io, userId, req.params.orderId);
    res.json({
      orderId: result.orderId,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

exports.sendMessage = sendMessage;
exports.getUnreadCounts = getUnreadCounts;
exports.getChatByOrderId = getChatByOrderId;
exports.markMessagesRead = markMessagesRead;
