const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Case = require('../src/models/Case');
const Document = require('../src/models/Document');
const AuditLog = require('../src/models/AuditLog');

describe('Document Access Notifications Test Suite', () => {
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

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});

    // Generate RSA keypairs for participants
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
      name: 'Sarah Jenkins',
      email: 's.jenkins@legalpartners.com',
      role: 'lawyer',
      authHash: 'LawyerNotifHash123',
      userSalt: 'LawyerNotifSalt123',
      publicKey: JSON.stringify(lawyerKeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedLawyerPrivKeyNotif',
      privateKeyIV: 'LawyerIVNotif'
    });
    lawyerToken = lawyerRes.body.token;
    lawyerUser = lawyerRes.body.user;

    // 2. Register Client 1 (Assigned to case)
    const client1Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Alice Smith',
      email: 'alice.smith@acme.org',
      role: 'client',
      authHash: 'Client1NotifHash123',
      userSalt: 'Client1NotifSalt123',
      publicKey: JSON.stringify(client1KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient1PrivKeyNotif',
      privateKeyIV: 'Client1IVNotif'
    });
    client1Token = client1Res.body.token;
    client1User = client1Res.body.user;

    // 3. Register Client 2 (Unauthorized / Unassigned)
    const client2Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Mallory Intruder',
      email: 'mallory@external.org',
      role: 'client',
      authHash: 'Client2NotifHash123',
      userSalt: 'Client2NotifSalt123',
      publicKey: JSON.stringify(client2KeyPair.publicKey),
      encryptedPrivateKey: 'EncryptedClient2PrivKeyNotif',
      privateKeyIV: 'Client2IVNotif'
    });
    client2Token = client2Res.body.token;
    client2User = client2Res.body.user;

    // 4. Create Legal Case
    const caseRes = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Acme Corporate Restructuring Case',
        description: 'Case for testing document access notifications',
        clientId: client1User._id
      });
    testCase = caseRes.body.case;

    // 5. Upload Encrypted Document
    const originalPdfBuffer = Buffer.from('%PDF-1.7\nTEST NOTIFICATION DOCUMENT\n%%EOF', 'utf-8');
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(originalPdfBuffer), cipher.final(), cipher.getAuthTag()]);

    const lawyerPub = crypto.createPublicKey({ key: lawyerKeyPair.publicKey, format: 'jwk' });
    const client1Pub = crypto.createPublicKey({ key: client1KeyPair.publicKey, format: 'jwk' });

    const wrappedLawyerDEK = crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, dek).toString('base64');
    const wrappedClient1DEK = crypto.publicEncrypt({ key: client1Pub, oaepHash: 'sha256' }, dek).toString('base64');

    const accessList = [
      { userId: lawyerUser._id, wrappedDEK: wrappedLawyerDEK },
      { userId: client1User._id, wrappedDEK: wrappedClient1DEK }
    ];

    const uploadRes = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .field('caseId', testCase._id)
      .field('originalFilename', 'financial_audit_2026.pdf')
      .field('mimeType', 'application/pdf')
      .field('fileIV', iv.toString('base64'))
      .field('accessList', JSON.stringify(accessList))
      .attach('file', ciphertext, 'financial_audit_2026.pdf.enc');

    uploadedDocId = uploadRes.body.document._id;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Case.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  test('1. Authorized client VIEWING document creates a VIEWED notification for assigned lawyer', async () => {
    // Client 1 views document
    const viewRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=view`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(viewRes.statusCode).toEqual(200);

    // Lawyer checks access notifications
    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(notifRes.statusCode).toEqual(200);
    expect(notifRes.body).toHaveProperty('notifications');
    expect(notifRes.body.notifications.length).toBeGreaterThanOrEqual(1);

    const notification = notifRes.body.notifications.find(n => n.action === 'VIEWED');
    expect(notification).toBeDefined();
    expect(notification.clientName).toEqual('Alice Smith');
    expect(notification.clientEmail).toEqual('alice.smith@acme.org');
    expect(notification.documentFilename).toEqual('financial_audit_2026.pdf');
    expect(notification.action).toEqual('VIEWED');
    expect(notification).toHaveProperty('timestamp');
  });

  test('2. Authorized client DOWNLOADING document creates a DOWNLOADED notification for assigned lawyer', async () => {
    // Client 1 downloads document
    const downloadRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=download`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(downloadRes.statusCode).toEqual(200);

    // Lawyer checks access notifications
    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(notifRes.statusCode).toEqual(200);
    const notification = notifRes.body.notifications.find(n => n.action === 'DOWNLOADED');
    expect(notification).toBeDefined();
    expect(notification.clientName).toEqual('Alice Smith');
    expect(notification.clientEmail).toEqual('alice.smith@acme.org');
    expect(notification.documentFilename).toEqual('financial_audit_2026.pdf');
    expect(notification.action).toEqual('DOWNLOADED');
  });

  test('3. Unauthorized client (Client 2) receives HTTP 403 and does NOT generate a success notification for lawyer', async () => {
    // Count notifications before unauthorized attempt
    const notifBefore = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${lawyerToken}`);

    const countBefore = notifBefore.body.notifications.length;

    // Client 2 attempts to download document
    const unauthRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=download`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(unauthRes.statusCode).toEqual(403);

    // Check notifications for lawyer
    const notifAfter = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(notifAfter.body.notifications.length).toEqual(countBefore);
  });

  test('4. Client identity is strictly derived from JWT session and cannot be spoofed by parameters', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=view&clientName=FakeUser&clientEmail=fake@hacker.com`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);

    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${lawyerToken}`);

    const lastNotif = notifRes.body.notifications[0];
    expect(lastNotif.clientName).toEqual('Alice Smith');
    expect(lastNotif.clientEmail).toEqual('alice.smith@acme.org');
    expect(lastNotif.clientName).not.toEqual('FakeUser');
    expect(lastNotif.clientEmail).not.toEqual('fake@hacker.com');
  });

  test('5. Lawyer VIEWING document creates a VIEWED notification for assigned client (Client 1)', async () => {
    // Lawyer views document
    const viewRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=view`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(viewRes.statusCode).toEqual(200);

    // Client 1 checks access notifications
    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${client1Token}`);

    expect(notifRes.statusCode).toEqual(200);
    expect(notifRes.body).toHaveProperty('notifications');

    const notification = notifRes.body.notifications.find(n => n.action === 'VIEWED');
    expect(notification).toBeDefined();
    expect(notification.lawyerName).toEqual('Sarah Jenkins');
    expect(notification.lawyerEmail).toEqual('s.jenkins@legalpartners.com');
    expect(notification.documentFilename).toEqual('financial_audit_2026.pdf');
    expect(notification.action).toEqual('VIEWED');
    expect(notification).toHaveProperty('timestamp');
  });

  test('6. Lawyer DOWNLOADING document creates a DOWNLOADED notification for assigned client (Client 1)', async () => {
    // Lawyer downloads document
    const downloadRes = await request(app)
      .get(`/api/v1/documents/${uploadedDocId}/ciphertext?action=download`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(downloadRes.statusCode).toEqual(200);

    // Client 1 checks access notifications
    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${client1Token}`);

    expect(notifRes.statusCode).toEqual(200);
    const notification = notifRes.body.notifications.find(n => n.action === 'DOWNLOADED');
    expect(notification).toBeDefined();
    expect(notification.lawyerName).toEqual('Sarah Jenkins');
    expect(notification.lawyerEmail).toEqual('s.jenkins@legalpartners.com');
    expect(notification.documentFilename).toEqual('financial_audit_2026.pdf');
    expect(notification.action).toEqual('DOWNLOADED');
  });

  test('7. Unauthorized client (Client 2) CANNOT see notifications belonging to Client 1 or Client 1\'s case', async () => {
    const notifRes = await request(app)
      .get('/api/v1/audit-logs/notifications')
      .set('Authorization', `Bearer ${client2Token}`);

    expect(notifRes.statusCode).toEqual(200);
    expect(notifRes.body.notifications).toEqual([]);
  });
});
