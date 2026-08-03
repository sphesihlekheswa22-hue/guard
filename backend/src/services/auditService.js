const prisma = require("../config/prisma");

exports.logAudit = async ({
  user,
  action,
  resourceType,
  resourceId,
  resourceLabel,
  details,
  metadata,
}) => {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: user?.id || user?._id || null,
        actorName: user?.fullName || user?.name || "",
        actorEmail: user?.email || "",
        actorRole: user?.role || "",
        action,
        resourceType,
        resourceId: resourceId ? String(resourceId) : "",
        resourceLabel,
        details,
        metadata: metadata || undefined,
      },
    });
  } catch (err) {
    console.error("Audit log failed:", err);
    return null;
  }
};
