const mongoose = require('mongoose');

const impersonationGrantSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports =
  mongoose.models.ImpersonationGrant || mongoose.model('ImpersonationGrant', impersonationGrantSchema);
