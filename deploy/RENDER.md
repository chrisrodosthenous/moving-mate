# Render deploy — moving-mate.com (GoDaddy domain, no GoDaddy hosting)

Deploy the full app (Angular + Node API + Socket.IO) on **Render**. Keep **only the domain** on GoDaddy — **do not buy** GoDaddy Web Hosting or VPS.

## What to buy (and what not to)

| Item | Buy on GoDaddy? | Buy elsewhere? |
|------|-----------------|----------------|
| Domain `moving-mate.com` | ✅ Already have | — |
| **Web Hosting / VPS** | ❌ **No** | Render (free → ~$7/mo) |
| Database | ❌ No | MongoDB Atlas ✅ done |
| Email SMTP | Optional on GoDaddy | **SendGrid free** (recommended) |
| Maps | ❌ No | Google Cloud (free tier) |

**GoDaddy total extra cost: $0** (unless you want GoDaddy email later).

---

## Part 1 — Accounts you need

1. **GitHub** — [github.com](https://github.com) (free)
2. **Render** — [render.com](https://render.com) (free tier to start)
3. **MongoDB Atlas** — ✅ already set up
4. **SendGrid** — [sendgrid.com](https://sendgrid.com) (free tier for SMTP)
5. **Google Cloud** — Maps + Geocoding API keys

---

## Part 2 — Push code to GitHub

On your PC (PowerShell), from the project folder:

```powershell
cd c:\Users\Christos\Documents\moving-mate

git init
git add .
git commit -m "Initial commit for Render deploy"

# Create a new empty repo on GitHub (github.com → New repository → moving-mate)
# Then:
git remote add origin https://github.com/chrisrodosthenous/moving-mate.git
git branch -M main
git push -u origin main
```

Ensure `server/.env` is **not** committed (it's in `.gitignore`).

---

## Part 3 — SendGrid (SMTP, ~10 minutes)

Production requires SMTP. SendGrid is easier than buying GoDaddy email.

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. **Settings → API Keys → Create API Key** (Full Access or Restricted with Mail Send)
3. Copy the key (starts with `SG.`) — you won't see it again
4. **Settings → Sender Authentication → Verify a Single Sender** (quick test)  
   OR verify domain `moving-mate.com` (better for production)

Use in Render env vars:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your_api_key_here
EMAIL_FROM=Moving Mate <noreply@moving-mate.com>
```

---

## Part 4 — Google Maps keys

1. [Google Cloud Console](https://console.cloud.google.com) → enable **Maps JavaScript API** + **Geocoding API**
2. **Browser key** → HTTP referrers:
   ```text
   https://moving-mate.com/*
   https://www.moving-mate.com/*
   https://*.onrender.com/*
   ```
3. **Server key** → no IP restriction needed on Render (or restrict later)
4. Put **server key** in Render as `GOOGLE_MAPS_API_KEY`
5. Put **browser key** in `src/environments/environment.prod.ts` → commit & push

Generate JWT secret (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Part 5 — Create Render web service

1. Log in to [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Web Service**
3. Connect **GitHub** → select repo **moving-mate**
4. Settings:

| Field | Value |
|-------|--------|
| **Name** | `moving-mate` |
| **Region** | Frankfurt (EU) |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm ci && npm ci --prefix server && npm run build:prod` |
| **Start Command** | `npm start --prefix server` |
| **Instance type** | Free (testing) or Starter $7/mo (always on) |

5. **Environment Variables** → Add:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas URI (from `server/.env`) |
| `JWT_SECRET` | output of crypto command above |
| `CLIENT_URL` | `https://moving-mate.com` (update after custom domain works) |
| `EXTRA_ALLOWED_ORIGINS` | `https://moving-mate.com,https://www.moving-mate.com` |
| `PAYMENTS_PROVIDER` | `mock` |
| `GOOGLE_MAPS_API_KEY` | server geocoding key |
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `apikey` |
| `SMTP_PASS` | your SendGrid API key |
| `EMAIL_FROM` | `Moving Mate <noreply@moving-mate.com>` |

Render sets `PORT` automatically — do not override.

6. **Advanced → Health Check Path:** `/api/health`
7. **Create Web Service**

Wait for the first deploy (~5–10 min). Test:

```text
https://moving-mate.onrender.com/api/health
```

(JSON: `{"ok":true,"payments":"mock",...}`)

---

## Part 6 — Custom domain on GoDaddy (no hosting purchase)

### In Render

1. Your service → **Settings** → **Custom Domains**
2. Add **`moving-mate.com`**
3. Add **`www.moving-mate.com`**
4. Render shows **exact DNS records** — copy them

### In GoDaddy (DNS only)

1. **My Products** → **moving-mate.com** → **DNS** → **Manage DNS**
2. Add what Render shows. Typically:

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `www` | `moving-mate.onrender.com` (your Render hostname) |
| **A** | `@` | IP Render gives for root domain (often `216.24.57.1` — **use Render's value**) |

3. Delete conflicting parking A/CNAME records
4. Wait 15–60 minutes; Render dashboard will show **Verified**

Update Render env if needed:

```env
CLIENT_URL=https://moving-mate.com
```

Redeploy or wait for automatic restart.

---

## Part 7 — Admin user

Render has no shell by default on free tier. Options:

**A) One-off locally against Atlas** (easiest):

```powershell
cd c:\Users\Christos\Documents\moving-mate\server
# .env already has MONGODB_URI pointing to Atlas
node scripts/make-admin.js your@email.com
```

**B) Render Shell** (paid plans) — run the same command there.

Then register/login on `https://moving-mate.com` with that email.

---

## Part 8 — MongoDB Atlas lockdown

Atlas → **Network Access** → remove `0.0.0.0/0` if you added it, **or** keep `0.0.0.0/0` if Render's outbound IPs change (Render free tier uses dynamic IPs — many teams keep `0.0.0.0/0` with strong DB password until they use VPC/peering).

For beta testing, **`0.0.0.0/0` + strong password is OK**.

---

## Free vs Starter on Render

| | Free | Starter (~$7/mo) |
|---|------|------------------|
| Cost | $0 | ~$7/mo |
| Sleeps after 15 min idle | Yes (slow first load) | No |
| Good for | You testing | Beta users / drivers |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | Check Render logs; run `npm run build:prod` locally |
| `SMTP configuration missing` | Add all SMTP_* env vars in Render |
| `Geocoding API key is missing` | Add `GOOGLE_MAPS_API_KEY` |
| CORS errors | Add `EXTRA_ALLOWED_ORIGINS` with your domain |
| Domain not verified | Double-check GoDaddy DNS; wait up to 48h |
| Cold start slow | Upgrade to Starter or accept free tier delay |

---

## Checklist

- [ ] GoDaddy: domain only — **no hosting purchased**
- [ ] Code on GitHub
- [ ] SendGrid API key
- [ ] Google Maps keys + browser key in `environment.prod.ts`
- [ ] Render web service created with env vars
- [ ] `https://xxx.onrender.com` works
- [ ] GoDaddy DNS → Render custom domain
- [ ] `https://moving-mate.com` works
- [ ] Admin user via `make-admin.js` locally
- [ ] Smoke test: order → mock pay → driver accept
