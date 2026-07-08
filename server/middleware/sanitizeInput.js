/**
 * Express 5 compatible input sanitization (no assignment to req.query).
 * Removes MongoDB operator keys ($gt, $where, keys with ".") recursively.
 * Does not replace req.body / req.query references — mutates in place only.
 */
const MAX_DEPTH = 30;

function isProhibitedKey(key) {
  return typeof key === 'string' && (key.startsWith('$') || key.includes('.'));
}

function sanitizeInPlace(value, depth) {
  if (depth > MAX_DEPTH || value === null || value === undefined) return;
  if (typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const el = value[i];
      if (el !== null && typeof el === 'object') sanitizeInPlace(el, depth + 1);
    }
    return;
  }

  const keys = Object.keys(value);
  for (const key of keys) {
    if (isProhibitedKey(key)) {
      delete value[key];
      continue;
    }
    const v = value[key];
    if (v !== null && typeof v === 'object') sanitizeInPlace(v, depth + 1);
  }
}

function sanitizeInputMiddleware(req, _res, next) {
  try {
    if (req.body !== null && typeof req.body === 'object') {
      sanitizeInPlace(req.body, 0);
    }
    if (req.params !== null && typeof req.params === 'object') {
      sanitizeInPlace(req.params, 0);
    }
    // Express 5: never assign to req.query. Mutate only if the object is extensible.
    try {
      if (req.query !== null && typeof req.query === 'object' && Object.isExtensible(req.query)) {
        sanitizeInPlace(req.query, 0);
      }
    } catch {
      /* query snapshot may be sealed in some Express setups */
    }
  } catch (err) {
    return next(err);
  }
  next();
}

module.exports = { sanitizeInputMiddleware, sanitizeInPlace };
