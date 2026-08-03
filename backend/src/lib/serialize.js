/**
 * Serialize Prisma rows to Mongo-like API shapes (_id, nested userId, etc.).
 */

const toPlain = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (typeof val === "function") continue;
      out[key] = toPlain(val);
    }
    return out;
  }
  return value;
};

const withId = (row) => {
  if (!row || typeof row !== "object") return row;
  const plain = toPlain(row);
  if (plain.id && !plain._id) plain._id = plain.id;
  return plain;
};

const serializeUser = (user, { includePassword = false } = {}) => {
  if (!user) return user;
  const plain = withId(user);
  if (!includePassword) delete plain.password;
  if (Array.isArray(plain.emergencyContacts)) {
    plain.emergencyContacts = plain.emergencyContacts.map(withId);
  }
  return plain;
};

const serializeEvidence = (item) => withId(item);

const serializeReport = (report) => {
  if (!report) return report;
  const plain = withId(report);
  if (plain.user && !plain.userId) {
    plain.userId = serializeUser(plain.user);
  } else if (plain.user && typeof plain.userId === "string") {
    plain.userId = serializeUser(plain.user);
  } else if (plain.user) {
    plain.userId = serializeUser(plain.user);
  }
  delete plain.user;

  if (Array.isArray(plain.evidence)) {
    plain.evidenceIds = plain.evidence.map(serializeEvidence);
    delete plain.evidence;
  } else if (!plain.evidenceIds) {
    plain.evidenceIds = [];
  }

  if (!Array.isArray(plain.statusHistory)) plain.statusHistory = plain.statusHistory || [];
  if (!Array.isArray(plain.interactions)) plain.interactions = plain.interactions || [];

  // Restore nested changedBy/createdBy ids as objects if only strings stored in JSON
  plain.statusHistory = (plain.statusHistory || []).map((entry) => {
    const e = { ...entry };
    if (e.changedBy && typeof e.changedBy === "object") e.changedBy = withId(e.changedBy);
    return e;
  });
  plain.interactions = (plain.interactions || []).map((entry) => {
    const e = { ...entry };
    if (e.createdBy && typeof e.createdBy === "object") e.createdBy = withId(e.createdBy);
    return e;
  });

  return plain;
};

const serializeCase = (item) => {
  if (!item) return item;
  const plain = withId(item);
  if (plain.user) {
    plain.userId = serializeUser(plain.user);
    delete plain.user;
  }
  if (plain.assignedTo) {
    plain.assignedTo = serializeUser(plain.assignedTo);
  }
  // Compatibility: mongoose used assignedTo as ObjectId field name
  if (plain.assignedToId && !plain.assignedTo) {
    plain.assignedTo = plain.assignedToId;
  }
  if (!Array.isArray(plain.notifiedContacts)) {
    plain.notifiedContacts = plain.notifiedContacts || [];
  }
  return plain;
};

const serializeAlert = (item) => {
  if (!item) return item;
  const plain = withId(item);
  if (plain.user) {
    plain.userId = serializeUser(plain.user);
    delete plain.user;
  }
  if (plain.case) {
    plain.caseId = serializeCase(plain.case);
    delete plain.case;
  } else if (plain.caseId && typeof plain.caseId === "string") {
    // keep string
  }
  if (plain.acknowledgedBy) {
    plain.acknowledgedBy = serializeUser(plain.acknowledgedBy);
  }
  if (plain.acknowledgedById && !plain.acknowledgedBy) {
    plain.acknowledgedBy = plain.acknowledgedById;
  }
  return plain;
};

const serializeOrg = (item) => withId(item);

const userIdOf = (userOrId) => {
  if (!userOrId) return null;
  if (typeof userOrId === "string") return userOrId;
  return userOrId.id || userOrId._id || null;
};

module.exports = {
  withId,
  serializeUser,
  serializeEvidence,
  serializeReport,
  serializeCase,
  serializeAlert,
  serializeOrg,
  userIdOf,
  toPlain,
};
