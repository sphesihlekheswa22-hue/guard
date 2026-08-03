const path = require("path");
const fs = require("fs");
const prisma = require("../config/prisma");
const { serializeEvidence } = require("../lib/serialize");
const { logAudit } = require("../services/auditService");

const uploadsRoot = path.resolve(__dirname, "../../uploads");

const resolveEvidencePath = (fileUrl = "") => {
  const raw = String(fileUrl || "").trim();
  if (!raw) return null;

  // Accept "/uploads/name.jpg", "uploads/name.jpg", or absolute paths under uploads
  const basename = path.basename(raw.replace(/\\/g, "/"));
  const absolute = path.resolve(uploadsRoot, basename);

  if (!absolute.startsWith(uploadsRoot)) return null;
  return absolute;
};

const guessContentType = (filePath = "", typeHint = "") => {
  const hint = String(typeHint || "").toLowerCase();
  if (hint === "image" || hint.startsWith("image/")) {
    if (hint.startsWith("image/")) return hint;
    return "image/jpeg";
  }
  if (hint === "audio" || hint.startsWith("audio/")) {
    if (hint.startsWith("audio/")) return hint;
    return "audio/webm";
  }
  if (hint === "video" || hint.startsWith("video/")) {
    if (hint.startsWith("video/")) return hint;
    return "video/mp4";
  }

  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext] || "application/octet-stream";
};

exports.uploadEvidence = async (req, res) => {
  const { reportId } = req.body;
  const fileUrl = req.file.path;

  const evidence = await prisma.evidence.create({
    data: {
      reportId,
      fileUrl,
      type: req.file.mimetype,
    },
  });

  res.json(serializeEvidence(evidence));
};

exports.logEvidenceView = async (req, res) => {
  try {
    const evidence = await prisma.evidence.findUnique({ where: { id: req.params.id } });
    await logAudit({
      user: req.user,
      action: "evidence_viewed",
      resourceType: "evidence",
      resourceId: req.params.id,
      resourceLabel: evidence?.name || req.params.id,
      details: `Viewed evidence ${evidence?.name || req.params.id}`,
      metadata: {
        evidenceType: evidence?.type || "",
        reportId: evidence?.reportId || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to log evidence view:", err);
    res.status(500).json({ error: "Failed to log evidence view" });
  }
};

exports.getEvidenceFile = async (req, res) => {
  try {
    const evidence = await prisma.evidence.findUnique({ where: { id: req.params.id } });
    if (!evidence) {
      return res.status(404).json({ msg: "Evidence not found" });
    }

    const absolute = resolveEvidencePath(evidence.fileUrl);
    if (!absolute) {
      return res.status(400).json({ msg: "Invalid evidence path" });
    }

    if (!fs.existsSync(absolute)) {
      console.error("Evidence file missing on disk:", absolute, "db:", evidence.fileUrl);
      return res.status(404).json({
        msg: "Evidence file is missing on the server. On Render free tier, uploaded files are lost after redeploy — ask the reporter to re-upload.",
      });
    }

    res.setHeader("Content-Type", guessContentType(absolute, evidence.type));
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.sendFile(absolute);
  } catch (err) {
    console.error("Failed to serve evidence file:", err);
    return res.status(500).json({ msg: "Failed to load evidence file" });
  }
};
