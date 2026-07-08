const path = require('path')
const { test, expect, request } = require('@playwright/test')
const {
  selectOrderRouteOnMap,
  fillOrderBoxesAndSchedule,
  acceptSafetyConsent,
  waitForGoogleMaps,
} = require('./helpers/new-order-form')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

test('customer new order form: map fields + photo upload + submit', async ({ page, baseURL }) => {
  test.setTimeout(120000)
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', {
      data: { runId },
    })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(bootstrap.customer.email)
    await page.locator('#password').fill(bootstrap.customer.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/customer\/dashboard$/)
    await page.getByTestId('sidebar').getByRole('link', { name: /new order/i }).click()
    await expect(page).toHaveURL(/\/customer\/book$/)

    await page.getByLabel('Pickup district').selectOption('Larnaca')
    await expect(page.getByLabel('Price offer (€)')).toHaveCount(0)
    await selectOrderRouteOnMap(page)

    const googleLoaded = await page.evaluate(() => Boolean(window.google?.maps?.DirectionsService))
    expect(googleLoaded).toBe(true)

    await fillOrderBoxesAndSchedule(page)
    await page.setInputFiles('#cargoPhoto', path.join(__dirname, 'fixtures', 'id-card-test.png'))
    await acceptSafetyConsent(page)

    const createRespPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/orders') && resp.request().method() === 'POST',
      { timeout: 120000 },
    )
    await page.getByRole('button', { name: /confirm order/i }).click()
    const createResp = await createRespPromise
    await expect(createResp.status()).toBe(201)
    await expect(page).toHaveURL(/\/customer\/orders$/)
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})
