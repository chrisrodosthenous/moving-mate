const { test, expect, request } = require('@playwright/test');
const { registerDriverViaApi, gotoDriverAvailableJobs } = require('./helpers/register-driver');

/** Minimal valid 1×1 JPEG (base64). */
const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF8A/9k=';

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function phoneFromRunId(runId) {
  let acc = 17;
  for (const ch of String(runId)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000;
  }
  return `+357${String(acc).padStart(8, '0')}`;
}

async function login(page, baseURL, email, password) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email or phone').fill(email);
  await page.locator('#password').fill(password);
  const loginResponsePromise = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  await loginResponsePromise;
}

test('driver lock: unverified sees warning; after verification sees orders area', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  test.info().annotations.push({ type: 'note', description: 'retries on transient API errors' });
  const runId = uniqueRunId();
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
  const driverEmail = `e2e-driverlock-${runId}@movingmate.test`;
  const driverPassword = 'DriverLockPass1!';

  try {
    const regRes = await registerDriverViaApi(backend, {
      firstName: 'Lock',
      lastName: 'Driver',
      email: driverEmail,
      password: driverPassword,
      phoneNumber: phoneFromRunId(runId),
      includeLicense: false,
      includeVehiclePhoto: true,
    });
    expect(regRes.status()).toBe(201);

    await login(page, baseURL, driverEmail, driverPassword);
    await expect(page).toHaveURL(/\/driver\/dashboard$/);

    await gotoDriverAvailableJobs(page, baseURL);
    await expect(page.getByRole('alert')).toContainText(/Account not verified/i);
    await expect(page.getByRole('alert')).toContainText(/upload your driving license/i);

    await page.goto(`${baseURL}/profile`);
    await page.waitForResponse(
      (r) => r.url().includes('/api/users/profile') && r.request().method() === 'GET' && r.status() === 200,
    );

    const jpegBuf = Buffer.from(MIN_JPEG_BASE64, 'base64');
    const [uploadResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/users/upload-license') && r.request().method() === 'POST',
        { timeout: 30000 },
      ),
      page.getByTestId('driver-license-file-input').setInputFiles({
        name: 'lock-e2e.jpg',
        mimeType: 'image/jpeg',
        buffer: jpegBuf,
      }),
    ]);
    expect(uploadResp.status()).toBe(200);
    const uploadJson = await uploadResp.json();
    expect(uploadJson.user?.verificationStatus).toBe('pending');

    await expect(page.getByTestId('driver-profile-verification-pending')).toBeVisible({ timeout: 5000 });

    const setRes = await backend.post('/api/test/e2e/set-driver-verified', {
      data: { email: driverEmail },
    });
    expect(setRes.ok()).toBeTruthy();

    await gotoDriverAvailableJobs(page, baseURL);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/No orders available|Loading orders/i)).toBeVisible({ timeout: 15000 });
  } finally {
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {});
    await backend.dispose();
  }
});
