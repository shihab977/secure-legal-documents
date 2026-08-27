const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'USER_REGISTER',
        'USER_LOGIN',
        'CASE_CREATED',
        'CASE_UPDATED',
        'CASE_ACCESSED',
        'DOC_UPLOADED',
        'DOC_DOWNLOADED',
        'UNAUTHORIZED_ACCESS_ATTEMPT'
      ],
      index: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetResource: {
      type: String,
      enum: ['Auth', 'Case', 'Document', 'User'],
      required: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    details: {
      type: String,
      trim: true
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
