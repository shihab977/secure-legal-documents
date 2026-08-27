const http = require('http');
const crypto = require('crypto');

function postJSON(path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJSON(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1' + path,
      method: 'GET',
      headers: { ...headers }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testRegistrationAndLogin() {
  console.log('--- Testing Zero-Knowledge Registration & Login Pipeline ---');

  const email = 'lawyer' + Date.now() + '@test.com';
  const saltRes = await getJSON(`/auth/salt?email=${encodeURIComponent(email)}`);
  console.log('[DEBUG saltRes]', saltRes);
  const userSalt = saltRes.body.userSalt;
  console.log('[1] Salt obtained:', userSalt.substring(0, 15) + '...');

  const authHash = crypto.createHash('sha256').update('TestPassword123!_AuthHash').digest('base64');
  const publicKey = JSON.stringify({ kty: 'RSA', n: 'test_lawyer_rsa_pub', e: 'AQAB' });
  const encryptedPrivateKey = crypto.randomBytes(64).toString('base64');
  const privateKeyIV = crypto.randomBytes(12).toString('base64');

  console.log('[2] Submitting registration payload for Test Lawyer...');
  const regRes = await postJSON('/auth/register', {
    name: 'Test Lawyer',
    email: email,
    role: 'lawyer',
    authHash,
    userSalt,
    publicKey,
    encryptedPrivateKey,
    privateKeyIV
  });

  if (regRes.status !== 201) {
    console.error('Registration failed with status:', regRes.status, regRes.body);
    process.exit(1);
  }

  console.log('[3] Registration SUCCESS! HTTP Status:', regRes.status);
  console.log('    User ID:', regRes.body.user._id);
  console.log('    Role:', regRes.body.user.role);
  console.log('    JWT Token Issued:', regRes.body.token.substring(0, 20) + '...');

  console.log('[4] Submitting login payload...');
  const loginRes = await postJSON('/auth/login', {
    email: email,
    authHash: authHash
  });

  console.log('[5] Login SUCCESS! HTTP Status:', loginRes.status);
  console.log('    User Name:', loginRes.body.user.name);
  console.log('    Encrypted Private Key Returned:', loginRes.body.user.encryptedPrivateKey.substring(0, 15) + '...');

  const meRes = await getJSON('/auth/me', {
    Authorization: `Bearer ${loginRes.body.token}`
  });
  console.log('[6] JWT Protected Endpoint SUCCESS! Email:', meRes.body.user.email);

  console.log('--- ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! ---');
}

testRegistrationAndLogin().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
