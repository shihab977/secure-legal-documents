const http = require('http');

function post(path, data) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method: 'GET'
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.end();
  });
}

async function verifyExactUser() {
  const email = 'lawyer@test.com';
  const saltRes = await get(`/auth/salt?email=${encodeURIComponent(email)}`);
  console.log('1. Salt fetched for lawyer@test.com:', saltRes.body.userSalt);

  const regRes = await post('/auth/register', {
    name: 'Test Lawyer',
    email: email,
    role: 'lawyer',
    authHash: 'TestLawyerAuthHash_Argon2id_Client',
    userSalt: saltRes.body.userSalt,
    publicKey: '{"kty":"RSA","n":"test_pub_key","e":"AQAB"}',
    encryptedPrivateKey: 'EncryptedPrivateKey_Lawyer',
    privateKeyIV: 'IV_12Bytes_Base64'
  });

  console.log('2. Registration Result:', regRes.status, regRes.body.message || regRes.body.error);

  const loginRes = await post('/auth/login', {
    email: email,
    authHash: 'TestLawyerAuthHash_Argon2id_Client'
  });

  console.log('3. Login Result:', loginRes.status, loginRes.body.message || loginRes.body.error);
  console.log('4. Logged in User Role:', loginRes.body.user?.role);
  console.log('5. JWT Token Issued:', Boolean(loginRes.body.token));
}

verifyExactUser().catch(console.error);
