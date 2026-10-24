# Moving Mate — Test Plan

This plan is based on the repository as inspected on 3 Oct 2026. It describes what the app actually does, what is already tested, and what should be added. It does not invent features that are not in the code.

---

## 1. Application snapshot

### 1.1 Type and stack

| Layer | Technology in this repo |
| --- | --- |
| Product | Cyprus moving marketplace (customer books a move; verified drivers accept; mock payment authorize/capture; 80/20-style split with tapered bands) |
| Frontend | Angular 21 (standalone components, Signals, NgRx Store/Effects, Tailwind) |
| Backend | Node.js + Express 5 |
| Language | TypeScript (Angular), JavaScript (Express) |
| Database | MongoDB via Mongoose (`TransportOrder`, `User`, `Message`, `Review`, `PaymentIntent`, `WalletLedger`, `Payout`, `NotificationSetting`, `PricingConfig`) |
| Auth | JWT (`Authorization: Bearer`), bcrypt passwords, role = `customer` \| `driver` \| `admin` |
| Realtime | Socket.io (chat, presence, driver GPS, new-order events) |
| External | Google Maps / Places / Directions, Firebase Cloud Messaging, Nodemailer/SMTP |
| Payments | Mock provider (`PAYMENTS_PROVIDER=mock`). Stripe is named in env/models but not implemented |
| Build | `ng build` + Express static SPA on Render; Playwright starts `ng serve` + `node server.js` |
| State | NgRx for customer/admin lists; `AuthStore` (NgRx signals) for session |

### 1.2 Architecture (what actually exists)

**Frontend modules**

- Marketing site: `/`, `/features`, `/how-it-works`, `/about`, `/contact`, `/download`
- Auth: login, register (customer + driver multipart docs), forgot/reset password
- Customer shell: dashboard, book (`/customer/book`), my orders, order details, mock checkout
- Driver shell: dashboard, available jobs, my trips, job detail, active delivery
- Admin shell: dashboard (fleet / orders / analytics / design tools), notification settings, **pricing** (`/admin/settings/pricing` — local, uncommitted)
- Shared: chat window, driver job cards, maps, profile, PWA / FCM

**Backend API (authenticated unless noted)**

- Public: `GET /api/health`, `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password`, `POST /api/contact`
- Orders: `POST /quote`, `POST /`, `GET /`, `GET /mine`, `GET /summary`, accept/pickup/deliver/cancel/complete, cargo upload, rate
- Users: profile, districts, change-password, license upload, FCM token
- Payments: checkout / confirm / status (mock)
- Wallet: driver balance + mock withdraw; admin platform wallet
- Chat / reviews / admin overview, verify driver, documents, notification settings, pricing-config
- Dev-only: `/api/test/e2e/*` when `NODE_ENV !== production` or `ENABLE_TEST_ROUTES=true`

**Guards that matter**

- JWT required on all `/api/orders` after the router `authMiddleware`
- H4: unverified driver → HTTP 403 `{ message: 'Driver not verified' }` on list/summary/accept
- Price mismatch: client `price` must match `calculateOrderPrice` within ±€0.05, unless a signed `quoteToken` is honoured
- H5: atomic `findOneAndUpdate` on accept → one 200, one 409
- Admin routes: `authMiddleware` + `adminMiddleware`
- Capture-before-accept: driver cannot accept until mock payment is authorized

**Business logic that must stay consistent**

- Cargo score → vehicle tier (`orderCargoScoring.js` / `order-cargo-scoring.util.ts`)
- Work-based price + driver cost floor (`orderPricing.js` mirrored in `order-pricing.util.ts`)
- Marginal commission 20% / 15% / 10% (`orderCommission.js` / `order-commission.util.ts`)
- Signed quotes (`orderQuote.js`) so a mid-session config edit does not change the shown price
- Vehicle matching: truck drivers can take van jobs; pickup cannot take a truck job

### 1.3 Major user journeys

1. Customer register / login / logout / change password
2. Forgot + reset password (depends on SMTP)
3. Driver register with vehicle photo + optional license → pending → admin approve/reject
4. Customer books: district, map route, cargo, floors, labor, schedule ≥1h, safety consent, photo, confirm
5. Customer pays (mock checkout) then order becomes accept-able
6. Verified driver sees district+vehicle-matched jobs, accepts, chats, starts trip, delivers
7. Customer rates driver; both see completed history
8. Driver / platform mock wallet withdraw
9. Admin: fleet, orders, analytics, notification test send, pricing config (local)
10. Push / email / scheduler reminders (24h and 30m before `scheduledAt`)
11. Marketing contact form (SMTP)

### 1.4 Existing tests (do not replace these)

**Server unit (`node:test`, `server/package.json` → `utils/**/*.test.js` + `services/**/*.test.js`)**

| File | What it covers |
| --- | --- |
| `utils/orderPricing.test.js` | Handling minutes, stairs, taper, cost floor, min fare, 2-bed reference job |
| `utils/orderCommission.test.js` | Marginal bands, locked-split stamp, helper vs first band 80/20 |
| `utils/orderQuote.test.js` | Fingerprint stability, expire, tamper, audience |
| `utils/driverVehicleMatching.test.js` | Full driver↔order vehicle matrix + district filter |
| `utils/notificationDedupe.test.js` | Push/email de-dupe keys |
| `services/paymentService.test.js` | Mock intent, authorize, capture, wallet credit, withdraw (Mongo) |
| `config/pricingDefaults.test.js` | Config normalize/merge + config-driven price (**not** in `npm test` glob today) |

`driverAge.js` contains `runDriverAgeUnitTests()` but that function is **not** invoked by `npm test`.

**Playwright E2E (`tests/*.spec.js`, `playwright.config.js`)**

Starts API `:3000` + Angular `:4200`. Uses `/api/test/e2e/bootstrap` + cleanup.

Covered journeys: login/register UI, customer home/profile/new-order/my-orders, driver flow/lifecycle/lock/upload-lock/auto-refresh, chat (flow, ticks, notifications, functionality), reviews, payments mock lifecycle, admin flow, H4/H5/price-tamper API, full-app grand tour.

Helpers: `tests/helpers/{auth,register-driver,new-order-form,e2e-ui,payments,order-logistics-payload}.js`.

**Angular Karma**

`ng test` uses ChromeHeadless. Only `src/app/app.spec.ts` (“should create the app”). No specs for pricing, cargo, commission, or password policy.

### 1.5 Risks

| Area | Why it is risky | Current coverage |
| --- | --- | --- |
| Pricing engine + client mirror | Money. Client/server drift → 400 on every book | Server unit strong; **no Angular unit mirror** |
| Cargo → vehicle | Wrong tier = wrong price and wrong drivers | Used everywhere; **no dedicated unit file** |
| Commission bands | Driver payout / wallet | Server unit; client util untested |
| Signed quotes | New path; token honour vs config edit | Unit for JWT; **no API/E2E** |
| H4 / H5 / price guard | Security product rules | Playwright API only |
| Payments mock vs “stripe” | `stripe` returns 503 | Mock lifecycle tested |
| SMTP | Local Ethereal 535; forgot-password/contact 502 | Not unit-tested (external) |
| Driver age 18–65 | Legal/eligibility | Embedded helper, **not in test runner** |
| Password policy | Auth security; two copies (TS + JS) | Untested |
| NoSQL operator sanitization | Express 5 query mutation | Untested |
| ObjectId strictness | IDOR / chat/order lookup | Untested |
| Insurance field | Stored, never priced | No tests (and no product behavior) |
| Chat `/chat/:id` deep link | Redirect drops conversation id | Untested gap |
| Uncommitted pricing vs production | Prod still old formula until deploy | E2E helpers now call new engine locally |

---

## 2. Testing strategy

Reuse what the repo already uses. Do not add Jest/Cypress/Vitest.

| Level | Framework | What belongs here | What does not |
| --- | --- | --- | --- |
| Unit | `node:test` + `assert` for server; Jasmine/Karma for pure Angular utils | Formula, scoring, password, age, sanitize, ObjectId, quote crypto, commission | Full HTTP, Mongo, SMTP, Maps, FCM |
| Integration | `node:test` + Mongo (`paymentService.test.js` pattern) | Wallet ledger, payment intent state machine, config upsert | Browser |
| API (in-process via Playwright `request`) | Existing `tests/api-security-hardening.spec.js` style | Authz, quote+create, price mismatch, concurrent accept | Visual layout |
| Component / UI | Playwright (not isolated Karma component trees) | Visible book/pay/accept/chat/admin | Screenshot-only tests |
| E2E | Playwright | One path per role that a real user would finish | Duplicating the same chat spec four times (already exists — do not add a fifth) |

**Rules**

- Prefer one assertion-rich test over many clones.
- Mock SMTP, Maps, and FCM. Do not mock `calculateOrderPrice` in API tests — that is the subject.
- E2E that needs a paid order must call `authorizeOrderPayment` (accept captures payment).
- Never point tests at production Mongo or live Stripe.
- If a test exposes a production bug, **keep the failing test** and document it. Do not change app code to silence it.

---

## 3. Priorities

**P0 — ship-breaking / money / security**

Price formula, cargo→vehicle, commission split, quote honour, price tamper, H4, H5, JWT on orders, mock pay authorize-before-accept.

**P1 — core journeys**

Register/login, driver verify, book+pay+accept+deliver+review, password rules, age gate, admin 403 on pricing-config, wallet credit on delivery.

**P2 — supporting**

Chat unread/ticks, profile/license preview, schedule validation, FCM token sanitization, sanitizer, ObjectId, notification settings.

**P3 — polish**

Marketing pages, download/PWA copy, design widget, empty/loading chrome, insurance (until it does something).

---

## 4. Test case inventory

Existing automated coverage is marked **Have**. New work in this pass is marked **Add**. The rest is backlog.

| ID | Area | Scenario | Type | Priority | Expected Result |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Pricing | 2-bed truck, 18 km, 3rd floor, helper | Unit | P0 | €247.44 rate card (Have) |
| P0-02 | Pricing | Empty cargo 1 km pickup | Unit | P0 | Minimum fare €45 (Have) |
| P0-03 | Pricing | Distance > 30 km van | Unit | P0 | Tapered near/far km (Have) |
| P0-04 | Pricing | Long intercity job | Unit | P0 | `pricingBasis === cost_floor` (Have) |
| P0-05 | Pricing | Client vs server ±€0.05 | Unit | P0 | `pricesMatch` true/false (Have) |
| P0-06 | Pricing | Config wage rise raises floor | Unit | P0 | Higher total (Have, config tests) |
| P0-07 | Cargo | Score thresholds 5 / 15 / 35 | Unit | P0 | pickup / minivan / van / truck (Add) |
| P0-08 | Cargo | Reject negative / non-integer qty | Unit | P0 | `parseCargoInventory` null (Add) |
| P0-09 | Cargo | 2-bed inventory is truck | Unit | P0 | API would reject `van` (Add; also Have in pricing alignment) |
| P0-10 | Commission | €100 → 20/80 | Unit | P0 | €20 / €80 (Have) |
| P0-11 | Commission | €247.44 marginal | Unit | P0 | €42.12 / €205.32 (Have) |
| P0-12 | Commission | €400 third band | Unit | P0 | €60 / €340 (Have) |
| P0-13 | Commission | Do not rewrite stamped split | Unit | P0 | Locked amounts kept (Have) |
| P0-14 | Quote | Same inputs, different types | Unit | P0 | Fingerprint equal (Have) |
| P0-15 | Quote | Expired / wrong secret / wrong aud | Unit | P0 | `ok: false` (Have) |
| P0-16 | Quote | Tampered total | Unit | P0 | Reject (Have) |
| P0-17 | API | POST order with price €2 | API | P0 | 400 Price mismatch (Have) |
| P0-18 | API | POST order with matching price | API | P0 | 201 stored server total (Have) |
| P0-19 | API | Quote then create without price | API | P0 | 201 at quoted total (Add) |
| P0-20 | API | Quote then change labor | API | P0 | 400 details changed (Add) |
| P0-21 | API | Forged quote token | API | P0 | 400 invalid token (Add) |
| P0-22 | API | Old quote after config save | API | P0 | Still original total (Add) |
| P0-23 | Authz | Unverified driver list/summary | API | P0 | 403 Driver not verified (Have) |
| P0-24 | Authz | Two drivers accept same order | API | P0 | 200 + 409 (Have) |
| P0-25 | Authz | No Bearer on /api/orders | API | P0 | 401 (Add light check) |
| P0-26 | Payments | Accept before authorize | API | P0 | 402 / not authorized (Have in payment E2E) |
| P0-27 | Payments | Checkout + confirm | Integration | P0 | `authorized` (Have) |
| P0-28 | Payments | Delivery credits wallets | Integration | P0 | Driver + platform balances (Have) |
| P1-01 | Password | Missing upper / number / special / length | Unit | P1 | Server messages (Add) |
| P1-02 | Password | Same rules on Angular util | Unit | P1 | `validatePassword` false (Add) |
| P1-03 | Age | 17 / 18th birthday / 65 / 66 | Unit | P1 | Eligible only 18–65 (Add) |
| P1-04 | Vehicle | Truck driver vs van order | Unit | P1 | Eligible (Have) |
| P1-05 | Vehicle | Pickup driver vs truck order | Unit | P1 | Ineligible (Have) |
| P1-06 | Auth | Register + login | E2E | P1 | Dashboard (Have) |
| P1-07 | Auth | Bad password | E2E | P1 | Error, stay on login (Have auth-ui) |
| P1-08 | Book | Map + cargo + consent + 201 | E2E | P1 | Lands on my orders (Have) |
| P1-09 | Lifecycle | Accept → pickup → deliver → review | E2E | P1 | Completed + rating (Have) |
| P1-10 | Admin | Customer GET pricing-config | API | P1 | 403 (Add) |
| P1-11 | Admin | Admin GET pricing-config + preview | API | P1 | 200, 4 sample jobs (Add) |
| P1-12 | Wallet | Withdraw more than balance | Integration | P1 | Rejected (Have-ish in payment tests) |
| P1-13 | Client price | Angular `calculateOrderPrice` matches server for 2-bed | Unit | P1 | Same total (Add) |
| P1-14 | Client commission | Angular split of €247.44 | Unit | P1 | 205.32 (Add) |
| P2-01 | Sanitize | `$gt` / dotted keys stripped | Unit | P2 | Keys deleted (Add) |
| P2-02 | ObjectId | Short / invalid / 24-hex | Unit | P2 | null vs canonical (Add) |
| P2-03 | FCM | Empty / short / dup tokens | Unit | P2 | Only >10 char unique (Add) |
| P2-04 | Chat | Two messages + ticks | E2E | P2 | Visible to both (Have) |
| P2-05 | License | Driver preview + admin open | E2E | P2 | Image or PDF (Have via license work / admin-flow) |
| P2-06 | Schedule | `< 1 hour` | API | P2 | 400 (backlog unless cheap) |
| P2-07 | Quote | Missing cargo on /quote | API | P2 | 400 (Add) |
| P2-08 | Profile | Update name | E2E | P2 | Persist (Have customer-profile) |
| P3-01 | Marketing | Landing renders | E2E | P3 | Have customer-home-ish / skip |
| P3-02 | Insurance | Field ignored in price | Unit | P3 | Backlog — no UI |
| P3-03 | Deep link | `/chat/:id` opens that thread | E2E | P3 | Known gap — do not “fix” app in this pass |

---

## 5. Implementation plan for this pass

1. Keep Playwright + `node:test` + Karma. No new dependencies.
2. Include `config/**/*.test.js` in `server` `npm test` so pricing-config tests actually run in CI.
3. Add the **Add** unit files listed above.
4. Extend `tests/api-security-hardening.spec.js` with quote + admin pricing-config cases (same bootstrap/cleanup pattern).
5. Add Karma specs only for **pure functions** (cargo, commission, password, a single pricing parity case) — not `TestBed` for the whole create-order page.
6. Run `node --test` (server). Run Karma if it finishes in this environment. Do **not** fail the plan if Playwright webServer cannot bind ports.
7. Write `TEST_COVERAGE.md` from actual results.
8. Do not change production controllers/pricing to make a test green.

---

## 6. Out of scope for this pass

- Stripe live PSP tests
- Real SMTP / SendGrid sandbox
- Recreating four overlapping chat E2E files
- Calibration telemetry (not built)
- Driver bidding (not built)
- Changing application behavior
