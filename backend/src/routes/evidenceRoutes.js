const router = require("express").Router();
const upload = require("../middleware/upload");
const auth = require("../middleware/authMiddleware");
const { uploadEvidence, logEvidenceView } = require("../controllers/evidenceController");

router.post("/upload", auth, upload.single("file"), uploadEvidence);
router.post("/:id/view", auth, logEvidenceView);

module.exports = router;
