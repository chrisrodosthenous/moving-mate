const { test, expect, request } = require('@playwright/test')

function uniqueId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`
}

test('login: password field is masked by default', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/login`)
  const pwd = page.locator('#password')
  await expect(pwd).toHaveAttribute('type', 'password')
  await expect(pwd).toBeVisible()
})

test('register: weak password shows policy errors and blocks submit', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/register`)
  await page.getByLabel(/first name/i).fill('Test')
  await page.getByLabel(/last name/i).fill('User')
  await page.getByLabel(/date of birth/i).fill('1992-01-01')
  await page.getByLabel(/^email$/i).fill(`weak-${Date.now()}@movingmate.test`)
  await page.getByLabel(/phone number/i).fill('99123456')
  await page.getByLabel(/^password$/i).fill('short')
  await expect(page.getByText(/at least 8 characters/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()
})

test('profile: mismatching new passwords show inline error', async ({ page, baseURL }) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
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
