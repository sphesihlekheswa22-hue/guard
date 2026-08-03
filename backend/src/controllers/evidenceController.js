const prisma = require("../config/prisma");
const { serializeEvidence } = require("../lib/serialize");
const { logAudit } = require("../services/auditService");

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
