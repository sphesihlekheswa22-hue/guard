const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

const {
  getDashboard,
  getUsers,
  deleteUserPermanently,
  getAuditLogs,
  getPublicOrganizations,
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization
} = require("../controllers/adminController");

router.get("/organizations/public", getPublicOrganizations);
router.get("/dashboard", auth, authorize("admin"), getDashboard);
router.get("/users", auth, authorize("admin"), getUsers);
router.delete("/users/:id", auth, authorize("admin"), deleteUserPermanently);
router.get("/audit-logs", auth, authorize("admin"), getAuditLogs);
router.get("/organizations", auth, authorize("admin"), getOrganizations);
router.post("/organizations", auth, authorize("admin"), createOrganization);
router.put("/organizations/:id", auth, authorize("admin"), updateOrganization);
router.delete("/organizations/:id", auth, authorize("admin"), deleteOrganization);

module.exports = router;
