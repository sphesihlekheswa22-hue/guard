const prisma = require("../config/prisma");
const path = require("path");
const { isSoshanguveLocation } = require("../constants/soshanguve");
const { serializeReport, serializeEvidence, withId, userIdOf } = require("../lib/serialize");

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

const reportInclude = {
  user: true,
  evidence: true,
  aiAnalysis: true,
};

const formatServiceResult = (report, evidenceDocuments, ai, duplicate = false) => ({
  report: serializeReport({ ...report, evidence: evidenceDocuments }),
  evidenceIds: (evidenceDocuments || []).map(serializeEvidence),
  ai: ai ? withId(ai) : null,
  ...(duplicate ? { duplicate: true } : {}),
});

const findDuplicateReport = async (userId, clientRequestId) => {
  if (!clientRequestId) return null;
  return prisma.report.findFirst({
    where: { userId, clientRequestId },
    include: reportInclude,
  });
};

exports.createReportService = async (user, data, files) => {
  const userId = userIdOf(user);
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
    const existingReport = await findDuplicateReport(userId, clientRequestId);
    if (existingReport) {
      console.log(
        "[createReportService] Duplicate request detected, returning existing report:",
        existingReport.caseId
      );
      return formatServiceResult(
        existingReport,
        existingReport.evidence || [],
        existingReport.aiAnalysis,
        true
      );
    }
  }

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

  const statusHistory = [
    {
      status: "pending",
      changedBy: userId,
      changedByRole: user.role,
      changedAt: new Date().toISOString(),
      reason: "Report created",
    },
  ];

  let report;
  try {
    report = await prisma.report.create({
      data: {
        caseId: generateCaseId(),
        userId,
        clientRequestId: clientRequestId || null,
        policeStationId: user.policeStationId || data.policeStationId || null,
        preferredNgoId: user.preferredNgoId || data.preferredNgoId || null,
        description: data.description || null,
        incidentType: data.incidentType || null,
        location: {
          type: "Point",
          coordinates,
          address,
        },
        status: "pending",
        statusHistory,
      },
      include: reportInclude,
    });
  } catch (err) {
    if (err?.code === "P2002" && clientRequestId) {
      const existingReport = await findDuplicateReport(userId, clientRequestId);
      if (existingReport) {
        console.log(
          "[createReportService] Duplicate request raced, returning existing report:",
          existingReport.caseId
        );
        return formatServiceResult(
          existingReport,
          existingReport.evidence || [],
          existingReport.aiAnalysis,
          true
        );
      }
    }
    throw err;
  }

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
      const evidence = await prisma.evidence.create({
        data: {
          reportId: report.id,
          fileUrl,
          name: file.originalname,
          type,
          userId,
        },
      });
      evidenceDocuments.push(evidence);
    }
  }

  console.log("💾 [reportService] Report saved - userId field:", report.userId);

  const ai = await prisma.aiAnalysis.create({
    data: {
      reportId: report.id,
      riskLevel: "high",
      insights: "Auto-detected urgent case",
    },
  });

  const reportWithEvidence = {
    ...report,
    evidence: evidenceDocuments,
  };

  return formatServiceResult(reportWithEvidence, evidenceDocuments, ai);
};

exports.getAllReports = async (userId) =>
  prisma.report.findMany({
    where: { userId },
    include: reportInclude,
    orderBy: { createdAt: "desc" },
  });

exports.reportInclude = reportInclude;
