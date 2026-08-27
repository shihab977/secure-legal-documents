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

describe('Phase 5: Document Download, RSA-OAEP Unwrapping, AES-256-GCM Decryption, & In-Browser Viewing Test Suite', () => {
  let lawyerToken = '';
  let lawyerUser = null;
  let lawyerKeyPair = null;

  let client1Token = '';
  let client1User = null;
  let client1KeyPair = null;

  let client2Token = '';
  let client2User = null;
  let client2KeyPair = null;

  let testCase = null;
  let uploadedDocId = '';
  let minioObjectKey = '';

  let originalPdfBuffer = null;
  let originalDek = null;
  let originalIv = null;

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});

    // Generate RSA-OAEP 2048 key pairs
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

    client2KeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
    });

    // 1. Register Lawyer
    const lawyerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Attorney Counsel',
      email: 'counsel@firm.com',
      role: 'lawyer',
      authHash: 'LawyerPhase5AuthHash',
      userSalt: 'LawyerPhase5Salt',
      publicKey: JSON.stringify(lawyerKeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedLawyerPrivKey',
      privateKeyIV: 'LawyerIV'
    });
    lawyerToken = lawyerRes.body.token;
    lawyerUser = lawyerRes.body.user;

    // 2. Register Client 1 (Assigned)
    const client1Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Assigned',
      email: 'assigned.client@corp.com',
      role: 'client',
      authHash: 'Client1Phase5AuthHash',
      userSalt: 'Client1Phase5Salt',
      publicKey: JSON.stringify(client1KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient1PrivKey',
      privateKeyIV: 'Client1IV'
    });
    client1Token = client1Res.body.token;
    client1User = client1Res.body.user;

    // 3. Register Client 2 (Unauthorized / Unassigned)
    const client2Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Unauthorized',
      email: 'unauth.client@corp.com',
      role: 'client',
      authHash: 'Client2Phase5AuthHash',
      userSalt: 'Client2Phase5Salt',
      publicKey: JSON.stringify(client2KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient2PrivKey',
      privateKeyIV: 'Client2IV'
    });
    client2Token = client2Res.body.token;
    client2User = client2Res.body.user;

    // 4. Create Legal Case
    const caseRes = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Phase 5 Zero-Knowledge Legal Discovery Case',
        description: 'Testing end-to-end encrypted document retrieval',
        clientId: client1User._id
      });
    testCase = caseRes.body.case;

    // 5. Encrypt and Upload a Legal PDF Document
    originalPdfBuffer = Buffer.from('%PDF-1.7\n%CONFIDENTIAL LEGAL CONTRACT CONTENT 2026\n%%EOF', 'utf-8');
    originalDek = crypto.randomBytes(32);
    originalIv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', originalDek, originalIv);
    const ciphertext = Buffer.concat([cipher.update(originalPdfBuffer), cipher.final(), cipher.getAuthTag()]);

    // Wrap DEK for Lawyer and Client 1
    const lawyerPub = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const client1Pub = crypto.createPublicKey({ key: client1KeyPair.publicKey, format: 'jwk' });

    const wrappedLawyerDEK = crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, originalDek).toString('base64');
    const wrappedClient1DEK = crypto.publicEncrypt({ key: client1Pub, oaepHash: 'sha256' }, originalDek).toString('base64');

    const accessList = [
      { userId: lawyerUser._id, wrappedDEK: wrappedLawyerDEK },
      { userId: client1User._id, wrappedDEK: wrappedClient1DEK }
    ];

    const uploadRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .field('caseId', testCase._id)
      .field('originalFilename', 'legal_contract.pdf')
      .field('mimeType', 'application/pdf')
      .field('fileIV', originalIv.toString('base64'))
      .field('accessList', JSON.stringify(accessList))
      .attach('file', ciphertext, 'legal_contract.pdf.enc');

    uploadedDocId = uploadRes.body.document._id;
    minioObjectKey = uploadRes.body.document.minioObjectKey;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  test('1. Authorized assigned client can retrieve document metadata & their specific wrapped DEK', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.document._id).toEqual(uploadedDocId);
    expect(res.body.document.originalFilename).toEqual('legal_contract.pdf');
    expect(res.body.document.mimeType).toEqual('application/pdf');
    expect(res.body).toHaveProperty('wrappedDEK');
  });

  test('2. Unauthorized user (Client 2) CANNOT retrieve document metadata (HTTP 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('3. Authorized assigned client can download encrypted ciphertext payload stream', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toEqual('application/octet-stream');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('4. Unauthorized user (Client 2) CANNOT download ciphertext payload stream (HTTP 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('5. Correct RSA-OAEP private key unwraps the DEK and decrypts ciphertext byte-for-byte matching original PDF', async () => {
    // 1. Fetch metadata & wrapped DEK as Client 1
    const metaRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${client1Token}`);
    const wrappedDEKBase64 = metaRes.body.wrappedDEK;
    const fileIVBase64 = metaRes.body.document.fileIV;

    // 2. Fetch ciphertext payload as Client 1
    const cipherRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${client1Token}`);
    const ciphertextBuffer = cipherRes.body;

    // 3. Unwrap DEK using Client 1's RSA Private Key
    const client1Priv = crypto.createPrivateKey({ key: client1KeyPair.privateKey, format: 'jwk' });
    const unwrappedDEK = crypto.privateDecrypt(
      { key: client1Priv, oaepHash: 'sha256' },
      Buffer.from(wrappedDEKBase64, 'base64')
    );

    expect(unwrappedDEK.equals(originalDek)).toBe(true);

    // 4. Decrypt AES-256-GCM ciphertext payload
    const iv = Buffer.from(fileIVBase64, 'base64');
    const authTag = ciphertextBuffer.slice(ciphertextBuffer.length - 16);
    const encryptedData = ciphertextBuffer.slice(0, ciphertextBuffer.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', unwrappedDEK, iv);
    decipher.setAuthTag(authTag);
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    // 5. Verify byte-for-byte exact match with original PDF
    expect(decryptedBuffer.equals(originalPdfBuffer)).toBe(true);
    expect(decryptedBuffer.toString('utf-8')).toContain('%PDF-1.7');
    expect(decryptedBuffer.toString('utf-8')).toContain('CONFIDENTIAL LEGAL CONTRACT CONTENT 2026');
  });

  test('6. Wrong RSA-OAEP private key (Client 2) fails to unwrap DEK', async () => {
    const metaRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);
    const wrappedDEKBase64 = metaRes.body.wrappedDEK;

    const client2Priv = crypto.createPrivateKey({ key: client2KeyPair.privateKey, format: 'jwk' });
    expect(() => {
      crypto.privateDecrypt(
        { key: client2Priv, oaepHash: 'sha256' },
        Buffer.from(wrappedDEKBase64, 'base64')
      );
    }).toThrow();
  });

  test('7. Wrong AES DEK or modified IV causes decryption failure', async () => {
    const cipherRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${lawyerToken}`);
    const ciphertextBuffer = cipherRes.body;

    const wrongDek = crypto.randomBytes(32);
    const iv = originalIv;
    const authTag = ciphertextBuffer.slice(ciphertextBuffer.length - 16);
    const encryptedData = ciphertextBuffer.slice(0, ciphertextBuffer.length - 16);

    const decipherWrongKey = crypto.createDecipheriv('aes-256-gcm', wrongDek, iv);
    decipherWrongKey.setAuthTag(authTag);
    expect(() => {
      Buffer.concat([decipherWrongKey.update(encryptedData), decipherWrongKey.final()]);
    }).toThrow();

    // Modified IV test
    const wrongIv = crypto.randomBytes(12);
    const decipherWrongIv = crypto.createDecipheriv('aes-256-gcm', originalDek, wrongIv);
    decipherWrongIv.setAuthTag(authTag);
    expect(() => {
      Buffer.concat([decipherWrongIv.update(encryptedData), decipherWrongIv.final()]);
    }).toThrow();
  });

  test('8. Tampered ciphertext payload fails AES-256-GCM authentication check', async () => {
    const cipherRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${lawyerToken}`);
    const ciphertextBuffer = Buffer.from(cipherRes.body);

    // Tamper single byte in encrypted payload
    ciphertextBuffer[2] ^= 0xFF;

    const authTag = ciphertextBuffer.slice(ciphertextBuffer.length - 16);
    const encryptedData = ciphertextBuffer.slice(0, ciphertextBuffer.length - 16);

    const decipherTampered = crypto.createDecipheriv('aes-256-gcm', originalDek, originalIv);
    decipherTampered.setAuthTag(authTag);
    expect(() => {
      Buffer.concat([decipherTampered.update(encryptedData), decipherTampered.final()]);
    }).toThrow();
  });

  test('9. CRITICAL SECURITY PROOF: Raw MinIO storage payload is ciphertext ONLY and cannot be opened as original PDF', async () => {
    const minioStream = await minioClient.getObject(BUCKET_NAME, minioObjectKey);
    const chunks = [];
    for await (const chunk of minioStream) {
      chunks.push(chunk);
    }
    const rawMinioBuffer = Buffer.concat(chunks);

    // Proof 1: MinIO payload DOES NOT contain PDF header (%PDF-1.7)
    expect(rawMinioBuffer.includes(Buffer.from('%PDF-1.7'))).toBe(false);

    // Proof 2: MinIO payload DOES NOT contain plaintext contract text
    expect(rawMinioBuffer.includes(Buffer.from('CONFIDENTIAL LEGAL CONTRACT CONTENT 2026'))).toBe(false);
  });
});
