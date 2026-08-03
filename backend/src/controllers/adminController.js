const User = require("../models/users");
const Report = require("../models/report");
const Alert = require("../models/alert");
const Case = require("../models/case");
const Evidence = require("../models/evidence");
const AuditLog = require("../models/auditLogs");
const PoliceStation = require("../models/policeStation");
const NgoOrg = require("../models/ngoOrg");
const AuthSession = require("../models/authSessions");
const EmergencyContact = require("../models/emergencyContacts");
const LiveLocation = require("../models/liveLocation");
const Notification = require("../models/notifications");
const TrackingSession = require("../models/tracking");
const ReporterProfile = require("../models/reporterProfile");
const PoliceOfficerProfile = require("../models/policeOfficerProfile");
const NgoProfile = require("../models/ngoProfile");
const AdminProfile = require("../models/adminProfile");
const { logAudit } = require("../services/auditService");
const { isSoshanguvePoliceStation, containsSoshanguve } = require("../constants/soshanguve");

const normalizeText = (value = "") => String(value).trim().replace(/\s+/g, " ");
const normalizeCode = (value = "") => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const organizationModels = {
  police_station: PoliceStation,
  ngo: NgoOrg,
};

const normalizeOrganization = (doc, type) => ({
  ...doc,
  type,
});

const getOrganizationsByType = async (type, query = {}) => {
  if (type) {
    const Model = organizationModels[type];
    if (!Model) return [];
    let docs = await Model.find(query).sort({ name: 1 }).lean();
    if (type === "police_station") {
      docs = docs.filter(isSoshanguvePoliceStation);
    }
    return docs.map((doc) => normalizeOrganization(doc, type));
  }

  const [policeStations, ngos] = await Promise.all([
    PoliceStation.find(query).sort({ name: 1 }).lean(),
    NgoOrg.find(query).sort({ name: 1 }).lean(),
  ]);

  return [
    ...policeStations.filter(isSoshanguvePoliceStation).map((doc) => normalizeOrganization(doc, "police_station")),
    ...ngos.map((doc) => normalizeOrganization(doc, "ngo")),
  ].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
};

const findOrganizationById = async (id, type) => {
  if (type && organizationModels[type]) {
    const doc = await organizationModels[type].findById(id);
    return doc ? { doc, type } : null;
  }

  const policeStation = await PoliceStation.findById(id);
  if (policeStation) return { doc: policeStation, type: "police_station" };

  const ngo = await NgoOrg.findById(id);
  if (ngo) return { doc: ngo, type: "ngo" };

  return null;
};

const roleFilters = {
  reporter: ["reporter"],
  police_officer: ["authority", "officer"],
  ngo_worker: ["ngo", "ngo_worker"],
  admin: ["admin"],
};

exports.getDashboard = async (req, res) => {
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
    recentAlerts
  ] = await Promise.all([
    User.countDocuments(),
    Report.countDocuments(),
    Alert.countDocuments(),
    Report.countDocuments({ status: "resolved" }),
    Report.countDocuments({ status: { $in: ["pending", "new", "investigating", "referred_to_ngo", "call_initiated", "arranged_counselling"] } }),
    Alert.countDocuments({ status: { $in: ["active", "call initiated", "acknowledged"] } }),
    Case.countDocuments({ status: { $in: ["resolved", "closed"] } }),
    Case.countDocuments({ status: { $in: ["active", "assigned"] } }),
    AuditLog.find({
      $or: [
        { userId: req.user._id },
        { actorEmail: req.user.email, actorRole: "admin" }
      ]
    }).sort({ createdAt: -1 }).limit(8).populate("userId", "fullName email role"),
    User.find().sort({ createdAt: -1 }).limit(5).select("fullName email role createdAt"),
    Report.find().sort({ createdAt: -1 }).limit(5).select("caseId incidentType status createdAt"),
    Alert.find().sort({ createdAt: -1 }).limit(5).select("type status createdAt")
  ]);

  res.json({
    totals: {
      users,
      reports,
      alerts,
      resolvedCases: resolvedReports + resolvedCases,
      pendingCases: pendingReports + pendingCases,
      activeSosAlerts: activeAlerts
    },
    health: {
      status: "online",
      database: ["disconnected", "connected", "connecting", "disconnecting"][User.db.readyState] || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date()
    },
    recentActivity,
    recentUsers,
    recentReports,
    recentAlerts
  });
};

exports.getUsers = async (req, res, next) => {
  try {
    const roleGroup = req.query.role;
    const query = roleGroup && roleFilters[roleGroup] ? { role: { $in: roleFilters[roleGroup] } } : {};
    const users = await User.find(query)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ accountDeletionRequestedAt: -1, createdAt: -1 })
      .limit(250)
      .lean();

    const sessions = await AuthSession.find({ userId: { $in: users.map((user) => user._id) } })
      .select("userId expiresAt")
      .sort({ _id: -1 })
      .lean();

    const latestSessionByUser = new Map();
    sessions.forEach((session) => {
      const userId = String(session.userId);
      if (!latestSessionByUser.has(userId)) {
        latestSessionByUser.set(userId, session);
      }
    });

    res.json(users.map((user) => {
      const latestSession = latestSessionByUser.get(String(user._id));
      return {
        ...user,
        lastLoginAt: latestSession?._id?.getTimestamp?.() || null,
        lastLoginSessionExpiresAt: latestSession?.expiresAt || null
      };
    }));
  } catch (err) {
    next(err);
  }
};

exports.deleteUserPermanently = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot permanently delete your own admin account." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await logAudit({
      user: req.user,
      action: "user_permanently_deleted",
      resourceType: "user",
      resourceId: user._id,
      resourceLabel: user.email,
      details: `Permanently deleted user account ${user.email}`,
      metadata: {
        deletedUserRole: user.role,
        deletionRequestedAt: user.accountDeletionRequestedAt || null
      }
    });

    const [userReports] = await Promise.all([
      Report.find({ userId: user._id }).select("_id evidenceIds").lean(),
    ]);
    const userReportIds = userReports.map((report) => report._id);
    const evidenceIds = userReports.flatMap((report) => report.evidenceIds || []);

    await Promise.all([
      AuthSession.deleteMany({ userId: user._id }),
      EmergencyContact.deleteMany({ userId: user._id }),
      LiveLocation.deleteMany({ userId: user._id }),
      Notification.deleteMany({ userId: user._id }),
      TrackingSession.deleteMany({ userId: user._id }),
      Alert.deleteMany({ userId: user._id }),
      Case.deleteMany({ $or: [{ userId: user._id }, { assignedTo: user._id }] }),
      Report.deleteMany({ userId: user._id }),
      Evidence.deleteMany({
        $or: [
          { _id: { $in: evidenceIds } },
          { reportId: { $in: userReportIds } }
        ]
      }),
      ReporterProfile.deleteOne({ userId: user._id }),
      PoliceOfficerProfile.deleteOne({ userId: user._id }),
      NgoProfile.deleteOne({ userId: user._id }),
      AdminProfile.deleteOne({ userId: user._id }),
      User.findByIdAndDelete(user._id)
    ]);

    res.json({ success: true, message: "User permanently deleted." });
  } catch (err) {
    next(err);
  }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .populate("userId", "fullName email role")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(logs);
  } catch (err) {
    next(err);
  }
};

exports.getPublicOrganizations = async (req, res, next) => {
  try {
    const type = req.query.type;
    if (type && !organizationModels[type]) {
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
    if (type && !organizationModels[type]) {
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

    const Model = organizationModels[type];
    const organization = await Model.create({
      name,
      code,
      phone: normalizeText(req.body.phone),
      email: normalizeText(req.body.email).toLowerCase(),
      address: normalizeText(req.body.address),
      active: req.body.active !== false
    });

    await logAudit({
      user: req.user,
      action: "organization_created",
      resourceType: type,
      resourceId: organization._id,
      resourceLabel: organization.name,
      details: `Created ${type === "police_station" ? "police station" : "NGO"} ${organization.name}`,
    });

    res.status(201).json(normalizeOrganization(organization.toObject(), type));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "An organization with this code already exists for this type." });
    }
    next(err);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const requestedType = req.body.type;
    if (requestedType && !organizationModels[requestedType]) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    const updateFields = {};
    if (Object.prototype.hasOwnProperty.call(req.body, "name")) updateFields.name = normalizeText(req.body.name);
    if (Object.prototype.hasOwnProperty.call(req.body, "code")) updateFields.code = normalizeCode(req.body.code);
    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) updateFields.phone = normalizeText(req.body.phone);
    if (Object.prototype.hasOwnProperty.call(req.body, "email")) updateFields.email = normalizeText(req.body.email).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(req.body, "address")) updateFields.address = normalizeText(req.body.address);
    if (Object.prototype.hasOwnProperty.call(req.body, "active")) updateFields.active = Boolean(req.body.active);

    const found = await findOrganizationById(req.params.id, requestedType);
    if (!found) return res.status(404).json({ message: "Organization not found." });

    Object.assign(found.doc, updateFields);
    const organization = await found.doc.save();

    await logAudit({
      user: req.user,
      action: "organization_updated",
      resourceType: found.type,
      resourceId: organization._id,
      resourceLabel: organization.name,
      details: `Updated ${found.type === "police_station" ? "police station" : "NGO"} ${organization.name}`,
    });

    res.json(normalizeOrganization(organization.toObject(), found.type));
  } catch (err) {
    if (err?.code === 11000) {
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
    await found.doc.deleteOne();

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
