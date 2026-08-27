const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth.middleware');
const {
  uploadEncryptedDocument,
  getCaseDocuments,
  getDocumentMetadata,
  getDocumentCiphertext
} = require('../controllers/document.controller');

// Multer memory storage configuration (Max 50MB per document)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(authenticateJWT);

router.post('/upload', upload.single('file'), uploadEncryptedDocument);
router.get('/case/:caseId', getCaseDocuments);
router.get('/:id', getDocumentMetadata);
router.get('/:id/ciphertext', getDocumentCiphertext);

module.exports = router;
