const { test, expect, request } = require('@playwright/test')

function uniqueRunId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function phone8(seed) {
  let acc = 37
  for (const ch of String(seed)) acc = (acc * 33 + ch.charCodeAt(0)) % 100000000
  return String(acc).padStart(8, '0').slice(0, 8)
}

test('customer profile: phone persists after reload (server truth)', async ({ page, baseURL }) => {
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
    await expect(page.locator('#phoneDigits')).toBeVisible({ timeout: 15000 })

    const newPhone = phone8(`${runId}-p`)
    await page.locator('#phoneDigits').fill(newPhone)
    const putProfile = page.waitForResponse(
      (r) =>
        r.url().includes('/api/users/profile') &&
        ['PATCH', 'PUT'].includes(r.request().method()) &&
        r.status() === 200,
    )
    await page.getByRole('button', { name: /save changes/i }).click()
    const putResp = await putProfile
    const putJson = await putResp.json()
    expect(String(putJson.user.phone || putJson.user.phoneNumber || '')).toContain(newPhone)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#phoneDigits')).toHaveValue(newPhone, { timeout: 15000 })
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
    await expect(page.locator('#emailAddress')).toBeDisabled({ timeout: 15000 })

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
