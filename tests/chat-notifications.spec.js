const { test, expect, request } = require('@playwright/test');
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload');
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

test('chat notifications: unread badge then clear; bubbles aligned', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const driverEmail = `e2e-driver-${runId}@movingmate.test`;
  const driverPassword = 'E2ePass1!';
  const customerFirst = `Customer first ${runId}`;
  const driverMsg1 = `Driver msg one ${runId}`;
  const driverMsg2 = `Driver msg two ${runId}`;

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
        pickupLocation: { address: `Notif pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Notif drop ${runId}`, lat: 35.19, lng: 33.39 },
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
    const paymentRes = await authorizeOrderPayment(backend, orderId, customerToken);
    expect(paymentRes.ok()).toBeTruthy();

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
    await customerPage.getByTestId('chat-message-input').fill(customerFirst);
    await customerPage.getByTestId('chat-send-button').click();
    await expect(customerPage.getByTestId('chat-messages')).toContainText(customerFirst, { timeout: 15000 });
    await customerPage.getByTestId('chat-close-button').click();
    await expect(customerPage.getByTestId('order-chat-drawer')).toBeHidden();

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

    await driverPage.getByTestId('chat-message-input').fill(driverMsg1);
    await driverPage.getByTestId('chat-send-button').click();
    await expect(driverPage.getByTestId('chat-messages')).toContainText(driverMsg1, { timeout: 15000 });

    await driverPage.getByTestId('chat-message-input').fill(driverMsg2);
    await driverPage.getByTestId('chat-send-button').click();
    await expect(driverPage.getByTestId('chat-messages')).toContainText(driverMsg2, { timeout: 15000 });

    await driverPage.getByTestId('chat-close-button').click();

    await customerPage.reload({ waitUntil: 'domcontentloaded' });
    const badge = customerPage.getByTestId(`chat-unread-badge-${orderId}`);
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveText('2');

    await customerPage.getByTestId(`chat-open-${orderId}`).click();
    await expect(customerPage.getByTestId('order-chat-drawer')).toBeVisible();
    await expect(customerPage.locator(`[data-testid="chat-unread-badge-${orderId}"]`)).toHaveCount(0, {
      timeout: 15000,
    });

    await expect(customerPage.getByTestId('chat-row-received')).toHaveCount(2);
    await expect(customerPage.getByTestId('chat-row-sent')).toHaveCount(1);
    await expect(customerPage.getByTestId('chat-messages')).toContainText(driverMsg1);
    await expect(customerPage.getByTestId('chat-messages')).toContainText(driverMsg2);
    await expect(customerPage.getByTestId('chat-messages')).toContainText(customerFirst);

    await customerCtx.close();
    await driverCtx.close();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
