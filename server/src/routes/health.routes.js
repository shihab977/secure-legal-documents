const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../controllers/health.controller');

router.get('/health', getHealthStatus);

module.exports = router;
