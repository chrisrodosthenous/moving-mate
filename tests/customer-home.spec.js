const { test, expect, request } = require('@playwright/test')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

test('customer dashboard home shows core Angular-parity elements', async ({ page, baseURL }) => {
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

    await page.getByTestId('sidebar').getByRole('link', { name: /dashboard/i }).click()
    await expect(page).toHaveURL(/\/customer\/dashboard$/)

    await expect(page.getByText(/Quick stats/i)).toBeVisible()
    await expect(page.getByText(/Active requests/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /new order/i })).toBeVisible()
    await expect(page.getByText(/Moving-Mate/i)).toBeVisible()
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})

