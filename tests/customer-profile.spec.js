const { test, expect, request } = require('@playwright/test')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

test('customer profile: name and phone are locked like email', async ({ page, baseURL }) => {
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(bootstrap.customer.email)
    await page.locator('#password').fill(bootstrap.customer.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/customer\/dashboard$/)

    await page.goto(`${baseURL}/profile`)
    await expect(page.locator('#firstName')).toContainText('E2E', { timeout: 15000 })
    await expect(page.locator('#lastName')).toContainText('Customer')
    await expect(page.locator('#phoneNumber')).toBeVisible()
    await expect(page.locator('input#firstName, input#lastName, input#phoneDigits, input#phoneNumber')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /save changes/i })).toHaveCount(0)
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})

test('customer profile: email locked and mismatch password validation', async ({ page, baseURL }) => {
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })

  try {
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()
    const bootstrap = await bootstrapRes.json()

    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(bootstrap.customer.email)
    await page.locator('#password').fill(bootstrap.customer.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/customer\/dashboard$/)

    await page.goto(`${baseURL}/profile`)
    const email = page.locator('#emailAddress')
    await expect(email).toBeVisible({ timeout: 15000 })
    await expect(email).toContainText(bootstrap.customer.email)
    await expect(page.locator('input#emailAddress')).toHaveCount(0)

    await page.locator('#currentPassword').fill(bootstrap.customer.password)
    await page.locator('#newPassword').fill('NewPass123!')
    await page.locator('#confirmPassword').fill('Different123!')
    await expect(page.getByText('Passwords do not match')).toBeVisible()
    await expect(page.getByRole('button', { name: /update password/i })).toBeDisabled()
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})
