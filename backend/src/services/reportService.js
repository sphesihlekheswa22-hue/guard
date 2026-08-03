
const Report = require("../models/report");
const Evidence = require("../models/evidence");
const AIAnalysis = require("../models/aiAnalysis");
const path = require("path");
const { isSoshanguveLocation } = require("../constants/soshanguve");

// Generate case ID in format: GBV-YYYYMMDD-XXXX
const generateCaseId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomSuffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `GBV-${year}${month}${day}-${randomSuffix}`;
};

const getTodayDateString = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};

const getMinimumIncidentDateString = () => {
  const minimumDate = new Date();
  minimumDate.setFullYear(minimumDate.getFullYear() - 10);
  minimumDate.setMinutes(minimumDate.getMinutes() - minimumDate.getTimezoneOffset());
  return minimumDate.toISOString().slice(0, 10);
};

exports.createReportService = async (user, data, files) => {
  const userId = user._id;
  const clientRequestId = typeof data.clientRequestId === "string" ? data.clientRequestId.trim() : "";
  const incidentDate = typeof data.date === "string" ? data.date.trim() : "";

  console.log("💾 [createReportService] Creating report for user:", userId);
  console.log("💾 [createReportService] User email:", user.email);
  console.log("💾 [createReportService] User role:", user.role);

  if (incidentDate && incidentDate > getTodayDateString()) {
    const error = new Error("Incident date cannot be in the future.");
    error.status = 400;
    throw error;
  }

  if (incidentDate && incidentDate < getMinimumIncidentDateString()) {
    const error = new Error("Incident date must be within the last 10 years.");
    error.status = 400;
    throw error;
  }

  if (clientRequestId) {
    const existingReport = await Report.findOne({ userId, clientRequestId }).populate("evidenceIds");
    if (existingReport) {
      console.log("[createReportService] Duplicate request detected, returning existing report:", existingReport.caseId);
      return {
        report: existingReport,
        evidenceIds: existingReport.evidenceIds || [],
        ai: null,
        duplicate: true
      };
    }
  }

  // Parse location (accepts either lat/lng or location string)
  let coordinates = [0, 0];
  let address = "";
  if (data.lng && data.lat) {
    coordinates = [parseFloat(data.lng), parseFloat(data.lat)];
  }
  if (data.location) {
    address = data.location;
  }

  const latitude = coordinates[1];
  const longitude = coordinates[0];
  const hasRealCoords = !(latitude === 0 && longitude === 0);

  if (
    !isSoshanguveLocation({
      address,
      latitude: hasRealCoords ? latitude : null,
      longitude: hasRealCoords ? longitude : null,
    })
  ) {
    const error = new Error(
      "SafeGuard only accepts incidents inside Soshanguve. Please use a Soshanguve location."
    );
    error.status = 400;
    throw error;
  }

  // Create report with generated case ID and initial status history
  let report;
  try {
    report = await Report.create({
      caseId: generateCaseId(),
      userId,
      clientRequestId: clientRequestId || undefined,
      policeStationId: user.policeStationId || data.policeStationId,
      preferredNgoId: user.preferredNgoId || data.preferredNgoId,
      description: data.description,
      incidentType: data.incidentType,
      location: {
        type: "Point",
        coordinates,
        address
      },
      status: "pending",
      statusHistory: [{
        status: "pending",
        changedBy: user._id,
        changedByRole: user.role,
        changedAt: new Date(),
        reason: "Report created"
      }]
    });
  } catch (err) {
    if (err && err.code === 11000 && clientRequestId) {
      const existingReport = await Report.findOne({ userId, clientRequestId }).populate("evidenceIds");
      if (existingReport) {
        console.log("[createReportService] Duplicate request raced, returning existing report:", existingReport.caseId);
        return {
          report: existingReport,
          evidenceIds: existingReport.evidenceIds || [],
          ai: null,
          duplicate: true
        };
      }
    }
    throw err;
  }

  // Save evidence files
  let evidenceIds = [];
  let evidenceDocuments = [];
  if (files && files.length > 0) {
    for (const file of files) {
      const type = file.mimetype.startsWith("image/")
        ? "image"
        : file.mimetype.startsWith("video/")
        ? "video"
        : file.mimetype.startsWith("audio/")
        ? "audio"
        : "document";
      const fileUrl = `/uploads/${path.basename(file.path)}`;
      const evidence = await Evidence.create({
        reportId: report._id,
        fileUrl,
        name: file.originalname,
        type
      });
      evidenceIds.push(evidence._id);
      evidenceDocuments.push(evidence);
    }
  }

  // Update report with evidence references
  report.evidenceIds = evidenceIds;
  await report.save();

  console.log("💾 [reportService] Report saved - userId field:", report.userId);
  console.log("💾 [reportService] Report saved - userId type:", typeof report.userId);
  console.log("💾 [reportService] Full report object keys:", Object.keys(report.toObject ? report.toObject() : report));

  // Optionally, create AI analysis
  const ai = await AIAnalysis.create({
    reportId: report._id,
    riskLevel: "high",
    insights: "Auto-detected urgent case"
  });

  return { report, evidenceIds: evidenceDocuments, ai };
};

exports.getAllReports = async (userId) => {
  return await Report.find({ userId }).populate("userId evidenceIds");
};
