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

async function login(page, entry, password) {
  await page.getByLabel('Email or phone').fill(entry);
  await page.locator('#password').fill(password);
  const loginResponsePromise = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  await loginResponsePromise;
}

test('chat: driver and customer messages persist after reload', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const driverMsg = "I'm arriving in 5 mins";
  const customerReply = 'Ok, standing outside';

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
        pickupLocation: { address: `ChatFunc pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `ChatFunc drop ${runId}`, lat: 35.19, lng: 33.39 },
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

    const driverCtx = await browser.newContext();
    const customerCtx = await browser.newContext();
    const driverPage = await driverCtx.newPage();
    const customerPage = await customerCtx.newPage();

    await driverPage.goto(`${baseURL}/login`);
    await login(driverPage, bootstrap.driver?.email ?? driverEmail, bootstrap.driver?.password ?? driverPassword);
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/);
    await driverPage.getByRole('link', { name: /my trips/i }).click();
    await expect(driverPage).toHaveURL(/\/driver\/tasks$/);

    const sendDriverPromise = driverPage.waitForResponse((resp) => (
      resp.url().includes('/api/chat/send') && resp.request().method() === 'POST'
    ));
    await driverPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(driverPage.getByTestId('order-chat-drawer')).toBeVisible();
    await driverPage.getByTestId('chat-message-input').fill(driverMsg);
    await driverPage.getByTestId('chat-send-button').click();
    expect((await sendDriverPromise).status()).toBe(201);

    await customerPage.goto(baseURL);
    await customerPage.evaluate(
      ([token, userJson]) => {
        localStorage.setItem('moving_mate_token', token);
        localStorage.setItem('moving_mate_user', userJson);
      },
      [customerToken, JSON.stringify(customerAuth.user)],
    );
    await customerPage.goto(`${baseURL}/customer/orders`);
    await customerPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(customerPage.getByTestId('chat-messages')).toContainText(driverMsg, { timeout: 15000 });

    const sendCustomerPromise = customerPage.waitForResponse((resp) => (
      resp.url().includes('/api/chat/send') && resp.request().method() === 'POST'
    ));
    await customerPage.getByTestId('chat-message-input').fill(customerReply);
    await customerPage.getByTestId('chat-send-button').click();
    expect((await sendCustomerPromise).status()).toBe(201);

    await customerPage.reload();
    await expect(customerPage).toHaveURL(/\/customer\/orders/);
    await customerPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(customerPage.getByTestId('chat-messages')).toContainText(driverMsg, { timeout: 10000 });
    await expect(customerPage.getByTestId('chat-messages')).toContainText(customerReply, { timeout: 10000 });
    await customerPage.getByTestId('chat-close-button').click();

    await driverPage.reload();
    await expect(driverPage).toHaveURL(/\/driver\/tasks$/);
    await driverPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(driverPage.getByTestId('chat-messages')).toContainText(driverMsg, { timeout: 10000 });
    await expect(driverPage.getByTestId('chat-messages')).toContainText(customerReply, { timeout: 10000 });

    await driverCtx.close();
    await customerCtx.close();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
