const prisma = require("../config/prisma");
const { serializeUser, serializeCase, serializeAlert, withId, userIdOf } = require("../lib/serialize");
const { logAudit } = require("../services/auditService");
const { isSoshanguveLocation } = require("../constants/soshanguve");
const { buildSosNotifications } = require("../services/sosNotifyService");

const CASE_INCLUDE = {
  user: true,
  assignedTo: true,
};

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

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getEmergencyContactsForUser = async (userId) => {
  const contacts = await prisma.emergencyContact.findMany({
    where: { userId: String(userId) },
  });

  return contacts.filter((contact) => {
    const hasEmail = Boolean(String(contact.email || "").trim());
    const phoneDigits = String(contact.phone || "").replace(/\D/g, "");
    const hasPhone = phoneDigits.length >= 9;
    return hasEmail || hasPhone;
  });
};

exports.createCase = async (req, res) => {
  const { reportId, assignedTo } = req.body;

  const newCase = await prisma.case.create({
    data: {
      userId: req.userId,
      reportId: reportId || null,
      assignedToId: assignedTo || null,
      type: "report",
      status: "active",
    },
  });

  res.json(serializeCase(newCase));
};

exports.updateCaseStatus = async (req, res) => {
  const { status } = req.body;
  const existingCase = await prisma.case.findUnique({
    where: { id: req.params.id },
  });

  const updated = await prisma.case.update({
    where: { id: req.params.id },
    data: { status },
  });

  if (updated) {
    await logAudit({
      user: req.user,
      action: "case_status_changed",
      resourceType: "case",
      resourceId: updated.id,
      resourceLabel: updated.caseId,
      details: `Changed case status from ${existingCase?.status || "unknown"} to ${status}`,
      metadata: { oldStatus: existingCase?.status || "", newStatus: status },
    });
  }

  res.json(serializeCase(updated));
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
    const userId = userIdOf(req.user);

    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return res.status(400).json({
        error: "Latitude and longitude are required for SOS cases",
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
      const station = await prisma.policeStation.findFirst({
        where: {
          OR: [
            { name: { contains: "soshanguve", mode: "insensitive" } },
            { code: { contains: "soshanguve", mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      policeStationId = station?.id ? String(station.id) : "";
    }

    const randomId = Math.random().toString(16).substring(2, 8).toUpperCase().padEnd(6, "0");
    const caseId = `SOS-${randomId}`;
    const sosTriggeredAt = new Date();

    const locationPayload = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)],
      address: address || "Location captured",
      accuracy: accuracy || null,
    };

    const sosCase = await prisma.case.create({
      data: {
        userId,
        policeStationId: policeStationId || null,
        caseId,
        type: "emergency",
        priority: "critical",
        status: "active",
        location: locationPayload,
        sosTriggeredAt,
      },
    });

    const alert = await prisma.alert.create({
      data: {
        userId,
        caseId: sosCase.id,
        policeStationId: policeStationId || null,
        location: locationPayload,
        type: "sos",
        status: "active",
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { emergencyContacts: true },
    });
    const emergencyContacts = await getEmergencyContactsForUser(userId);
    console.log("[SOS] Emergency contact lookup:", {
      userId: String(userId),
      contacts: emergencyContacts.length,
      withEmail: emergencyContacts.filter((c) => c.email).length,
      withPhone: emergencyContacts.filter((c) => c.phone).length,
    });

    const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const locationText = `${address || "Location captured"} (${mapLink})`;
    const contactsForNotify = emergencyContacts.map(withId);
    const sosNotifications = buildSosNotifications({
      emergencyContacts: contactsForNotify,
      reporterName: user?.fullName || user?.name || "A SafeGuard user",
      locationText,
      mapLink,
      time: sosTriggeredAt.toLocaleString(),
    });

    const notifiedContacts = emergencyContacts.map((contact) => {
      const methods = [];
      if (contact.email) methods.push("email");
      if (contact.phone) methods.push("whatsapp");
      return {
        contactId: contact.id,
        notifiedAt: sosTriggeredAt,
        method: methods.join("+") || "none",
      };
    });

    await prisma.case.update({
      where: { id: sosCase.id },
      data: { notifiedContacts },
    });

    await logAudit({
      user: req.user,
      action: "sos_triggered",
      resourceType: "case",
      resourceId: sosCase.id,
      resourceLabel: sosCase.caseId,
      details: `SOS triggered at ${locationPayload.address}`,
      metadata: {
        alertId: alert.id,
        policeStationId,
        mapLink,
        whatsappLinks: sosNotifications.whatsapp.length,
        emailTargets: sosNotifications.emailTargets.length,
        contacts: emergencyContacts.length,
      },
    });

    if (policeStationId) {
      const officers = await prisma.user.findMany({
        where: {
          role: { in: ["officer", "authority"] },
          policeStationId,
        },
        select: { id: true },
      });

      if (officers.length > 0) {
        await prisma.notification.createMany({
          data: officers.map((officer) => ({
            userId: officer.id,
            message: `SOS ${sosCase.caseId} triggered by ${user?.fullName || "a reporter"} at ${locationPayload.address}`,
            read: false,
          })),
        });
      }
    }

    const emailNotifications = {
      total: emergencyContacts.length,
      emailTargets: sosNotifications.emailTargets.length,
      sent: 0,
      skipped: emergencyContacts.length - sosNotifications.emailTargets.length,
      failed: 0,
      pendingClientSend: true,
      channel: "emailjs-client",
      results: sosNotifications.emailTargets.map((contact) => ({
        contactId: contact._id || contact.id,
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
        sosId: sosCase.id,
        alertId: alert.id,
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
        emergencyContacts: contactsForNotify,
        mapLink,
        whatsappNotifications: sosNotifications.whatsapp,
      });
    }

    const populatedCase = await prisma.case.findUnique({
      where: { id: sosCase.id },
      include: CASE_INCLUDE,
    });

    res.status(201).json({
      success: true,
      message: "SOS case created successfully",
      case: serializeCase({ ...populatedCase, notifiedContacts }),
      alert: serializeAlert(alert),
      emergencyContacts: contactsForNotify,
      emailNotifications,
      whatsappNotifications: sosNotifications.whatsapp,
      sosMessage: sosNotifications.message,
      notificationSummary: sosNotifications.summary,
    });
  } catch (error) {
    console.error("Error creating SOS case:", error);
    res.status(500).json({
      error: "Failed to create SOS case",
      details: error.message,
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
        error: "Latitude and longitude are required",
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const maxDist = parseInt(maxDistance, 10);

    const emergencyCases = await prisma.case.findMany({
      where: {
        type: "emergency",
        location: { not: null },
      },
      include: { assignedTo: true },
    });

    const nearbyCases = emergencyCases
      .filter((item) => {
        const loc = item.location;
        if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) {
          return false;
        }
        const [caseLng, caseLat] = loc.coordinates;
        const distance = haversineDistanceMeters(lat, lng, caseLat, caseLng);
        return distance <= maxDist;
      })
      .map(serializeCase);

    res.json({
      success: true,
      nearbyCases,
    });
  } catch (error) {
    console.error("Error getting nearby responders:", error);
    res.status(500).json({
      error: "Failed to get nearby responders",
      details: error.message,
    });
  }
};

/**
 * Get user's cases (reports and emergency cases)
 */
exports.getUserCases = async (req, res) => {
  try {
    const userId = userIdOf(req.user);

    const userCases = await prisma.case.findMany({
      where: { userId },
      include: CASE_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      total: userCases.length,
      cases: userCases.map((c) => ({
        _id: c.id,
        id: c.id,
        caseId: c.caseId || c.id.slice(-8).toUpperCase(),
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
      })),
    });
  } catch (error) {
    console.error("Error fetching user cases:", error);
    res.status(500).json({
      error: "Failed to fetch cases",
      details: error.message,
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
    const userId = String(userIdOf(req.user));

    const sosCase = await prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!sosCase) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (String(sosCase.userId) !== userId) {
      return res.status(403).json({ error: "Unauthorized: Case does not belong to this user" });
    }

    const location = buildLocationUpdate(req.body, sosCase.location || {});
    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: { location },
    });

    await prisma.alert.updateMany({
      where: { caseId: sosCase.id, userId },
      data: { location },
    });

    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "case",
      resourceId: sosCase.id,
      resourceLabel: sosCase.caseId,
      details: "Updated SOS case location",
      metadata: { location },
    });

    const io = req.app.locals.io;
    if (io) {
      io.emit("caseLocationUpdated", {
        caseId: sosCase.id,
        displayCaseId: sosCase.caseId,
        location,
        updatedAt: updatedCase.updatedAt,
        userId: sosCase.userId,
      });
    }

    res.json({
      success: true,
      message: "Live location updated",
      case: {
        _id: updatedCase.id,
        location,
        updatedAt: updatedCase.updatedAt,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Error updating live location:", error);
    res.status(500).json({
      error: "Failed to update live location",
      details: error.message,
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

    const caseToDelete = await prisma.case.findUnique({
      where: { id },
    });

    if (!caseToDelete) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (caseToDelete.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized: Case does not belong to this user" });
    }

    await prisma.alert.deleteMany({ where: { caseId: id } });
    await prisma.case.delete({ where: { id } });

    res.json({
      success: true,
      message: "Case and associated alerts deleted successfully",
      id,
    });
  } catch (error) {
    console.error("Error deleting case:", error);
    res.status(500).json({
      error: "Failed to delete case",
      details: error.message,
    });
  }
};
