const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadminpassword',
});

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'secure-legal-documents';

const initMinIO = async () => {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`[MinIO] Bucket '${BUCKET_NAME}' created successfully.`);
    } else {
      console.log(`[MinIO] Connected successfully to bucket '${BUCKET_NAME}'.`);
    }
    return true;
  } catch (error) {
    console.error(`[MinIO Error] Bucket initialization failed: ${error.message}`);
    return false;
  }
};

module.exports = {
  minioClient,
  BUCKET_NAME,
  initMinIO
};
