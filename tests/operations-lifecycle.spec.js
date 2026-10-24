const { test, expect, request } = require('@playwright/test');
const { registerDriverViaApi } = require('./helpers/register-driver');
const { authorizeOrderPayment } = require('./helpers/payments');

const API_BASE = 'http://127.0.0.1:3000';

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function phoneFromRunId(runId, salt = 0) {
  let acc = 17 + salt;
  for (const ch of String(runId)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000;
  }
  return `+357${String(acc).padStart(8, '0')}`;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(backend, emailOrPhone, password) {
  const res = await backend.post('/api/auth/login', {
    data: { emailOrPhone, password },
  });
  expect(res.status(), await res.text()).toBe(200);
  const json = await res.json();
  expect(json.token).toBeTruthy();
  expect(json.user?.id).toBeTruthy();
  return json;
}

function scheduledIn(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** 1 box → pickup. Shared by the guard tests and the paid lifecycle. */
function pickupJob(runId, extras = {}) {
  return {
    pickupDistrict: 'Nicosia',
    pickupLocation: { address: `Ops pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
    dropoffLocation: { address: `Ops dropoff ${runId}`, lat: 35.19, lng: 33.39 },
    distanceKm: 10,
    vehicleType: 'pickup',
    cargoInventory: { boxes: 1, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
    pickupFloor: '0',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'none',
    scheduledAt: scheduledIn(2),
    ...extras,
  };
}

/** 2-bed inventory scores as a truck. Used to prove a signed quote survives a config edit. */
function truckJob() {
  return {
    distanceKm: 18,
    cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
    pickupFloor: '3',
    destinationFloor: '0',
    hasElevator: false,
    laborRequired: 'driver_plus_helper',
  };
}

test.describe('operations lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('public registration rejects an admin role and an under-age driver', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const email = `e2e-customer-${runId}@movingmate.test`;
    const password = 'OpsPass1!';

    try {
      const adminRole = await backend.post('/api/auth/register', {
        data: {
          firstName: 'Bad',
          lastName: 'Role',
          email,
          password,
          phoneNumber: phoneFromRunId(runId, 1),
          dateOfBirth: '1992-05-05',
          role: 'admin',
        },
      });
      expect(adminRole.status()).toBe(400);

      const tooYoung = await registerDriverViaApi(backend, {
        firstName: 'Young',
        lastName: 'Driver',
        email: `e2e-driver-${runId}-young@movingmate.test`,
        password,
        phoneNumber: phoneFromRunId(runId, 2),
        dateOfBirth: '2010-01-01',
      });
      expect(tooYoung.status()).toBe(400);
      expect((await tooYoung.json()).message).toMatch(/18 and 65/i);

      const customer = await backend.post('/api/auth/register', {
        data: {
          firstName: 'Ops',
          lastName: 'Customer',
          email,
          password,
          phoneNumber: phoneFromRunId(runId, 1),
          dateOfBirth: '1992-05-05',
          role: 'customer',
        },
      });
      expect(customer.status()).toBe(201);
      const session = await login(backend, email, password);
      expect(session.user.role).toBe('customer');

      const unknown = await backend.post('/api/auth/forgot-password', {
        data: { email: `missing-${runId}@movingmate.test` },
      });
      expect(unknown.status()).toBe(404);

      const reset = await backend.post('/api/auth/forgot-password', { data: { email } });
      expect([200, 502]).toContain(reset.status());
      const resetBody = await reset.json();
      if (reset.status() === 502) {
        expect(resetBody.message).toMatch(/could not send the reset email/i);
      } else {
        expect(resetBody.message).toMatch(/reset link has been sent/i);
      }
    } finally {
      await backend.post('/api/test/e2e/delete-user-by-email', { data: { email } }).catch(() => {});
      await backend.dispose();
    }
  });

  test('order guards: vehicle, schedule, unpaid accept, and district', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();
      const customer = await login(backend, bootstrap.customer.email, bootstrap.customer.password);
      const driver = await login(backend, bootstrap.driver.email, bootstrap.driver.password);

      const wrongVehicle = await backend.post('/api/orders', {
        headers: authHeaders(customer.token),
        data: pickupJob(runId, { vehicleType: 'van', price: 1 }),
      });
      expect(wrongVehicle.status()).toBe(400);
      expect((await wrongVehicle.json()).message).toMatch(/must be pickup/i);

      const tooSoon = await backend.post('/api/orders', {
        headers: authHeaders(customer.token),
        data: pickupJob(`${runId}-soon`, { scheduledAt: scheduledIn(0.2), price: 1 }),
      });
      expect(tooSoon.status()).toBe(400);
      expect((await tooSoon.json()).message).toMatch(/at least 1 hour/i);

      const quoteRes = await backend.post('/api/orders/quote', {
        headers: authHeaders(customer.token),
        data: {
          distanceKm: 10,
          cargoInventory: { boxes: 1, mediumItems: 0, largeFurniture: 0, heavyAppliances: 0 },
          pickupFloor: '0',
          destinationFloor: '0',
          hasElevator: false,
          laborRequired: 'none',
        },
      });
      expect(quoteRes.status()).toBe(200);
      const quote = await quoteRes.json();
      expect(quote.vehicleType).toBe('pickup');

      const created = await backend.post('/api/orders', {
        headers: authHeaders(customer.token),
        data: pickupJob(runId, { quoteToken: quote.quoteToken, price: 1 }),
      });
      expect(created.status()).toBe(201);
      const order = await created.json();
      expect(order.price).toBe(quote.breakdown.total);
      expect(order.driverEarnings).toBe(quote.driverEarnings);
      expect(order.platformCommission).toBe(quote.platformCommission);
      const orderId = String(order._id);

      const unpaid = await backend.patch(`/api/orders/${orderId}/accept`, {
        headers: authHeaders(driver.token),
      });
      expect(unpaid.status()).toBe(402);
      expect((await unpaid.json()).message).toMatch(/Payment required/i);

      const limassol = await registerDriverViaApi(backend, {
        firstName: 'Limassol',
        lastName: 'Driver',
        email: `e2e-limassol-${runId}@movingmate.test`,
        password: 'OpsPass1!',
        phoneNumber: phoneFromRunId(runId, 9),
        districts: ['Limassol'],
        vehicleType: 'pickup',
      });
      expect(limassol.status()).toBe(201);
      const verify = await backend.post('/api/test/e2e/set-driver-verified', {
        data: { email: `e2e-limassol-${runId}@movingmate.test` },
      });
      expect(verify.ok()).toBeTruthy();
      const otherDistrict = await login(
        backend,
        `e2e-limassol-${runId}@movingmate.test`,
        'OpsPass1!',
      );

      const pay = await authorizeOrderPayment(backend, orderId, customer.token);
      expect(pay.ok()).toBeTruthy();

      const wrongDistrict = await backend.patch(`/api/orders/${orderId}/accept`, {
        headers: authHeaders(otherDistrict.token),
      });
      expect(wrongDistrict.status()).toBe(403);
      expect((await wrongDistrict.json()).message).toMatch(/districts/i);

      const accepted = await backend.patch(`/api/orders/${orderId}/accept`, {
        headers: authHeaders(driver.token),
      });
      expect(accepted.status()).toBe(200);
      expect((await accepted.json()).status).toBe('accepted');

      const cancelAfterAccept = await backend.patch(`/api/orders/${orderId}/cancel`, {
        headers: authHeaders(customer.token),
      });
      expect(cancelAfterAccept.status()).toBe(400);
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend
        .post('/api/test/e2e/delete-user-by-email', {
          data: { email: `e2e-limassol-${runId}@movingmate.test` },
        })
        .catch(() => {});
      await backend.dispose();
    }
  });

  test('admin approves a driver, then book, pay, deliver, rate, and wallet stay in sync', async () => {
    test.setTimeout(90000);
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const driverEmail = `e2e-pending-${runId}@movingmate.test`;
    const password = 'OpsPass1!';
    let originalConfig = null;
    let adminToken = '';

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();
      const admin = await login(backend, bootstrap.admin.email, bootstrap.admin.password);
      adminToken = admin.token;
      const customer = await login(backend, bootstrap.customer.email, bootstrap.customer.password);

      const customerOverview = await backend.get('/api/admin/overview', {
        headers: authHeaders(customer.token),
      });
      expect(customerOverview.status()).toBe(403);

      const registered = await registerDriverViaApi(backend, {
        firstName: 'Pending',
        lastName: 'Driver',
        email: driverEmail,
        password,
        phoneNumber: phoneFromRunId(runId, 4),
        districts: ['Nicosia'],
        vehicleType: 'truck',
      });
      expect(registered.status()).toBe(201);
      const driverSession = await login(backend, driverEmail, password);
      expect(driverSession.user.isVerified).toBe(false);

      const blocked = await backend.get('/api/orders', { headers: authHeaders(driverSession.token) });
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()).message).toBe('Driver not verified');

      const pending = await backend.get('/api/admin/pending-verifications', {
        headers: authHeaders(admin.token),
      });
      expect(pending.status()).toBe(200);
      expect((await pending.json()).users.some((user) => user.email === driverEmail)).toBe(true);

      const approved = await backend.patch(`/api/admin/verify-driver/${driverSession.user.id}`, {
        headers: authHeaders(admin.token),
        data: { status: 'approved' },
      });
      expect(approved.status(), await approved.text()).toBe(200);

      const openJobs = await backend.get('/api/orders', { headers: authHeaders(driverSession.token) });
      expect(openJobs.status()).toBe(200);

      const logistics = truckJob();
      const quoteRes = await backend.post('/api/orders/quote', {
        headers: authHeaders(customer.token),
        data: logistics,
      });
      expect(quoteRes.status()).toBe(200);
      const quote = await quoteRes.json();
      expect(quote.vehicleType).toBe('truck');
      expect(quote.breakdown.total).toBeGreaterThan(0);

      const currentConfig = await backend.get('/api/admin/pricing-config', {
        headers: authHeaders(admin.token),
      });
      expect(currentConfig.status()).toBe(200);
      originalConfig = (await currentConfig.json()).config;

      const raised = await backend.put('/api/admin/pricing-config', {
        headers: authHeaders(admin.token),
        data: {
          config: {
            ...originalConfig,
            driverHourlyTargetEur: Number(originalConfig.driverHourlyTargetEur) + 40,
            dieselPricePerLitreEur: Number(originalConfig.dieselPricePerLitreEur) + 4,
          },
        },
      });
      expect(raised.status()).toBe(200);

      const requote = await backend.post('/api/orders/quote', {
        headers: authHeaders(customer.token),
        data: logistics,
      });
      expect(requote.status()).toBe(200);
      const requoteBody = await requote.json();
      expect(requoteBody.breakdown.total).not.toBe(quote.breakdown.total);

      const created = await backend.post('/api/orders', {
        headers: authHeaders(customer.token),
        data: {
          pickupDistrict: 'Nicosia',
          pickupLocation: { address: `Truck pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
          dropoffLocation: { address: `Truck dropoff ${runId}`, lat: 35.2, lng: 33.4 },
          vehicleType: quote.vehicleType,
          scheduledAt: scheduledIn(3),
          quoteToken: quote.quoteToken,
          ...logistics,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const order = await created.json();
      expect(order.price).toBe(quote.breakdown.total);
      expect(order.driverEarnings).toBe(quote.driverEarnings);
      expect(order.platformCommission).toBe(quote.platformCommission);
      const orderId = String(order._id);
      const lockedDriverEarnings = order.driverEarnings;
      const lockedPlatformCommission = order.platformCommission;

      const pickupDriver = await login(backend, bootstrap.driver.email, bootstrap.driver.password);
      const pay = await authorizeOrderPayment(backend, orderId, customer.token);
      expect(pay.ok()).toBeTruthy();

      const wrongVehicle = await backend.patch(`/api/orders/${orderId}/accept`, {
        headers: authHeaders(pickupDriver.token),
      });
      expect(wrongVehicle.status()).toBe(403);
      expect((await wrongVehicle.json()).message).toMatch(/vehicle type/i);

      const driverBefore = await backend.get('/api/wallet', {
        headers: authHeaders(driverSession.token),
      });
      expect(driverBefore.status()).toBe(200);
      const driverBalanceBefore = (await driverBefore.json()).wallet.availableBalance;

      const platformBefore = await backend.get('/api/admin/wallet', {
        headers: authHeaders(admin.token),
      });
      expect(platformBefore.status()).toBe(200);
      const platformBalanceBefore = (await platformBefore.json()).wallet.availableBalance;

      const accepted = await backend.patch(`/api/orders/${orderId}/accept`, {
        headers: authHeaders(driverSession.token),
      });
      expect(accepted.status(), await accepted.text()).toBe(200);
      expect((await accepted.json()).paymentStatus).toBe('captured');

      const pickup = await backend.patch(`/api/orders/${orderId}/pickup`, {
        headers: authHeaders(driverSession.token),
      });
      expect(pickup.status()).toBe(200);
      expect((await pickup.json()).status).toBe('driver_is_on_the_way');

      const delivered = await backend.patch(`/api/orders/${orderId}/deliver`, {
        headers: authHeaders(driverSession.token),
      });
      expect(delivered.status(), await delivered.text()).toBe(200);
      const deliveredBody = await delivered.json();
      expect(deliveredBody.status).toBe('delivered');
      expect(deliveredBody.driverEarnings).toBe(lockedDriverEarnings);
      expect(deliveredBody.platformCommission).toBe(lockedPlatformCommission);

      const rated = await backend.post(`/api/orders/${orderId}/rate`, {
        headers: authHeaders(customer.token),
        data: { rating: 5, review: 'Careful with the wardrobe' },
      });
      expect(rated.status()).toBe(200);
      expect((await rated.json()).rating).toBe(5);

      const driverAfter = await backend.get('/api/wallet', {
        headers: authHeaders(driverSession.token),
      });
      const platformAfter = await backend.get('/api/admin/wallet', {
        headers: authHeaders(admin.token),
      });
      const driverBalanceAfter = (await driverAfter.json()).wallet.availableBalance;
      const platformBalanceAfter = (await platformAfter.json()).wallet.availableBalance;
      expect(Number((driverBalanceAfter - driverBalanceBefore).toFixed(2))).toBe(lockedDriverEarnings);
      expect(Number((platformBalanceAfter - platformBalanceBefore).toFixed(2))).toBe(
        lockedPlatformCommission,
      );

      const overdraw = await backend.post('/api/wallet/withdraw', {
        headers: authHeaders(driverSession.token),
        data: { amount: driverBalanceAfter + 1 },
      });
      expect(overdraw.status()).toBe(400);
      expect((await overdraw.json()).message).toMatch(/Insufficient balance/i);

      const mine = await backend.get('/api/orders/mine?scope=active&view=summary&limit=10', {
        headers: authHeaders(customer.token),
      });
      expect(mine.status()).toBe(200);
      const mineBody = await mine.json();
      expect(mineBody.orders.some((row) => String(row._id) === orderId)).toBe(false);
    } finally {
      if (originalConfig && adminToken) {
        await backend
          .put('/api/admin/pricing-config', {
            headers: authHeaders(adminToken),
            data: { config: originalConfig },
          })
          .catch(() => {});
      }
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {});
      await backend.dispose();
    }
  });
});
