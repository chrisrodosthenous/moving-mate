/** Click the customer My Orders “Completed Orders” tab. */
async function clickCompletedOrdersTab(page) {
  const modal = page.getByTestId('review-modal')
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^cancel$/i }).click()
  }
  await page.getByTestId('my-orders-tab-completed').click()
  await page
    .waitForResponse(
      (r) => r.url().includes('/api/orders') && r.request().method() === 'GET' && r.status() === 200,
      { timeout: 15000 },
    )
    .catch(() => {})
}

/** Click the driver My trips “Completed Trips” tab. */
async function clickCompletedTripsTab(page) {
  await page.getByTestId('driver-trips-tab-completed').click()
}

module.exports = {
  clickCompletedOrdersTab,
  clickCompletedTripsTab,
}
