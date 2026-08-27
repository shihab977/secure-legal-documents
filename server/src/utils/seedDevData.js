const crypto = require('crypto');
const { argon2id } = require('hash-wasm');
const User = require('../models/User');
const { hashAuthHash } = require('./argon2Server');

/**
 * Derives client-side MasterKey & AuthHash in Node exactly like browser Web Crypto API.
 */
async function deriveClientAuthHash(password, base64Salt) {
  const saltBuffer = Buffer.from(base64Salt, 'base64');
  const masterKeyHex = await argon2id({
    password,
    salt: saltBuffer,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'hex'
  });

  const masterKeyBytes = Buffer.from(masterKeyHex, 'hex');

  // HMAC-SHA256 signature for AuthHash
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  const authSig = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    encoder.encode('ServerAuthToken_ZeroKnowledgeLegal_2026')
  );

  return {
    masterKeyBytes,
    clientAuthHash: Buffer.from(authSig).toString('base64')
  };
}

/**
 * Encrypts RSA Private Key JWK using AES-256-GCM and MasterKey in Node.
 */
async function encryptPrivateKey(privateKeyJwk, masterKeyBytes) {
  const iv = crypto.randomBytes(12);
  const aesKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintextBytes
  );

  return {
    encryptedPrivateKey: Buffer.from(encryptedBuffer).toString('base64'),
    privateKeyIV: iv.toString('base64')
  };
}

/**
 * Seeds missing development accounts (lawyer@test.com & client@test.com) if not already present.
 */
async function seedDevData() {
  if (process.env.NODE_ENV === 'test') return;

  const defaultPassword = 'TestPassword123!';

  const devAccounts = [
    {
      email: 'lawyer@test.com',
      name: 'Test Lawyer',
      role: 'lawyer'
    },
    {
      email: 'client@test.com',
      name: 'Test Client',
      role: 'client'
    }
  ];

  for (const acc of devAccounts) {
    const existing = await User.findOne({ email: acc.email });
    if (existing) {
      console.log(`[Seed Check] Account '${acc.email}' already exists in DB. Preserving existing record.`);
      continue;
    }

    console.log(`[Seed Info] Creating missing development account '${acc.email}'...`);

    // 1. Generate random 16-byte user salt
    const userSalt = crypto.randomBytes(16).toString('base64');

    // 2. Derive Client AuthHash & MasterKey
    const { masterKeyBytes, clientAuthHash } = await deriveClientAuthHash(defaultPassword, userSalt);

    // 3. Hash clientAuthHash with server-side Argon2id
    const serverAuthHash = await hashAuthHash(clientAuthHash);

    // 4. Generate RSA-2048 key pair
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
    });

    // 5. Encrypt private key with MasterKey
    const { encryptedPrivateKey, privateKeyIV } = await encryptPrivateKey(keyPair.privateKey, masterKeyBytes);

    // 6. Save user to MongoDB
    await User.create({
      name: acc.name,
      email: acc.email,
      role: acc.role,
      userSalt,
      authHash: serverAuthHash,
      publicKey: JSON.stringify(keyPair.publicKey),
      encryptedPrivateKey,
      privateKeyIV
    });

    console.log(`[Seed Info] Development account '${acc.email}' seeded successfully.`);
  }
}

module.exports = { seedDevData };
