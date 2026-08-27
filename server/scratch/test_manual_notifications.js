const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Case = require('../src/models/Case');
const Document = require('../src/models/Document');
const AuditLog = require('../src/models/AuditLog');

async function runManualTest() {
  console.log('--- Starting Manual Verification of Document Access Notifications ---');
  await connectDB();

  // Clean test DB records for manual test run
  await User.deleteMany({ email: { $in: ['manual.lawyer@firm.com', 'manual.client@corp.com'] } });

  // Generate key pairs
  const lawyerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'jwk' }, privateKeyEncoding: { type: 'pkcs8', format: 'jwk' } });
  const clientKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'jwk' }, privateKeyEncoding: { type: 'pkcs8', format: 'jwk' } });

  // 1. Register Test Lawyer
  const lawyerRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Test Lawyer Counsel',
    email: 'manual.lawyer@firm.com',
    role: 'lawyer',
    authHash: 'LawyerManualHash',
    userSalt: 'LawyerManualSalt',
    publicKey: JSON.stringify(lawyerKeys.publicKey),
    encryptedPrivateKey: 'EncryptedLawyerKey',
    privateKeyIV: 'LawyerIV'
  });
  const lawyerToken = lawyerRes.body.token;
  const lawyerUser = lawyerRes.body.user;
  console.log('✓ Registered Test Lawyer:', lawyerUser.name, `(${lawyerUser.email})`);

  // 2. Register Test Client
  const clientRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Test Client Enterprise',
    email: 'manual.client@corp.com',
    role: 'client',
    authHash: 'ClientManualHash',
    userSalt: 'ClientManualSalt',
    publicKey: JSON.stringify(clientKeys.publicKey),
    encryptedPrivateKey: 'EncryptedClientKey',
    privateKeyIV: 'ClientIV'
  });
  const clientToken = clientRes.body.token;
  const clientUser = clientRes.body.user;
  console.log('✓ Registered Test Client:', clientUser.name, `(${clientUser.email})`);

  // 3. Lawyer Creates Legal Case
  const caseRes = await request(app)
    .post('/api/v1/cases')
    .set('Authorization', `Bearer ${lawyerToken}`)
    .send({
      title: 'Manual Verification Case #2026',
      description: 'Testing live notification pipeline',
      clientId: clientUser._id
    });
  const testCase = caseRes.body.case;
  console.log('✓ Created Case:', testCase.caseNumber, `-`, testCase.title);

  // 4. Upload Document
  const docBuffer = Buffer.from('%PDF-1.7\nCONFIDENTIAL MANUAL TEST CONTRACT\n%%EOF');
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(docBuffer), cipher.final(), cipher.getAuthTag()]);

  const lawyerPub = crypto.createPublicKey({ key: lawyerKeys.publicKey, format: 'jwk' });
  const clientPub = crypto.createPublicKey({ key: clientKeys.publicKey, format: 'jwk' });
  const accessList = [
    { userId: lawyerUser._id, wrappedDEK: crypto.publicEncrypt({ key: lawyerPub, oaepHash: 'sha256' }, dek).toString('base64') },
    { userId: clientUser._id, wrappedDEK: crypto.publicEncrypt({ key: clientPub, oaepHash: 'sha256' }, dek).toString('base64') }
  ];

  const uploadRes = await request(app)
    .post('/api/v1/documents/upload')
    .set('Authorization', `Bearer ${lawyerToken}`)
    .field('caseId', testCase._id)
    .field('originalFilename', 'manual_verification_agreement.pdf')
    .field('mimeType', 'application/pdf')
    .field('fileIV', iv.toString('base64'))
    .field('accessList', JSON.stringify(accessList))
    .attach('file', ciphertext, 'manual_verification_agreement.pdf.enc');

  const docId = uploadRes.body.document._id;
  console.log('✓ Uploaded Encrypted Document:', uploadRes.body.document.originalFilename, `(ID: ${docId})`);

  // 5. Test Client VIEWs document
  await request(app)
    .get(`/api/v1/documents/${docId}/ciphertext?action=view`)
    .set('Authorization', `Bearer ${clientToken}`);
  console.log('✓ Test Client performed VIEW action on document.');

  // 6. Test Client DOWNLOADs document
  await request(app)
    .get(`/api/v1/documents/${docId}/ciphertext?action=download`)
    .set('Authorization', `Bearer ${clientToken}`);
  console.log('✓ Test Client performed DOWNLOAD action on document.');

  // 7. Lawyer Fetches Access Notifications
  const notifRes = await request(app)
    .get('/api/v1/audit-logs/notifications')
    .set('Authorization', `Bearer ${lawyerToken}`);

  console.log('\n--- Retrieved Lawyer Notifications ---');
  console.log(JSON.stringify(notifRes.body.notifications, null, 2));

  if (notifRes.body.notifications && notifRes.body.notifications.length === 2) {
    console.log('\n✅ MANUAL TEST SUCCESSFUL: Notifications correctly recorded and retrieved by Lawyer Dashboard endpoint!');
  } else {
    console.error('\n❌ MANUAL TEST FAILED: Unexpected notification count.');
  }

  await mongoose.connection.close();
}

runManualTest().catch(console.error);
