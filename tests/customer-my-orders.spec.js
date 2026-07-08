const path = require('path')
const { test, expect, request } = require('@playwright/test')
const {
  selectOrderRouteOnMap,
  fillOrderInventoryAndSchedule,
  acceptSafetyConsent,
} = require('./helpers/new-order-form')
const { clickCompletedOrdersTab } = require('./helpers/e2e-ui')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

test('customer my-orders list and cancel pending order', async ({ page, baseURL }) => {
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
    await selectOrderRouteOnMap(page)
    await fillOrderInventoryAndSchedule(page, { boxes: 1 })
    await page.setInputFiles('#cargoPhoto', path.join(__dirname, 'fixtures', 'id-card-test.png'))
    await acceptSafetyConsent(page)

    const createRespPromise = page.waitForResponse((resp) => (
      resp.url().includes('/api/orders') && resp.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /confirm order/i }).click()
    const createResp = await createRespPromise
    expect(createResp.status()).toBe(201)
    const createdOrder = await createResp.json()
    const orderId = String(createdOrder.order?._id || createdOrder._id || createdOrder.id)
    await expect(page).toHaveURL(/\/customer\/orders$/)

    await expect(page.getByText(/Pending/i)).toBeVisible()

    const cancelRespPromise = page.waitForResponse((resp) => (
      resp.url().includes('/api/orders/') &&
      resp.url().includes('/cancel') &&
      resp.request().method() === 'PATCH'
    ))
    await page.getByRole('button', { name: /cancel order/i }).click()
    await page.getByRole('button', { name: /^Confirm$/i }).click()
    const cancelResp = await cancelRespPromise
    expect(cancelResp.status()).toBe(200)

    await expect(page).toHaveURL(/\/customer\/orders/)
    await clickCompletedOrdersTab(page)
    await expect(page.getByTestId(`customer-order-status-${orderId}`)).toHaveText(/cancelled/i, { timeout: 15000 })
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})
