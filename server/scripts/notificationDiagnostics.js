#!/usr/bin/env node
/**
 * Automated notification diagnostics (dev / ENABLE_TEST_ROUTES).
 *
 * Usage:
 *   cd server && node scripts/notificationDiagnostics.js
 *
 * Env (optional):
 *   BASE_URL=http://127.0.0.1:3000
 *   DIAG_EMAIL_TO=you@example.com          — Test A recipient
 *   DIAG_FCM_TOKEN=...                     — Test B: raw FCM token (optional if DIAG_USER_ID set)
 *   DIAG_USER_ID=64a1b2c3d4e5f6789012345  — Test B: load fcmToken from Mongo user
 *
 * Requires: API server running, Mongo reachable for userId lookup.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const https = require('https');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const EMAIL_TO = process.env.DIAG_EMAIL_TO || 'test@example.com';
const FCM_TOKEN = String(process.env.DIAG_FCM_TOKEN || '').trim();
const USER_ID = String(process.env.DIAG_USER_ID || '').trim();

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const port = u.port || (isHttps ? 443 : 80);
    const opts = {
      hostname: u.hostname,
      port,
      path: `${u.pathname}${u.search}`,
      method,
      headers: body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers,
    };
    const req = lib.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: buf });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function statusEmoji(ok) {
  return ok ? '🟢' : '🔴';
}

async function main() {
  console.log('\n=== Moving Mate — notification diagnostics ===\n');
  console.log(`BASE_URL=${BASE}`);
  console.log('Firebase Admin JSON search order (first file that exists wins):');
  console.log('  1. FIREBASE_SERVICE_ACCOUNT_PATH (resolved from process.cwd())');
  console.log('  2. server/config/firebase-service-account.json');
  console.log('  3. server/config/firebase-service-account.json.json');
  console.log('  4. backend/config/firebase-service-account.json (legacy path)\n');

  const report = {
    health: false,
    email: false,
    /** @type {boolean|null} null = skipped */
    push: null,
    socket: false,
  };

  try {
    const h = await request(`${BASE}/api/health`);
    report.health = h.status === 200;
    console.log(`${statusEmoji(report.health)} Health GET /api/health → ${h.status}`);
  } catch (e) {
    console.log(`${statusEmoji(false)} Health failed: ${e.message}`);
    console.log('\nStart the server: cd server && npm run dev\n');
    printReport(report);
    process.exit(1);
  }

  // Test A — account-verified template (legacy body template=driver-approved still accepted)
  try {
    const body = JSON.stringify({
      to: EMAIL_TO,
      template: 'account-verified',
      firstName: 'Diagnostic',
    });
    const r = await request(`${BASE}/api/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    report.email = r.status === 200;
    console.log(
      `${statusEmoji(report.email)} Test A POST /api/test-email (account-verified) → ${r.status}`
    );
    if (r.status !== 200) console.log('   ', r.body.slice(0, 400));
  } catch (e) {
    console.log(`${statusEmoji(false)} Test A failed: ${e.message}`);
  }

  // Test B — push
  if (!FCM_TOKEN && !USER_ID) {
    console.log('⚪ Test B skipped — set DIAG_FCM_TOKEN or DIAG_USER_ID');
  } else {
    let pushUrl = `${BASE}/api/test-push-notification`;
    if (FCM_TOKEN) {
      pushUrl += `?token=${encodeURIComponent(FCM_TOKEN)}`;
    } else {
      pushUrl += `?userId=${encodeURIComponent(USER_ID)}`;
    }
    try {
      const r = await request(pushUrl);
      report.push = r.status === 200;
      console.log(`${statusEmoji(report.push)} Test B GET /api/test-push-notification → ${r.status}`);
      if (r.status !== 200) console.log('   ', r.body.slice(0, 400));
    } catch (e) {
      report.push = false;
      console.log(`${statusEmoji(false)} Test B failed: ${e.message}`);
    }
  }

  // Test C — admin toast (open Admin Dashboard with socket connected first)
  try {
    const r = await request(
      `${BASE}/api/test/trigger-socket?type=admin_toast`
    );
    report.socket = r.status === 200;
    console.log(
      `${statusEmoji(report.socket)} Test C GET /api/test/trigger-socket?type=admin_toast → ${r.status}`
    );
    if (r.status !== 200) console.log('   ', r.body.slice(0, 400));
  } catch (e) {
    console.log(`${statusEmoji(false)} Test C failed: ${e.message}`);
  }

  printReport(report);
}

function printReport(report) {
  console.log('\n--- Summary (Green/Red) ---');
  console.log(`  Email (SMTP / templates):     ${statusEmoji(report.email)} ${report.email ? 'OK' : 'FAIL'}`);
  const pushLabel =
    report.push === null ? '⚪ SKIP (set DIAG_FCM_TOKEN or DIAG_USER_ID)' : `${statusEmoji(report.push)} ${report.push ? 'OK' : 'FAIL'}`;
  console.log(`  Firebase Admin (push):       ${pushLabel}`);
  console.log(`  Socket.io (admin broadcast): ${statusEmoji(report.socket)} ${report.socket ? 'OK' : 'FAIL'}`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
