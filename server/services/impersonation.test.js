const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AdminAudit = require('../models/AdminAudit');
const ImpersonationGrant = require('../models/ImpersonationGrant');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');
const { impersonateUser, redeemImpersonation } = require('../controllers/adminController');
const { getJwtSecret } = require('../config/env');

const MONGODB_URI = 'mongodb://127.0.0.1:27017/movingmate_impersonation_test';

function tokenFor(user) {
  return jwt.sign({ userId: user._id, phone: user.phoneNumber, role: user.role }, getJwtSecret(), {
    expiresIn: '1h',
  });
}

async function post(base, path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

describe('admin impersonation', () => {
  let base;
  let server;
  let admin;
  let otherAdmin;
  let customer;
  let suspended;

  before(async () => {
    await mongoose.connect(MONGODB_URI);
    await Promise.all([
      User.deleteMany({ email: /@impersonation-test\.local$/ }),
      AdminAudit.deleteMany({}),
      ImpersonationGrant.deleteMany({}),
    ]);
    admin = await User.create({
      firstName: 'Audit',
      lastName: 'Admin',
      email: 'admin@impersonation-test.local',
      phoneNumber: '+35788001001',
      password: 'hashed-password',
      role: 'admin',
      isVerified: true,
    });
    otherAdmin = await User.create({
      firstName: 'Other',
      lastName: 'Admin',
      email: 'other-admin@impersonation-test.local',
      phoneNumber: '+35788001002',
      password: 'hashed-password',
      role: 'admin',
      isVerified: true,
    });
    customer = await User.create({
      firstName: 'Local',
      lastName: 'Customer',
      email: 'customer@impersonation-test.local',
      phoneNumber: '+35788001003',
      password: 'hashed-password',
      role: 'customer',
    });
    suspended = await User.create({
      firstName: 'Suspended',
      lastName: 'Customer',
      email: 'suspended@impersonation-test.local',
      phoneNumber: '+35788001004',
      password: 'hashed-password',
      role: 'customer',
      isSuspended: true,
    });

    const app = express();
    app.use(express.json());
    app.post('/api/admin/impersonate/redeem', authMiddleware, adminMiddleware, redeemImpersonation);
    app.post('/api/admin/impersonate/:id', authMiddleware, adminMiddleware, impersonateUser);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  it('rejects a customer token', async () => {
    const res = await post(base, `/api/admin/impersonate/${customer._id}`, tokenFor(customer));
    assert.equal(res.status, 403);
    assert.equal(res.json.token, undefined);
    assert.equal(res.json.code, undefined);
  });

  it('refuses a suspended account without creating an audit or a token', async () => {
    const beforeCount = await AdminAudit.countDocuments({ targetUserId: suspended._id });
    const res = await post(base, `/api/admin/impersonate/${suspended._id}`, tokenFor(admin));
    assert.equal(res.status, 400);
    assert.equal(res.json.token, undefined);
    assert.equal(res.json.code, undefined);
    assert.equal(await AdminAudit.countDocuments({ targetUserId: suspended._id }), beforeCount);
  });

  it('refuses impersonating another admin', async () => {
    const res = await post(base, `/api/admin/impersonate/${otherAdmin._id}`, tokenFor(admin));
    assert.equal(res.status, 404);
    assert.equal(res.json.token, undefined);
  });

  it('issues a one-time code and an 8-hour customer session that cannot be redeemed twice', async () => {
    const created = await post(base, `/api/admin/impersonate/${customer._id}`, tokenFor(admin));
    assert.equal(created.status, 200);
    assert.equal(typeof created.json.code, 'string');
    assert.equal(created.json.token, undefined);
    const audit = await AdminAudit.findOne({ targetUserId: customer._id, adminId: admin._id });
    assert.equal(audit?.action, 'impersonate');
    assert.equal(audit?.targetRole, 'customer');

    const redeemed = await post(base, '/api/admin/impersonate/redeem', tokenFor(admin), {
      code: created.json.code,
    });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.json.user.role, 'customer');
    const decoded = jwt.verify(redeemed.json.token, getJwtSecret());
    assert.equal(decoded.role, 'customer');
    assert.equal(String(decoded.impersonatedBy), String(admin._id));
    assert.ok(decoded.exp - decoded.iat <= 8 * 60 * 60);

    const again = await post(base, '/api/admin/impersonate/redeem', tokenFor(admin), {
      code: created.json.code,
    });
    assert.equal(again.status, 400);
    assert.equal(again.json.token, undefined);
  });
});
