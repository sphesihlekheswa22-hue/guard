const Case = require("../models/case");
const Alert = require("../models/alert");
const EmergencyContact = require("../models/emergencyContacts");
const User = require("../models/users");
const Notification = require("../models/notifications");
const { logAudit } = require("../services/auditService");
const { isSoshanguveLocation } = require("../constants/soshanguve");
const { buildSosNotifications } = require("../services/sosNotifyService");

const buildLocationUpdate = (body, currentLocation = {}) => {
  const address = typeof body.address === "string" ? body.address.trim().replace(/\s+/g, " ") : "";
  const hasLatitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
  const hasLongitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== "";

  if (!address && (!hasLatitude || !hasLongitude)) {
    const err = new Error("Address or coordinates are required");
    err.statusCode = 400;
    throw err;
  }

  const location = {
    type: "Point",
    coordinates: Array.isArray(currentLocation.coordinates) ? currentLocation.coordinates : [0, 0],
    address: address || currentLocation.address || "Location updated",
    accuracy: currentLocation.accuracy || null,
  };

  if (hasLatitude || hasLongitude) {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      const err = new Error("Valid latitude and longitude are required");
      err.statusCode = 400;
      throw err;
    }

    location.coordinates = [longitude, latitude];
  }

  if (body.accuracy !== undefined && body.accuracy !== null && body.accuracy !== "") {
    const accuracy = Number(body.accuracy);
    location.accuracy = Number.isFinite(accuracy) ? accuracy : null;
  }

  return location;
};

const getEmergencyContactsForUser = async (user, fallbackUserId) => {
  const contactsById = new Map();
  const contactIds = [];
  const userId = user?._id || fallbackUserId;

  if (Array.isArray(user?.emergencyContacts)) {
    user.emergencyContacts.forEach((contact) => {
      if (contact && contact._id) {
        contactsById.set(contact._id.toString(), contact);
        contactIds.push(contact._id);
      } else if (contact) {
        contactIds.push(contact);
      }
    });
  }

  const lookupFilters = [];
  if (userId) lookupFilters.push({ userId });
  if (contactIds.length > 0) lookupFilters.push({ _id: { $in: contactIds } });

  const contacts = lookupFilters.length > 0
    ? await EmergencyContact.find({ $or: lookupFilters })
    : [];

  contacts.forEach((contact) => {
    contactsById.set(contact._id.toString(), contact);
  });

  // Keep contacts that can be reached by email and/or WhatsApp (phone).
  // Previously this returned only contacts with email, which dropped WhatsApp-only contacts.
  return Array.from(contactsById.values()).filter((contact) => {
    const hasEmail = Boolean(String(contact.email || "").trim());
    const phoneDigits = String(contact.phone || "").replace(/\D/g, "");
    const hasPhone = phoneDigits.length >= 9;
    return hasEmail || hasPhone;
  });
};

exports.createCase = async (req, res) => {
  const { reportId, assignedTo } = req.body;

  const newCase = await Case.create({
    userId: req.userId,
    reportId,
    assignedTo,
    type: "report",
    status: "active"
  });

  res.json(newCase);
};

exports.updateCaseStatus = async (req, res) => {
  const { status } = req.body;
  const existingCase = await Case.findById(req.params.id);

  const updated = await Case.findByIdAndUpdate(
    req.params.id,
    { status },
    { returnDocument: 'after' }
  );

  if (updated) {
    await logAudit({
      user: req.user,
      action: "case_status_changed",
      resourceType: "case",
      resourceId: updated._id,
      resourceLabel: updated.caseId,
      details: `Changed case status from ${existingCase?.status || "unknown"} to ${status}`,
      metadata: { oldStatus: existingCase?.status || "", newStatus: status }
    });
  }

  res.json(updated);
};

/**
 * Create an SOS emergency case
 * Requires: userId (from auth), latitude, longitude, address (optional)
 */
exports.createSOSCase = async (req, res) => {
  try {
    if (req.user.role !== "reporter") {
      return res.status(403).json({
        error: "Only reporters can trigger SOS alerts.",
      });
    }

    const { latitude, longitude, address, accuracy } = req.body;
    const userId = req.user._id || req.user.id;

    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return res.status(400).json({
        error: "Latitude and longitude are required for SOS cases"
      });
    }

    if (
      !isSoshanguveLocation({
        address,
        latitude,
        longitude,
      })
    ) {
      return res.status(400).json({
        error: "SafeGuard SOS is only available inside Soshanguve. Move to a Soshanguve location or use a Soshanguve address.",
      });
    }

    let policeStationId = req.user.policeStationId ? String(req.user.policeStationId) : "";
    if (!policeStationId) {
      const PoliceStation = require("../models/policeStation");
      const station = await PoliceStation.findOne({
        $or: [{ name: /soshanguve/i }, { code: /soshanguve/i }],
      }).select("_id");
      policeStationId = station?._id ? String(station._id) : "";
    }

    // Generate caseId in format "SOS-XXXXXX"
    const randomId = Math.random().toString(16).substring(2, 8).toUpperCase().padEnd(6, "0");
    const caseId = `SOS-${randomId}`;
    const sosTriggeredAt = new Date();

    const locationPayload = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)],
      address: address || "Location captured",
      accuracy: accuracy || null,
    };

    const sosCase = await Case.create({
      userId,
      policeStationId,
      caseId,
      type: "emergency",
      priority: "critical",
      status: "active",
      location: locationPayload,
      sosTriggeredAt,
    });

    const alert = await Alert.create({
      userId,
      caseId: sosCase._id,
      policeStationId,
      location: locationPayload,
      type: "sos",
      status: "active",
    });

    const user = await User.findById(userId).populate("emergencyContacts");
    const emergencyContacts = await getEmergencyContactsForUser(user || req.user, userId);
    console.log("[SOS] Emergency contact lookup:", {
      userId: String(userId),
      contacts: emergencyContacts.length,
      withEmail: emergencyContacts.filter((c) => c.email).length,
      withPhone: emergencyContacts.filter((c) => c.phone).length,
    });

    const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const locationText = `${address || "Location captured"} (${mapLink})`;
    const sosNotifications = buildSosNotifications({
      emergencyContacts,
      reporterName: user?.fullName || user?.name || "A SafeGuard user",
      locationText,
      mapLink,
      time: sosTriggeredAt.toLocaleString(),
    });

    // Persist notification intent for audit/demo evidence (email is completed client-side via EmailJS).
    sosCase.notifiedContacts = emergencyContacts.map((contact) => {
      const methods = [];
      if (contact.email) methods.push("email");
      if (contact.phone) methods.push("whatsapp");
      return {
        contactId: contact._id,
        notifiedAt: sosTriggeredAt,
        method: methods.join("+") || "none",
      };
    });
    await sosCase.save();

    await logAudit({
      user: req.user,
      action: "sos_triggered",
      resourceType: "case",
      resourceId: sosCase._id,
      resourceLabel: sosCase.caseId,
      details: `SOS triggered at ${locationPayload.address}`,
      metadata: {
        alertId: alert._id,
        policeStationId,
        mapLink,
        whatsappLinks: sosNotifications.whatsapp.length,
        emailTargets: sosNotifications.emailTargets.length,
        contacts: emergencyContacts.length,
      },
    });

    // Notify police officers assigned to this station
    if (policeStationId) {
      const officers = await User.find({
        role: { $in: ["officer", "authority"] },
        policeStationId,
      }).select("_id");

      if (officers.length > 0) {
        await Notification.insertMany(
          officers.map((officer) => ({
            userId: officer._id,
            message: `SOS ${sosCase.caseId} triggered by ${user?.fullName || "a reporter"} at ${locationPayload.address}`,
            read: false,
          }))
        );
      }
    }

    // Emails are sent by the reporter browser via EmailJS (public key). Backend returns targets + WhatsApp links.
    const emailNotifications = {
      total: emergencyContacts.length,
      emailTargets: sosNotifications.emailTargets.length,
      sent: 0,
      skipped: emergencyContacts.length - sosNotifications.emailTargets.length,
      failed: 0,
      pendingClientSend: true,
      channel: "emailjs-client",
      results: sosNotifications.emailTargets.map((contact) => ({
        contactId: contact._id,
        contactName: contact.fullName || contact.name || "Emergency contact",
        email: contact.email,
        success: false,
        skipped: false,
        reason: "Pending EmailJS send from client",
      })),
    };

    const io = req.app.locals.io;
    if (io) {
      io.emit("sosAlertReceived", {
        sosId: sosCase._id,
        alertId: alert._id,
        caseId: sosCase.caseId,
        userId,
        userName: user?.fullName || user?.name || "Unknown User",
        userPhone: user?.phone || "N/A",
        policeStationId,
        location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          address: locationPayload.address,
          accuracy,
        },
        timestamp: sosTriggeredAt,
        emergencyContacts,
        mapLink,
        whatsappNotifications: sosNotifications.whatsapp,
      });
    }

    const populatedCase = await sosCase.populate("userId");

    res.status(201).json({
      success: true,
      message: "SOS case created successfully",
      case: populatedCase,
      alert,
      emergencyContacts,
      emailNotifications,
      whatsappNotifications: sosNotifications.whatsapp,
      sosMessage: sosNotifications.message,
      notificationSummary: sosNotifications.summary,
    });
  } catch (error) {
    console.error("Error creating SOS case:", error);
    res.status(500).json({
      error: "Failed to create SOS case",
      details: error.message
    });
  }
};

/**
 * Get nearby responders for an SOS location
 */
exports.getNearbyResponders = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "Latitude and longitude are required"
      });
    }

    // Find cases within maxDistance meters of the location
    const nearbyCases = await Case.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).populate("assignedTo");

    res.json({
      success: true,
      nearbyCases
    });
  } catch (error) {
    console.error("Error getting nearby responders:", error);
    res.status(500).json({
      error: "Failed to get nearby responders",
      details: error.message
    });
  }
};

/**
 * Get user's cases (reports and emergency cases)
 */
exports.getUserCases = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const userCases = await Case.find({ userId })
      .populate("userId assignedTo")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: userCases.length,
      cases: userCases.map(c => ({
        _id: c._id,
        id: c._id,
        caseId: c.caseId || c._id.toString().slice(-8).toUpperCase(),
        type: c.type,
        incidentType: c.type === "emergency" ? "Emergency Alert (SOS)" : "Report",
        priority: c.priority,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        location: c.location,
        description: c.type === "emergency" ? "SOS Emergency Alert" : "Case",
        sosTriggeredAt: c.sosTriggeredAt,
        notifiedContacts: c.notifiedContacts,
        policeStationId: c.policeStationId,
      }))
    });
  } catch (error) {
    console.error("Error fetching user cases:", error);
    res.status(500).json({
      error: "Failed to fetch cases",
      details: error.message
    });
  }
};

/**
 * Update live location for an active SOS case
 * Used for continuous location tracking
 */
exports.updateLiveLocation = async (req, res) => {
  try {
    const { caseId } = req.params;
    const userId = String(req.user._id || req.user.id);

    const sosCase = await Case.findById(caseId);
    if (!sosCase) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (String(sosCase.userId) !== userId) {
      return res.status(403).json({ error: "Unauthorized: Case does not belong to this user" });
    }

    sosCase.location = buildLocationUpdate(req.body, sosCase.location || {});
    await sosCase.save();
    await Alert.updateMany({ caseId: sosCase._id, userId }, { location: sosCase.location });
    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "case",
      resourceId: sosCase._id,
      resourceLabel: sosCase.caseId,
      details: "Updated SOS case location",
      metadata: { location: sosCase.location }
    });

    const io = req.app.locals.io;
    if (io) {
      io.emit("caseLocationUpdated", {
        caseId: sosCase._id,
        displayCaseId: sosCase.caseId,
        location: sosCase.location,
        updatedAt: sosCase.updatedAt,
        userId: sosCase.userId,
      });
    }

    res.json({
      success: true,
      message: "Live location updated",
      case: {
        _id: sosCase._id,
        location: sosCase.location,
        updatedAt: sosCase.updatedAt
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Error updating live location:", error);
    res.status(500).json({
      error: "Failed to update live location",
      details: error.message
    });
  }
};

/**
 * Delete a case (SOS emergency case) and associated alerts
 * Only allows user to delete their own cases
 */
exports.deleteCase = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the case
    const caseToDelete = await Case.findById(id);

    if (!caseToDelete) {
      return res.status(404).json({ error: "Case not found" });
    }

    // Verify ownership
    if (caseToDelete.userId.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized: Case does not belong to this user" });
    }

    // Delete the case
    await Case.deleteOne({ _id: id });

    // Also delete associated alerts
    await Alert.deleteMany({ caseId: id });

    res.json({
      success: true,
      message: "Case and associated alerts deleted successfully",
      id: id
    });
  } catch (error) {
    console.error("Error deleting case:", error);
    res.status(500).json({
      error: "Failed to delete case",
      details: error.message
    });
  }
};
