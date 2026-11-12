const mongoose = require('mongoose');

const adminAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetRole: { type: String, enum: ['customer', 'driver'], required: true },
    action: { type: String, enum: ['impersonate'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.models.AdminAudit || mongoose.model('AdminAudit', adminAuditSchema);
