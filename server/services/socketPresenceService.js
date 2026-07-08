/**
 * Ref-counted socket presence per user id (supports multiple tabs).
 * Used to suppress FCM when the app is already connected via Socket.io.
 */

/** @type {Map<string, number>} */
const refCounts = new Map();

function registerSocketConnected(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  refCounts.set(uid, (refCounts.get(uid) || 0) + 1);
}

function unregisterSocketConnected(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const n = (refCounts.get(uid) || 0) - 1;
  if (n <= 0) refCounts.delete(uid);
  else refCounts.set(uid, n);
}

/** True when at least one socket for this user is connected. */
function isUserSocketConnected(userId) {
  return (refCounts.get(String(userId || '').trim()) || 0) > 0;
}

/** Test helper — clear all presence state. */
function _resetSocketPresenceForTests() {
  refCounts.clear();
}

/**
 * Attach connect/disconnect presence tracking. Call once from io.on('connection').
 * @param {import('socket.io').Socket} socket
 */
function attachSocketPresenceToSocket(socket) {
  const uid = String(socket.userId || '').trim();
  if (!uid) return;

  registerSocketConnected(uid);

  socket.on('disconnect', () => {
    unregisterSocketConnected(uid);
  });
}

module.exports = {
  registerSocketConnected,
  unregisterSocketConnected,
  isUserSocketConnected,
  attachSocketPresenceToSocket,
  _resetSocketPresenceForTests,
};
