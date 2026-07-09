const path = require('path');
const { test, expect, request } = require('@playwright/test');
const {
  selectOrderRouteOnMap,
  fillOrderBoxesAndSchedule,
  acceptSafetyConsent,
} = require('./helpers/new-order-form');
const { gotoDriverAvailableJobs } = require('./helpers/register-driver');
const { authorizeOrderPayment } = require('./helpers/payments');

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

test('driver flow: customer order in Nicosia, driver sees and accepts', async ({ page, baseURL }) => {
  test.setTimeout(120000);
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

    await page.goto(`${baseURL}/login`);
    await login(page, bootstrap.customer.email, bootstrap.customer.password);
    await expect(page).toHaveURL(/\/customer\/dashboard$/);

    await page.getByTestId('sidebar').getByRole('link', { name: /new order/i }).click();
    await expect(page).toHaveURL(/\/customer\/book$/);

    await page.getByLabel('Pickup district').selectOption('Nicosia');
    await selectOrderRouteOnMap(page);

    await fillOrderBoxesAndSchedule(page, { medium: 0 });
    await page.setInputFiles('#cargoPhoto', path.join(__dirname, 'fixtures', 'id-card-test.png'));
    await acceptSafetyConsent(page);

    const createRespPromise = page.waitForResponse((resp) => (
      resp.url().includes('/api/orders') && resp.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: /confirm order/i }).click();
    const createResp = await createRespPromise;
    await expect(createResp.status()).toBe(201);
    const created = await createResp.json();
    const orderId = String(created._id);

    const customerLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: bootstrap.customer.email, password: bootstrap.customer.password },
    });
    expect(customerLogin.ok()).toBeTruthy();
    const customerToken = (await customerLogin.json()).token;
    const paymentRes = await authorizeOrderPayment(backend, orderId, customerToken);
    expect(paymentRes.ok()).toBeTruthy();

    await page.getByTestId('sidebar').getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto(`${baseURL}/login`);
    await login(page, bootstrap.driver?.email ?? driverEmail, bootstrap.driver?.password ?? driverPassword);
    await expect(page).toHaveURL(/\/driver\/dashboard$/);

    await gotoDriverAvailableJobs(page, baseURL);
    await expect(page.getByTestId(`accept-order-${orderId}`)).toBeVisible({ timeout: 15000 });

    const acceptPromise = page.waitForResponse((resp) => (
      resp.url().includes(`/api/orders/${orderId}/accept`) && resp.request().method() === 'PATCH'
    ));
    await page.getByTestId(`accept-order-${orderId}`).click();
    const acceptResp = await acceptPromise;
    await expect(acceptResp.status()).toBe(200);
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
