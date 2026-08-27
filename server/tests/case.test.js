const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Case = require('../src/models/Case');
const AuditLog = require('../src/models/AuditLog');

describe('Phase 3: Case Management & Server-Side ACL Test Suite', () => {
  let lawyerToken = '';
  let lawyerUser = null;

  let client1Token = '';
  let client1User = null;

  let client2Token = '';
  let client2User = null;

  let testCaseId = '';

  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
    await Case.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Lawyer
    const lawyerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Attorney Alex Vance',
      email: 'alex.vance@firm.com',
      role: 'lawyer',
      authHash: 'LawyerAuthHashBase64_CaseTest',
      userSalt: 'LawyerSaltBase64',
      publicKey: '{"kty":"RSA","n":"lawyer_key"}',
      encryptedPrivateKey: 'EncryptedLawyerPrivKey',
      privateKeyIV: 'LawyerIV'
    });
    lawyerToken = lawyerRes.body.token;
    lawyerUser = lawyerRes.body.user;

    // Register Client 1 (Assigned Client)
    const client1Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Alice Smith',
      email: 'alice@company.com',
      role: 'client',
      authHash: 'Client1AuthHashBase64',
      userSalt: 'Client1SaltBase64',
      publicKey: '{"kty":"RSA","n":"client1_key"}',
      encryptedPrivateKey: 'EncryptedClient1PrivKey',
      privateKeyIV: 'Client1IV'
    });
    client1Token = client1Res.body.token;
    client1User = client1Res.body.user;

    // Register Client 2 (Unassigned Client)
    const client2Res = await request(app).post('/api/v1/auth/register').send({
      name: 'Client Bob Jones',
      email: 'bob@othercorp.com',
      role: 'client',
      authHash: 'Client2AuthHashBase64',
      userSalt: 'Client2SaltBase64',
      publicKey: '{"kty":"RSA","n":"client2_key"}',
      encryptedPrivateKey: 'EncryptedClient2PrivKey',
      privateKeyIV: 'Client2IV'
    });
    client2Token = client2Res.body.token;
    client2User = client2Res.body.user;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Case.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  test('1. Lawyer should successfully create a new legal case', async () => {
    const res = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        title: 'Patent Infringement Case 2026',
        description: 'Litigation against rogue clone vendor',
        clientId: client1User._id
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.case).toHaveProperty('caseNumber');
    expect(res.body.case.title).toEqual('Patent Infringement Case 2026');
    expect(res.body.case.lawyerId._id.toString()).toEqual(lawyerUser._id);
    expect(res.body.case.clientId._id.toString()).toEqual(client1User._id);

    testCaseId = res.body.case._id;
  });

  test('2. Client should NOT be allowed to create a legal case (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${client1Token}`)
      .send({
        title: 'Unauthorized Client Case',
        clientId: client2User._id
      });

    expect(res.statusCode).toEqual(403);
  });

  test('3. Lawyer should see their created case in case listing', async () => {
    const res = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.cases.length).toEqual(1);
    expect(res.body.cases[0]._id).toEqual(testCaseId);
  });

  test('4. Assigned Client (Client 1) should see the case in their assigned case listing', async () => {
    const res = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.cases.length).toEqual(1);
    expect(res.body.cases[0]._id).toEqual(testCaseId);
  });

  test('5. Unassigned Client (Client 2) should NOT see the case in their listing', async () => {
    const res = await request(app)
      .get('/api/v1/cases')
      .set('Authorization', `Bearer ${client2Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.cases.length).toEqual(0);
  });

  test('6. Assigned Client 1 can view case details by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Authorization', `Bearer ${client1Token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.case.title).toEqual('Patent Infringement Case 2026');
  });

  test('7. Unassigned Client 2 should be denied when attempting to access case details by ID (HTTP 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/cases/${testCaseId}`)
      .set('Authorization', `Bearer ${client2Token}`);

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('8. Client should NOT be allowed to update case details (HTTP 403)', async () => {
    const res = await request(app)
      .put(`/api/v1/cases/${testCaseId}`)
      .set('Authorization', `Bearer ${client1Token}`)
      .send({ title: 'Hacked Case Title' });

    expect(res.statusCode).toEqual(403);
  });

  test('9. Lawyer can update case status and description', async () => {
    const res = await request(app)
      .put(`/api/v1/cases/${testCaseId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ status: 'closed', description: 'Settled out of court' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.case.status).toEqual('closed');
    expect(res.body.case.description).toEqual('Settled out of court');
  });

  test('10. Should have recorded audit logs for case creation and unauthorized access attempt', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.auditLogs.length).toBeGreaterThan(0);

    const actions = res.body.auditLogs.map(l => l.action);
    expect(actions).toContain('CASE_CREATED');
  });
});
