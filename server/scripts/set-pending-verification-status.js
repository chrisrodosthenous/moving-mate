/**
 * One-off: set verificationStatus to 'pending' for users who have a licenseUrl
 * but verificationStatus is missing, 'none', or anything other than 'approved'/'rejected'.
 * Usage (from project root): node server/scripts/set-pending-verification-status.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/moving-mate';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const result = await User.updateMany(
    {
      licenseUrl: { $exists: true, $ne: '' },
      verificationStatus: { $ne: 'approved' },
    },
    { $set: { verificationStatus: 'pending' } }
  );

  console.log('Updated', result.modifiedCount, 'user(s) to verificationStatus: pending');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
