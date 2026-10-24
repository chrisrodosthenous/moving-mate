/**
 * Create (or promote) an admin user in the currently configured database.
 * Usage: node server/scripts/create-admin.js <email> <password> [phoneNumber] [firstName] [lastName]
 * Example: node server/scripts/create-admin.js admin@local.test 'Admin123!' +35799000001 Local Admin
 *
 * Idempotent: if the email already exists, its role is set to 'admin' and the password is reset.
 * Refuses to run against a database whose name looks like production unless ALLOW_PROD_ADMIN=true.
 */
const path = require('path');
// Pinned so the script picks up server/.env regardless of the caller's cwd.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_NUMBER_REGEX = /^\+357\d{8}$/;
const BCRYPT_ROUNDS = 10;

function databaseNameFromUri(uri) {
  try {
    const withoutQuery = uri.split('?')[0];
    return withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1) || '(default)';
  } catch {
    return '(unknown)';
  }
}

/** Free phone slot so the unique index cannot collide with an unrelated seeded account. */
async function assertPhoneAvailable(phoneNumber, email) {
  const owner = await User.findOne({ phoneNumber }).select('email');
  if (owner && owner.email !== email) {
    throw new Error(`Phone ${phoneNumber} is already used by ${owner.email}. Pass a different one.`);
  }
}

async function main() {
  const [email, password, phoneNumber = '+35799000001', firstName = 'Local', lastName = 'Admin'] =
    process.argv.slice(2);

  if (!email || !password) {
    console.error(
      'Usage: node server/scripts/create-admin.js <email> <password> [phoneNumber] [firstName] [lastName]'
    );
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    console.error('Invalid email format:', normalizedEmail);
    process.exit(1);
  }
  if (!PHONE_NUMBER_REGEX.test(phoneNumber)) {
    console.error('Phone number must be +357 followed by exactly 8 digits. Got:', phoneNumber);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Check server/.env.');
    process.exit(1);
  }

  const dbName = databaseNameFromUri(MONGODB_URI);
  if (/prod/i.test(dbName) && process.env.ALLOW_PROD_ADMIN !== 'true') {
    console.error(
      `Refusing to write to "${dbName}": it looks like production. Set ALLOW_PROD_ADMIN=true to override.`
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to database:', dbName);

  await assertPhoneAvailable(phoneNumber, normalizedEmail);

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await User.findOne({ email: normalizedEmail }).select('_id');

  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        role: 'admin',
        password: hashedPassword,
        isVerified: true,
        verificationStatus: 'approved',
      },
      $setOnInsert: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  ).select('-password');

  console.log(existing ? 'Existing user promoted to admin:' : 'Admin user created:');
  console.log('  email:', user.email);
  console.log('  phone:', user.phoneNumber);
  console.log('  name :', `${user.firstName} ${user.lastName}`);
  console.log('  role :', user.role);
  console.log('\nLog out and log back in so the cached role in localStorage refreshes.');
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Failed:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
