const mongoose = require('mongoose');

const connectDB = async (maxRetries = 5, retryDelayMs = 1500) => {
  const isTest = process.env.NODE_ENV === 'test';
  const mongoUri = isTest
    ? (process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/secure_legal_test_db')
    : (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/secure_legal_db');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[MongoDB] Connecting to ${isTest ? 'TEST' : 'PERSISTENT'} database (Attempt ${attempt}/${maxRetries}): ${mongoUri}`);
      const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[MongoDB] Connected successfully to ${isTest ? 'TEST' : 'PERSISTENT'} database: ${conn.connection.host}/${conn.connection.name}`);
      return true;
    } catch (err) {
      console.warn(`[MongoDB Warning] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        console.log(`[MongoDB] Retrying in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  console.error(`[MongoDB Error] Unable to connect to ${isTest ? 'TEST' : 'PERSISTENT'} database after maximum retries.`);
  return false;
};

module.exports = connectDB;
