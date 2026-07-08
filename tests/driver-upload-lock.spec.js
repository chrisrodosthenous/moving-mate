const { test, expect, request } = require('@playwright/test')
const { registerDriverViaApi, gotoDriverAvailableJobs, MIN_JPEG_BASE64 } = require('./helpers/register-driver')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function phoneFromRunId(runId) {
  let acc = 17
  for (const ch of String(runId)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000
  }
  return `+357${String(acc).padStart(8, '0')}`
}

async function login(page, baseURL, email, password) {
  await page.goto(`${baseURL}/login`)
  await page.getByLabel('Email or phone').fill(email)
  await page.locator('#password').fill(password)
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login') && resp.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /sign in/i }).click()
  await loginResponsePromise
}

test('driver license upload: JPG sets pending; dashboard shows gate message', async ({ page, baseURL }) => {
  test.setTimeout(120000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })
  const driverEmail = `e2e-upload-${runId}@movingmate.test`
  const driverPassword = 'UploadLockPass1!'

  try {
    const regRes = await registerDriverViaApi(backend, {
      firstName: 'Upload',
      lastName: 'Driver',
      email: driverEmail,
      password: driverPassword,
      phoneNumber: phoneFromRunId(runId),
      includeLicense: false,
      includeVehiclePhoto: true,
    })
    expect(regRes.status()).toBe(201)

    await login(page, baseURL, driverEmail, driverPassword)
    await gotoDriverAvailableJobs(page, baseURL)
    await expect(page.getByRole('alert')).toContainText(/upload your driving license/i)

    await page.goto(`${baseURL}/profile`)
    await page.waitForResponse(
      (r) => r.url().includes('/api/users/profile') && r.request().method() === 'GET' && r.status() === 200,
    )

    const jpegBuf = Buffer.from(MIN_JPEG_BASE64, 'base64')
    const uploadRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/users/upload-license') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 30000 },
    )
    await page.getByTestId('driver-license-file-input').setInputFiles({
      name: 'license-e2e.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuf,
    })
    const uploadResp = await uploadRespPromise
    const uploadJson = await uploadResp.json()
    expect(uploadJson.user?.verificationStatus).toBe('pending')
    expect(uploadJson.user?.isVerified).toBe(false)

    await expect(page.getByTestId('driver-profile-verification-pending')).toBeVisible({ timeout: 10000 })

    await gotoDriverAvailableJobs(page, baseURL)
    await expect(page.getByRole('alert')).toContainText(/Waiting for admin approval/i)
  } finally {
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {})
    await backend.dispose()
  }
})

test('driver license upload: 6MB file shows client-side size error', async ({ page, baseURL }) => {
  test.setTimeout(120000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })
  const driverEmail = `e2e-upload-big-${runId}@movingmate.test`
  const driverPassword = 'UploadLockPass1!'

  try {
    const regRes = await registerDriverViaApi(backend, {
      firstName: 'Big',
      lastName: 'File',
      email: driverEmail,
      password: driverPassword,
      phoneNumber: phoneFromRunId(`${runId}-big`),
      includeLicense: false,
      includeVehiclePhoto: true,
    })
    expect(regRes.status()).toBe(201)

    await login(page, baseURL, driverEmail, driverPassword)
    await page.goto(`${baseURL}/profile`)
    await page.waitForResponse(
      (r) => r.url().includes('/api/users/profile') && r.request().method() === 'GET' && r.status() === 200,
    )

    const oversized = Buffer.alloc(6 * 1024 * 1024 + 1, 0xff)
    await page.getByTestId('driver-license-file-input').setInputFiles({
      name: 'too-big.jpg',
      mimeType: 'image/jpeg',
      buffer: oversized,
    })

    await expect(page.getByTestId('driver-license-file-error')).toBeVisible()
    await expect(page.getByTestId('driver-license-file-error')).toContainText(/5MB/i)
  } finally {
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {})
    await backend.dispose()
  }
})
