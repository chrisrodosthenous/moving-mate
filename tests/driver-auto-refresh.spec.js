const { test, expect, request } = require('@playwright/test');
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload');
const { gotoDriverAvailableJobs } = require('./helpers/register-driver');

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function phoneFromRunId(runId) {
  let acc = 17;
  for (const ch of String(runId)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000;
  }
  return String(acc).padStart(8, '0');
}

async function login(page, entry, password) {
  await page.getByLabel('Email or phone').fill(entry);
  await page.locator('#password').fill(password);
  const loginResponsePromise = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  await loginResponsePromise;
}

test('driver dashboard auto-refresh: new order appears without reload', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const pickupMarker = `AutoRefresh-${runId}`;

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
    expect(bootstrapRes.ok()).toBeTruthy();
    const bootstrap = await bootstrapRes.json();

    const driverEmail = `e2e-driver-${runId}@movingmate.test`;
    const driverPassword = 'E2ePass1!';
    if (!bootstrap.driver) {
      const regRes = await backend.post('/api/auth/register', {
        data: {
          firstName: 'E2E',
          lastName: 'Driver',
          email: driverEmail,
          password: driverPassword,
          phoneNumber: phoneFromRunId(`${runId}-drv`),
          dateOfBirth: '1988-06-01',
          role: 'driver',
          districts: ['Nicosia'],
        },
      });
      if (!regRes.ok()) {
        const body = await regRes.json().catch(() => ({}));
        if (!/already registered/i.test(String(body.message || ''))) {
          throw new Error(`Driver register failed: ${body.message || regRes.status()}`);
        }
      }
    }

    await page.goto(`${baseURL}/login`);
    await login(page, bootstrap.driver?.email ?? driverEmail, bootstrap.driver?.password ?? driverPassword);
    await expect(page).toHaveURL(/\/driver\/dashboard$/);

    await gotoDriverAvailableJobs(page, baseURL);

    const customerLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: bootstrap.customer.email, password: 'E2ePass1!' },
    });
    expect(customerLogin.ok()).toBeTruthy();
    const { token: customerToken } = await customerLogin.json();

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const orderRes = await backend.post('/api/orders', {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        pickupDistrict: 'Nicosia',
        pickupLocation: { address: `${pickupMarker} Nicosia`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Drop AutoRefresh ${runId}`, lat: 35.19, lng: 33.39 },
        price: testOrderPrice(3),
        distanceKm: 3,
        smallBoxes: 1,
        mediumBoxes: 0,
        largeBoxes: 0,
        ...DEFAULT_LOGISTICS_PAYLOAD,
        scheduledAt,
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const created = await orderRes.json();
    const orderId = String(created._id);

    await page.waitForTimeout(12000);

    await expect(page.getByTestId(`accept-order-${orderId}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(pickupMarker, { exact: false })).toBeVisible();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
