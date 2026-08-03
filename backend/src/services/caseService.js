const Case = require("../models/case");
const EmergencyContact = require("../models/emergencyContacts");
const Notification = require("../models/notifications");

exports.createCaseService = async (data) => {
  return await Case.create({
    userId: data.userId,
    reportId: data.reportId,
    assignedTo: data.assignedTo,
    type: "report",
    status: "active"
  });
};

exports.updateCaseStatusService = async (id, status) => {
  return await Case.findByIdAndUpdate(
    id,
    { status },
    { returnDocument: 'after' }
  );
};

/**
 * Create SOS case and notify emergency contacts
 */
exports.createSOSCaseService = async (userId, location) => {
  try {
    const sosCase = await Case.create({
      userId,
      type: "emergency",
      priority: "critical",
      status: "active",
      location: {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
        address: location.address || "Location captured",
        accuracy: location.accuracy || null
      },
      sosTriggeredAt: new Date()
    });

    return await sosCase.populate("userId");
  } catch (error) {
    throw new Error(`Failed to create SOS case: ${error.message}`);
  }
};

/**
 * Get emergency contacts for a user
 */
exports.getUserEmergencyContacts = async (userId) => {
  try {
    const contacts = await EmergencyContact.find({ userId });
    return contacts;
  } catch (error) {
    throw new Error(`Failed to fetch emergency contacts: ${error.message}`);
  }
};

/**
 * Create notifications for emergency contacts
 */
exports.notifyEmergencyContacts = async (sosCase, userInfo, locationLink) => {
  try {
    const contacts = await this.getUserEmergencyContacts(sosCase.userId);
    
    const notificationPromises = contacts.map(contact => {
      const message = `🚨 Emergency Alert: ${userInfo.fullName} may be in danger. Last known location: ${locationLink}. Please act immediately.`;
      
      return Notification.create({
        userId: sosCase.userId, // Store for the person who triggered SOS
        message,
        read: false
      });
    });

    await Promise.all(notificationPromises);
    return contacts.length;
  } catch (error) {
    throw new Error(`Failed to notify emergency contacts: ${error.message}`);
  }
};