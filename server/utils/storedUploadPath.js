const path = require('path');

const CONTENT_TYPES = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'application/pdf': 'application/pdf',
};

/** Public URL path for a driver or license upload. Null when it can escape `/uploads`. */
function publicUploadPath(urlPath) {
  const raw = String(urlPath || '').trim();
  if (!raw.startsWith('/uploads/')) return null;
  if (raw.includes('\\') || raw.includes('\0')) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const normalized = path.posix.normalize(decoded);
  if (!normalized.startsWith('/uploads/')) return null;
  if (normalized.includes('..')) return null;
  if (normalized.endsWith('/')) return null;
  return normalized;
}

/** Disk path inside the uploads directory. Null when the public path is unsafe. */
function absoluteUploadPath(uploadsRoot, urlPath) {
  const safe = publicUploadPath(urlPath);
  if (!safe) return null;
  const relative = safe.slice('/uploads/'.length);
  const root = path.resolve(uploadsRoot);
  const absolute = path.resolve(root, relative);
  const fromRoot = path.relative(root, absolute);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
  return absolute;
}

/** Allowed image or PDF type. Null for anything else. */
function contentTypeForUpload(mimetype, urlPath) {
  const fromMime = CONTENT_TYPES[String(mimetype || '').toLowerCase()];
  if (fromMime) return fromMime;
  const ext = path.posix.extname(String(urlPath || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return null;
}

module.exports = {
  publicUploadPath,
  absoluteUploadPath,
  contentTypeForUpload,
};
