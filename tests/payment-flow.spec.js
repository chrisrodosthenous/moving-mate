const { test, expect, request } = require('@playwright/test');
const { registerDriverViaApi } = require('./helpers/register-driver');
const {
  DEFAULT_LOGISTICS_PAYLOAD,
  testOrderPrice,
} = require('./helpers/order-logistics-payload');
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

async function loginToken(backend, emailOrPhone, password) {
  const res = await backend.post('/api/auth/login', {
    data: { emailOrPhone, password },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json.token;
}

function buildCreateOrderPayload({ price, distanceKm = 4, runId }) {
  return {
    pickupDistrict: 'Nicosia',
    pickupLocation: {
      address: `Payment test pickup ${runId}`,
      lat: 35.1856,
      lng: 33.3823,
    },
    dropoffLocation: {
      address: `Payment test dropoff ${runId}`,
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

test.describe('Mock payment lifecycle', () => {
  test('authorize → capture on accept → delivery credits → withdrawals', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const password = 'E2ePass1!';

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      expect(bootstrapRes.ok()).toBeTruthy();
      const bootstrap = await bootstrapRes.json();

      const customerToken = await loginToken(backend, bootstrap.customer.email, password);
      const driverToken = await loginToken(backend, bootstrap.driver.email, password);

      const price = testOrderPrice(4, 'pickup');
      const createRes = await backend.post('/api/orders', {
        headers: { Authorization: `Bearer ${customerToken}` },
        data: buildCreateOrderPayload({ price, runId }),
      });
      expect(createRes.status()).toBe(201);
      const orderId = String((await createRes.json())._id);

      const acceptBlocked = await backend.put(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${driverToken}` },
        data: { status: 'accepted' },
      });
      expect(acceptBlocked.status()).toBe(402);

      const authRes = await authorizeOrderPayment(backend, orderId, customerToken);
      expect(authRes.ok()).toBeTruthy();
      expect((await authRes.json()).paymentStatus).toBe('authorized');

      const acceptOk = await backend.put(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${driverToken}` },
        data: { status: 'accepted' },
      });
      expect(acceptOk.status()).toBe(200);

      const deliverRes = await backend.patch(`/api/orders/${orderId}/deliver`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      expect(deliverRes.ok()).toBeTruthy();
      const delivered = await deliverRes.json();
      expect(delivered.paymentStatus).toBe('captured');
      expect(delivered.driverEarnings).toBeGreaterThan(0);

      const driverWallet = await backend.get('/api/wallet', {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      expect(driverWallet.ok()).toBeTruthy();
      const dw = await driverWallet.json();
      expect(dw.wallet.availableBalance).toBeCloseTo(delivered.driverEarnings, 2);

      const wd = await backend.post('/api/wallet/withdraw', {
        headers: { Authorization: `Bearer ${driverToken}` },
        data: { amount: 5 },
      });
      expect(wd.ok()).toBeTruthy();

      const adminToken = await loginToken(backend, bootstrap.admin.email, password);
      const platformWallet = await backend.get('/api/admin/wallet', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(platformWallet.ok()).toBeTruthy();
      const pw = await platformWallet.json();
      expect(pw.wallet.availableBalance).toBeGreaterThan(0);

      const adminWd = await backend.post('/api/admin/wallet/withdraw', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { amount: 1 },
      });
      expect(adminWd.ok()).toBeTruthy();
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend.dispose();
    }
  });

  test('cancel pending authorized order releases payment', async () => {
    const runId = uniqueRunId();
    const backend = await request.newContext({ baseURL: API_BASE });
    const password = 'E2ePass1!';

    try {
      const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
      const bootstrap = await bootstrapRes.json();
      const customerToken = await loginToken(backend, bootstrap.customer.email, password);

      const price = testOrderPrice(3, 'pickup');
      const createRes = await backend.post('/api/orders', {
        headers: { Authorization: `Bearer ${customerToken}` },
        data: buildCreateOrderPayload({ price, distanceKm: 3, runId }),
      });
      const orderId = String((await createRes.json())._id);
      await authorizeOrderPayment(backend, orderId, customerToken);

      const cancelRes = await backend.patch(`/api/orders/${orderId}/cancel`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(cancelRes.ok()).toBeTruthy();

      const statusRes = await backend.get(`/api/payments/status/${orderId}`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const statusBody = await statusRes.json();
      expect(statusBody.intentStatus).toBe('cancelled');
    } finally {
      await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
      await backend.dispose();
    }
  });
});
