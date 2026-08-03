const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

const { updateLocation } = require("../controllers/locationController");

router.post("/update", auth, updateLocation);

module.exports = router;