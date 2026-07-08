/**
 * Tracks which (userId, orderId) pairs have at least one socket reporting the chat UI open.
 * Ref-counted so multiple tabs increment/decrement; disconnect clears that socket's views.
 */

const refCounts = new Map();

function key(userId, orderId) {
  return `${String(userId)}:${String(orderId)}`;
}

function registerViewing(userId, orderId) {
  const k = key(userId, orderId);
  refCounts.set(k, (refCounts.get(k) || 0) + 1);
}

function unregisterViewing(userId, orderId) {
  const k = key(userId, orderId);
  const n = (refCounts.get(k) || 0) - 1;
  if (n <= 0) refCounts.delete(k);
  else refCounts.set(k, n);
}

/** True if the user has the chat window open for this order (any connected tab). */
function isUserViewingChatOrder(userId, orderId) {
  return (refCounts.get(key(userId, orderId)) || 0) > 0;
}

/**
 * Attach viewing_chat / left_chat handlers to each socket. Call once from io.on('connection').
 */
function attachChatPresenceToSocket(socket) {
  if (!socket._chatViewingOrders) {
    socket._chatViewingOrders = new Set();
  }

  socket.on('viewing_chat', (payload) => {
    const orderId = String(payload?.orderId || '').trim();
    if (!orderId) return;
    const uid = String(socket.userId || '');
    if (!uid) return;
    if (socket._chatViewingOrders.has(orderId)) return;
    socket._chatViewingOrders.add(orderId);
    registerViewing(uid, orderId);
    console.log(`[Chat] Presence: user ${uid} started viewing order ${orderId} (ref after +1)`);
  });

  socket.on('left_chat', (payload) => {
    const orderId = String(payload?.orderId || '').trim();
    if (!orderId) return;
    const uid = String(socket.userId || '');
    if (!uid) return;
    if (!socket._chatViewingOrders.has(orderId)) return;
    socket._chatViewingOrders.delete(orderId);
    unregisterViewing(uid, orderId);
    console.log(`[Chat] Presence: user ${uid} left chat for order ${orderId}`);
  });

  socket.on('disconnect', () => {
    const uid = String(socket.userId || '');
    if (!uid || !socket._chatViewingOrders?.size) return;
    for (const orderId of socket._chatViewingOrders) {
      unregisterViewing(uid, orderId);
      console.log(`[Chat] Presence: user ${uid} disconnect — cleared viewing order ${orderId}`);
    }
    socket._chatViewingOrders.clear();
  });
}

module.exports = {
  isUserViewingChatOrder,
  attachChatPresenceToSocket,
};
