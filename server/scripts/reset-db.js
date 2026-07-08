/**
 * COMPLETE DATABASE CLEANUP + SEED ADMIN USER
 *
 * Deletes all documents from: Users, TransportOrders (orders), Messages, Reviews.
 * Then creates a single admin user from env vars.
 *
 * Usage (run from project root):
 *   set ADMIN_EMAIL=your@email.com
 *   set ADMIN_PASSWORD=YourSecurePassword
 *   node server/scripts/reset-db.js
 *
 * Or on Unix/Mac:
 *   ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourSecurePassword node server/scripts/reset-db.js
 *
 * Requires: ADMIN_EMAIL and ADMIN_PASSWORD. Optional: ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_PHONE
 * (defaults: Admin, User, +35700000000). No auto-increment counters in this app; nothing to reset.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const Message = require('../models/Message');
const Review = require('../models/Review');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/moving-mate';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      'Missing credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD (env vars). Example:\n' +
        '  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret node server/scripts/reset-db.js'
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  const messagesDeleted = (await Message.deleteMany({})).deletedCount;
  const reviewsDeleted = (await Review.deleteMany({})).deletedCount;
  const ordersDeleted = (await TransportOrder.deleteMany({})).deletedCount;
  const usersDeleted = (await User.deleteMany({})).deletedCount;

  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Admin';
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || 'User';
  const phoneNumber = (process.env.ADMIN_PHONE || '+35700000000').trim();
  const dateOfBirth = new Date(process.env.ADMIN_DOB || '1990-01-01');
  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: hashedPassword,
    phoneNumber,
    dateOfBirth,
    role: 'admin',
  });

  console.log('Database cleared successfully.');
  console.log(
    'Deleted:',
    messagesDeleted,
    'messages,',
    reviewsDeleted,
    'reviews,',
    ordersDeleted,
    'orders,',
    usersDeleted,
    'users.'
  );
  console.log('Admin user created:', email);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
