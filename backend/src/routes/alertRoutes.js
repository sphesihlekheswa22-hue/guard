const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

const {
  createAlert,
  triggerAlert,
  resolveAlert,
  updateAlertStatus,
  getAllActiveAlerts,
  getResolvedAlerts,
  getUserAlerts,
  getAlertStats,
  getSystemAlertStats,
  getAlert,
  updateAlertLocation,
  deleteAlert
} = require("../controllers/alertController");

// Create an alert (new endpoint for SOS)
router.post("/", auth, createAlert);

// Get user's alerts
router.get("/me", auth, getUserAlerts);

// Get alert statistics
router.get("/me/stats", auth, getAlertStats);

// Get system-wide alert statistics
router.get("/stats", auth, getSystemAlertStats);

// Get all active alerts (for authority users)
router.get("/active", auth, getAllActiveAlerts);

// Get resolved/acknowledged alerts
router.get("/resolved", auth, getResolvedAlerts);

// Get specific alert details
router.get("/:id", auth, getAlert);

// Update alert status
router.patch("/:id/status", auth, updateAlertStatus);
router.put("/:id/location", auth, updateAlertLocation);

// Legacy endpoints
router.post("/trigger", auth, triggerAlert);
router.patch("/:id/resolve", auth, resolveAlert);
router.delete("/:id", auth, deleteAlert);

module.exports = router;
