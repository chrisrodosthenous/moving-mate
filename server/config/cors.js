/**
 * CORS configuration for Express and Socket.IO.
 *
 * In development (NODE_ENV !== 'production') every origin is accepted so that
 * ngrok tunnels, LAN IPs, and any other reverse-proxy can reach the API without
 * manual allow-listing.  Using `true` (not `'*'`) echoes the request Origin back,
 * which is required for `credentials: true` to work — browsers reject
 * `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Credentials: true`.
 *
 * In production only explicitly listed / matched origins are permitted.
 *
 * Static allow-list (production):
 *  - localhost / 127.0.0.1 dev ports
 *  - CLIENT_URL, RENDER_EXTERNAL_URL, EXTRA_ALLOWED_ORIGINS
 *  - LAN IPs  (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 *  - ngrok tunnels (*.ngrok-free.app, *.ngrok.io, *.ngrok.app, *.ngrok.dev)
 *  - Render default hostnames (*.onrender.com)
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

const STATIC_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:3000',
];

const ENV_EXTRA = (process.env.EXTRA_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Normalize env URL to origin form (scheme + host, no path). */
function normalizeOrigin(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`;
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

function envOrigins() {
  const fromEnv = [
    ...ENV_EXTRA.map(normalizeOrigin),
    normalizeOrigin(process.env.CLIENT_URL || ''),
    normalizeOrigin(process.env.RENDER_EXTERNAL_URL || ''),
  ].filter(Boolean);
  return [...new Set(fromEnv)];
}

function staticOrigins() {
  return [...new Set([...STATIC_ORIGINS, ...envOrigins()])];
}

/** Returns true for any origin that should be permitted (production rules). */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (staticOrigins().includes(origin)) return true;
  // LAN (192.168.x.x or 10.x.x.x or 172.16-31.x.x) on any port
  if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(:\d+)?$/.test(origin)) return true;
  // ngrok tunnels
  if (/^https:\/\/[a-z0-9-]+\.(ngrok-free\.app|ngrok\.io|ngrok\.app|ngrok\.dev)(:\d+)?$/i.test(origin)) {
    return true;
  }
  // Render default service URLs (before custom domain is wired)
  if (/^https:\/\/[a-z0-9-]+\.onrender\.com(:\d+)?$/i.test(origin)) return true;
  return false;
}

/**
 * Origin callback compatible with `cors()` and Socket.IO `cors.origin`.
 *
 *  - Dev: allow every origin (reflected, not wildcard) so credentials work.
 *  - Prod: allow only origins matched by isAllowedOrigin().
 */
function corsOrigin(origin, cb) {
  if (IS_DEV) return cb(null, true); // echo origin — safe for dev, works with credentials
  if (!origin) return cb(null, true); // same-origin / server-to-server / Postman
  if (isAllowedOrigin(origin)) return cb(null, true);
  cb(new Error('Not allowed by CORS'));
}

/**
 * Headers browsers are allowed to send.
 * Includes Authorization (JWT), Content-Type, x-fb-token (FCM browser warning bypass),
 * and ngrok's own skip-warning header.
 */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-fb-token',
  'ngrok-skip-browser-warning',
];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

module.exports = {
  ALLOWED_ORIGINS: corsOrigin,
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  isAllowedOrigin,
  IS_DEV,
};
