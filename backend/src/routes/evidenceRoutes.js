const router = require("express").Router();
const upload = require("../middleware/upload");
const auth = require("../middleware/authMiddleware");
const {
  uploadEvidence,
  logEvidenceView,
  getEvidenceFile,
} = require("../controllers/evidenceController");

// Allow ?token= for <img src> / window.open (localStorage JWT can't be sent as a header there)
const authWithQueryToken = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${String(req.query.token)}`;
  }
  return auth(req, res, next);
};

router.post("/upload", auth, upload.single("file"), uploadEvidence);
router.post("/:id/view", auth, logEvidenceView);
router.get("/:id/file", authWithQueryToken, getEvidenceFile);

module.exports = router;
