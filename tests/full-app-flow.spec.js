/**
 * End-to-end "grand tour": customer + driver auth, license upload → pending,
 * admin bypass verify, order → accept → chat (2 msgs) → complete → 5★ review.
 */
const { test, expect, request } = require('@playwright/test')
const { DEFAULT_LOGISTICS_PAYLOAD, testOrderPrice } = require('./helpers/order-logistics-payload')
const { registerDriverViaApi, MIN_JPEG_BASE64, gotoDriverAvailableJobs } = require('./helpers/register-driver')
const { clickCompletedTripsTab, clickCompletedOrdersTab } = require('./helpers/e2e-ui')

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

async function loginWithBase(page, baseURL, entry, password) {
  await page.goto(`${baseURL}/login`)
  await page.getByLabel('Email or phone').fill(entry)
  await page.locator('#password').fill(password)
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login') && resp.request().method() === 'POST'
  )
  await page.getByRole('button', { name: /sign in/i }).click()
  await loginResponsePromise
}

test('full app flow: license pending → verify → order → chat → complete → review', async ({ browser, baseURL }) => {
  test.setTimeout(420000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })
  const tourDriverEmail = `e2e-tour-driver-${runId}@movingmate.test`
  const tourDriverPassword = 'TourGrandPass1!'
  const driverMsg = 'Grand tour: driver message.'
  const customerReply = 'Grand tour: customer reply.'

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    const regDriver = await registerDriverViaApi(backend, {
      firstName: 'Tour',
      lastName: 'Driver',
      email: tourDriverEmail,
      password: tourDriverPassword,
      phoneNumber: phoneFromRunId(`${runId}-tour`),
      includeLicense: false,
      includeVehiclePhoto: true,
    })
    expect(regDriver.status()).toBe(201)

    const driverCtx = await browser.newContext()
    const customerCtx = await browser.newContext()
    const driverPage = await driverCtx.newPage()
    const customerPage = await customerCtx.newPage()

    await loginWithBase(driverPage, baseURL, tourDriverEmail, tourDriverPassword)
    await expect(driverPage).toHaveURL(/\/driver\/dashboard$/)

    await driverPage.goto(`${baseURL}/profile`)
    await driverPage.waitForResponse(
      (r) => r.url().includes('/api/users/profile') && r.request().method() === 'GET' && r.status() === 200
    )

    const jpegBuf = Buffer.from(MIN_JPEG_BASE64, 'base64')
    const uploadP = driverPage.waitForResponse(
      (r) => r.url().includes('/api/users/upload-license') && r.request().method() === 'POST' && r.status() === 200,
      { timeout: 60000 }
    )
    await driverPage.getByTestId('driver-license-file-input').setInputFiles({
      name: 'tour-license.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuf,
    })
    await uploadP
    await expect(driverPage.getByTestId('driver-profile-verification-pending')).toBeVisible({ timeout: 15000 })
    await expect(driverPage.getByTestId('driver-license-upload-form')).toHaveCount(0)

    const verifyRes = await backend.post('/api/test/e2e/set-driver-verified', {
      data: { email: tourDriverEmail },
    })
    expect(verifyRes.ok()).toBeTruthy()

    await loginWithBase(customerPage, baseURL, bootstrap.customer.email, bootstrap.customer.password)
    await expect(customerPage).toHaveURL(/\/customer\/dashboard$/)

    const customerToken = await customerPage.evaluate(() => localStorage.getItem('moving_mate_token'))
    expect(customerToken).toBeTruthy()

    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const orderRes = await backend.post('/api/orders', {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        pickupDistrict: 'Nicosia',
        pickupLocation: { address: `Grand tour pickup ${runId}`, lat: 35.1856, lng: 33.3823 },
        dropoffLocation: { address: `Grand tour drop ${runId}`, lat: 35.19, lng: 33.39 },
        price: testOrderPrice(4.5),
        distanceKm: 4.5,
        smallBoxes: 1,
        mediumBoxes: 0,
        largeBoxes: 0,
        ...DEFAULT_LOGISTICS_PAYLOAD,
        scheduledAt,
      },
    })
    expect(orderRes.ok()).toBeTruthy()
    const created = await orderRes.json()
    const orderId = String(created._id)

    const driverLogin = await backend.post('/api/auth/login', {
      data: { emailOrPhone: tourDriverEmail, password: tourDriverPassword },
    })
    expect(driverLogin.ok()).toBeTruthy()
    const driverAuth = await driverLogin.json()
    const driverToken = driverAuth.token

    const ratingBeforeRes = await backend.get('/api/users/driver-rating', {
      headers: { Authorization: `Bearer ${driverToken}` },
    })
    expect(ratingBeforeRes.ok()).toBeTruthy()
    const ratingBefore = await ratingBeforeRes.json()
    const totalBefore = Number(ratingBefore.totalReviews ?? ratingBefore.totalRatings ?? 0)

    await gotoDriverAvailableJobs(driverPage, baseURL)

    const acceptP = driverPage.waitForResponse(
      (r) => r.url().includes(`/api/orders/${orderId}/accept`) && r.request().method() === 'PATCH',
      { timeout: 30000 }
    )
    await driverPage.getByTestId(`accept-order-${orderId}`).click()
    await acceptP

    await driverPage.getByRole('link', { name: /my trips/i }).click()
    await expect(driverPage).toHaveURL(/\/driver\/tasks$/)

    await driverPage.getByTestId(`chat-open-${orderId}`).click()
    await expect(driverPage.getByTestId('order-chat-drawer')).toBeVisible()

    const sendDriverP = driverPage.waitForResponse(
      (resp) => resp.url().includes('/api/chat/send') && resp.request().method() === 'POST'
    )
    await driverPage.getByTestId('chat-message-input').fill(driverMsg)
    await driverPage.getByTestId('chat-send-button').click()
    expect((await sendDriverP).status()).toBe(201)

    await customerPage.goto(`${baseURL}/customer/my-orders`)
    await customerPage.getByTestId(`chat-open-${orderId}`).click()
    await expect(customerPage.getByTestId('order-chat-drawer')).toBeVisible()
    await expect(customerPage.getByTestId('chat-messages')).toContainText(driverMsg, { timeout: 20000 })

    const sendCustP = customerPage.waitForResponse(
      (resp) => resp.url().includes('/api/chat/send') && resp.request().method() === 'POST'
    )
    await customerPage.getByTestId('chat-message-input').fill(customerReply)
    await customerPage.getByTestId('chat-send-button').click()
    expect((await sendCustP).status()).toBe(201)

    await expect(driverPage.getByTestId('chat-messages')).toContainText(customerReply, { timeout: 25000 })

    await driverPage.getByTestId('chat-close-button').click()
    await expect(driverPage.getByTestId('order-chat-drawer')).toBeHidden({ timeout: 5000 })

    const startP = driverPage.waitForResponse(
      (resp) => resp.url().includes(`/api/orders/${orderId}/status`) && resp.request().method() === 'PATCH'
    )
    await driverPage.getByTestId(`start-delivery-${orderId}`).click()
    await startP

    const completeP = driverPage.waitForResponse(
      (resp) => resp.url().includes(`/api/orders/${orderId}/status`) && resp.request().method() === 'PATCH'
    )
    await driverPage.getByTestId(`mark-completed-${orderId}`).click()
    await completeP

    await clickCompletedTripsTab(driverPage)
    await expect(driverPage.getByTestId(`driver-history-row-${orderId}`)).toBeVisible({ timeout: 20000 })

    await customerPage.goto(`${baseURL}/customer/my-orders`)
    await clickCompletedOrdersTab(customerPage)
    await customerPage.getByTestId(`rate-service-${orderId}`).click()
    await expect(customerPage.getByTestId('review-modal')).toBeVisible()

    await customerPage.getByTestId('review-star-5').click()
    await customerPage.getByTestId('review-comment').fill('Grand tour five stars.')

    const reviewPost = customerPage.waitForResponse(
      (resp) => resp.url().includes('/api/reviews') && resp.request().method() === 'POST'
    )
    await customerPage.getByTestId('review-submit').click()
    expect((await reviewPost).status()).toBe(201)

    const ratingAfterRes = await backend.get('/api/users/driver-rating', {
      headers: { Authorization: `Bearer ${driverToken}` },
    })
    expect(ratingAfterRes.ok()).toBeTruthy()
    const ratingAfter = await ratingAfterRes.json()
    const totalAfter = Number(ratingAfter.totalReviews ?? ratingAfter.totalRatings ?? 0)
    expect(totalAfter).toBe(totalBefore + 1)

    await driverCtx.close()
    await customerCtx.close()
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.post('/api/test/e2e/delete-user-by-email', { data: { email: tourDriverEmail } }).catch(() => {})
    await backend.dispose()
  }
})
