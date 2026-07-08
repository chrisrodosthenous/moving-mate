const { test, expect, request } = require('@playwright/test')
const { registerDriverViaApi } = require('./helpers/register-driver')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function phoneFromSeed(seed) {
  let acc = 17
  for (const ch of String(seed)) acc = (acc * 33 + ch.charCodeAt(0)) % 100000000
  return `+357${String(acc).padStart(8, '0')}`
}

test('login flow: invalid, customer redirect, driver redirect', async ({ page, baseURL }) => {
  const runId = uniqueRunId()
  const backend = await request.newContext({ baseURL: 'http://127.0.0.1:3000' })

  const customerEmail = `e2e-customer-${runId}@movingmate.test`
  const customerPassword = 'E2ePass1!'
  const driverEmail = `e2e-login-driver-${runId}@movingmate.test`
  const driverPassword = 'DriverPass1!'

  try {
    // Setup customer via dedicated bootstrap
    const bootstrapRes = await backend.post('/api/test/e2e/bootstrap', { data: { runId } })
    expect(bootstrapRes.ok()).toBeTruthy()

    // Setup driver via register API
    const driverRegisterRes = await registerDriverViaApi(backend, {
      firstName: 'E2E',
      lastName: 'Driver',
      email: driverEmail,
      password: driverPassword,
      phoneNumber: phoneFromSeed(`${runId}-driver`),
      districts: ['Larnaca'],
    })
    expect(driverRegisterRes.status()).toBe(201)

    // Invalid credentials
    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill('doesnotexist@example.com')
    await page.locator('#password').fill('WrongPass1!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert')).toContainText(/invalid|failed|too many|try again/i)

    // Customer login redirect
    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(customerEmail)
    await page.locator('#password').fill(customerPassword)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/customer\/dashboard$/)

    await page.evaluate(() => {
      localStorage.removeItem('moving_mate_token')
      localStorage.removeItem('moving_mate_user')
    })
    await page.goto(`${baseURL}/login`)
    await page.getByLabel('Email or phone').fill(driverEmail)
    await page.locator('#password').fill(driverPassword)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/driver\/dashboard$/)
  } finally {
    await backend.post('/api/test/e2e/cleanup', { data: { runId } }).catch(() => {})
    await backend.dispose()
  }
})

