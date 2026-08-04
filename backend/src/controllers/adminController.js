const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const { logAudit } = require("../services/auditService");
const { syncRoleProfile } = require("../services/roleProfileService");
const {
  isSoshanguvePoliceStation,
  containsSoshanguve,
  SOSHANGUVE_STATION_NAME,
} = require("../constants/soshanguve");
const {
  serializeUser,
  serializeReport,
  serializeAlert,
  serializeOrg,
  withId,
  userIdOf,
} = require("../lib/serialize");

const normalizeText = (value = "") => String(value).trim().replace(/\s+/g, " ");
const normalizeCode = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const normalizeOrganization = (doc, type) => ({
  ...serializeOrg(doc),
  type,
});

const serializeAuditLog = (log) => {
  if (!log) return log;
  const plain = withId(log);
  if (plain.user) {
    plain.userId = serializeUser(plain.user);
    delete plain.user;
  }
  return plain;
};

const findOrganizationById = async (id, type) => {
  if (type === "police_station") {
    const doc = await prisma.policeStation.findUnique({ where: { id } });
    return doc ? { doc, type: "police_station" } : null;
  }
  if (type === "ngo") {
    const doc = await prisma.ngoOrg.findUnique({ where: { id } });
    return doc ? { doc, type: "ngo" } : null;
  }

  const policeStation = await prisma.policeStation.findUnique({ where: { id } });
  if (policeStation) return { doc: policeStation, type: "police_station" };

  const ngo = await prisma.ngoOrg.findUnique({ where: { id } });
  if (ngo) return { doc: ngo, type: "ngo" };

  return null;
};

const getOrganizationsByType = async (type, query = {}) => {
  const where = {};
  if (query.active !== undefined) where.active = query.active;

  if (type === "police_station") {
    const docs = await prisma.policeStation.findMany({ where, orderBy: { name: "asc" } });
    return docs.filter(isSoshanguvePoliceStation).map((doc) => normalizeOrganization(doc, "police_station"));
  }

  if (type === "ngo") {
    const docs = await prisma.ngoOrg.findMany({ where, orderBy: { name: "asc" } });
    return docs.map((doc) => normalizeOrganization(doc, "ngo"));
  }

  const [policeStations, ngos] = await Promise.all([
    prisma.policeStation.findMany({ where, orderBy: { name: "asc" } }),
    prisma.ngoOrg.findMany({ where, orderBy: { name: "asc" } }),
  ]);

  return [
    ...policeStations.filter(isSoshanguvePoliceStation).map((doc) => normalizeOrganization(doc, "police_station")),
    ...ngos.map((doc) => normalizeOrganization(doc, "ngo")),
  ].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
};

const roleFilters = {
  reporter: ["reporter"],
  police_officer: ["authority", "officer"],
  ngo_worker: ["ngo", "ngo_worker"],
  admin: ["admin"],
};

const reportPendingStatuses = [
  "pending",
  "new",
  "investigating",
  "referred_to_ngo",
  "call_initiated",
  "arranged_counselling",
];

const alertActiveStatuses = ["active", "call initiated", "acknowledged"];

exports.getDashboard = async (req, res, next) => {
  try {
    const adminId = userIdOf(req.user);
    const adminEmail = req.user.email;

    const [
      users,
      reports,
      alerts,
      resolvedReports,
      pendingReports,
      activeAlerts,
      resolvedCases,
      pendingCases,
      recentActivity,
      recentUsers,
      recentReports,
      recentAlerts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.report.count(),
      prisma.alert.count(),
      prisma.report.count({ where: { status: "resolved" } }),
      prisma.report.count({ where: { status: { in: reportPendingStatuses } } }),
      prisma.alert.count({ where: { status: { in: alertActiveStatuses } } }),
      prisma.case.count({ where: { status: { in: ["resolved", "closed"] } } }),
      prisma.case.count({ where: { status: { in: ["active", "assigned"] } } }),
      prisma.auditLog.findMany({
        where: {
          OR: [{ userId: adminId }, { actorEmail: adminEmail, actorRole: "admin" }],
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, fullName: true, email: true, role: true, createdAt: true },
      }),
      prisma.report.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, caseId: true, incidentType: true, status: true, createdAt: true },
      }),
      prisma.alert.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, type: true, status: true, createdAt: true },
      }),
    ]);

    let databaseStatus = "connected";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = "disconnected";
    }

    res.json({
      totals: {
        users,
        reports,
        alerts,
        resolvedCases: resolvedReports + resolvedCases,
        pendingCases: pendingReports + pendingCases,
        activeSosAlerts: activeAlerts,
      },
      health: {
        status: "online",
        database: databaseStatus,
        uptimeSeconds: Math.floor(process.uptime()),
        checkedAt: new Date(),
      },
      recentActivity: recentActivity.map(serializeAuditLog),
      recentUsers: recentUsers.map(serializeUser),
      recentReports: recentReports.map(serializeReport),
      recentAlerts: recentAlerts.map(serializeAlert),
    });
  } catch (err) {
    next(err);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const roleGroup = req.query.role;
    const where =
      roleGroup && roleFilters[roleGroup] ? { role: { in: roleFilters[roleGroup] } } : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ accountDeletionRequestedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
    });

    const userIds = users.map((user) => user.id);
    const sessions =
      userIds.length > 0
        ? await prisma.authSession.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, expiresAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const latestSessionByUser = new Map();
    sessions.forEach((session) => {
      const userId = String(session.userId);
      if (!latestSessionByUser.has(userId)) {
        latestSessionByUser.set(userId, session);
      }
    });

    res.json(
      users.map((user) => {
        const serialized = serializeUser(user);
        const latestSession = latestSessionByUser.get(String(user.id));
        return {
          ...serialized,
          lastLoginAt: latestSession?.createdAt || null,
          lastLoginSessionExpiresAt: latestSession?.expiresAt || null,
        };
      })
    );
  } catch (err) {
    next(err);
  }
};

exports.deleteUserPermanently = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot permanently delete your own admin account." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await logAudit({
      user: req.user,
      action: "user_permanently_deleted",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      details: `Permanently deleted user account ${user.email}`,
      metadata: {
        deletedUserRole: user.role,
        deletionRequestedAt: user.accountDeletionRequestedAt || null,
      },
    });

    await prisma.$transaction([
      prisma.evidence.deleteMany({ where: { userId: user.id } }),
      prisma.case.deleteMany({ where: { assignedToId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);

    res.json({ success: true, message: "User permanently deleted." });
  } catch (err) {
    next(err);
  }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json(logs.map(serializeAuditLog));
  } catch (err) {
    next(err);
  }
};

exports.getPublicOrganizations = async (req, res, next) => {
  try {
    const type = req.query.type;
    if (type && !["police_station", "ngo"].includes(type)) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    const organizations = await getOrganizationsByType(type, { active: true });
    res.json(organizations);
  } catch (err) {
    next(err);
  }
};

exports.getOrganizations = async (req, res, next) => {
  try {
    const type = req.query.type;
    if (type && !["police_station", "ngo"].includes(type)) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    const organizations = await getOrganizationsByType(type);
    res.json(organizations);
  } catch (err) {
    next(err);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const type = req.body.type;
    const name = normalizeText(req.body.name);
    const code = normalizeCode(req.body.code || name);

    if (!["police_station", "ngo"].includes(type)) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    if (!name || !code) {
      return res.status(400).json({ message: "Name is required." });
    }

    if (type === "police_station" && !containsSoshanguve(`${name} ${req.body.address || ""}`)) {
      return res.status(400).json({
        message: "Only Soshanguve police stations are allowed in SafeGuard.",
      });
    }

    const data = {
      name,
      code,
      phone: normalizeText(req.body.phone),
      email: normalizeText(req.body.email).toLowerCase(),
      address: normalizeText(req.body.address),
      active: req.body.active !== false,
    };

    const organization =
      type === "police_station"
        ? await prisma.policeStation.create({ data })
        : await prisma.ngoOrg.create({ data });

    await logAudit({
      user: req.user,
      action: "organization_created",
      resourceType: type,
      resourceId: organization.id,
      resourceLabel: organization.name,
      details: `Created ${type === "police_station" ? "police station" : "NGO"} ${organization.name}`,
    });

    res.status(201).json(normalizeOrganization(organization, type));
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "An organization with this code already exists for this type." });
    }
    next(err);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const requestedType = req.body.type;
    if (requestedType && !["police_station", "ngo"].includes(requestedType)) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    const updateFields = {};
    if (Object.prototype.hasOwnProperty.call(req.body, "name")) updateFields.name = normalizeText(req.body.name);
    if (Object.prototype.hasOwnProperty.call(req.body, "code")) updateFields.code = normalizeCode(req.body.code);
    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) updateFields.phone = normalizeText(req.body.phone);
    if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
      updateFields.email = normalizeText(req.body.email).toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "address")) {
      updateFields.address = normalizeText(req.body.address);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "active")) updateFields.active = Boolean(req.body.active);

    const found = await findOrganizationById(req.params.id, requestedType);
    if (!found) return res.status(404).json({ message: "Organization not found." });

    const organization =
      found.type === "police_station"
        ? await prisma.policeStation.update({ where: { id: found.doc.id }, data: updateFields })
        : await prisma.ngoOrg.update({ where: { id: found.doc.id }, data: updateFields });

    await logAudit({
      user: req.user,
      action: "organization_updated",
      resourceType: found.type,
      resourceId: organization.id,
      resourceLabel: organization.name,
      details: `Updated ${found.type === "police_station" ? "police station" : "NGO"} ${organization.name}`,
    });

    res.json(normalizeOrganization(organization, found.type));
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "An organization with this code already exists for this type." });
    }
    next(err);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const found = await findOrganizationById(req.params.id, req.query.type);
    if (!found) return res.status(404).json({ message: "Organization not found." });

    const organizationName = found.doc.name;

    if (found.type === "police_station") {
      await prisma.policeStation.delete({ where: { id: found.doc.id } });
    } else {
      await prisma.ngoOrg.delete({ where: { id: found.doc.id } });
    }

    await logAudit({
      user: req.user,
      action: "organization_deleted",
      resourceType: found.type,
      resourceId: req.params.id,
      resourceLabel: organizationName,
      details: `Permanently removed ${found.type === "police_station" ? "police station" : "NGO"} ${organizationName}`,
    });

    res.json({ success: true, message: "Organization removed." });
  } catch (err) {
    next(err);
  }
};

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
const normalizeFullName = (value = "") => String(value).trim().replace(/\s+/g, " ");
const isValidFullName = (value = "") => /^[\p{L}]+(?: [\p{L}]+)*$/u.test(normalizeFullName(value));
const normalizeIdNumber = (value = "") => String(value).replace(/\D/g, "").slice(0, 13);
const isValidIdNumber = (value = "") => /^\d{13}$/.test(normalizeIdNumber(value));
const normalizeSouthAfricanPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("0027")) return `0${digits.slice(4)}`.slice(0, 10);
  if (digits.startsWith("27")) return `0${digits.slice(2)}`.slice(0, 10);
  return digits.slice(0, 10);
};
const isValidSouthAfricanPhone = (value = "") => /^0[678]\d{8}$/.test(normalizeSouthAfricanPhone(value));

exports.createStaffUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      idNumber,
      role,
      policeStationId,
      policeStationName,
      ngoId,
      ngoName,
    } = req.body;

    const normalizedRole = role === "authority" ? "officer" : role === "ngo" ? "ngo_worker" : role;
    if (!["officer", "ngo_worker"].includes(normalizedRole)) {
      return res.status(400).json({ message: "Only police officer or NGO worker accounts can be created here." });
    }

    const normalizedFullName = normalizeFullName(fullName);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizeSouthAfricanPhone(phone);
    const normalizedIdNumber = normalizeIdNumber(idNumber);

    if (!isValidFullName(normalizedFullName)) {
      return res.status(400).json({ message: "Full name can only contain letters and spaces." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long." });
    }
    if (!isValidSouthAfricanPhone(normalizedPhone)) {
      return res.status(400).json({ message: "A valid South African mobile number is required." });
    }
    if (!isValidIdNumber(normalizedIdNumber)) {
      return res.status(400).json({ message: "A valid 13-digit ID number is required." });
    }

    if (normalizedRole === "officer" && !policeStationId) {
      return res.status(400).json({ message: "Police station is required for officers." });
    }
    if (normalizedRole === "ngo_worker" && !ngoId) {
      return res.status(400).json({ message: "NGO is required for NGO workers." });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hashed = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        fullName: normalizedFullName,
        email: normalizedEmail,
        password: hashed,
        phone: normalizedPhone,
        idNumber: normalizedIdNumber,
        role: normalizedRole,
        policeStationId: normalizedRole === "officer" ? String(policeStationId) : null,
        policeStationName:
          normalizedRole === "officer" ? policeStationName || SOSHANGUVE_STATION_NAME : null,
        ngoId: normalizedRole === "ngo_worker" ? String(ngoId) : null,
        ngoName: normalizedRole === "ngo_worker" ? ngoName || null : null,
        isVerified: true,
      },
    });

    await syncRoleProfile(user);
    await logAudit({
      user: req.user,
      action: "staff_user_created",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      details: `Created ${normalizedRole} account ${user.email}`,
    });

    res.status(201).json({ success: true, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
};

exports.updateStaffUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!["officer", "authority", "ngo_worker", "ngo"].includes(user.role)) {
      return res.status(400).json({ message: "Only police officer or NGO worker accounts can be edited here." });
    }

    const updateData = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "fullName")) {
      const normalizedFullName = normalizeFullName(req.body.fullName);
      if (!isValidFullName(normalizedFullName)) {
        return res.status(400).json({ message: "Full name can only contain letters and spaces." });
      }
      updateData.fullName = normalizedFullName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
      const normalizedEmail = normalizeEmail(req.body.email);
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: "A valid email address is required." });
      }
      updateData.email = normalizedEmail;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
      const normalizedPhone = normalizeSouthAfricanPhone(req.body.phone);
      if (!isValidSouthAfricanPhone(normalizedPhone)) {
        return res.status(400).json({ message: "A valid South African mobile number is required." });
      }
      updateData.phone = normalizedPhone;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "idNumber")) {
      const normalizedIdNumber = normalizeIdNumber(req.body.idNumber);
      if (!isValidIdNumber(normalizedIdNumber)) {
        return res.status(400).json({ message: "A valid 13-digit ID number is required." });
      }
      updateData.idNumber = normalizedIdNumber;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "password") && String(req.body.password || "").trim()) {
      if (String(req.body.password).length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long." });
      }
      updateData.password = await bcrypt.hash(String(req.body.password), 10);
    }

    if (["officer", "authority"].includes(user.role)) {
      if (Object.prototype.hasOwnProperty.call(req.body, "policeStationId")) {
        updateData.policeStationId = String(req.body.policeStationId || "").trim() || null;
        updateData.policeStationName = req.body.policeStationName || SOSHANGUVE_STATION_NAME;
      }
    }

    if (["ngo_worker", "ngo"].includes(user.role)) {
      if (Object.prototype.hasOwnProperty.call(req.body, "ngoId")) {
        updateData.ngoId = String(req.body.ngoId || "").trim() || null;
        updateData.ngoName = req.body.ngoName || null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
    await syncRoleProfile(updated);

    await logAudit({
      user: req.user,
      action: "staff_user_updated",
      resourceType: "user",
      resourceId: updated.id,
      resourceLabel: updated.email,
      details: `Updated staff account ${updated.email}`,
    });

    res.json({ success: true, user: serializeUser(updated) });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    next(err);
  }
};
