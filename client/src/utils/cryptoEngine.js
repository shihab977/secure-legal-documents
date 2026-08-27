import { argon2id } from 'hash-wasm';

/**
 * Converts ArrayBuffer to Base64 string
 */
export const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

/**
 * Converts Base64 string to Uint8Array Buffer
 */
export const base64ToBuffer = (base64) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Generates a random 16-byte salt as Base64
 */
export const generateUserSalt = () => {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  return bufferToBase64(saltBytes);
};

/**
 * Derives MasterKey (32 bytes) and AuthHash using Argon2id in WASM.
 */
export const deriveMasterKeyAndAuthHash = async (password, base64Salt) => {
  const saltUint8 = base64ToBuffer(base64Salt);
  
  // 1. Argon2id KDF: Password + Salt -> 32-byte raw MasterKey hex
  const masterKeyHex = await argon2id({
    password,
    salt: saltUint8,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64MB RAM in KiB
    hashLength: 32, // 256 bits
    outputType: 'hex'
  });

  const masterKeyBytes = new Uint8Array(
    masterKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  // 2. Convert raw bytes into WebCrypto AES-GCM MasterKey
  const masterCryptoKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false, // Non-extractable for security
    ['encrypt', 'decrypt']
  );

  // 3. Compute AuthHash via HMAC-SHA256(masterKeyBytes, "ServerAuthToken")
  const hmacKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  const authSignature = await window.crypto.subtle.sign(
    'HMAC',
    hmacKey,
    encoder.encode('ServerAuthToken_ZeroKnowledgeLegal_2026')
  );
  const authHash = bufferToBase64(authSignature);

  return {
    masterCryptoKey,
    authHash
  };
};

/**
 * Generates RSA-OAEP 2048-bit Key Pair in browser Web Crypto API.
 */
export const generateRSAKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256'
    },
    true, // Extractable so public key can be sent to server & private key can be encrypted
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKeyString: JSON.stringify(publicKeyJwk),
    privateKeyJwk,
    privateKeyObject: keyPair.privateKey
  };
};

/**
 * Encrypts user's RSA Private Key (JWK) using MasterKey (AES-256-GCM).
 */
export const encryptPrivateKey = async (privateKeyJwk, masterCryptoKey) => {
  const encoder = new TextEncoder();
  const privateKeyBytes = encoder.encode(JSON.stringify(privateKeyJwk));

  // Generate random 12-byte IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterCryptoKey,
    privateKeyBytes
  );

  return {
    encryptedPrivateKey: bufferToBase64(ciphertext),
    privateKeyIV: bufferToBase64(iv)
  };
};

/**
 * Decrypts user's encrypted RSA Private Key using MasterKey (AES-256-GCM).
 */
export const decryptPrivateKey = async (encryptedPrivateKeyBase64, privateKeyIvBase64, masterCryptoKey) => {
  const ciphertextBuffer = base64ToBuffer(encryptedPrivateKeyBase64);
  const ivBuffer = base64ToBuffer(privateKeyIvBase64);

  const decryptedBytes = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    masterCryptoKey,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  const privateKeyJwk = JSON.parse(decoder.decode(decryptedBytes));

  // Import back into CryptoKey object
  const privateCryptoKey = await window.crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt', 'unwrapKey']
  );

  return privateCryptoKey;
};

/**
 * Generates a fresh, random 256-bit Document Encryption Key (DEK) via AES-GCM.
 */
export const generateDocumentDEK = async () => {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // Extractable so it can be wrapped with RSA-OAEP
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypts a raw file ArrayBuffer using AES-256-GCM with a fresh random 12-byte IV.
 */
export const encryptDocumentFile = async (fileArrayBuffer, dekKey) => {
  // Generate a fresh random 12-byte IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dekKey,
    fileArrayBuffer
  );

  return {
    ciphertextBuffer: ciphertext,
    fileIVBase64: bufferToBase64(iv)
  };
};

/**
 * Wraps (encrypts) the 256-bit DEK using an authorized recipient's RSA-OAEP Public Key.
 */
export const wrapDEK = async (dekKey, recipientPublicKeyString) => {
  // 1. Export raw 32-byte DEK
  const rawDEK = await window.crypto.subtle.exportKey('raw', dekKey);

  // 2. Import recipient's RSA-OAEP Public Key
  const publicKeyJwk = typeof recipientPublicKeyString === 'string'
    ? JSON.parse(recipientPublicKeyString)
    : recipientPublicKeyString;

  const recipientCryptoKey = await window.crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  // 3. Encrypt DEK bytes with RSA-OAEP
  const wrappedBuffer = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientCryptoKey,
    rawDEK
  );

  return bufferToBase64(wrappedBuffer);
};

/**
 * Unwraps (decrypts) a wrapped DEK using the user's RSA-OAEP Private Key.
 */
export const unwrapDEK = async (wrappedDEKBase64, userPrivateKeyObject) => {
  const wrappedBytes = base64ToBuffer(wrappedDEKBase64);

  // Decrypt wrapped DEK using user's decrypted RSA Private Key
  const rawDEK = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    userPrivateKeyObject,
    wrappedBytes
  );

  // Import raw 32 bytes back as AES-GCM DEK
  return await window.crypto.subtle.importKey(
    'raw',
    rawDEK,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
};

/**
 * Decrypts document ciphertext ArrayBuffer using DEK + file IV (AES-256-GCM).
 */
export const decryptDocumentFile = async (ciphertextArrayBuffer, fileIvBase64, dekKey) => {
  const ivBuffer = base64ToBuffer(fileIvBase64);

  return await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    dekKey,
    ciphertextArrayBuffer
  );
};

