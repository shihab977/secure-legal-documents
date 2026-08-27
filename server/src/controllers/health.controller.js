const mongoose = require('mongoose');
const { minioClient, BUCKET_NAME } = require('../config/minio');

const getHealthStatus = async (req, res) => {
  let dbState = 'Disconnected';
  let mongoConnected = false;
  if (mongoose.connection.readyState === 1) {
    dbState = 'Connected';
    mongoConnected = true;
  }

  let minioState = 'Disconnected';
  let minioConnected = false;
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (bucketExists) {
      minioState = 'Connected';
      minioConnected = true;
    }
  } catch (err) {
    minioState = `Error: ${err.message}`;
  }

  const isHealthy = mongoConnected && minioConnected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'Zero-Knowledge Legal Document API',
    version: '1.0.0',
    components: {
      database: {
        type: 'MongoDB',
        status: dbState
      },
      storage: {
        type: 'MinIO',
        bucket: BUCKET_NAME,
        status: minioState
      }
    }
  });
};

module.exports = { getHealthStatus };
