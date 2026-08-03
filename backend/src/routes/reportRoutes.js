const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const { createReport, getReports, getReportById, deleteReport, updateReport, updateReportLocation, getReportInteractions, addReportInteraction } = require("../controllers/reportController");

// Accept multiple files as 'evidence' field

router.post("/", auth, upload.array("evidence"), createReport);
router.get("/", auth, getReports);
router.get("/:id", auth, getReportById);
router.get("/:id/interactions", auth, getReportInteractions);
router.post("/:id/interactions", auth, addReportInteraction);
router.put("/:id/location", auth, updateReportLocation);
router.patch("/:id", auth, updateReport);
router.put("/:id/status", auth, updateReport);
router.delete("/:id", auth, deleteReport);

module.exports = router;
