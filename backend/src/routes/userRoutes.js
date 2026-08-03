const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const {
  getProfile,
  updateProfile,
  requestAccountDeletion,
  getChatbotContext,
  askChatbot,
} = require("../controllers/userController");
const { deleteEmergencyContact } = require("../controllers/emergencyContactController");


router.get("/profile", auth, getProfile);
router.get("/chatbot-context", auth, getChatbotContext);
router.post("/chatbot-ask", auth, askChatbot);
router.put("/profile", auth, updateProfile);
router.post("/profile/deletion-request", auth, requestAccountDeletion);
router.delete("/emergency-contact/:id", auth, deleteEmergencyContact);

module.exports = router;
