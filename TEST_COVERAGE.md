# Moving Mate — Test coverage report

Generated 3 Oct 2026 after adding the tests listed in `TEST_PLAN.md`. Application controllers, pricing, and UI were **not** changed to make tests pass.

## Suite results (this pass)

| Suite | Command | Tests | Passed | Failed | Notes |
| --- | --- | --- | --- | --- | --- |
| Server unit + payment integration | `npm test --prefix server` | **127** | **127** | 0 | Includes `utils`, `services`, `config`, `middleware` |
| Angular Karma | `npx ng test --watch=false --browsers=ChromeHeadless` | **9** | **9** | 0 | 1 existing `AppComponent` + 8 new util specs |
| Playwright E2E / API | `npx playwright test` | not re-run in this pass | — | — | Last attempt timed out waiting for `webServer` (API :3000 + `ng serve` :4200). Existing 25 spec files remain. Two new cases were added to `tests/api-security-hardening.spec.js`. |

There is **no** whole-repo coverage percentage. Server `npm test` does not run `c8`. Angular `karma-coverage` is in `package.json` but was not invoked (`ng test` was run without a coverage reporter). Inventing a % would be dishonest.

## Tests added this pass

**Server (`node:test`) — 13 new cases**

- `utils/orderCargoScoring.test.js` — parse + band edges + 2-bed → truck
- `utils/passwordValidation.test.js` — accept / reject policy
- `utils/driverAge.test.js` — built-in fixtures + 18/65 edges (these previously lived only as an unused helper)
- `utils/objectId.test.js` — strict 24-hex vs mongoose-coercible junk
- `utils/fcmTokens.test.js` — trim, dedupe, length > 10
- `middleware/sanitizeInput.test.js` — `$` / dotted keys stripped

**Also:** `server/package.json` `test` now includes `config/**/*.test.js` and `middleware/**/*.test.js`, so `pricingDefaults.test.js` actually runs in CI.

**Angular (Jasmine) — 8 new cases**

- `order-cargo-scoring.util.spec.ts`
- `order-commission.util.spec.ts`
- `order-pricing.util.spec.ts` (2-bed €247.44 + pickup min fare)
- `password-policy.spec.ts`

**Playwright API — 2 new cases (not executed this pass)**

- Unauthenticated `POST /api/orders` → 401
- Signed quote honour + 403 on customer `GET /api/admin/pricing-config` + 400 on incomplete quote

## Critical areas

| Area | Status |
| --- | --- |
| Work-based price + floor + min fare | Covered (server + Angular mirror for the reference job) |
| Cargo → vehicle | Covered both sides |
| Commission bands | Covered both sides |
| Quote JWT | Covered (unit). API honour added, not executed here |
| H4 / H5 / price tamper | Existing Playwright API |
| Mock payments + wallet | Existing `paymentService.test.js` |
| Password / driver age | Now in the runner |
| Operator sanitization / ObjectId | Now covered |

## Still thin (recommended next)

1. **Run Playwright** on a free :3000/:4200 — especially `api-security-hardening.spec.js` and `payment-flow.spec.js`.
2. **Schedule &lt; 1 hour** create-order 400 (API).
3. **Wrong vehicleType for cargo score** create-order 400 (API).
4. **Accept without authorized payment** as a dedicated API assertion (today it is inside the payment E2E).
5. **Chat `/chat/:id` deep link** — known product gap (redirect drops the id).
6. **Forgot-password / contact** when SMTP is down — expect 502; do not mock away the failure.
7. **Angular create-order quote effect** — no component test; only the utils.

## Problems found in application code (tests did not change the app)

These were already known from code/API review, not from a new red unit test:

1. **Local SMTP is dead** (Ethereal 535). Forgot-password and contact return 502. The stack continues without mail.
2. **`PAYMENTS_PROVIDER=stripe` is not implemented** — checkout returns 503. Mock path works.
3. **`/chat/:id` redirects to My Orders / My trips**, not that conversation.
4. **`insuranceStatus` is stored and never priced or shown** on the book form.
5. **`runDriverAgeUnitTests` was never called by `npm test`** until this pass added `driverAge.test.js`.

No production behavior was altered. No secrets were added.
