const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

const {
  getNotifications,
  markAsRead
} = require("../controllers/notificationController");

router.get("/", auth, getNotifications);
router.patch("/:id/read", auth, markAsRead);

module.exports = router;