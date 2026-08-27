const crypto = require('crypto');
const Case = require('../models/Case');
const Document = require('../models/Document');
const { minioClient, BUCKET_NAME } = require('../config/minio');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * POST /api/v1/documents/upload
 * Uploads client-side encrypted document ciphertext to MinIO and registers metadata in MongoDB.
 */
const uploadEncryptedDocument = async (req, res) => {
  try {
    // SECURITY GUARD: Ensure file payload was received
    if (!req.file) {
      return res.status(400).json({ error: 'No encrypted document file payload uploaded.' });
    }

    // SECURITY GUARD: Check that server NEVER receives plaintext DEKs or masterKeys
    if (req.body.dek || req.body.plaintextDEK || req.body.masterKey || req.body.privateKey) {
      return res.status(400).json({
        error: 'Security violation: Server must NEVER receive plaintext DEKs, MasterKeys, or Private Keys.'
      });
    }

    const { caseId, originalFilename, fileIV, mimeType, accessList: accessListRaw } = req.body;

    if (!caseId || !originalFilename || !fileIV || !accessListRaw) {
      return res.status(400).json({ error: 'Missing required metadata fields (caseId, originalFilename, fileIV, accessList).' });
    }

    // 1. Server ACL Check: Verify case exists and user is participant
    const targetCase = await Case.findById(caseId);
    if (!targetCase) {
      return res.status(404).json({ error: 'Legal case not found.' });
    }

    const isLawyer = targetCase.lawyerId.toString() === req.user._id.toString();
    const isClient = targetCase.clientId.toString() === req.user._id.toString();

    if (!isLawyer && !isClient) {
      await logAuditEvent({
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        performedBy: req.user._id,
        targetResource: 'Document',
        details: `User ${req.user.email} attempted unauthorized upload to Case ${targetCase.caseNumber}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE'
      });
      return res.status(403).json({ error: 'Access denied. You are not an authorized participant in this case.' });
    }

    // Parse accessList
    let accessList = [];
    try {
      accessList = typeof accessListRaw === 'string' ? JSON.parse(accessListRaw) : accessListRaw;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid accessList JSON format.' });
    }

    if (!Array.isArray(accessList) || accessList.length === 0) {
      return res.status(400).json({ error: 'Access list must contain wrapped DEKs for authorized case participants.' });
    }

    // 2. Generate unique MinIO object key (UUID.enc)
    const minioObjectKey = `${crypto.randomUUID()}.enc`;
    const ciphertextBuffer = req.file.buffer;

    // 3. Upload encrypted ciphertext binary directly to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      minioObjectKey,
      ciphertextBuffer,
      ciphertextBuffer.length,
      { 'content-type': 'application/octet-stream' }
    );

    // 4. Register document metadata record in MongoDB
    const newDoc = await Document.create({
      caseId: targetCase._id,
      uploadedBy: req.user._id,
      originalFilename: originalFilename.trim(),
      mimeType: mimeType || 'application/octet-stream',
      fileSize: ciphertextBuffer.length,
      minioBucket: BUCKET_NAME,
      minioObjectKey,
      fileIV,
      encryptionAlgorithm: 'AES-256-GCM',
      keyWrapAlgorithm: 'RSA-OAEP-2048',
      accessList
    });

    await logAuditEvent({
      action: 'DOC_UPLOADED',
      performedBy: req.user._id,
      targetResource: 'Document',
      targetId: newDoc._id,
      details: `Encrypted document '${originalFilename}' uploaded to Case ${targetCase.caseNumber}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return res.status(201).json({
      message: 'Encrypted document uploaded successfully.',
      document: newDoc
    });
  } catch (error) {
    console.error('[Upload Encrypted Document Error]', error);
    return res.status(500).json({ error: 'Failed to process encrypted document upload.' });
  }
};

/**
 * GET /api/v1/documents/case/:caseId
 * Lists metadata for all documents uploaded to a legal case (Enforces ACL).
 */
const getCaseDocuments = async (req, res) => {
  try {
    const { caseId } = req.params;
    const targetCase = await Case.findById(caseId);
    if (!targetCase) {
      return res.status(404).json({ error: 'Legal case not found.' });
    }

    // Server ACL Check
    const isLawyer = targetCase.lawyerId.toString() === req.user._id.toString();
    const isClient = targetCase.clientId.toString() === req.user._id.toString();

    if (!isLawyer && !isClient) {
      return res.status(403).json({ error: 'Access denied. You are not authorized to view documents for this case.' });
    }

    const documents = await Document.find({ caseId })
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.json({ documents });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve case documents.' });
  }
};

/**
 * GET /api/v1/documents/:id
 * Retrieves metadata + user-specific wrapped DEK for an encrypted document (Enforces ACL).
 */
const getDocumentMetadata = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('caseId')
      .populate('uploadedBy', 'name email role');

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Server ACL Check
    const targetCase = doc.caseId;
    const isLawyer = targetCase.lawyerId.toString() === req.user._id.toString();
    const isClient = targetCase.clientId.toString() === req.user._id.toString();

    if (!isLawyer && !isClient) {
      return res.status(403).json({ error: 'Access denied. You are not authorized to access this document.' });
    }

    // Extract wrapped DEK for logged-in user
    const userAccess = doc.accessList.find(
      item => item.userId.toString() === req.user._id.toString()
    );

    if (!userAccess) {
      return res.status(403).json({ error: 'Access denied. No wrapped DEK found for your account.' });
    }

    return res.json({
      document: doc,
      wrappedDEK: userAccess.wrappedDEK
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve document metadata.' });
  }
};

/**
 * GET /api/v1/documents/:id/ciphertext
 * Retrieves the raw ciphertext payload from MinIO (Enforces ACL).
 */
const getDocumentCiphertext = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('caseId');
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Server ACL Check
    const targetCase = doc.caseId;
    const isLawyer = targetCase.lawyerId.toString() === req.user._id.toString();
    const isClient = targetCase.clientId.toString() === req.user._id.toString();

    if (!isLawyer && !isClient) {
      await logAuditEvent({
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        performedBy: req.user._id,
        targetResource: 'Document',
        targetId: doc._id,
        details: `User ${req.user.email} attempted unauthorized access to document '${doc.originalFilename}'`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE'
      });
      return res.status(403).json({ error: 'Access denied. You are not authorized to download this ciphertext.' });
    }

    const isViewAction = req.query.action === 'view' || req.query.action === 'VIEWED';
    const auditAction = isViewAction ? 'DOC_VIEWED' : 'DOC_DOWNLOADED';

    await logAuditEvent({
      action: auditAction,
      performedBy: req.user._id,
      targetResource: 'Document',
      targetId: doc._id,
      details: `Ciphertext for '${doc.originalFilename}' ${isViewAction ? 'viewed' : 'downloaded'} by ${req.user.role} ${req.user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const dataStream = await minioClient.getObject(doc.minioBucket, doc.minioObjectKey);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.minioObjectKey}"`);
    return dataStream.pipe(res);
  } catch (error) {
    console.error('[Download Ciphertext Error]', error.message);
    return res.status(500).json({ error: 'Failed to download document ciphertext.' });
  }
};

module.exports = {
  uploadEncryptedDocument,
  getCaseDocuments,
  getDocumentMetadata,
  getDocumentCiphertext
};
