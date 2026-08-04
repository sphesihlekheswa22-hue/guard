const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { assessLocation, listHotspots } = require("../controllers/safetyMapController");

router.get("/assess", auth, assessLocation);
router.get("/hotspots", auth, listHotspots);

module.exports = router;
