const prisma = require("../config/prisma");
const { createReportService, getAllReports, reportInclude } = require("../services/reportService");
const { logAudit } = require("../services/auditService");
const { serializeReport, serializeUser, userIdOf } = require("../lib/serialize");

const NGO_ACTIVE_REFERRAL_STATUSES = ["referred_to_ngo", "call_initiated", "arranged_counselling"];

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  policeStationName: true,
};

const buildNgoReferralWhere = (ngoId) => ({
  AND: [
    {
      OR: [
        { status: { in: NGO_ACTIVE_REFERRAL_STATUSES } },
        {
          statusHistory: {
            path: [],
            string_contains: "referred_to_ngo",
          },
        },
      ],
    },
    { referredNgoId: ngoId },
  ],
});

const collectJsonUserIds = (report) => {
  const ids = new Set();
  for (const entry of report.statusHistory || []) {
    if (entry?.changedBy && typeof entry.changedBy === "string") ids.add(entry.changedBy);
  }
  for (const entry of report.interactions || []) {
    if (entry?.createdBy && typeof entry.createdBy === "string") ids.add(entry.createdBy);
  }
  return [...ids];
};

const enrichReportUsers = async (report) => {
  if (!report) return report;
  const userIds = collectJsonUserIds(report);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: USER_SELECT,
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, serializeUser(u)]));

  const plain = serializeReport(report);
  plain.statusHistory = (plain.statusHistory || []).map((entry) => ({
    ...entry,
    changedBy: userMap.get(entry.changedBy) || entry.changedBy,
  }));
  plain.interactions = (plain.interactions || []).map((entry) => ({
    ...entry,
    createdBy: userMap.get(entry.createdBy) || entry.createdBy,
  }));
  return plain;
};

const enrichReports = async (reports) => {
  if (!Array.isArray(reports) || reports.length === 0) return [];

  const allUserIds = new Set();
  for (const report of reports) {
    for (const id of collectJsonUserIds(report)) allUserIds.add(id);
  }

  const users =
    allUserIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...allUserIds] } },
          select: USER_SELECT,
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, serializeUser(u)]));

  return reports.map((report) => {
    const plain = serializeReport(report);
    plain.statusHistory = (plain.statusHistory || []).map((entry) => ({
      ...entry,
      changedBy: userMap.get(entry.changedBy) || entry.changedBy,
    }));
    plain.interactions = (plain.interactions || []).map((entry) => ({
      ...entry,
      createdBy: userMap.get(entry.createdBy) || entry.createdBy,
    }));
    return plain;
  });
};

const buildLocationUpdate = (body, currentLocation = {}) => {
  const address = typeof body.address === "string" ? body.address.trim().replace(/\s+/g, " ") : "";
  const hasLatitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
  const hasLongitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== "";

  if (!address && (!hasLatitude || !hasLongitude)) {
    const err = new Error("Address or coordinates are required");
    err.statusCode = 400;
    throw err;
  }

  const location = {
    type: "Point",
    coordinates: Array.isArray(currentLocation.coordinates) ? currentLocation.coordinates : [0, 0],
    address: address || currentLocation.address || "Location updated",
    accuracy: currentLocation.accuracy || null,
  };

  if (hasLatitude || hasLongitude) {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      const err = new Error("Valid latitude and longitude are required");
      err.statusCode = 400;
      throw err;
    }

    location.coordinates = [longitude, latitude];
  }

  if (body.accuracy !== undefined && body.accuracy !== null && body.accuracy !== "") {
    const accuracy = Number(body.accuracy);
    location.accuracy = Number.isFinite(accuracy) ? accuracy : null;
  }

  return location;
};

const getStationFilter = (user) => {
  if ((user.role === "authority" || user.role === "officer") && user.policeStationId) {
    return { policeStationId: user.policeStationId };
  }

  if ((user.role === "ngo" || user.role === "ngo_worker") && user.ngoId) {
    return buildNgoReferralWhere(user.ngoId);
  }

  return null;
};

exports.getReportInteractions = async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      select: { interactions: true },
    });
    if (!report) return res.status(404).json({ message: "Report not found" });

    const userIds = (report.interactions || [])
      .map((entry) => entry.createdBy)
      .filter((id) => typeof id === "string");
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: USER_SELECT,
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, serializeUser(u)]));

    const interactions = (report.interactions || []).map((entry) => ({
      ...entry,
      createdBy: userMap.get(entry.createdBy) || entry.createdBy,
    }));

    res.json(interactions);
  } catch (err) {
    next(err);
  }
};

exports.addReportInteraction = async (req, res, next) => {
  try {
    const { type, description } = req.body;
    if (!type || !description) {
      return res.status(400).json({ message: "Type and description are required" });
    }

    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ message: "Report not found" });

    const interaction = {
      type,
      description,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };

    const interactions = [...(report.interactions || []), interaction];

    await prisma.report.update({
      where: { id: report.id },
      data: { interactions },
    });

    const creator = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: USER_SELECT,
    });
    const newInteraction = {
      ...interaction,
      createdBy: serializeUser(creator),
    };

    const io = req.app.locals.io;
    if (io) {
      io.emit("reportInteractionAdded", {
        reportId: report.id,
        caseId: report.caseId,
        interaction: newInteraction,
        addedBy: req.user.email,
        addedByRole: req.user.role,
      });
      console.log("🔌 [addReportInteraction] Socket event emitted for new interaction");
    }

    res.status(201).json(newInteraction);
  } catch (err) {
    next(err);
  }
};

exports.createReport = async (req, res, next) => {
  try {
    const result = await createReportService(req.user, req.body, req.files);

    console.log("📋 Report created:", result.report.caseId, "ID:", result.report._id);

    try {
      if (result.duplicate) {
        console.log(
          "[createReport] Duplicate request returned existing report, skipping socket broadcast:",
          result.report.caseId
        );
        return res.json(result);
      }

      const io = req.app.locals.io;
      if (!io) {
        console.warn("⚠️  Socket.IO instance not available on app.locals");
      } else {
        const evidenceArray = (result.evidenceIds || []).map((ev) => ({
          id: ev.id || ev._id,
          _id: ev._id || ev.id,
          fileUrl: ev.fileUrl,
          type: ev.type,
          name: ev.name,
        }));

        const reportData = {
          reportId: result.report._id ? String(result.report._id) : "",
          caseId: result.report.caseId || "",
          incidentType: result.report.incidentType || "",
          location:
            result.report.location?.address ||
            (result.report.location ? JSON.stringify(result.report.location) : ""),
          date: result.report.createdAt
            ? new Date(result.report.createdAt).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          description: result.report.description || "",
          evidenceIds: evidenceArray,
          status: result.report.status || "pending",
          createdAt: result.report.createdAt
            ? new Date(result.report.createdAt).toISOString()
            : new Date().toISOString(),
          userId: result.report.userId
            ? typeof result.report.userId === "object"
              ? String(result.report.userId._id || result.report.userId.id)
              : String(result.report.userId)
            : "",
        };

        console.log("🔌 Broadcasting reportSubmitted event:", JSON.stringify(reportData, null, 2));
        io.emit("reportSubmitted", reportData);
        console.log("✅ Socket event emitted successfully for case:", reportData.caseId);
      }
    } catch (socketErr) {
      console.error("❌ Socket emit error:", socketErr);
    }

    res.json(result);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ msg: err.message, error: err.message });
    }
    next(err);
  }
};

exports.getReports = async (req, res, next) => {
  try {
    let data;
    const stationFilter = getStationFilter(req.user);

    console.log("📥 [getReports] Called by user:", req.user.email, "Role:", req.user.role);
    console.log("📥 [getReports] User ID:", req.user.id);
    console.log("📥 [getReports] Station filter:", stationFilter ? JSON.stringify(stationFilter) : "null (will use userId filter)");

    if (stationFilter) {
      console.log("📥 [getReports] Using filter:", stationFilter);
      if (req.user.role === "ngo" || req.user.role === "ngo_worker") {
        console.log("📥 [getReports] NGO/NGO Worker: Filtering for all referred cases for NGO");
      }
      data = await prisma.report.findMany({
        where: stationFilter,
        include: reportInclude,
        orderBy: { createdAt: "desc" },
      });
    } else {
      console.log("📥 [getReports] Using userId filter. Query: { userId:", req.user.id, "}");
      data = await getAllReports(req.user.id);

      const directQuery = await prisma.report.findMany({
        where: { userId: req.user.id },
        select: { id: true, caseId: true, userId: true, createdAt: true },
      });
      console.log("📥 [getReports] Direct DB query found:", directQuery.length, "reports");
      if (directQuery.length > 0) {
        console.log("📥 [getReports] First report userId:", directQuery[0].userId);
        console.log("📥 [getReports] First report caseId:", directQuery[0].caseId);
      }
    }

    console.log("📥 [getReports] Found reports:", data.length ? `${data.length} reports` : "0 reports");
    if (data.length > 0) {
      console.log("📥 [getReports] First report case ID:", data[0].caseId);
      console.log("📥 [getReports] First report userId:", data[0].userId);
    }

    res.json(await enrichReports(data));
  } catch (err) {
    console.error("📥 [getReports] Error:", err.message);
    next(err);
  }
};

exports.getReportById = async (req, res, next) => {
  try {
    const stationFilter = getStationFilter(req.user);
    const where = stationFilter
      ? { id: req.params.id, ...stationFilter }
      : { id: req.params.id, userId: req.user.id };

    const report = await prisma.report.findFirst({
      where,
      include: reportInclude,
    });

    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(await enrichReportUsers(report));
  } catch (err) {
    next(err);
  }
};

exports.deleteReport = async (req, res, next) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    await prisma.report.delete({ where: { id: report.id } });

    res.json({
      success: true,
      message: "Report deleted successfully",
      id: req.params.id,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateReport = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: reportInclude,
    });
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    const oldStatus = report.status;
    console.log(`📝 [updateReport] Status change: ${oldStatus} → ${status} by ${req.user.email}`);

    const statusHistory = [...(report.statusHistory || [])];
    statusHistory.push({
      status,
      changedBy: req.user.id,
      changedByRole: req.user.role,
      changedAt: new Date().toISOString(),
      reason: `Status changed from ${oldStatus} to ${status}`,
    });

    const updateData = {
      status,
      statusHistory,
    };

    if (status === "referred_to_ngo") {
      const referredNgoId = String(req.body.referredNgoId || req.body.ngoId || "").trim();
      let referredNgoName = String(req.body.referredNgoName || req.body.ngoName || "").trim();

      if (!referredNgoId) {
        return res.status(400).json({
          message: "Select an NGO to refer this case to.",
        });
      }

      if (!["authority", "officer", "admin"].includes(req.user.role)) {
        return res.status(403).json({
          message: "Only police officers can assign an NGO referral.",
        });
      }

      if (!referredNgoName) {
        const ngo = await prisma.ngoOrg.findFirst({
          where: {
            OR: [{ id: referredNgoId }, { code: referredNgoId }],
          },
        });
        referredNgoName = ngo?.name || "";
      }

      updateData.referredNgoId = referredNgoId;
      updateData.referredNgoName = referredNgoName;
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: updateData,
      include: reportInclude,
    });

    await logAudit({
      user: req.user,
      action: "case_status_changed",
      resourceType: "report",
      resourceId: updated.id,
      resourceLabel: updated.caseId,
      details: `Changed report status from ${oldStatus} to ${status}`,
      metadata: { oldStatus, newStatus: status },
    });

    const serialized = await enrichReportUsers(updated);

    console.log("✅ [updateReport] Status history updated with entry");

    const io = req.app.locals.io;
    if (io) {
      const reportUserId =
        typeof serialized.userId === "object"
          ? serialized.userId._id || serialized.userId.id
          : serialized.userId;
      io.emit("reportStatusUpdated", {
        reportId: serialized._id,
        caseId: serialized.caseId,
        status: serialized.status,
        oldStatus,
        updatedAt: serialized.updatedAt,
        userId: reportUserId,
        changedBy: req.user.email,
        changedByRole: req.user.role,
      });
      console.log("🔌 [updateReport] Socket event emitted for status update");
    }

    res.json({
      success: true,
      message: `Report status updated from ${oldStatus} to ${status}`,
      report: serialized,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateReportLocation = async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: reportInclude,
    });

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (userIdOf(report.userId) !== req.user.id) {
      return res.status(403).json({ message: "You can only update the location for your own report" });
    }

    const location = buildLocationUpdate(req.body, report.location || {});

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { location },
      include: reportInclude,
    });

    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "report",
      resourceId: updated.id,
      resourceLabel: updated.caseId,
      details: "Updated report location",
      metadata: { location: updated.location },
    });

    const serialized = await enrichReportUsers(updated);

    const io = req.app.locals.io;
    if (io) {
      const reportUserId =
        typeof serialized.userId === "object"
          ? serialized.userId._id || serialized.userId.id
          : serialized.userId;
      io.emit("reportLocationUpdated", {
        reportId: serialized._id,
        caseId: serialized.caseId,
        location: serialized.location,
        updatedAt: serialized.updatedAt,
        userId: reportUserId,
      });
    }

    res.json({
      success: true,
      message: "Report location updated",
      report: serialized,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
};
