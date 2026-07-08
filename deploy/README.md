# Production deployment (mock payments)

Deploy Moving Mate to a public server for **real user testing** while keeping **mock payments** (`PAYMENTS_PROVIDER=mock`). Integrate Stripe later by setting `PAYMENTS_PROVIDER=stripe` and wiring the provider.

## Architecture

Single Node process (simplest):

```
Browser → HTTPS → Node :3000
                    ├── /api/*        Express API + Socket.IO
                    ├── /uploads/*    Static uploads
                    └── /*            Angular SPA (dist/moving-mate/browser)
```

Run `npm run build:prod` before start so the API can serve the Angular build from the same origin (no CORS issues).

## 1. Server requirements

- **Node.js 20+**
- **MongoDB** (Atlas recommended)
- **HTTPS** (Let’s Encrypt + nginx, or platform TLS)
- **SMTP** (Postmark, SendGrid, SES, etc.) — required when `NODE_ENV=production`
- **Google Maps API key** (server geocoding + browser key in `environment.prod.ts`)

## 2. Configure environment

On the server:

```bash
cp deploy/.env.production.example server/.env
# Edit server/.env with real values
```

Minimum production values:

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://...` |
| `JWT_SECRET` | 64+ random characters |
| `CLIENT_URL` | `https://yourdomain.com` |
| `PAYMENTS_PROVIDER` | `mock` |
| `GOOGLE_MAPS_API_KEY` | server geocoding key |
| `SMTP_*` + `EMAIL_FROM` | your mail provider |

Leave **`ENABLE_TEST_ROUTES` unset** on public production.

## 3. Build and run

From the **project root** on the server:

```bash
npm ci
npm ci --prefix server
npm run build:prod
npm run server:prod
```

Or one command (build + start):

```bash
npm run start:prod
```

Verify:

```bash
curl -s https://yourdomain.com/api/health
# OK

curl -s -H "Accept: application/json" https://yourdomain.com/api/health
# {"ok":true,"payments":"mock","mockPayments":true}
```

Create an admin:

```bash
node server/scripts/make-admin.js you@yourdomain.com
```

## 4. Process manager (PM2)

```bash
npm run build:prod
pm2 start server/server.js --name moving-mate --cwd server
pm2 save
```

Ensure `server/.env` exists with `NODE_ENV=production`.

## 5. nginx reverse proxy (optional)

If nginx terminates TLS and proxies to Node on `127.0.0.1:3000`, see `deploy/nginx.conf.example`.

Set `SERVE_CLIENT=false` only if nginx serves `dist/moving-mate/browser` directly; otherwise Node serves the SPA (default).

## 6. Split hosting (optional)

Frontend on CDN + API on subdomain:

1. Build: `npm run build:prod`, upload `dist/moving-mate/browser/` to static host.
2. API: `SERVE_CLIENT=false`, `CLIENT_URL=https://app.example.com`.
3. Set `EXTRA_ALLOWED_ORIGINS=https://app.example.com`.
4. Update the Angular app to use an absolute API base URL (today it uses relative `/api` — same-origin deploy is easier).

## 7. What works in mock mode

- Customer checkout (authorize at booking)
- Capture when driver accepts
- 80/20 wallet credits on delivery
- Driver/admin mock withdrawals + email notifications
- **No real card charges or bank payouts**

Checkout shows a **Test mode** banner while `mockPayments: true` in `environment.prod.ts`.

## 8. Before going live with real payments

1. Stripe account + Connect for drivers
2. Set `PAYMENTS_PROVIDER=stripe` and add Stripe env vars
3. Replace mock checkout with Stripe Checkout / Elements
4. Set `mockPayments: false` in `environment.prod.ts`
5. Webhooks + legal pages (terms, refunds)

---

**Local production smoke test** (Windows PowerShell):

```powershell
# server/.env: NODE_ENV=production + real MONGODB_URI + SMTP + GOOGLE_MAPS_API_KEY
npm run build:prod
npm run server:prod
# Open http://localhost:3000
```
