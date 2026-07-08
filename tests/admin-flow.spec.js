const { test, expect, request } = require('@playwright/test')

const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF8A/9k='

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function phoneFromRunId(seed) {
  let acc = 17
  for (const ch of String(seed)) {
    acc = (acc * 33 + ch.charCodeAt(0)) % 100000000
  }
  return `+357${String(acc).padStart(8, '0')}`
}

test('admin: login, see pending driver, approve, removed from pending', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })
  const driverEmail = `e2e-adminflow-${runId}@movingmate.test`
  const driverPassword = 'AdminFlowPass1!'

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    const jpegBuf = Buffer.from(MIN_JPEG_BASE64, 'base64')

    const regRes = await backend.post('/api/auth/register-driver', {
      multipart: {
        firstName: 'Pending',
        lastName: 'Driver',
        email: driverEmail,
        password: driverPassword,
        phoneNumber: phoneFromRunId(`${runId}-adm`),
        dateOfBirth: '1990-05-15',
        role: 'driver',
        districts: JSON.stringify(['Nicosia']),
        vehicleType: 'pickup',
        drivingLicense: {
          name: 'lic.jpg',
          mimeType: 'image/jpeg',
          buffer: jpegBuf,
        },
        vehiclePhoto: {
          name: 'vehicle.jpg',
          mimeType: 'image/jpeg',
          buffer: jpegBuf,
        },
      },
    })
    expect(regRes.status()).toBe(201)
    const regJson = await regRes.json()
    const driverId = String(regJson.user?.id || regJson.user?._id)

    const driverLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: driverEmail, password: driverPassword },
    })
    expect(driverLogin.ok()).toBeTruthy()

    const adminLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: bootstrap.admin.email, password: bootstrap.admin.password },
    })
    expect(adminLogin.ok()).toBeTruthy()
    const adminAuth = await adminLogin.json()
    const adminToken = adminAuth.token

    const pendingBefore = await backend.get('/api/admin/pending-verifications', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(pendingBefore.ok()).toBeTruthy()
    const pendingJson = await pendingBefore.json()
    expect(pendingJson.users?.some((u) => String(u._id) === driverId)).toBeTruthy()

    const page = await browser.newPage()
    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(bootstrap.admin.email)
    await page.locator('#password').fill(bootstrap.admin.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/admin$/)

    await page.getByRole('button', { name: /driver approvals/i }).click()
    await expect(page.getByTestId('admin-stat-drivers')).toBeVisible()
    await page.getByTestId(`admin-pending-card-${driverId}`).click()
    await expect(page.getByTestId(`admin-approve-${driverId}`)).toBeVisible({ timeout: 15000 })

    const approveP = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/drivers/${driverId}/verify`) &&
        r.request().method() === 'PUT' &&
        r.status() === 200
    )
    await page.getByTestId(`admin-approve-${driverId}`).click()
    await approveP

    const pendingAfter = await backend.get('/api/admin/pending-verifications', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(pendingAfter.ok()).toBeTruthy()
    const afterJson = await pendingAfter.json()
    expect(afterJson.users?.some((u) => String(u._id) === driverId)).toBe(false)

    await expect(page.getByTestId(`admin-pending-card-${driverId}`)).toHaveCount(0)

    await page.close()

    const customerPage = await browser.newPage()
    await customerPage.goto(`${baseURL}/login`)
    await customerPage.getByLabel('Email or phone').fill(bootstrap.customer.email)
    await customerPage.locator('#password').fill(bootstrap.customer.password)
    await customerPage.getByRole('button', { name: /sign in/i }).click()
    await expect(customerPage).toHaveURL(/\/customer\/dashboard$/)
    await customerPage.goto(`${baseURL}/admin/dashboard`)
    await expect(customerPage).toHaveURL(/\/dashboard$/)
    await customerPage.close()
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {})
    await backend.dispose()
  }
})

test('admin: reject with reason; driver profile shows exact message', async ({ browser, baseURL }) => {
  test.setTimeout(180000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })
  const driverEmail = `e2e-reject-reason-${runId}@movingmate.test`
  const driverPassword = 'RejectReasonPass1!'
  const rejectionMessage = 'Document is blurry'

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    const jpegBuf = Buffer.from(MIN_JPEG_BASE64, 'base64')

    const regRes = await backend.post('/api/auth/register-driver', {
      multipart: {
        firstName: 'Reject',
        lastName: 'Case',
        email: driverEmail,
        password: driverPassword,
        phoneNumber: phoneFromRunId(`${runId}-rej`),
        dateOfBirth: '1990-05-15',
        role: 'driver',
        districts: JSON.stringify(['Nicosia']),
        vehicleType: 'pickup',
        drivingLicense: {
          name: 'lic.jpg',
          mimeType: 'image/jpeg',
          buffer: jpegBuf,
        },
        vehiclePhoto: {
          name: 'vehicle.jpg',
          mimeType: 'image/jpeg',
          buffer: jpegBuf,
        },
      },
    })
    expect(regRes.status()).toBe(201)
    const regJson = await regRes.json()
    const driverId = String(regJson.user?.id || regJson.user?._id)

    const driverLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: driverEmail, password: driverPassword },
    })
    expect(driverLogin.ok()).toBeTruthy()

    const adminPage = await browser.newPage()
    await adminPage.goto(`${baseURL}/login`)
    await adminPage.getByLabel('Email or phone').fill(bootstrap.admin.email)
    await adminPage.locator('#password').fill(bootstrap.admin.password)
    await adminPage.getByRole('button', { name: /sign in/i }).click()
    await expect(adminPage).toHaveURL(/\/admin$/)

    await adminPage.getByRole('button', { name: /driver approvals/i }).click()
    await adminPage.getByTestId(`admin-pending-card-${driverId}`).click()
    await expect(adminPage.getByTestId(`admin-reject-${driverId}`)).toBeVisible({ timeout: 15000 })
    await adminPage.getByTestId(`admin-reject-${driverId}`).click()
    await expect(adminPage.getByTestId('admin-reject-modal')).toBeVisible()
    await adminPage.getByTestId('admin-reject-reason-input').fill(rejectionMessage)

    const rejectP = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/drivers/${driverId}/verify`) &&
        r.request().method() === 'PUT' &&
        r.status() === 200
    )
    await adminPage.getByTestId('admin-reject-submit').click()
    const rejectResp = await rejectP
    const rejectJson = await rejectResp.json()
    expect(rejectJson.user?.rejectionReason).toBe(rejectionMessage)
    await adminPage.close()

    const driverPage = await browser.newPage()
    await driverPage.goto(`${baseURL}/login`)
    await driverPage.getByLabel('Email or phone').fill(driverEmail)
    await driverPage.locator('#password').fill(driverPassword)
    await driverPage.getByRole('button', { name: /sign in/i }).click()
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/)

    await driverPage.goto(`${baseURL}/profile`)
    await driverPage.waitForResponse(
      (r) => r.url().includes('/api/users/profile') && r.request().method() === 'GET' && r.status() === 200
    )
    await expect(driverPage.getByTestId('driver-license-rejected-alert')).toBeVisible()
    await expect(driverPage.getByTestId('driver-rejection-reason-text')).toContainText(rejectionMessage)
    await expect(driverPage.getByTestId('driver-license-upload-form')).toBeVisible()
    await driverPage.close()
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: driverEmail } }).catch(() => {})
    await backend.dispose()
  }
})
