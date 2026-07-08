#!/usr/bin/env node
/**
 * Verifies forgot-password + reset-password API flow against local server + MongoDB.
 * Run: node server/scripts/passwordResetFlowTest.js
 * Optional: TEST_EMAIL=you@example.com API_BASE=http://127.0.0.1:3000
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/env');
const User = require('../models/User');

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TEST_EMAIL = (process.env.TEST_EMAIL || '').trim().toLowerCase();
const NEW_PASSWORD = 'ResetFlow1!';

async function findTestUser() {
  if (TEST_EMAIL) {
    const u = await User.findOne({ email: TEST_EMAIL, role: { $ne: 'admin' } });
    if (!u) throw new Error(`No non-admin user for TEST_EMAIL=${TEST_EMAIL}`);
    return u;
  }
  const u = await User.findOne({ role: 'customer', email: { $exists: true, $ne: '' } }).sort({ createdAt: -1 });
  if (!u) throw new Error('No customer with email in DB — set TEST_EMAIL or register a customer.');
  return u;
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  await mongoose.connect(getMongoUri());
  const user = await findTestUser();
  const email = user.email.trim().toLowerCase();
  console.log(`Using account: ${email} (${user.role})`);

  const forgot = await postJson('/api/auth/forgot-password', { email });
  if (forgot.status !== 200) {
    throw new Error(`forgot-password failed: ${forgot.status} ${JSON.stringify(forgot.data)}`);
  }
  const afterForgot = await User.findById(user._id).select('+passwordResetTokenHash passwordResetExpires');
  if (!afterForgot?.passwordResetTokenHash || !afterForgot.passwordResetExpires) {
    throw new Error('forgot-password did not persist reset token on user');
  }
  console.log('OK forgot-password — reset token stored, expires:', afterForgot.passwordResetExpires);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  afterForgot.passwordResetTokenHash = tokenHash;
  afterForgot.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await afterForgot.save();

  const reset = await postJson('/api/auth/reset-password', {
    token: rawToken,
    newPassword: NEW_PASSWORD,
  });
  if (reset.status !== 200) {
    throw new Error(`reset-password failed: ${reset.status} ${JSON.stringify(reset.data)}`);
  }
  console.log('OK reset-password —', reset.data.message);

  const login = await postJson('/api/auth/login', {
    emailOrPhone: email,
    password: NEW_PASSWORD,
  });
  if (login.status !== 200 || !login.data.token) {
    throw new Error(`login with new password failed: ${login.status} ${JSON.stringify(login.data)}`);
  }
  console.log('OK login with new password');

  const cleared = await User.findById(user._id).select('+passwordResetTokenHash passwordResetExpires');
  if (cleared?.passwordResetTokenHash || cleared?.passwordResetExpires) {
    throw new Error('reset fields were not cleared after reset');
  }
  console.log('OK reset fields cleared');
  console.log('\nPassword reset flow test passed.');
}

main()
  .catch((err) => {
    console.error('\nPassword reset flow test FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
