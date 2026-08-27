const AuditLog = require('../models/AuditLog');

/**
 * Creates an Audit Log record for security auditing.
 */
const logAuditEvent = async ({
  action,
  performedBy,
  targetResource,
  targetId = null,
  details = '',
  ipAddress = '',
  userAgent = '',
  status = 'SUCCESS'
}) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetResource,
      targetId,
      details,
      ipAddress,
      userAgent,
      status
    });
  } catch (error) {
    console.error('[Audit Logger Failure]', error.message);
  }
};

module.exports = { logAuditEvent };
