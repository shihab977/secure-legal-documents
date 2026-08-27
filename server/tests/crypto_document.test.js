const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Case = require('../src/models/Case');
const Document = require('../src/models/Document');
const AuditLog = require('../src/models/AuditLog');
const { minioClient, BUCKET_NAME } = require('../src/config/minio');

describe('Phase 4: Client-Side AES-256-GCM & RSA-OAEP Document Encryption Test Suite', () => {
  let lawyerToken = '';
  let lawyerUser = null;
  let lawyerKeyPair = null;

  let client1Token = '';
  let client1User = null;
  let client1KeyPair = null;

  let client2Token = '';
  let client2User = null;

  let testCase = null;
  let uploadedDocId = '';
  let minioObjectKey = '';

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});

    // Generate RSA-OAEP 2048 key pairs natively in Node crypto for testing
    lawyerKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
    });

    client1KeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
    });

    // Register Lawyer
    const lawyerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Attorney Cryptographer',
      email: 'lawyer.crypto@firm.com',
      role: 'lawyer',
      authHash: 'LawyerAuthHashBase64_DocTest',
      userSalt: 'LawyerSaltBase64',
      publicKey: JSON.stringify(lawyerKeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedLawyerPrivKey',
      privateKeyIV: 'LawyerIV'
    });
    lawyerToken = lawyerRes.body.token;
    lawyerUser = lawyerRes.body.user;

    // Register Client 1 (Assigned)
    const client1Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Alice',
      email: 'alice.client@corp.com',
      role: 'client',
      authHash: 'Client1AuthHashBase64',
      userSalt: 'Client1SaltBase64',
      publicKey: JSON.stringify(client1KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient1PrivKey',
      privateKeyIV: 'Client1IV'
    });
    client1Token = client1Res.body.token;
    client1User = client1Res.body.user;

    // Register Client 2 (Unassigned)
    const client2Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Bob (Unassigned)',
      email: 'bob.unassigned@corp.com',
      role: 'client',
      authHash: 'Client2AuthHashBase64',
      userSalt: 'Client2SaltBase64',
      publicKey: '{"kty":"RSA"}',
      encryptedPrivateKey: 'EncryptedClient2PrivKey',
      privateKeyIV: 'Client2IV'
    });
    client2Token = client2Res.body.token;
    client2User = client2Res.body.user;

    // Lawyer creates legal case
    const caseRes = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Highly Confidential Merger Contract 2026',
        description: 'Zero-knowledge protected legal agreement',
        clientId: client1User._id
      });
    testCase = caseRes.body.case;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  // --- CRYPTOGRAPHIC PRIMITIVE VERIFICATION TESTS ---

  test('1. AES-256-GCM encryption produces ciphertext distinct from original plaintext', () => {
    const plaintext = Buffer.from('%PDF-1.7 Confidential Legal Agreement Content 2026', 'utf-8');
    const dek = crypto.randomBytes(32); // 256-bit DEK
    const iv = crypto.randomBytes(12); // 12-byte IV

    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

    expect(ciphertext.equals(plaintext)).toBe(false);
    expect(ciphertext.includes(Buffer.from('%PDF-1.7'))).toBe(false);
  });

  test('2. AES-256-GCM decryption with correct DEK & IV succeeds', () => {
    const plaintext = Buffer.from('Strictly Confidential Legal Briefing', 'utf-8');
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    expect(decrypted.toString('utf-8')).toEqual('Strictly Confidential Legal Briefing');
  });

  test('3. Decryption with wrong DEK or tampered ciphertext fails authentication', () => {
    const plaintext = Buffer.from('Sensitive Data', 'utf-8');
    const dek1 = crypto.randomBytes(32);
    const dek2 = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', dek1, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Wrong DEK attempt
    const decipherWrongKey = crypto.createDecipheriv('aes-256-gcm', dek2, iv);
    decipherWrongKey.setAuthTag(tag);
    expect(() => {
      Buffer.concat([decipherWrongKey.update(encrypted), decipherWrongKey.final()]);
    }).toThrow();

    // Tampered ciphertext attempt
    const tamperedCiphertext = Buffer.from(encrypted);
    tamperedCiphertext[0] ^= 0xFF; // Flip bits

    const decipherTampered = crypto.createDecipheriv('aes-256-gcm', dek1, iv);
    decipherTampered.setAuthTag(tag);
    expect(() => {
      Buffer.concat([decipherTampered.update(tamperedCiphertext), decipherTampered.final()]);
    }).toThrow();
  });

  test('4. RSA-OAEP wrapping and unwrapping of 256-bit DEK', () => {
    const dek = crypto.randomBytes(32);

    // Wrap DEK with Lawyer's Public Key
    const publicKeyObject = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const wrappedDEK = crypto.publicEncrypt(
      { key: publicKeyObject, oaepHash: 'sha256' },
      dek
    );

    // Unwrap DEK with Lawyer's Private Key
    const privateKeyObject = crypto.createPrivateKey({ key: lawyerKeyPair.privateKey, format: 'jwk' });
    const unwrappedDEK = crypto.privateDecrypt(
      { key: privateKeyObject, oaepHash: 'sha256' },
      wrappedDEK
    );

    expect(unwrappedDEK.equals(dek)).toBe(true);
  });

  // --- API & MINIO STORAGE TESTS ---

  test('5. Lawyer should successfully upload client-side encrypted document ciphertext', async () => {
    const originalPdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Title (Secret Legal Contract) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // Encrypt PDF buffer using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertextBuffer = Buffer.concat([cipher.update(originalPdfBuffer), cipher.final(), cipher.getAuthTag()]);

    // Wrap DEK for Lawyer and Client 1 using their RSA Public Keys
    const lawyerPub = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const client1Pub = crypto.createPublicKey({ key: client1KeyPair.publicKey, format: 'jwk' });

    const wrappedLawyerDEK = crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, dek).toString('base64');
    const wrappedClient1DEK = crypto.publicEncrypt({ key: client1Pub, oaepHash: 'sha256' }, dek).toString('base64');

    const accessList = [
      { userId: lawyerUser._id, wrappedDEK: wrappedLawyerDEK },
      { userId: client1User._id, wrappedDEK: wrappedClient1DEK }
    ];

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .field('caseId', testCase._id)
      .field('originalFilename', 'contract_v1.pdf')
      .field('mimeType', 'application/pdf')
      .field('fileIV', iv.toString('base64'))
      .field('accessList', JSON.stringify(accessList))
      .attach('file', ciphertextBuffer, 'contract_v1.pdf.enc');

    expect(res.statusCode).toEqual(201);
    expect(res.body.document).toHaveProperty('minioObjectKey');
    expect(res.body.document.originalFilename).toEqual('contract_v1.pdf');
    expect(res.body.document.encryptionAlgorithm).toEqual('AES-256-GCM');

    uploadedDocId = res.body.document._id;
    minioObjectKey = res.body.document.minioObjectKey;
  });

  test('6. CRITICAL SECURITY PROOF: Stored MinIO payload is raw ciphertext and CANNOT be read as original PDF', async () => {
    // Fetch directly from MinIO object storage
    const minioStream = await minioClient.getObject(BUCKET_NAME, minioObjectKey);
    const chunks = [];
    for await (const chunk of minioStream) {
      chunks.push(chunk);
    }
    const storedMinioBuffer = Buffer.concat(chunks);

    // Proof 1: Storage payload is non-empty binary
    expect(storedMinioBuffer.length).toBeGreaterThan(0);

    // Proof 2: Storage payload DOES NOT contain PDF header (%PDF-1.7)
    expect(storedMinioBuffer.includes(Buffer.from('%PDF-1.7'))).toBe(false);

    // Proof 3: Storage payload DOES NOT contain plaintext title (Secret Legal Contract)
    expect(storedMinioBuffer.includes(Buffer.from('Secret Legal Contract'))).toBe(false);
  });

  test('7. Server strictly rejects upload if request body contains plaintext DEK or masterKey (Security Guard)', async () => {
    const dummyBuffer = Buffer.from('EncryptedBinary', 'utf-8');

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .field('caseId', testCase._id)
      .field('originalFilename', 'malicious.pdf')
      .field('fileIV', 'DummyIV')
      .field('accessList', '[]')
      .field('plaintextDEK', 'ATTEMPT_TO_SEND_PLAINTEXT_DEK')
      .attach('file', dummyBuffer, 'malicious.enc');

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Security violation');
  });

  test('8. Unauthorized User (Client 2) CANNOT upload documents to unassigned case (HTTP 403)', async () => {
    const dummyBuffer = Buffer.from('EncryptedBinary', 'utf-8');

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${client2Token}`)
      .field('caseId', testCase._id)
      .field('originalFilename', 'hacked.pdf')
      .field('fileIV', 'DummyIV')
      .field('accessList', '[]')
      .attach('file', dummyBuffer, 'hacked.enc');

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('9. Assigned Client 1 can retrieve document metadata & wrapped DEK', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.document._id).toEqual(uploadedDocId);
    expect(res.body).toHaveProperty('wrappedDEK');
  });

  test('10. Unauthorized User (Client 2) CANNOT retrieve document metadata or ciphertext (HTTP 403)', async () => {
    const metaRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(metaRes.statusCode).toEqual(403);

    const streamRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(streamRes.statusCode).toEqual(403);
  });
});
