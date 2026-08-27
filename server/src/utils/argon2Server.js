const argon2 = require('argon2');

/**
 * Hashes the client's AuthHash using Argon2id on the server.
 * Ensures that even if the database is leaked, the AuthHash cannot be recovered.
 */
const hashAuthHash = async (clientAuthHash) => {
  return await argon2.hash(clientAuthHash, {
    type: argon2.argon2id,
    memoryCost: 2 ** 14, // 16MB memory cost
    timeCost: 2,
    parallelism: 1
  });
};

/**
 * Verifies a client's AuthHash against the stored server Argon2id hash.
 */
const verifyAuthHash = async (storedHash, clientAuthHash) => {
  try {
    return await argon2.verify(storedHash, clientAuthHash);
  } catch (error) {
    return false;
  }
};

module.exports = {
  hashAuthHash,
  verifyAuthHash
};
