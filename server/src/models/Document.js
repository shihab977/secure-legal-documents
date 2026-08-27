const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: [true, 'Case ID is required'],
      index: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader ID is required'],
      index: true
    },
    originalFilename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true
    },
    mimeType: {
      type: String,
      required: true,
      default: 'application/octet-stream'
    },
    fileSize: {
      type: Number,
      required: true // Size of encrypted ciphertext in bytes
    },
    minioBucket: {
      type: String,
      required: true
    },
    minioObjectKey: {
      type: String,
      required: true,
      unique: true
    },
    // Base64 12-byte IV used for file payload AES-256-GCM encryption
    fileIV: {
      type: String,
      required: [true, 'File IV is required']
    },
    encryptionAlgorithm: {
      type: String,
      default: 'AES-256-GCM'
    },
    keyWrapAlgorithm: {
      type: String,
      default: 'RSA-OAEP-2048'
    },
    // Access Control List containing wrapped DEKs for authorized users
    accessList: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        wrappedDEK: {
          type: String,
          required: true // Base64 RSA-OAEP encrypted DEK
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

documentSchema.index({ caseId: 1, createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
