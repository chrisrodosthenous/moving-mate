'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILENAME = 'firebase-service-account.json';

/**
 * Candidate paths for Firebase Admin service account JSON.
 * Render secret files are mounted at /etc/secrets/<filename> (see Render docs).
 */
function firebaseServiceAccountCandidates() {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const fromServerConfig = path.join(__dirname, DEFAULT_FILENAME);

  const candidates = [];

  if (envPath) {
    candidates.push(path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath));
  }

  // Render / similar hosts: secret files live under /etc/secrets/
  candidates.push(
    path.join('/etc/secrets', DEFAULT_FILENAME),
    path.join('/etc/secrets', 'config', DEFAULT_FILENAME),
  );

  candidates.push(
    fromServerConfig,
    path.join(__dirname, `${DEFAULT_FILENAME}.json`),
    path.join(__dirname, '..', '..', 'backend', 'config', DEFAULT_FILENAME),
  );

  const seen = new Set();
  return candidates.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

function resolveFirebaseServiceAccountPath() {
  for (const p of firebaseServiceAccountCandidates()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @returns {object|null} Parsed service account object, or null if unavailable.
 */
function loadFirebaseServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`);
    }
  }

  const filePath = resolveFirebaseServiceAccountPath();
  if (!filePath) return null;

  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(filePath);
}

module.exports = {
  DEFAULT_FILENAME,
  firebaseServiceAccountCandidates,
  resolveFirebaseServiceAccountPath,
  loadFirebaseServiceAccount,
};
