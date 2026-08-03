const AuditLog = require("../models/auditLogs");

exports.logAudit = async ({
  user,
  action,
  resourceType,
  resourceId,
  resourceLabel,
  details,
  metadata
}) => {
  try {
    return await AuditLog.create({
      userId: user?._id || user?.id || null,
      actorName: user?.fullName || user?.name || "",
      actorEmail: user?.email || "",
      actorRole: user?.role || "",
      action,
      resourceType,
      resourceId: resourceId ? resourceId.toString() : "",
      resourceLabel,
      details,
      metadata
    });
  } catch (err) {
    console.error("Audit log failed:", err);
    return null;
  }
};
