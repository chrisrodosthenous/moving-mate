/**
 * Socket.io integration checks (GET /api/test/sockets).
 * Creates two temporary driver users (Limassol + Larnaca), connects real socket.io-clients,
 * simulates admin verify via account_verified, and checks new_order_available routing.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { io: ioClient } = require('socket.io-client');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const { emitNewOrderAvailable } = require('../services/realtimeService');

function randomPhone() {
  const n = Math.floor(10000000 + Math.random() * 89999999);
  return `+357${n}`;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectDriverSocket(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket.io-client connect timeout'));
    }, 12000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
  });
}

/**
 * Simulates admin clicking Verify: targets the driver's private room (room name = mongo id string).
 */
function simulateAdminVerifyEmit(io, driverMongoId) {
  const room = String(driverMongoId);
  console.log(`[Socket emit] event=account_verified room=${room} (simulate admin verify)`);
  io.to(room).emit('account_verified', {
    userId: String(driverMongoId),
    verified: true,
  });
}

/**
 * @param {import('express').Request} req
 */
async function runSocketIntegrationTest(req) {
  const io = req.app.get('io');
  if (!io) {
    return { ok: false, error: 'io not set on app' };
  }

  const JWT_SECRET = getJwtSecret();
  const port = Number(process.env.PORT || 3000);
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = Date.now();
  const passwordHash = await bcrypt.hash('TestPass1!A', 10);

  const limUser = await User.create({
    firstName: 'SocketTest',
    lastName: 'Limassol',
    dateOfBirth: new Date('1990-06-15'),
    phoneNumber: randomPhone(),
    email: `sock-lim-${suffix}@socket-test.local`,
    password: passwordHash,
    role: 'driver',
    districts: ['Limassol'],
    vehicleType: 'pickup',
    verificationStatus: 'approved',
    isVerified: true,
  });

  const larUser = await User.create({
    firstName: 'SocketTest',
    lastName: 'Larnaca',
    dateOfBirth: new Date('1991-06-15'),
    phoneNumber: randomPhone(),
    email: `sock-lar-${suffix}@socket-test.local`,
    password: passwordHash,
    role: 'driver',
    districts: ['Larnaca'],
    vehicleType: 'pickup',
    verificationStatus: 'approved',
    isVerified: true,
  });

  const tokenLim = jwt.sign(
    { userId: limUser._id.toString(), role: 'driver' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const tokenLar = jwt.sign(
    { userId: larUser._id.toString(), role: 'driver' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let limSocket;
  let larSocket;
  try {
    [limSocket, larSocket] = await Promise.all([
      connectDriverSocket(baseUrl, tokenLim),
      connectDriverSocket(baseUrl, tokenLar),
    ]);

    await wait(500);

    let limVerified = false;
    let larVerified = false;
    limSocket.on('account_verified', () => {
      limVerified = true;
    });
    larSocket.on('account_verified', () => {
      larVerified = true;
    });

    simulateAdminVerifyEmit(io, limUser._id);

    await wait(300);

    const verifyOk = limVerified === true && larVerified === false;

    let limJob = false;
    let larJob = false;
    limSocket.on('new_order_available', () => {
      limJob = true;
    });
    larSocket.on('new_order_available', () => {
      larJob = true;
    });

    await emitNewOrderAvailable(io, 'Larnaca', {
      _id: 'test-order-larnaca',
      pickupDistrict: 'Larnaca',
      status: 'pending',
      vehicleType: 'pickup',
    });

    await wait(400);

    const jobRoutingOk = limJob === false && larJob === true;

    return {
      ok: verifyOk && jobRoutingOk,
      baseUrl,
      privateUserRoomPattern: '<mongoDriverId>',
      simulateAdminVerify: {
        event: 'account_verified',
        targetRoom: String(limUser._id),
        limassolDriverReceived: limVerified,
        larnacaDriverReceived: larVerified,
        pass: verifyOk,
      },
      newOrderInLarnaca: {
        event: 'new_order_available',
        limassolDriverReceived: limJob,
        larnacaDriverReceived: larJob,
        pass: jobRoutingOk,
      },
    };
  } finally {
    if (limSocket) limSocket.close();
    if (larSocket) larSocket.close();
    await User.deleteMany({ _id: { $in: [limUser._id, larUser._id] } });
  }
}

module.exports = { runSocketIntegrationTest, simulateAdminVerifyEmit };
