/**
 * One-time migration: moves the legacy `fcmToken` (String) field on each User document
 * into the new `fcmTokens` ([String]) array, then removes the old field.
 *
 * Usage (run once from the project root):
 *   node server/scripts/migrateFcmTokens.js
 *
 * Safe to run multiple times — $addToSet prevents duplicates and $unset is idempotent.
 */
'use strict';

const path    = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('[Migration] MONGO_URI not set in server/.env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('[Migration] Connected to MongoDB');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // Find all documents that still have a non-empty string fcmToken.
  const cursor = users.find({ fcmToken: { $exists: true, $ne: '' } });
  let migrated = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const oldToken = String(doc.fcmToken || '').trim();
    if (!oldToken) continue;

    await users.updateOne(
      { _id: doc._id },
      {
        $addToSet: { fcmTokens: oldToken },
        $unset:    { fcmToken: '' },
      }
    );
    console.log(`  Migrated user ${doc._id} (${doc.email}) — token …${oldToken.slice(-10)}`);
    migrated++;
  }

  // Also clean up documents that have fcmToken: '' (empty string leftover).
  const cleaned = await users.updateMany(
    { fcmToken: '' },
    { $unset: { fcmToken: '' } }
  );

  console.log(`[Migration] Done. Migrated ${migrated} token(s). Cleaned ${cleaned.modifiedCount} empty-string field(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[Migration] Failed:', err.message);
  process.exit(1);
});
