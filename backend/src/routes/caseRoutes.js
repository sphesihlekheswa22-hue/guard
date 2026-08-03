const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

const {
  createCase,
  updateCaseStatus,
  createSOSCase,
  getNearbyResponders,
  getUserCases,
  updateLiveLocation,
  deleteCase
} = require("../controllers/caseController");

router.post("/", auth, authorize("authority", "admin"), createCase);
router.patch("/:id", auth, authorize("authority", "admin"), updateCaseStatus);

// Get user's cases
router.get("/me", auth, getUserCases);

// SOS endpoints
router.post("/sos/trigger", auth, createSOSCase);
router.get("/sos/nearby", auth, getNearbyResponders);

// Live location update for active SOS cases
router.put("/:caseId/location", auth, updateLiveLocation);

// Delete case (and associated alerts)
router.delete("/:id", auth, deleteCase);

module.exports = router;