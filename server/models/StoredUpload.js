const mongoose = require('mongoose');

/** Bytes for a public `/uploads/...` file so a deploy can remove the disk copy. */
const storedUploadSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      unique: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('StoredUpload', storedUploadSchema);
