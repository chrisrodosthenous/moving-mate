const { expect } = require('@playwright/test')

/** Wait until Google Maps JS API is available (not just haversine fallback). */
async function waitForGoogleMaps(page) {
  await page.waitForFunction(() => Boolean(window.google?.maps?.DirectionsService), null, { timeout: 15000 })
}

/**
 * Set pickup (A) and destination (B) via map taps — matches create-order map-first UX.
 * Requires pickup district to be selected first so the map is focused on Cyprus.
 */
async function selectOrderRouteOnMap(page) {
  await waitForGoogleMaps(page)
  const mapShell = page.getByTestId('google-map-shell')
  await expect(mapShell).toBeVisible({ timeout: 15000 })

  const box = await mapShell.boundingBox()
  if (!box) throw new Error('Map shell has no bounding box')
  const center = { x: Math.floor(box.width / 2), y: Math.floor(box.height / 2) }
  const offset = { x: center.x + Math.min(80, Math.floor(box.width * 0.15)), y: center.y + Math.min(60, Math.floor(box.height * 0.12)) }

  await mapShell.click({ position: center })
  await expect(page.locator('#pickupAddress')).not.toHaveValue('', { timeout: 20000 })

  await mapShell.click({ position: offset })
  await expect(page.locator('#dropoffAddress')).not.toHaveValue('', { timeout: 20000 })

  await expect(page.getByTestId('order-summary-panel')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('order-summary-price')).toBeVisible({ timeout: 45000 })
}

/** Add cargo via inventory +/- counters (defaults: 1 box). */
async function fillOrderInventoryAndSchedule(page, { boxes = 1, time = '10:00' } = {}) {
  const qty = page.getByTestId('cargo-qty-boxes')
  const incBoxes = page.getByTestId('cargo-inc-boxes')
  const currentQty = Number(await qty.innerText())
  if (currentQty < boxes) {
    for (let i = currentQty; i < boxes; i++) {
      await incBoxes.dispatchEvent('click')
    }
    await expect(qty).toHaveText(String(boxes))
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yyyy = tomorrow.getFullYear()
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const dd = String(tomorrow.getDate()).padStart(2, '0')
  await page.locator('#scheduledDate').fill(`${yyyy}-${mm}-${dd}`)
  await page.locator('#scheduledTime').selectOption(time)
}

async function acceptSafetyConsent(page) {
  const checkbox = page.locator('input[formcontrolname="safetyConsent"]')
  await checkbox.scrollIntoViewIfNeeded()
  await checkbox.check()
}

module.exports = {
  waitForGoogleMaps,
  selectOrderRouteOnMap,
  fillOrderInventoryAndSchedule,
  /** @deprecated use fillOrderInventoryAndSchedule */
  fillOrderBoxesAndSchedule: fillOrderInventoryAndSchedule,
  acceptSafetyConsent,
}
