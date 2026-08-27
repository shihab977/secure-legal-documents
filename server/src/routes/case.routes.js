const express = require('express');
const router = express.Router();
const { authenticateJWT, requireRole } = require('../middleware/auth.middleware');
const {
  createCase,
  getCases,
  getCaseById,
  updateCase
} = require('../controllers/case.controller');

// Require authentication for all case routes
router.use(authenticateJWT);

router.post('/', requireRole('lawyer'), createCase);
router.get('/', getCases);
router.get('/:id', getCaseById);
router.put('/:id', requireRole('lawyer'), updateCase);

module.exports = router;
