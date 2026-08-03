const Evidence = require("../models/evidence");
const { logAudit } = require("../services/auditService");

exports.uploadEvidence = async (req, res) => {
  const { reportId } = req.body;

  const fileUrl = req.file.path;

  const evidence = await Evidence.create({
    reportId,
    fileUrl,
    type: req.file.mimetype
  });

  res.json(evidence);
};

exports.logEvidenceView = async (req, res) => {
  try {
    const evidence = await Evidence.findById(req.params.id);
    await logAudit({
      user: req.user,
      action: "evidence_viewed",
      resourceType: "evidence",
      resourceId: req.params.id,
      resourceLabel: evidence?.name || req.params.id,
      details: `Viewed evidence ${evidence?.name || req.params.id}`,
      metadata: {
        evidenceType: evidence?.type || "",
        reportId: evidence?.reportId || null
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to log evidence view:", err);
    res.status(500).json({ error: "Failed to log evidence view" });
  }
};
