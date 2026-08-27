const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: ['lawyer', 'client'],
      required: [true, 'Role is required']
    },
    // Server-side Argon2id hash of the client's AuthHash
    authHash: {
      type: String,
      required: [true, 'Authentication hash is required'],
      select: false // Exclude from default queries for security
    },
    // Base64 salt used by client for Argon2id key derivation
    userSalt: {
      type: String,
      required: [true, 'User salt is required']
    },
    // Public Key for RSA-OAEP 2048 key exchange (Stored in Plaintext JSON string / JWK format)
    publicKey: {
      type: String,
      required: [true, 'Public key is required']
    },
    // Private Key encrypted on client with user's MasterKey via AES-256-GCM (Base64)
    encryptedPrivateKey: {
      type: String,
      required: [true, 'Encrypted private key is required']
    },
    // 12-byte IV used for encrypting the private key (Base64)
    privateKeyIV: {
      type: String,
      required: [true, 'Private key IV is required']
    }
  },
  {
    timestamps: true
  }
);

// Method to remove sensitive fields when serializing User object
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.authHash;
  delete userObject.__v;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
