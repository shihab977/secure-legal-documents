const express = require('express');
const router = express.Router();
const { authenticateJWT, requireRole } = require('../middleware/auth.middleware');
const { getClientsList, getUserPublicKey } = require('../controllers/user.controller');

router.use(authenticateJWT);

router.get('/clients', requireRole('lawyer'), getClientsList);
router.get('/:id/public-key', getUserPublicKey);

module.exports = router;
