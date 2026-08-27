const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

describe('Phase 2: Zero-Knowledge Auth & RBAC Security Test Suite', () => {
  beforeAll(async () => {
    await connectDB();
    await User.deleteMany({});
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  const mockUserLawyer = {
    name: 'Attorney Sarah Jenkins',
    email: 'sarah.jenkins@lawfirm.com',
    role: 'lawyer',
    authHash: 'MockClientAuthHash_Lawyer_1234567890_Base64',
    userSalt: 'MockUserSalt_Lawyer_Base64_16Bytes',
    publicKey: '{"kty":"RSA","n":"mock_rsa_public_key_n","e":"AQAB"}',
    encryptedPrivateKey: 'MockEncryptedPrivateKey_Base64_AESGCM',
    privateKeyIV: 'MockIV_12Bytes_Base64'
  };

  const mockUserClient = {
    name: 'Client John Doe',
    email: 'john.doe@company.com',
    role: 'client',
    authHash: 'MockClientAuthHash_Client_1234567890_Base64',
    userSalt: 'MockUserSalt_Client_Base64_16Bytes',
    publicKey: '{"kty":"RSA","n":"mock_rsa_client_public_key_n","e":"AQAB"}',
    encryptedPrivateKey: 'MockEncryptedPrivateKey_Client_Base64_AESGCM',
    privateKeyIV: 'MockIV_12Bytes_Client_Base64'
  };

  let lawyerToken = '';
  let clientToken = '';

  test('1. Should successfully register a new Lawyer account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(mockUserLawyer);

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', mockUserLawyer.email);
    expect(res.body.user.role).toEqual('lawyer');
    expect(res.body.user).not.toHaveProperty('authHash'); // Must not expose authHash

    lawyerToken = res.data ? res.data.token : res.body.token;
  });

  test('2. Should reject duplicate registration with same email (HTTP 409)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(mockUserLawyer);

    expect(res.statusCode).toEqual(409);
    expect(res.body).toHaveProperty('error');
  });

  test('3. Should register Client account successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(mockUserClient);

    expect(res.statusCode).toEqual(201);
    clientToken = res.body.token;
  });

  test('4. Should reject registration if client attempts to send masterKey or privateKey (Security Guard)', async () => {
    const maliciousPayload = {
      ...mockUserLawyer,
      email: 'hacker@malicious.com',
      masterKey: 'ATTEMPT_TO_SEND_MASTER_KEY',
      privateKey: 'ATTEMPT_TO_SEND_PLAINTEXT_PRIVATE_KEY'
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(maliciousPayload);

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Security violation');
  });

  test('5. Should successfully login Lawyer using AuthHash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: mockUserLawyer.email,
        authHash: mockUserLawyer.authHash
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toEqual(mockUserLawyer.email);
  });

  test('6. Should reject login with incorrect AuthHash (HTTP 401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: mockUserLawyer.email,
        authHash: 'WRONG_AUTH_HASH_PASSWORD'
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error');
  });

  test('7. Should reject access to protected endpoint with missing JWT (HTTP 401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.statusCode).toEqual(401);
  });

  test('8. Should reject access to protected endpoint with invalid JWT (HTTP 401)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid_corrupted_jwt_token_xyz');

    expect(res.statusCode).toEqual(401);
  });

  test('9. Should allow Lawyer to access lawyer-only endpoint (/api/v1/users/clients)', async () => {
    const res = await request(app)
      .get('/api/v1/users/clients')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
    expect(res.body.clients.length).toBeGreaterThan(0);
  });

  test('10. Should deny Client from accessing lawyer-only endpoint (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/v1/users/clients')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Access forbidden');
  });

  test('11. Should prevent role escalation attempts via profile update API (HTTP 403)', async () => {
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ role: 'lawyer' });

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain('Role escalation forbidden');
  });
});
