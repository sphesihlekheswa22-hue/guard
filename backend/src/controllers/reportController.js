
const { createReportService, getAllReports } = require("../services/reportService");
const Report = require("../models/report");
const { logAudit } = require("../services/auditService");

const NGO_ACTIVE_REFERRAL_STATUSES = ["referred_to_ngo", "call_initiated", "arranged_counselling"];
const referralStatusFilter = {
  $or: [
    { status: { $in: NGO_ACTIVE_REFERRAL_STATUSES } },
    { "statusHistory.status": "referred_to_ngo" }
  ]
};

const getNgoReferralFilter = (ngoId) => ({
  $and: [
    referralStatusFilter,
    {
      $or: [
        { referredNgoId: ngoId },
        {
          preferredNgoId: ngoId,
          $or: [
            { referredNgoId: { $exists: false } },
            { referredNgoId: null },
            { referredNgoId: "" }
          ]
        }
      ]
    }
  ]
});

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

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
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

// Get interactions for a report
exports.getReportInteractions = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id).populate("interactions.createdBy", "fullName name email role");
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report.interactions || []);
  } catch (err) {
    next(err);
  }
};

// Add interaction to a report
exports.addReportInteraction = async (req, res, next) => {
  try {
    const { type, description } = req.body;
    if (!type || !description) {
      return res.status(400).json({ message: "Type and description are required" });
    }
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    
    const interaction = {
      type,
      description,
      createdBy: req.user.id,
      createdAt: new Date()
    };
    
    report.interactions.push(interaction);
    await report.save();
    
    // Populate the createdBy field for the response
    const updatedReport = await Report.findById(req.params.id)
      .populate("interactions.createdBy", "name email fullName");
    const newInteraction = updatedReport.interactions[updatedReport.interactions.length - 1];
    
    // Emit socket event to update all connected clients in real-time
    const io = req.app.locals.io;
    if (io) {
      io.emit("reportInteractionAdded", {
        reportId: report._id,
        caseId: report.caseId,
        interaction: newInteraction,
        addedBy: req.user.email,
        addedByRole: req.user.role
      });
      console.log(`🔌 [addReportInteraction] Socket event emitted for new interaction`);
    }
    
    res.status(201).json(newInteraction);
  } catch (err) {
    next(err);
  }
};

exports.createReport = async (req, res, next) => {
  try {
    // Pass user object to service so police station and NGO metadata can be saved
    const result = await createReportService(req.user, req.body, req.files);
    
    console.log("📋 Report created:", result.report.caseId, "ID:", result.report._id);
    
    // Debug userId
    console.log("📋 [DEBUG] result.report.userId:", result.report.userId);
    console.log("📋 [DEBUG] result.report.userId type:", typeof result.report.userId);
    console.log("📋 [DEBUG] result.report.userId is null?", result.report.userId === null);
    console.log("📋 [DEBUG] result.report.userId is undefined?", result.report.userId === undefined);
    
    // Emit socket event to notify all connected clients about the new report submission
    try {
      if (result.duplicate) {
        console.log("[createReport] Duplicate request returned existing report, skipping socket broadcast:", result.report.caseId);
        return res.json(result);
      }

      const io = req.app.locals.io;
      if (!io) {
        console.warn("⚠️  Socket.IO instance not available on app.locals");
      } else {
        // Convert evidenceIds to plain objects for JSON serialization
        const evidenceArray = (result.evidenceIds || []).map(ev => ({
          fileUrl: ev.fileUrl,
          type: ev.type,
          name: ev.name
        }));
        
        const reportData = {
          reportId: result.report._id ? result.report._id.toString() : "",
          caseId: result.report.caseId || "",
          incidentType: result.report.incidentType || "",
          location: result.report.location?.address || (result.report.location ? JSON.stringify(result.report.location) : ""),
          date: result.report.createdAt ? result.report.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          description: result.report.description || "",
          evidenceIds: evidenceArray,
          status: result.report.status || "pending",
          createdAt: result.report.createdAt ? result.report.createdAt.toISOString() : new Date().toISOString(),
          userId: result.report.userId ? result.report.userId.toString() : "",
        };
        
        console.log("🔌 Broadcasting reportSubmitted event:", JSON.stringify(reportData, null, 2));
        io.emit("reportSubmitted", reportData);
        console.log("✅ Socket event emitted successfully for case:", reportData.caseId);
      }
    } catch (socketErr) {
      console.error("❌ Socket emit error:", socketErr);
      // Don't fail the API call if socket emit fails
    }
    
    res.json(result);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ msg: err.message, error: err.message });
    }
    next(err);
  }
};

const getStationFilter = (user) => {
  // Authority/Officer: see all reports for their police station
  if ((user.role === "authority" || user.role === "officer") && user.policeStationId) {
    return { policeStationId: user.policeStationId };
  }

  // NGO/NGO Worker: see all cases referred to them.
  // The frontend separates active referrals from resolved referrals.
  if ((user.role === "ngo" || user.role === "ngo_worker") && user.ngoId) {
    return getNgoReferralFilter(user.ngoId);
  }

  return null;
};

exports.getReports = async (req, res, next) => {
  try {
    let data;
    const stationFilter = getStationFilter(req.user);

    console.log("📥 [getReports] Called by user:", req.user.email, "Role:", req.user.role);
    console.log("📥 [getReports] User ID:", req.user.id);
    console.log("📥 [getReports] User._id:", req.user._id);
    console.log("📥 [getReports] Station filter:", stationFilter ? JSON.stringify(stationFilter) : "null (will use userId filter)");

    if (stationFilter) {
      console.log("📥 [getReports] Using filter:", stationFilter);
      // For NGO users: show every report referred to the NGO.
      if (req.user.role === "ngo" || req.user.role === "ngo_worker") {
        console.log("📥 [getReports] NGO/NGO Worker: Filtering for all referred cases for NGO");
      }
      data = await Report.find(stationFilter)
        .populate("userId evidenceIds")
        .populate("statusHistory.changedBy", "fullName name email role policeStationName")
        .populate("interactions.createdBy", "fullName name email role")
        .sort({ createdAt: -1 });
    } else {
      console.log("📥 [getReports] Using userId filter. Query: { userId:", req.user.id, "}");
      console.log("📥 [getReports] Searching for reports where userId equals:", req.user.id);
      data = await getAllReports(req.user.id);
      
      // Also log what we got back
      const directQuery = await Report.find({ userId: req.user.id }).select("_id caseId userId createdAt");
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

    res.json(data);
  } catch (err) {
    console.error("📥 [getReports] Error:", err.message);
    next(err);
  }
};

exports.getReportById = async (req, res, next) => {
  try {
    let report;
    const stationFilter = getStationFilter(req.user);

    if (stationFilter) {
      report = await Report.findOne({ _id: req.params.id, ...stationFilter })
        .populate("userId evidenceIds")
        .populate("statusHistory.changedBy", "fullName name email role policeStationName")
        .populate("interactions.createdBy", "fullName name email role");
    } else {
      report = await Report.findOne({ _id: req.params.id, userId: req.user.id })
        .populate("userId evidenceIds")
        .populate("statusHistory.changedBy", "fullName name email role policeStationName")
        .populate("interactions.createdBy", "fullName name email role");
    }

    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a report by ID (only if user is the owner)
 */
exports.deleteReport = async (req, res, next) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    await Report.deleteOne({ _id: req.params.id });
    
    res.json({
      success: true,
      message: "Report deleted successfully",
      id: req.params.id
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update report status (for authority users)
 */
exports.updateReport = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // Find the report first to get the old status
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    const oldStatus = report.status;
    console.log(`📝 [updateReport] Status change: ${oldStatus} → ${status} by ${req.user.email}`);

    // Add to status history
    if (!report.statusHistory) {
      report.statusHistory = [];
    }
    report.statusHistory.push({
      status: status,
      changedBy: req.user._id,
      changedByRole: req.user.role,
      changedAt: new Date(),
      reason: `Status changed from ${oldStatus} to ${status}`
    });

    // Update the status and timestamp
    report.status = status;
    if (status === "referred_to_ngo") {
      if (!report.preferredNgoId) {
        return res.status(400).json({ message: "This report does not have a reporter-selected NGO to refer to." });
      }

      report.referredNgoId = report.preferredNgoId;
      report.referredNgoName = report.referredNgoName || "";
    }
    report.updatedAt = new Date();
    await report.save();
    await logAudit({
      user: req.user,
      action: "case_status_changed",
      resourceType: "report",
      resourceId: report._id,
      resourceLabel: report.caseId,
      details: `Changed report status from ${oldStatus} to ${status}`,
      metadata: { oldStatus, newStatus: status }
    });

    // Populate the user info for response
    await report.populate("userId evidenceIds");

    console.log(`✅ [updateReport] Status history updated with entry`);

    // Emit socket event to update all connected clients
    const io = req.app.locals.io;
    if (io) {
      io.emit("reportStatusUpdated", {
        reportId: report._id,
        caseId: report.caseId,
        status: report.status,
        oldStatus: oldStatus,
        updatedAt: report.updatedAt,
        userId: report.userId._id,
        changedBy: req.user.email,
        changedByRole: req.user.role
      });
      console.log(`🔌 [updateReport] Socket event emitted for status update`);
    }

    res.json({
      success: true,
      message: `Report status updated from ${oldStatus} to ${status}`,
      report
    });
  } catch (err) {
    next(err);
  }
};

exports.updateReportLocation = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only update the location for your own report" });
    }

    report.location = buildLocationUpdate(req.body, report.location || {});
    report.updatedAt = new Date();
    await report.save();
    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "report",
      resourceId: report._id,
      resourceLabel: report.caseId,
      details: "Updated report location",
      metadata: { location: report.location }
    });
    await report.populate("userId evidenceIds");

    const io = req.app.locals.io;
    if (io) {
      io.emit("reportLocationUpdated", {
        reportId: report._id,
        caseId: report.caseId,
        location: report.location,
        updatedAt: report.updatedAt,
        userId: report.userId._id,
      });
    }

    res.json({
      success: true,
      message: "Report location updated",
      report,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
};
