const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth.middleware');
const { getAuditLogs } = require('../controllers/audit.controller');

router.use(authenticateJWT);
router.get('/', getAuditLogs);

module.exports = router;
