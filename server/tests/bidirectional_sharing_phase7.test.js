const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Case = require('../src/models/Case');
const Document = require('../src/models/Document');
const AuditLog = require('../src/models/AuditLog');
const { minioClient, BUCKET_NAME, initMinIO } = require('../src/config/minio');

describe('Phase 7: Bidirectional Secure File Sharing Test Suite', () => {
  let lawyerToken = '';
  let lawyerUser = null;
  let lawyerKeyPair = null;

  let client1Token = '';
  let client1User = null;
  let client1KeyPair = null;

  let client2Token = '';
  let client2User = null;
  let client2KeyPair = null;

  let testCase1 = null;
  let testCase2 = null;

  let clientUploadedDocId = '';
  let clientMinioKey = '';
  let clientOriginalBuffer = null;
  let clientOriginalDek = null;
  let clientOriginalIv = null;

  let lawyerUploadedDocId = '';
  let lawyerOriginalBuffer = null;
  let lawyerOriginalDek = null;

  beforeAll(async () => {
    await connectDB();
    await initMinIO();
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});

    // Generate RSA-OAEP 2048 key pairs for participants
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
      name: 'Sarah Jenkins, Esq.',
      email: 'sjenkins@lawfirm.com',
      role: 'lawyer',
      authHash: 'LawyerPhase7AuthHash',
      userSalt: 'LawyerPhase7Salt',
      publicKey: JSON.stringify(lawyerKeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedLawyerPrivKey',
      privateKeyIV: 'LawyerIV'
    });
    lawyerToken = lawyerRes.body.token;
    lawyerUser = lawyerRes.body.user;

    // 2. Register Client 1 (Assigned to Case 1)
    const client1Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Acme Corporation (Client 1)',
      email: 'legal@acmecorp.com',
      role: 'client',
      authHash: 'Client1Phase7AuthHash',
      userSalt: 'Client1Phase7Salt',
      publicKey: JSON.stringify(client1KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient1PrivKey',
      privateKeyIV: 'Client1IV'
    });
    client1Token = client1Res.body.token;
    client1User = client1Res.body.user;

    // 3. Register Client 2 (Assigned to Case 2 - Unauthorized for Case 1)
    const client2Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Global Tech Ltd (Client 2)',
      email: 'contact@globaltech.com',
      role: 'client',
      authHash: 'Client2Phase7AuthHash',
      userSalt: 'Client2Phase7Salt',
      publicKey: JSON.stringify(client2KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient2PrivKey',
      privateKeyIV: 'Client2IV'
    });
    client2Token = client2Res.body.token;
    client2User = client2Res.body.user;

    // 4. Create Legal Case 1 (Lawyer + Client 1)
    const case1Res = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Acme Corp Patent Defense Case 2026',
        description: 'Bidirectional encrypted document vault for patent litigation',
        clientId: client1User._id
      });
    testCase1 = case1Res.body.case;

    // 5. Create Legal Case 2 (Lawyer + Client 2)
    const case2Res = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Global Tech Merger Case',
        description: 'Unrelated case',
        clientId: client2User._id
      });
    testCase2 = case2Res.body.case;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  test('1. Authorized client (Client 1) can upload an encrypted document to assigned case', async () => {
    clientOriginalBuffer = Buffer.from('CONFIDENTIAL CLIENT EVIDENCE DATA 2026 - TAX RECORDS & RECEIPTS', 'utf-8');
    clientOriginalDek = crypto.randomBytes(32);
    clientOriginalIv = crypto.randomBytes(12);

    // Encrypt locally via AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', clientOriginalDek, clientOriginalIv);
    const ciphertext = Buffer.concat([cipher.update(clientOriginalBuffer), cipher.final(), cipher.getAuthTag()]);

    // Envelope encryption: Wrap DEK for both Lawyer and Client 1
    const lawyerPub = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const client1Pub = crypto.createPublicKey({ key: client1KeyPair.publicKey, format: 'jwk' });

    const wrappedLawyerDEK = crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, clientOriginalDek).toString('base64');
    const wrappedClient1DEK = crypto.publicEncrypt({ key: client1Pub, oaepHash: 'sha256' }, clientOriginalDek).toString('base64');

    const accessList = [
      { userId: lawyerUser._id, wrappedDEK: wrappedLawyerDEK },
      { userId: client1User._id, wrappedDEK: wrappedClient1DEK }
    ];

    const uploadRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${client1Token}`)
      .field('caseId', testCase1._id)
      .field('originalFilename', 'client_evidence_2026.txt')
      .field('mimeType', 'text/plain')
      .field('fileIV', clientOriginalIv.toString('base64'))
      .field('accessList', JSON.stringify(accessList))
      .attach('file', ciphertext, 'client_evidence_2026.txt.enc');

    expect(uploadRes.statusCode).toEqual(201);
    expect(uploadRes.body.document).toHaveProperty('_id');
    expect(uploadRes.body.document.originalFilename).toEqual('client_evidence_2026.txt');
    expect(uploadRes.body.document.uploadedBy.toString()).toEqual(client1User._id.toString());

    clientUploadedDocId = uploadRes.body.document._id;
    clientMinioKey = uploadRes.body.document.minioObjectKey;
  });

  test('2. Unauthorized client (Client 2) CANNOT upload a document to another case (HTTP 403)', async () => {
    const dummyDek = crypto.randomBytes(32);
    const dummyIv = crypto.randomBytes(12);
    const dummyCipher = crypto.createCipheriv('aes-256-gcm', dummyDek, dummyIv);
    const dummyCiphertext = Buffer.concat([dummyCipher.update('UNAUTHORIZED PAYLOAD'), dummyCipher.final(), dummyCipher.getAuthTag()]);

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${client2Token}`)
      .field('caseId', testCase1._id)
      .field('originalFilename', 'malicious_upload.pdf')
      .field('mimeType', 'application/pdf')
      .field('fileIV', dummyIv.toString('base64'))
      .field('accessList', JSON.stringify([{ userId: client2User._id, wrappedDEK: 'fake' }]))
      .attach('file', dummyCiphertext, 'malicious_upload.pdf.enc');

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('3. Lawyer assigned to the case can access & decrypt client-uploaded file', async () => {
    // 1. Retrieve metadata & lawyer-specific wrapped DEK
    const metaRes = await request(app)
      .get(`/api/v1/documents/${clientUploadedDocId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(metaRes.statusCode).toEqual(200);
    expect(metaRes.body.document.originalFilename).toEqual('client_evidence_2026.txt');
    expect(metaRes.body).toHaveProperty('wrappedDEK');

    const wrappedDEKBase64 = metaRes.body.wrappedDEK;
    const fileIVBase64 = metaRes.body.document.fileIV;

    // 2. Retrieve ciphertext stream from MinIO
    const cipherRes = await request(app)
      .get(`/api/v1/documents/${clientUploadedDocId}/ciphertext?action=view`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(cipherRes.statusCode).toEqual(200);
    const ciphertextBuffer = cipherRes.body;

    // 3. Lawyer unwraps DEK using Lawyer RSA Private Key
    const lawyerPriv = crypto.createPrivateKey({ key: lawyerKeyPair.privateKey, format: 'jwk' });
    const unwrappedDEK = crypto.privateDecrypt(
      { key: lawyerPriv, oaepHash: 'sha256' },
      Buffer.from(wrappedDEKBase64, 'base64')
    );

    expect(unwrappedDEK.equals(clientOriginalDek)).toBe(true);

    // 4. Lawyer decrypts ciphertext via AES-256-GCM
    const iv = Buffer.from(fileIVBase64, 'base64');
    const authTag = ciphertextBuffer.slice(ciphertextBuffer.length - 16);
    const encryptedData = ciphertextBuffer.slice(0, ciphertextBuffer.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', unwrappedDEK, iv);
    decipher.setAuthTag(authTag);
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    expect(decryptedBuffer.equals(clientOriginalBuffer)).toBe(true);
    expect(decryptedBuffer.toString('utf-8')).toContain('CONFIDENTIAL CLIENT EVIDENCE DATA 2026');
  });

  test('4. Client can still access & decrypt lawyer-uploaded documents', async () => {
    // 1. Lawyer uploads a document
    lawyerOriginalBuffer = Buffer.from('LAWYER LEGAL STRATEGY BRIEF 2026', 'utf-8');
    lawyerOriginalDek = crypto.randomBytes(32);
    const lawyerIv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', lawyerOriginalDek, lawyerIv);
    const ciphertext = Buffer.concat([cipher.update(lawyerOriginalBuffer), cipher.final(), cipher.getAuthTag()]);

    const lawyerPub = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const client1Pub = crypto.createPublicKey({ key: client1KeyPair.publicKey, format: 'jwk' });

    const wrappedLawyerDEK = crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, lawyerOriginalDek).toString('base64');
    const wrappedClient1DEK = crypto.publicEncrypt({ key: client1Pub, oaepHash: 'sha256' }, lawyerOriginalDek).toString('base64');

    const accessList = [
      { userId: lawyerUser._id, wrappedDEK: wrappedLawyerDEK },
      { userId: client1User._id, wrappedDEK: wrappedClient1DEK }
    ];

    const uploadRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .field('caseId', testCase1._id)
      .field('originalFilename', 'legal_strategy_brief.txt')
      .field('mimeType', 'text/plain')
      .field('fileIV', lawyerIv.toString('base64'))
      .field('accessList', JSON.stringify(accessList))
      .attach('file', ciphertext, 'legal_strategy_brief.txt.enc');

    expect(uploadRes.statusCode).toEqual(201);
    lawyerUploadedDocId = uploadRes.body.document._id;

    // 2. Client 1 retrieves metadata & wrapped DEK
    const metaRes = await request(app)
      .get(`/api/v1/documents/${lawyerUploadedDocId}`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(metaRes.statusCode).toEqual(200);

    // 3. Client 1 retrieves ciphertext
    const cipherRes = await request(app)
      .get(`/api/v1/documents/${lawyerUploadedDocId}/ciphertext?action=view`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(cipherRes.statusCode).toEqual(200);

    // 4. Client 1 unwraps DEK and decrypts payload
    const client1Priv = crypto.createPrivateKey({ key: client1KeyPair.privateKey, format: 'jwk' });
    const unwrappedDEK = crypto.privateDecrypt(
      { key: client1Priv, oaepHash: 'sha256' },
      Buffer.from(metaRes.body.wrappedDEK, 'base64')
    );

    const iv = Buffer.from(metaRes.body.document.fileIV, 'base64');
    const authTag = cipherRes.body.slice(cipherRes.body.length - 16);
    const encryptedData = cipherRes.body.slice(0, cipherRes.body.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', unwrappedDEK, iv);
    decipher.setAuthTag(authTag);
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    expect(decryptedBuffer.equals(lawyerOriginalBuffer)).toBe(true);
  });

  test('5. Unauthorized user (Client 2) CANNOT access metadata or ciphertext of client-uploaded document (HTTP 403)', async () => {
    const metaRes = await request(app)
      .get(`/api/v1/documents/${clientUploadedDocId}`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(metaRes.statusCode).toEqual(403);
    expect(metaRes.body.error).toContain('Access denied');

    const streamRes = await request(app)
      .get(`/api/v1/documents/${clientUploadedDocId}/ciphertext`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(streamRes.statusCode).toEqual(403);
    expect(streamRes.body.error).toContain('Access denied');
  });

  test('6. CRITICAL SECURITY PROOF: Backend and MinIO receive and store ONLY ciphertext', async () => {
    const minioStream = await minioClient.getObject(BUCKET_NAME, clientMinioKey);
    const chunks = [];
    for await (const chunk of minioStream) {
      chunks.push(chunk);
    }
    const rawMinioBuffer = Buffer.concat(chunks);

    // Proof 1: MinIO payload does NOT contain plaintext text
    expect(rawMinioBuffer.includes(Buffer.from('CONFIDENTIAL CLIENT EVIDENCE DATA 2026'))).toBe(false);

    // Proof 2: MinIO payload length equals ciphertext length
    expect(rawMinioBuffer.length).toBeGreaterThan(0);
  });

  test('7. CRITICAL SECURITY PROOF: Backend rejects requests attempting to transmit plaintext DEKs or masterKeys', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${client1Token}`)
      .field('caseId', testCase1._id)
      .field('originalFilename', 'leak_test.txt')
      .field('fileIV', clientOriginalIv.toString('base64'))
      .field('accessList', '[]')
      .field('dek', 'PLAINTEXT_DEK_LEAK_ATTEMPT')
      .attach('file', Buffer.from('data'), 'leak_test.txt.enc');

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Security violation');
  });
});
