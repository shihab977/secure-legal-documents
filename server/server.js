require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initMinIO } = require('./src/config/minio');
const { seedDevData } = require('./src/utils/seedDevData');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  console.log('--- Starting Zero-Knowledge Backend API ---');
  
  // 1. Connect MongoDB
  await connectDB();

  // 2. Seed missing development test accounts (lawyer@test.com & client@test.com)
  await seedDevData();

  // 3. Initialize MinIO Bucket
  await initMinIO();


  // 3. Start Express HTTP Listener
  app.listen(PORT, () => {
    console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    console.log(`[Server] Health Endpoint: http://localhost:${PORT}/api/v1/health`);
  });
};

startServer().catch((err) => {
  console.error('[Server Startup Failure]', err);
});
