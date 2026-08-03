const EmergencyContact = require("../models/emergencyContacts");
const User = require("../models/users");

// DELETE /api/users/emergency-contact/:id
exports.deleteEmergencyContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const userId = req.user.id;
    // Find and remove the contact
    const contact = await EmergencyContact.findOneAndDelete({ _id: contactId, userId });
    if (!contact) {
      return res.status(404).json({ message: "Contact not found or not authorized" });
    }
    // Remove from user's emergencyContacts array
    await User.findByIdAndUpdate(userId, { $pull: { emergencyContacts: contactId } });
    res.json({ message: "Emergency contact deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};
