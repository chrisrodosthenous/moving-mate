/** E2E helpers for mock payment authorize flow. */

/**
 * Authorize payment for a pending order (simulates payment provider success).
 * @param {import('@playwright/test').APIRequestContext} backend
 */
async function authorizeOrderPayment(backend, orderId, customerToken) {
  const res = await backend.post(`/api/payments/confirm/${orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  return res;
}

module.exports = {
  authorizeOrderPayment,
};
