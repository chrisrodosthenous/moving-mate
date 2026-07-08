const path = require('path')
const { test, expect } = require('@playwright/test')
const { fillDriverVehicleSignup } = require('./helpers/register-driver')
const { gotoLoggedOut } = require('./helpers/auth')

function uniqueId() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`
}

function phone8(seed) {
  let acc = 37
  for (const ch of String(seed)) acc = (acc * 33 + ch.charCodeAt(0)) % 100000000
  return String(acc).padStart(8, '0').slice(0, 8)
}

test('registration flow: customer + driver + invalid driver DOB', async ({ page, baseURL }) => {
  const run = uniqueId()

  await page.goto(`${baseURL}/register`)

  await page.getByLabel(/first name/i).fill('Cust')
  await page.getByLabel(/last name/i).fill('User')
  await page.getByLabel(/date of birth/i).fill('1992-01-01')
  await page.getByLabel(/^email$/i).fill(`customer-${run}@movingmate.test`)
  await page.getByLabel(/phone number/i).fill(phone8(`${run}-c`))
  await page.getByLabel(/^password$/i).fill('CustomerPass1!')

  const customerResp = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/register') && resp.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: /create account/i }).click()
  await expect((await customerResp).status()).toBe(201)
  await expect(page).toHaveURL(/\/customer\/dashboard$/)

  await gotoLoggedOut(page, `${baseURL}/register`, baseURL)
  await page.getByRole('radio', { name: /driver/i }).check()
  await page.getByLabel(/first name/i).fill('Driver')
  await page.getByLabel(/last name/i).fill('User')
  await page.getByLabel(/date of birth/i).fill('1992-06-15')
  await page.getByLabel(/^email$/i).fill(`driver-${run}@movingmate.test`)
  await page.getByLabel(/phone number/i).fill(phone8(`${run}-d`))
  await page.getByLabel(/^password$/i).fill('DriverPass1!')
  await page.getByRole('checkbox', { name: 'Larnaca' }).check()
  await fillDriverVehicleSignup(page, path.join(__dirname, 'fixtures', 'id-card-test.png'))

  const driverResp = page.waitForResponse((resp) => (
    resp.url().includes('/api/auth/register-driver') && resp.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: /create account/i }).click()
  await expect((await driverResp).status()).toBe(201)
  await expect(page).toHaveURL(/\/driver\/dashboard$/)

  await gotoLoggedOut(page, `${baseURL}/register`, baseURL)
  await page.getByRole('radio', { name: /driver/i }).check()
  await page.getByLabel(/first name/i).fill('Too')
  await page.getByLabel(/last name/i).fill('Young')
  await page.getByLabel(/date of birth/i).fill('2011-01-01')
  await page.getByLabel(/^email$/i).fill(`young-${run}@movingmate.test`)
  await page.getByLabel(/phone number/i).fill(phone8(`${run}-y`))
  await page.getByLabel(/^password$/i).fill('DriverPass1!')
  await page.getByRole('checkbox', { name: 'Nicosia' }).check()

  await expect(page.getByText(/at least 18 years old/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()
})
