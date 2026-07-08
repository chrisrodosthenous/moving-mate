const { markMessagesReadForUser } = require('./chatReadService');

/**
 * Socket: `mark_messages_read` { orderId } — same effect as PATCH /api/chat/mark-read/:orderId.
 * Server broadcasts `chat_messages_read` { orderId, readByUserId } to both order participants.
 */
function attachChatSocketHandlers(socket, io) {
  socket.on('mark_messages_read', async (payload) => {
    const orderId = String(payload?.orderId || '').trim();
    if (!orderId) return;
    const userId = socket.userId;
    if (!userId) return;
    try {
      await markMessagesReadForUser(io, userId, orderId);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Chat] mark_messages_read failed:', e.message);
      }
    }
  });
}

module.exports = { attachChatSocketHandlers };
