const path = require('path');
const { test, expect, request } = require('@playwright/test');
const {
  selectOrderRouteOnMap,
  fillOrderBoxesAndSchedule,
  acceptSafetyConsent,
} = require('./helpers/new-order-form');
const { fillDriverVehicleSignup } = require('./helpers/register-driver');
const { gotoLoggedOut } = require('./helpers/auth');

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function phoneFromRunId(runId) {
  // Deterministic-ish 8 digits from runId to avoid "already registered" conflicts.
  let acc = 17;
  for (const ch of String(runId)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000;
  }
  return String(acc).padStart(8, '0');
}

async function login(page, baseURL, entry, password) {
  await gotoLoggedOut(page, `${baseURL}/login`, baseURL);
  await page.getByLabel('Email or phone').fill(entry);
  await page.locator('#password').fill(password);
  const loginResponsePromise = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  const resp = await loginResponsePromise;
  if (resp.status() !== 200) {
    let bodyText = '';
    try {
      bodyText = JSON.stringify(await resp.json());
    } catch {
      bodyText = await resp.text();
    }
    // eslint-disable-next-line no-console
    console.log('[E2E] Login failed:', resp.status(), bodyText);
  }
}

test('clean migration flow: driver register/login + customer register/login/order', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const runId = uniqueRunId();
  const driverEmail = `e2e-driver-${runId}@movingmate.test`;
  const driverPassword = 'DriverPass1!';
  const customerEmail = `e2e-customer-local-${runId}@movingmate.test`;
  const customerPassword = 'CustomerPass1!';
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });

  try {
    const driverCtx = await browser.newContext();
    const customerCtx = await browser.newContext();
    const driverPage = await driverCtx.newPage();
    const customerPage = await customerCtx.newPage();

    // Step 1: Driver registers
    await driverPage.goto(`${baseURL}/register`);
    await driverPage.getByRole('radio', { name: /driver/i }).check();
    await driverPage.getByLabel(/first name/i).fill('E2E');
    await driverPage.getByLabel(/last name/i).fill('Driver');
    await driverPage.getByLabel(/^email$/i).fill(driverEmail);
    const dobInput = driverPage.getByLabel(/date of birth/i);
    await dobInput.fill('1990-01-01');
    await expect(dobInput).toHaveValue('1990-01-01');
    const phoneDigits = phoneFromRunId(runId);
    await driverPage.getByLabel(/phone number/i).fill(phoneDigits);
    await driverPage.getByLabel(/^password$/i).fill(driverPassword);
    await driverPage.getByRole('checkbox', { name: 'Larnaca' }).check();
    await fillDriverVehicleSignup(driverPage, path.join(__dirname, 'fixtures', 'id-card-test.png'));
    await expect(driverPage.getByRole('button', { name: /create account/i })).toBeEnabled();
    const registerBtn = driverPage.getByRole('button', { name: /create account/i });
    const registerResponsePromise = driverPage.waitForResponse((resp) => {
      return (
        resp.url().includes('/api/auth/register-driver') &&
        resp.request().method() === 'POST'
      );
    });
    await registerBtn.click();
    const registerResp = await registerResponsePromise;
    if (registerResp.status() !== 201) {
      let bodyText = '';
      try {
        const json = await registerResp.json();
        bodyText = JSON.stringify(json);
      } catch {
        bodyText = await registerResp.text();
      }
      // eslint-disable-next-line no-console
      console.log('[E2E] Register failed:', registerResp.status(), bodyText);
    }
    await expect(registerResp.status(), 'registration should return 201').toBe(201);
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/);

    // Step 2: Driver logs in and sees waiting approval placeholder
    await driverPage.goto(`${baseURL}/login`);
    await login(driverPage, baseURL, driverEmail, driverPassword);
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/);
    await expect(driverPage.getByRole('navigation')).toBeVisible();

    // Step 3: Customer registers
    await customerPage.goto(`${baseURL}/register`);
    await customerPage.getByRole('radio', { name: /customer/i }).check();
    await customerPage.getByLabel(/first name/i).fill('E2E');
    await customerPage.getByLabel(/last name/i).fill('Customer');
    await customerPage.getByLabel(/date of birth/i).fill('1992-01-01');
    await customerPage.getByLabel(/^email$/i).fill(customerEmail);
    await customerPage.getByLabel(/phone number/i).fill(phoneFromRunId(`${runId}-c`));
    await customerPage.getByLabel(/^password$/i).fill(customerPassword);
    const customerRegisterRespPromise = customerPage.waitForResponse((resp) => (
      resp.url().includes('/api/auth/register') && resp.request().method() === 'POST'
    ));
    await customerPage.getByRole('button', { name: /create account/i }).click();
    await expect((await customerRegisterRespPromise).status()).toBe(201);
    await expect(customerPage).toHaveURL(/\/customer\/dashboard$/);

    // Step 4: Customer logs in and creates order with sidebar + map present
    await customerPage.goto(`${baseURL}/login`);
    await login(customerPage, baseURL, customerEmail, customerPassword);
    await expect(customerPage).toHaveURL(/\/customer\/dashboard$/);
    await customerPage.getByTestId('sidebar').getByRole('link', { name: /new order/i }).click();
    await expect(customerPage).toHaveURL(/\/customer\/book$/);
    await expect(customerPage.getByTestId('sidebar')).toBeVisible();
    await expect(customerPage.getByTestId('google-map-shell')).toBeVisible();

    await customerPage.getByLabel('Pickup district').selectOption('Larnaca');
    await expect(customerPage.getByLabel('Price offer (€)')).toHaveCount(0);
    await selectOrderRouteOnMap(customerPage);

    await fillOrderBoxesAndSchedule(customerPage);
    await customerPage.setInputFiles('#cargoPhoto', path.join(__dirname, 'fixtures', 'id-card-test.png'));
    await acceptSafetyConsent(customerPage);

    const createOrderReqPromise = customerPage.waitForRequest((req) => {
      return req.url().includes('/api/orders') && req.method() === 'POST';
    });

    await customerPage.getByRole('button', { name: /confirm order/i }).click();
    const createOrderReq = await createOrderReqPromise;
    const createOrderPayload = createOrderReq.postDataJSON?.() ?? JSON.parse(createOrderReq.postData());
    expect(createOrderPayload.pickupLocation.lat).toBeDefined();
    expect(createOrderPayload.pickupLocation.lng).toBeDefined();
    expect(createOrderPayload.scheduledAt).toBeTruthy();
    expect(createOrderPayload.vehicleType).toBe('pickup');
    expect(createOrderPayload.cargoInventory).toMatchObject({
      boxes: 1,
      mediumItems: 0,
      largeFurniture: 0,
      heavyAppliances: 0,
    });
    expect(createOrderPayload.pickupFloor).toBe('0');
    expect(createOrderPayload.destinationFloor).toBe('0');
    expect(createOrderPayload.hasElevator).toBe(false);
    expect(createOrderPayload.laborRequired).toBe('none');
    await expect(customerPage).toHaveURL(/\/customer\/orders$/);
    await Promise.all([driverCtx.close(), customerCtx.close()]);
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {});
    await backend.dispose();
  }
});
