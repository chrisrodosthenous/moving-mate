const { test, expect, request } = require('@playwright/test');
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload');

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

test('chat read receipts: one gray tick then two blue ticks after driver reads', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const driverEmail = `e2e-driver-${runId}@movingmate.test`;
  const driverPassword = 'E2ePass1!';
  const customerMsg = `Ticks test message ${runId}`;

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } });
    expect(bootstrapRes.ok()).toBeTruthy();
    const bootstrap = await bootstrapRes.json();

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
        pickupLocation: { address: `Ticks pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Ticks drop ${runId}`, lat: 35.19, lng: 33.39 },
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

    const driverLogin = await backend.post('/api/auth/login', {
      data: {
        emailOrPhone: bootstrap.driver?.email ?? driverEmail,
        password: bootstrap.driver?.password ?? driverPassword,
      },
    });
    expect(driverLogin.ok()).toBeTruthy();
    const driverAuth = await driverLogin.json();

    const acceptRes = await backend.patch(`/api/orders/${orderId}/accept`, {
      headers: { Authorization: `Bearer ${driverAuth.token}` },
      data: {},
    });
    expect(acceptRes.ok()).toBeTruthy();

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
    await customerPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(customerPage.getByTestId('order-chat-drawer')).toBeVisible();

    const sendPromise = customerPage.waitForResponse(
      (resp) => resp.url().includes('/api/chat/send') && resp.request().method() === 'POST',
    );
    await customerPage.getByTestId('chat-message-input').fill(customerMsg);
    await customerPage.getByTestId('chat-send-button').click();
    const sendResp = await sendPromise;
    expect(sendResp.status()).toBe(201);

    await expect(customerPage.locator('[data-testid^="chat-ticks-single-"]').first()).toBeVisible({ timeout: 15000 });

    await driverPage.goto(baseURL);
    await driverPage.evaluate(
      ([token, userJson]) => {
        localStorage.setItem('moving_mate_token', token);
        localStorage.setItem('moving_mate_user', userJson);
      },
      [driverAuth.token, JSON.stringify(driverAuth.user)],
    );
    await driverPage.goto(`${baseURL}/driver/tasks`);
    await driverPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(driverPage.getByTestId('order-chat-drawer')).toBeVisible();

    await customerPage.waitForTimeout(6000);

    await expect(customerPage.locator('[data-testid^="chat-ticks-double-"]').first()).toBeVisible({ timeout: 20000 });

    await customerCtx.close();
    await driverCtx.close();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
