'use strict';

/**
 * Helmet / Content-Security-Policy for the Express app (API + Angular SPA).
 * Default helmet CSP blocks Google Maps dynamic script injection (script-src 'self' only).
 */

const GOOGLE_MAPS_SCRIPT = ['https://maps.googleapis.com', 'https://maps.gstatic.com'];
const GOOGLE_MAPS_CONNECT = ['https://maps.googleapis.com', 'https://*.googleapis.com'];
const GOOGLE_MAPS_IMG = [
  'https://maps.googleapis.com',
  'https://maps.gstatic.com',
  'https://*.ggpht.com',
  'https://*.googleusercontent.com',
  'https://*.google.com',
];

/** Firebase Cloud Messaging service worker uses importScripts from gstatic. */
const FIREBASE_SCRIPT = ['https://www.gstatic.com'];

function buildHelmetOptions() {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", ...GOOGLE_MAPS_SCRIPT, ...FIREBASE_SCRIPT],
        'connect-src': ["'self'", 'wss:', 'ws:', ...GOOGLE_MAPS_CONNECT],
        'img-src': ["'self'", 'data:', 'blob:', ...GOOGLE_MAPS_IMG],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'worker-src': ["'self'", 'blob:'],
      },
    },
  };
}

module.exports = { buildHelmetOptions };
