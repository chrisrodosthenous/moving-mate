const mongoose = require('mongoose');

/**
 * Returns canonical 24-char hex string for a valid Mongo ObjectId, or null.
 * Rejects invalid strings that pass mongoose.Types.ObjectId.isValid (e.g. too short).
 */
function strictMongoObjectIdString(id) {
  if (id == null) return null;
  if (id instanceof mongoose.Types.ObjectId) {
    return String(id);
  }
  if (typeof id === 'object' && id._id != null) {
    return strictMongoObjectIdString(id._id);
  }
  const s = String(id).trim();
  if (!s || s === '[object Object]') return null;
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  let oid;
  try {
    oid = new mongoose.Types.ObjectId(s);
  } catch {
    return null;
  }
  if (String(oid) !== s) return null;
  return s;
}

module.exports = { strictMongoObjectIdString };
