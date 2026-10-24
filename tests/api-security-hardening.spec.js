const { test, expect, request } = require('@playwright/test');
const { registerDriverViaApi } = require('./helpers/register-driver');
const { authorizeOrderPayment } = require('./helpers/payments');
const {
  DEFAULT_LOGISTICS_PAYLOAD,
  testOrderPrice,
} = require('./helpers/order-logistics-payload');

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

async function loginToken(backend, emailOrPhone, password) {
  const res = await backend.post('/api/auth/login', {
    data: { emailOrPhone, password },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.token).toBeTruthy();
  return json.token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function buildCreateOrderPayload({ price, distanceKm = 10, runId }) {
  return {
    pickupDistrict: 'Nicosia',
    pickupLocation: {
      address: `Security test pickup ${runId}`,
      lat: 35.1856,
      lng: 33.3823,
    },
    dropoffLocation: {
      address: `Security test dropoff ${runId}`,
      lat: 35.19,
      lng: 33.39,
    },
    price,
    distanceKm,
    smallBoxes: 1,
    mediumBoxes: 0,
    largeBoxes: 0,
    ...DEFAULT_LOGISTICS_PAYLOAD,
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

test.describe('API security hardening', () => {
  test('H4: unverified driver receives 403 on /api/orders/summary and /api/orders', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const unverifiedEmail = `e2e-unverified-${runId}@movingmate.test`;
    const password = 'SecTestPass1!';

    try {
      const regRes = await registerDriverViaApi(backend, {
        firstName: 'Unverified',
        lastName: 'Driver',
        email: unverifiedEmail,
        password,
        phoneNumber: phoneFromRunId(`${runId}-unv`, 91),
        districts: ['Nicosia'],
        includeLicense: true,
        includeVehiclePhoto: true,
      });
      expect(regRes.status()).toBe(201);

      const token = await loginToken(backend, unverifiedEmail, password);

      const summaryRes = await backend.get('/api/orders/summary', {
        headers: authHeaders(token),
      });
      expect(summaryRes.status()).toBe(403);
      expect(await summaryRes.json()).toMatchObject({ message: 'Driver not verified' });

      const ordersRes = await backend.get('/api/orders', {
        headers: authHeaders(token),
      });
      expect(ordersRes.status()).toBe(403);
      expect(await ordersRes.json()).toMatchObject({ message: 'Driver not verified' });
    } finally {
      await backend
        .post('/api/test/e2e/delete-user-by-email', { data: { email: unverifiedEmail } })
        .catch(() => {});
      await backend.dispose();
    }
  });

  test('price tampering: server rejects manipulated client price (orderPricing.js)', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();

      const customerToken = await loginToken(
        backend,
        bootstrap.customer.email,
        bootstrap.customer.password,
      );

      const distanceKm = 10;
      const serverPrice = testOrderPrice(distanceKm, 'pickup');
      const tamperedPrice = 2;

      expect(tamperedPrice).not.toBe(serverPrice);

      const rejectRes = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: buildCreateOrderPayload({ price: tamperedPrice, distanceKm, runId }),
      });
      expect(rejectRes.status()).toBe(400);
      const rejectBody = await rejectRes.json();
      expect(rejectBody.message).toMatch(/Price mismatch/i);
      expect(rejectBody.message).toContain(serverPrice.toFixed(2));

      const acceptRes = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: buildCreateOrderPayload({ price: serverPrice, distanceKm, runId: `${runId}-ok` }),
      });
      expect(acceptRes.status()).toBe(201);
      const created = await acceptRes.json();
      expect(created.price).toBe(serverPrice);
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend.dispose();
    }
  });

  test('H5: concurrent PUT accept — one 200 OK and one 409 Conflict', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const driver2Email = `e2e-driver2-${runId}@movingmate.test`;
    const password = 'E2ePass1!';

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();

      const reg2 = await registerDriverViaApi(backend, {
        firstName: 'Race',
        lastName: 'Driver',
        email: driver2Email,
        password,
        phoneNumber: phoneFromRunId(`${runId}-d2`, 42),
        districts: ['Nicosia'],
        includeLicense: true,
        includeVehiclePhoto: true,
      });
      expect(reg2.status()).toBe(201);

      const verify2 = await backend.post('/api/test/e2e/set-driver-verified', {
        data: { email: driver2Email },
      });
      expect(verify2.ok()).toBeTruthy();

      const customerToken = await loginToken(
        backend,
        bootstrap.customer.email,
        bootstrap.customer.password,
      );
      const driver1Token = await loginToken(backend, bootstrap.driver.email, password);
      const driver2Token = await loginToken(backend, driver2Email, password);

      const distanceKm = 4;
      const price = testOrderPrice(distanceKm, 'pickup');
      const createRes = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: buildCreateOrderPayload({ price, distanceKm, runId }),
      });
      expect(createRes.status()).toBe(201);
      const orderId = String((await createRes.json())._id);

      const authRes = await authorizeOrderPayment(backend, orderId, customerToken);
      expect(authRes.ok()).toBeTruthy();

      const acceptPayload = { status: 'accepted' };
      const [resA, resB] = await Promise.all([
        backend.put(`/api/orders/${orderId}`, {
          headers: authHeaders(driver1Token),
          data: acceptPayload,
        }),
        backend.put(`/api/orders/${orderId}`, {
          headers: authHeaders(driver2Token),
          data: acceptPayload,
        }),
      ]);

      const outcomes = [
        { status: resA.status(), body: await resA.json() },
        { status: resB.status(), body: await resB.json() },
      ];

      const successes = outcomes.filter((o) => o.status === 200);
      const conflicts = outcomes.filter((o) => o.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].body).toMatchObject({ message: 'Order no longer available.' });
      expect(successes[0].body.status).toBe('accepted');
      expect(String(successes[0].body.driverId)).toBeTruthy();
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend
        .post('/api/test/e2e/delete-user-by-email', { data: { email: driver2Email } })
        .catch(() => {});
      await backend.dispose();
    }
  });

  test('unauthenticated POST /api/orders is 401', async () => {
    const backend = await request.newContext({ baseURL: API_BASE });
    try {
      const res = await backend.post('/api/orders', { data: { price: 1 } });
      expect(res.status()).toBe(401);
    } finally {
      await backend.dispose();
    }
  });

  test('signed quote is required to match the job; a later config edit does not change it', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();
      const customerToken = await loginToken(
        backend,
        bootstrap.customer.email,
        bootstrap.customer.password,
      );
      const adminToken = await loginToken(backend, bootstrap.admin.email, bootstrap.admin.password);

      const denied = await backend.get('/api/admin/pricing-config', {
        headers: authHeaders(customerToken),
      });
      expect(denied.status()).toBe(403);

      const logistics = {
        distanceKm: 18,
        cargoInventory: { boxes: 20, mediumItems: 6, largeFurniture: 5, heavyAppliances: 2 },
        pickupFloor: '3',
        destinationFloor: '0',
        hasElevator: false,
        laborRequired: 'driver_plus_helper',
      };

      const missing = await backend.post('/api/orders/quote', {
        headers: authHeaders(customerToken),
        data: { distanceKm: 18 },
      });
      expect(missing.status()).toBe(400);

      const quoteRes = await backend.post('/api/orders/quote', {
        headers: authHeaders(customerToken),
        data: logistics,
      });
      expect(quoteRes.status()).toBe(200);
      const quote = await quoteRes.json();
      expect(quote.vehicleType).toBe('truck');
      expect(typeof quote.quoteToken).toBe('string');
      expect(quote.breakdown.total).toBeGreaterThan(0);

      const orderBody = {
        pickupDistrict: 'Nicosia',
        pickupLocation: { address: `Quote pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Quote drop ${runId}`, lat: 35.19, lng: 33.39 },
        vehicleType: quote.vehicleType,
        smallBoxes: 20,
        mediumBoxes: 6,
        largeBoxes: 7,
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        ...logistics,
      };

      const changed = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: { ...orderBody, laborRequired: 'none', quoteToken: quote.quoteToken },
      });
      expect(changed.status()).toBe(400);
      expect((await changed.json()).message).toMatch(/changed/i);

      const forged = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: { ...orderBody, quoteToken: `${quote.quoteToken.slice(0, -4)}aaaa` },
      });
      expect(forged.status()).toBe(400);

      const created = await backend.post('/api/orders', {
        headers: authHeaders(customerToken),
        data: { ...orderBody, quoteToken: quote.quoteToken },
      });
      expect(created.status()).toBe(201);
      const createdBody = await created.json();
      expect(createdBody.price).toBe(quote.breakdown.total);
      expect(createdBody.driverEarnings).toBe(quote.driverEarnings);

      const preview = await backend.get('/api/admin/pricing-config', {
        headers: authHeaders(adminToken),
      });
      expect(preview.status()).toBe(200);
      const previewJson = await preview.json();
      expect(previewJson.preview.length).toBe(4);
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend.dispose();
    }
  });
});
