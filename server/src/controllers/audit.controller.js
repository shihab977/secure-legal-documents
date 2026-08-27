const AuditLog = require('../models/AuditLog');
const Case = require('../models/Case');
const Document = require('../models/Document');

/**
 * GET /api/v1/audit-logs
 * Retrieves security audit log records relevant to the authenticated user.
 */
const getAuditLogs = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'lawyer') {
      // Lawyer sees events performed by themselves or targeting their resources
      query = { performedBy: req.user._id };
    } else {
      // Client sees events where they performed the action
      query = { performedBy: req.user._id };
    }

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ auditLogs: logs });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
};

/**
 * GET /api/v1/audit-logs/notifications
 * Retrieves access notifications for documents in cases owned by the authenticated lawyer.
 */
const getAccessNotifications = async (req, res) => {
  try {
    if (req.user.role !== 'lawyer') {
      return res.status(403).json({ error: 'Access denied. Lawyer role required.' });
    }

    // 1. Find all cases owned by this lawyer
    const lawyerCases = await Case.find({ lawyerId: req.user._id });
    const caseIds = lawyerCases.map(c => c._id);

    // 2. Find all documents belonging to these cases
    const caseDocuments = await Document.find({ caseId: { $in: caseIds } });
    const docIds = caseDocuments.map(d => d._id);

    // 3. Find AuditLog records for DOC_VIEWED and DOC_DOWNLOADED on these documents
    const accessLogs = await AuditLog.find({
      targetResource: 'Document',
      targetId: { $in: docIds },
      action: { $in: ['DOC_VIEWED', 'DOC_DOWNLOADED'] }
    })
      .populate('performedBy', 'name email role')
      .populate({
        path: 'targetId',
        ref: 'Document',
        select: 'originalFilename caseId',
        populate: { path: 'caseId', select: 'caseNumber title' }
      })
      .sort({ createdAt: -1 })
      .limit(100);

    // Filter only events performed by clients
    const notifications = accessLogs
      .filter(log => log.performedBy && log.performedBy.role === 'client' && log.targetId)
      .map(log => {
        const doc = log.targetId;
        const caseObj = doc ? doc.caseId : null;
        return {
          id: log._id,
          clientName: log.performedBy.name,
          clientEmail: log.performedBy.email,
          documentFilename: doc ? doc.originalFilename : 'Unknown File',
          caseId: caseObj ? (caseObj.caseNumber || caseObj._id.toString()) : 'Unknown Case',
          action: log.action === 'DOC_VIEWED' ? 'VIEWED' : 'DOWNLOADED',
          timestamp: log.createdAt
        };
      });

    return res.json({ notifications });
  } catch (error) {
    console.error('[Get Access Notifications Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve access notifications.' });
  }
};

module.exports = { getAuditLogs, getAccessNotifications };
