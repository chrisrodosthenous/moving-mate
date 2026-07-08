const { test, expect, request } = require('@playwright/test');
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload');
const { clickCompletedOrdersTab } = require('./helpers/e2e-ui');
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

test('end-to-end: customer order syncs to Accepted then Completed via polling', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });

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

    const customerLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: bootstrap.customer.email, password: 'E2ePass1!' },
    });
    expect(customerLogin.ok()).toBeTruthy();
    const customerAuth = await customerLogin.json();
    const customerToken = customerAuth.token;

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const orderRes = await backend.post('/api/orders', {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        pickupDistrict: 'Nicosia',
        pickupLocation: { address: `E2E Sync pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `E2E Sync drop ${runId}`, lat: 35.19, lng: 33.39 },
        price: testOrderPrice(4),
        distanceKm: 4,
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

    const customerCtx = await browser.newContext();
    const driverCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();
    const driverPage = await driverCtx.newPage();

    await customerPage.goto(baseURL);
    await customerPage.evaluate(
      ([token, userJson]) => {
        localStorage.setItem('moving_mate_token', token);
        localStorage.setItem('moving_mate_user', userJson);
      },
      [customerToken, JSON.stringify(customerAuth.user)],
    );
    await customerPage.goto(`${baseURL}/customer/my-orders`);
    await expect(customerPage.getByTestId(`customer-order-status-${orderId}`)).toHaveText(/pending/i, {
      timeout: 15000,
    });

    await driverPage.goto(`${baseURL}/login`);
    await login(driverPage, bootstrap.driver?.email ?? driverEmail, bootstrap.driver?.password ?? driverPassword);
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/);
    await gotoDriverAvailableJobs(driverPage, baseURL);

    const acceptPromise = driverPage.waitForResponse((resp) => (
      resp.url().includes(`/api/orders/${orderId}/accept`) && resp.request().method() === 'PATCH'
    ));
    await driverPage.getByTestId(`accept-order-${orderId}`).click();
    await acceptPromise;

    await expect(customerPage.getByTestId(`customer-order-status-${orderId}`)).toHaveText(/accepted/i, {
      timeout: 15000,
    });
    await expect(customerPage.getByTestId(`customer-order-driver-${orderId}`)).toBeVisible({ timeout: 5000 });

    await driverPage.getByRole('link', { name: /my trips/i }).click();
    await expect(driverPage).toHaveURL(/\/driver\/tasks$/);

    const startPromise = driverPage.waitForResponse((resp) => (
      resp.url().includes(`/api/orders/${orderId}/status`) && resp.request().method() === 'PATCH'
    ));
    await driverPage.getByTestId(`start-delivery-${orderId}`).click();
    await startPromise;

    const completePromise = driverPage.waitForResponse((resp) => (
      resp.url().includes(`/api/orders/${orderId}/status`) && resp.request().method() === 'PATCH'
    ));
    await driverPage.getByTestId(`mark-completed-${orderId}`).click();
    await completePromise;

    await clickCompletedOrdersTab(customerPage);
    await expect(customerPage.getByTestId(`customer-order-status-${orderId}`)).toHaveText(/completed/i, {
      timeout: 15000,
    });

    await customerCtx.close();
    await driverCtx.close();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
