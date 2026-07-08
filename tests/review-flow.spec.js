const { test, expect, request } = require('@playwright/test');
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload');
const { clickCompletedTripsTab, clickCompletedOrdersTab } = require('./helpers/e2e-ui');

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

test('review: customer rates completed order; driver review count increases', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const driverEmail = `e2e-driver-${runId}@movingmate.test`;
  const driverPassword = 'E2ePass1!';
  const reviewText = 'Excellent service!';

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
        pickupLocation: { address: `Review pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Review drop ${runId}`, lat: 35.19, lng: 33.39 },
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

    const ratingBeforeRes = await backend.get('/api/users/driver-rating', {
      headers: { Authorization: `Bearer ${driverAuth.token}` },
    });
    expect(ratingBeforeRes.ok()).toBeTruthy();
    const ratingBefore = await ratingBeforeRes.json();
    const totalBefore = Number(ratingBefore.totalReviews ?? ratingBefore.totalRatings ?? 0);

    const driverCtx = await browser.newContext();
    const customerCtx = await browser.newContext();
    const driverPage = await driverCtx.newPage();
    const customerPage = await customerCtx.newPage();

    await driverPage.goto(`${baseURL}/login`);
    await login(driverPage, bootstrap.driver?.email ?? driverEmail, bootstrap.driver?.password ?? driverPassword);
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/);
    await driverPage.getByRole('link', { name: /my trips/i }).click();
    await expect(driverPage).toHaveURL(/\/driver\/tasks$/);

    await driverPage.getByTestId(`start-delivery-${orderId}`).click();
    await expect(driverPage.getByTestId(`driver-task-status-${orderId}`)).toContainText(/in progress|progress/i, {
      timeout: 15000,
    });

    await driverPage.getByTestId(`mark-completed-${orderId}`).click();
    await clickCompletedTripsTab(driverPage);
    await expect(driverPage.getByTestId(`driver-history-row-${orderId}`)).toBeVisible({ timeout: 15000 });

    await customerPage.goto(baseURL);
    await customerPage.evaluate(
      ([token, userJson]) => {
        localStorage.setItem('moving_mate_token', token);
        localStorage.setItem('moving_mate_user', userJson);
      },
      [customerToken, JSON.stringify(customerAuth.user)],
    );
    await customerPage.goto(`${baseURL}/customer/my-orders`);

    await clickCompletedOrdersTab(customerPage);
    await customerPage.getByTestId(`rate-service-${orderId}`).click();
    await expect(customerPage.getByTestId('review-modal')).toBeVisible();

    await customerPage.getByTestId('review-star-5').click();
    await customerPage.getByTestId('review-comment').fill(reviewText);

    const reviewPost = customerPage.waitForResponse(
      (resp) => resp.url().includes('/api/reviews') && resp.request().method() === 'POST',
    );
    await customerPage.getByTestId('review-submit').click();
    const reviewResp = await reviewPost;
    expect(reviewResp.status()).toBe(201);

    await expect(customerPage.getByTestId(`rate-service-${orderId}`)).toHaveCount(0);

    const ratingAfterRes = await backend.get('/api/users/driver-rating', {
      headers: { Authorization: `Bearer ${driverAuth.token}` },
    });
    expect(ratingAfterRes.ok()).toBeTruthy();
    const ratingAfter = await ratingAfterRes.json();
    const totalAfter = Number(ratingAfter.totalReviews ?? ratingAfter.totalRatings ?? 0);
    expect(totalAfter).toBe(totalBefore + 1);

    await driverCtx.close();
    await customerCtx.close();
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
