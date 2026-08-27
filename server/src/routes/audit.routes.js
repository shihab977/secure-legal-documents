const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth.middleware');
const { getAuditLogs, getAccessNotifications } = require('../controllers/audit.controller');

router.use(authenticateJWT);
router.get('/', getAuditLogs);
router.get('/notifications', getAccessNotifications);

module.exports = router;
