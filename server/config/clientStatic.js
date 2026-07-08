const fs = require('fs');
const path = require('path');
const express = require('express');

const CLIENT_DIST = path.join(__dirname, '..', '..', 'dist', 'moving-mate', 'browser');

function getClientDistPath() {
  return CLIENT_DIST;
}

function clientDistExists() {
  return fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
}

/** Serve built Angular app from Node when dist exists (default in production). */
function shouldServeClient() {
  if (process.env.SERVE_CLIENT === 'false') return false;
  if (process.env.NODE_ENV === 'production') return clientDistExists();
  return process.env.SERVE_CLIENT === 'true' && clientDistExists();
}

function registerClientStatic(app) {
  if (!shouldServeClient()) {
    if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT !== 'false') {
      console.warn('[Server] Production: Angular build not found at', CLIENT_DIST);
      console.warn('[Server] Run `npm run build:prod` from the project root before starting.');
    }
    return false;
  }

  console.log('[Server] Serving Angular client from', CLIENT_DIST);
  app.use(express.static(CLIENT_DIST, { maxAge: '1d', index: false }));
  return true;
}

/** History-mode SPA fallback — after API routes, before 404. */
function registerSpaFallback(app, enabled) {
  if (!enabled) return;

  app.get(/^(?!\/api\/|\/socket\.io|\/uploads\/).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

module.exports = {
  getClientDistPath,
  clientDistExists,
  shouldServeClient,
  registerClientStatic,
  registerSpaFallback,
};
