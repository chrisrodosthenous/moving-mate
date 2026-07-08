/**
 * Set a user's role to 'admin' by email.
 * Usage: node server/scripts/make-admin.js <email>
 * Example: node server/scripts/make-admin.js admin@example.com
 *
 * Requires MongoDB to be running and MONGODB_URI/MONGO_URI if not default.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/moving-mate';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node server/scripts/make-admin.js <email>');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { $set: { role: 'admin' } },
    { returnDocument: 'after' }
  ).select('-password');

  if (!user) {
    console.error('No user found with email:', email);
    process.exit(1);
  }

  console.log('User updated to admin:', user.email, '|', user.firstName, user.lastName);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
