/**
 * Automated socket integration (GET /api/test/socket-auto).
 * Uses a real DB driver in Larnaca (or creates a temporary one), JWT, socket.io-client,
 * validates district + driver_* rooms, and confirms new_order_available delivery.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { io: ioClient } = require('socket.io-client');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const { emitNewOrderAvailable, districtRoomName } = require('../services/realtimeService');

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
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 12000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket.io-client connect timeout'));
    }, 15000);
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
 * @param {import('express').Request} req
 * @returns {Promise<object>}
 */
async function runSocketAutoTest(req) {
  const report = {
    connection: 'FAIL',
    authentication: 'FAIL',
    roomJoined: 'FAIL',
    messageReceived: 'FAIL',
  };

  const io = req.app.get('io');
  if (!io) {
    return { ...report, error: 'Socket.io server (io) not on app' };
  }

  const JWT_SECRET = getJwtSecret();
  const port = Number(process.env.PORT || 3000);
  const baseUrl = `http://127.0.0.1:${port}`;

  let driver = await User.findOne({ role: 'driver', districts: 'Larnaca' }).select('_id');
  let createdTempDriver = false;
  if (!driver) {
    const suffix = Date.now();
    const passwordHash = await bcrypt.hash('SockAuto1!A', 10);
    driver = await User.create({
      firstName: 'SocketAuto',
      lastName: 'Larnaca',
      dateOfBirth: new Date('1992-03-15'),
      phoneNumber: randomPhone(),
      email: `sock-auto-${suffix}@socket-auto.local`,
      password: passwordHash,
      role: 'driver',
      districts: ['Larnaca'],
      vehicleType: 'pickup',
      verificationStatus: 'approved',
      isVerified: true,
    });
    createdTempDriver = true;
  }

  const userId = driver._id.toString();
  const token = jwt.sign({ userId, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

  let client;
  try {
    try {
      client = await connectDriverSocket(baseUrl, token);
      report.connection = 'OK';
      report.authentication = 'OK';
    } catch (err) {
      return {
        ...report,
        error: err.message || String(err),
        driverId: userId,
        tempDriverCreated: createdTempDriver,
      };
    }

    await wait(800);

    const srvSocket = io.sockets.sockets.get(client.id);
    const rooms = srvSocket ? Array.from(srvSocket.rooms) : [];
    const needDistrict = districtRoomName('Larnaca');
    const needDriverRoom = `driver_${userId}`;
    const hasLarnacaDistrictRoom = rooms.includes(needDistrict);
    const hasDriverIdRoom = rooms.includes(needDriverRoom);
    if (hasLarnacaDistrictRoom && hasDriverIdRoom) {
      report.roomJoined = 'OK';
    }

    const gotMessage = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 5000);
      client.once('new_order_available', () => {
        clearTimeout(t);
        resolve(true);
      });
      void emitNewOrderAvailable(io, 'Larnaca', {
        _id: `socket-auto-${Date.now()}`,
        pickupDistrict: 'Larnaca',
        status: 'pending',
        vehicleType: 'pickup',
        source: 'socket-auto',
      }).catch(() => {
        clearTimeout(t);
        resolve(false);
      });
    });

    if (gotMessage) {
      report.messageReceived = 'OK';
    }

    const allOk =
      report.connection === 'OK' &&
      report.authentication === 'OK' &&
      report.roomJoined === 'OK' &&
      report.messageReceived === 'OK';

    return {
      ...report,
      driverId: userId,
      tempDriverCreated: createdTempDriver,
      roomsChecked: { needDistrict, needDriverRoom, rooms },
      ok: allOk,
    };
  } finally {
    if (client) {
      client.removeAllListeners();
      client.close();
    }
    if (createdTempDriver && driver?._id) {
      await User.deleteOne({ _id: driver._id }).catch(() => {});
    }
  }
}

module.exports = { runSocketAutoTest };
