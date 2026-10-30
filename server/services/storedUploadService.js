const fs = require('fs');
const path = require('path');
const StoredUpload = require('../models/StoredUpload');
const {
  publicUploadPath,
  absoluteUploadPath,
  contentTypeForUpload,
} = require('../utils/storedUploadPath');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer) return Buffer.from(data.buffer);
  return Buffer.from(data);
}

async function readMulterBytes(file) {
  if (file?.buffer && file.buffer.length) return file.buffer;
  if (file?.path) return fs.promises.readFile(file.path);
  return null;
}

/** Save a multer upload under its public `/uploads/...` path. */
async function persistMulterFile(urlPath, file) {
  const safePath = publicUploadPath(urlPath);
  const contentType = contentTypeForUpload(file?.mimetype, safePath || '');
  const data = await readMulterBytes(file);
  if (!safePath || !contentType || !data || data.length === 0 || data.length > MAX_BYTES) {
    throw new Error('Could not store uploaded file.');
  }
  await StoredUpload.findOneAndUpdate(
    { path: safePath },
    { path: safePath, contentType, data, size: data.length },
    { upsert: true },
  );
  return safePath;
}

async function deleteStoredUpload(urlPath) {
  const safePath = publicUploadPath(urlPath);
  if (!safePath) return;
  await StoredUpload.deleteOne({ path: safePath });
}

function requestPublicPath(req) {
  const base = req.baseUrl || '';
  const rest = req.path || '';
  const joined = `${base}${rest.startsWith('/') ? rest : `/${rest}`}`;
  return publicUploadPath(joined);
}

/**
 * Send the disk file when it is still present, otherwise the MongoDB copy.
 * Returns false when neither copy exists.
 */
async function sendPublicUpload(res, urlPath) {
  const safePath = publicUploadPath(urlPath);
  if (!safePath) return false;

  const absolute = absoluteUploadPath(UPLOADS_ROOT, safePath);
  if (absolute && fs.existsSync(absolute)) {
    const contentType = contentTypeForUpload('', safePath);
    if (contentType) res.set('Content-Type', contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', 'inline');
    await new Promise((resolve, reject) => {
      res.sendFile(absolute, (err) => (err ? reject(err) : resolve()));
    });
    return true;
  }

  const stored = await StoredUpload.findOne({ path: safePath }).select('contentType data');
  const data = toBuffer(stored?.data);
  const contentType = contentTypeForUpload(stored?.contentType, safePath);
  if (!data || data.length === 0 || !contentType) return false;

  res.set('Content-Type', contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', 'inline');
  res.set('Cache-Control', 'private, max-age=300');
  res.send(data);
  return true;
}

/** After `express.static`, serve a copy that survived a disk wipe. */
async function serveStoredUpload(req, res, next) {
  try {
    const safePath = requestPublicPath(req);
    if (!safePath) {
      return res.status(400).type('text/plain').send('Invalid file path');
    }
    const sent = await sendPublicUpload(res, safePath);
    if (!sent) return next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  persistMulterFile,
  deleteStoredUpload,
  sendPublicUpload,
  serveStoredUpload,
};
