const prisma = require("../config/prisma");
const { serializeCase } = require("../lib/serialize");

exports.createCaseService = async (data) => {
  const created = await prisma.case.create({
    data: {
      userId: data.userId,
      reportId: data.reportId || null,
      assignedToId: data.assignedTo || null,
      type: "report",
      status: "active",
    },
  });
  return serializeCase(created);
};

exports.updateCaseStatusService = async (id, status) => {
  const updated = await prisma.case.update({
    where: { id },
    data: { status },
  });
  return serializeCase(updated);
};

/**
 * Create SOS case and notify emergency contacts
 */
exports.createSOSCaseService = async (userId, location) => {
  try {
    const sosCase = await prisma.case.create({
      data: {
        userId,
        type: "emergency",
        priority: "critical",
        status: "active",
        location: {
          type: "Point",
          coordinates: [location.longitude, location.latitude],
          address: location.address || "Location captured",
          accuracy: location.accuracy || null,
        },
        sosTriggeredAt: new Date(),
      },
    });

    const populated = await prisma.case.findUnique({
      where: { id: sosCase.id },
      include: { user: true },
    });

    return serializeCase(populated);
  } catch (error) {
    throw new Error(`Failed to create SOS case: ${error.message}`);
  }
};

/**
 * Get emergency contacts for a user
 */
exports.getUserEmergencyContacts = async (userId) => {
  try {
    return await prisma.emergencyContact.findMany({
      where: { userId: String(userId) },
    });
  } catch (error) {
    throw new Error(`Failed to fetch emergency contacts: ${error.message}`);
  }
};

/**
 * Create notifications for emergency contacts
 */
exports.notifyEmergencyContacts = async (sosCase, userInfo, locationLink) => {
  try {
    const contacts = await exports.getUserEmergencyContacts(sosCase.userId);

    await Promise.all(
      contacts.map((contact) => {
        const message = `🚨 Emergency Alert: ${userInfo.fullName} may be in danger. Last known location: ${locationLink}. Please act immediately.`;

        return prisma.notification.create({
          data: {
            userId: sosCase.userId,
            message,
            read: false,
          },
        });
      })
    );

    return contacts.length;
  } catch (error) {
    throw new Error(`Failed to notify emergency contacts: ${error.message}`);
  }
};
