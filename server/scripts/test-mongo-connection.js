/**
 * Quick Atlas connectivity check — reads MONGODB_URI or MONGO_URI from server/.env
 * Usage: node scripts/test-mongo-connection.js
 *
 * Uses override: true so a stale $env:MONGODB_URI in PowerShell does not win over .env
 */
require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
  override: true,
});
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

async function main() {
  if (!uri || !String(uri).trim()) {
    console.error('Missing MONGODB_URI or MONGO_URI in server/.env');
    process.exit(1);
  }

  const userMatch = uri.match(/mongodb(\+srv)?:\/\/([^:@/]+)/);
  const user = userMatch?.[2] ?? 'unknown';
  const safe = uri.replace(/:([^:@/]+)@/, ':***@');
  console.log('Connecting as user:', user);
  console.log('URI:', safe);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('OK — MongoDB connection successful');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    if (/bad auth|authentication failed/i.test(err.message)) {
      console.error('');
      console.error('Fix: In Atlas → Database & Network Access → Database Users, reset the password');
      console.error('      then update MONGODB_URI in server/.env');
      console.error('      If PowerShell still fails after fixing .env, run:');
      console.error('      Remove-Item Env:MONGODB_URI -ErrorAction SilentlyContinue');
    }
    process.exit(1);
  }
}

void main();
