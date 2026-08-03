const prisma = require("../config/prisma");

// DELETE /api/users/emergency-contact/:id
exports.deleteEmergencyContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const userId = req.user.id;

    const contact = await prisma.emergencyContact.deleteMany({
      where: { id: contactId, userId },
    });

    if (contact.count === 0) {
      return res.status(404).json({ message: "Contact not found or not authorized" });
    }

    res.json({ message: "Emergency contact deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};
