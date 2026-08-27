const AuditLog = require('../models/AuditLog');

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

module.exports = { getAuditLogs };
