const Case = require('../models/Case');
const User = require('../models/User');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * POST /api/v1/cases
 * Creates a new legal case and assigns a client (Lawyer only).
 */
const createCase = async (req, res) => {
  try {
    const { title, description, clientId } = req.body;

    if (!title || !clientId) {
      return res.status(400).json({ error: 'Case title and client ID are required.' });
    }

    // Verify assigned user exists and is a client
    const targetClient = await User.findOne({ _id: clientId, role: 'client' });
    if (!targetClient) {
      return res.status(404).json({ error: 'Assigned client not found or invalid role.' });
    }

    // Generate unique case number
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    const caseNumber = `CASE-2026-${randomCode}`;

    const newCase = await Case.create({
      caseNumber,
      title: title.trim(),
      description: description ? description.trim() : '',
      lawyerId: req.user._id,
      clientId: targetClient._id,
      status: 'active'
    });

    await logAuditEvent({
      action: 'CASE_CREATED',
      performedBy: req.user._id,
      targetResource: 'Case',
      targetId: newCase._id,
      details: `Case ${caseNumber} created by lawyer ${req.user.email} for client ${targetClient.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const populatedCase = await Case.findById(newCase._id)
      .populate('lawyerId', 'name email publicKey role')
      .populate('clientId', 'name email publicKey role');

    return res.status(201).json({
      message: 'Legal case created successfully.',
      case: populatedCase
    });
  } catch (error) {
    console.error('[Create Case Error]', error.message);
    return res.status(500).json({ error: 'Failed to create legal case.' });
  }
};

/**
 * GET /api/v1/cases
 * Retrieves cases accessible to the logged-in user (Lawyer sees created cases; Client sees assigned cases).
 */
const getCases = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'lawyer') {
      query = { lawyerId: req.user._id };
    } else if (req.user.role === 'client') {
      query = { clientId: req.user._id };
    }

    const cases = await Case.find(query)
      .populate('lawyerId', 'name email publicKey role')
      .populate('clientId', 'name email publicKey role')
      .sort({ createdAt: -1 });

    return res.json({ cases });
  } catch (error) {
    console.error('[Get Cases Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve cases.' });
  }
};

/**
 * GET /api/v1/cases/:id
 * Retrieves details for a specific case (Enforces ACL).
 */
const getCaseById = async (req, res) => {
  try {
    const targetCase = await Case.findById(req.params.id)
      .populate('lawyerId', 'name email publicKey role')
      .populate('clientId', 'name email publicKey role');

    if (!targetCase) {
      return res.status(404).json({ error: 'Legal case not found.' });
    }

    // SERVER-SIDE ACL CHECK
    const isLawyer = targetCase.lawyerId._id.toString() === req.user._id.toString();
    const isClient = targetCase.clientId._id.toString() === req.user._id.toString();

    if (!isLawyer && !isClient) {
      await logAuditEvent({
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        performedBy: req.user._id,
        targetResource: 'Case',
        targetId: targetCase._id,
        details: `User ${req.user.email} attempted unauthorized access to Case ${targetCase.caseNumber}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'FAILURE'
      });
      return res.status(403).json({ error: 'Access denied. You are not authorized to view this legal case.' });
    }

    await logAuditEvent({
      action: 'CASE_ACCESSED',
      performedBy: req.user._id,
      targetResource: 'Case',
      targetId: targetCase._id,
      details: `Case ${targetCase.caseNumber} accessed by ${req.user.role} ${req.user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return res.json({ case: targetCase });
  } catch (error) {
    console.error('[Get Case Details Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve case details.' });
  }
};

/**
 * PUT /api/v1/cases/:id
 * Updates case details or assigned client (Lawyer owner only).
 */
const updateCase = async (req, res) => {
  try {
    const targetCase = await Case.findById(req.params.id);
    if (!targetCase) {
      return res.status(404).json({ error: 'Legal case not found.' });
    }

    // SERVER-SIDE ACL CHECK: Only creating lawyer can update
    if (targetCase.lawyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied. Only the assigned lawyer can update case details.' });
    }

    const { title, description, clientId, status } = req.body;

    if (title) targetCase.title = title.trim();
    if (description !== undefined) targetCase.description = description.trim();
    if (status && ['active', 'closed', 'archived'].includes(status)) {
      targetCase.status = status;
    }

    if (clientId && clientId !== targetCase.clientId.toString()) {
      const newClient = await User.findOne({ _id: clientId, role: 'client' });
      if (!newClient) {
        return res.status(404).json({ error: 'New assigned client not found or invalid role.' });
      }
      targetCase.clientId = newClient._id;
    }

    await targetCase.save();

    await logAuditEvent({
      action: 'CASE_UPDATED',
      performedBy: req.user._id,
      targetResource: 'Case',
      targetId: targetCase._id,
      details: `Case ${targetCase.caseNumber} updated by lawyer ${req.user.email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const updatedCase = await Case.findById(targetCase._id)
      .populate('lawyerId', 'name email publicKey role')
      .populate('clientId', 'name email publicKey role');

    return res.json({
      message: 'Case updated successfully.',
      case: updatedCase
    });
  } catch (error) {
    console.error('[Update Case Error]', error.message);
    return res.status(500).json({ error: 'Failed to update case details.' });
  }
};

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase
};
