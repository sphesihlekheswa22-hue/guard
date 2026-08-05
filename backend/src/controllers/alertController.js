const prisma = require("../config/prisma");
const { serializeAlert, userIdOf } = require("../lib/serialize");
const { logAudit } = require("../services/auditService");
const { buildOfficerStationWhere } = require("../services/stationScopeService");

const ALERT_INCLUDE = {
  user: true,
  case: true,
  acknowledgedBy: true,
};

const EMPTY_FILTER = { id: { in: [] } };

const getAlertQueryFilter = async (user) => {
  if (user.role === "authority" || user.role === "officer") {
    if (!user.policeStationId) return EMPTY_FILTER;
    return buildOfficerStationWhere(user);
  }
  return { userId: userIdOf(user) };
};

const getSystemAlertFilter = async (user) => {
  if (user.role === "authority" || user.role === "officer") {
    if (!user.policeStationId) return EMPTY_FILTER;
    return buildOfficerStationWhere(user);
  }
  return EMPTY_FILTER;
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

const fetchAlert = (id) =>
  prisma.alert.findUnique({
    where: { id },
    include: ALERT_INCLUDE,
  });

exports.getResolvedAlerts = async (req, res) => {
  try {
    const stationFilter = await getAlertQueryFilter(req.user);
    const alerts = await prisma.alert.findMany({
      where: { ...stationFilter, status: "resolved" },
      include: ALERT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    res.json({
      success: true,
      total: alerts.length,
      alerts: alerts.map(serializeAlert),
    });
  } catch (error) {
    console.error("Error fetching resolved alerts:", error);
    res.status(500).json({
      error: "Failed to fetch resolved alerts",
      details: error.message,
    });
  }
};

exports.getAllActiveAlerts = async (req, res) => {
  try {
    const stationFilter = await getAlertQueryFilter(req.user);
    const alerts = await prisma.alert.findMany({
      where: {
        ...stationFilter,
        status: { in: ["active", "call initiated"] },
      },
      include: ALERT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    res.json({
      success: true,
      total: alerts.length,
      alerts: alerts.map(serializeAlert),
    });
  } catch (error) {
    console.error("Error fetching all active alerts:", error);
    res.status(500).json({
      error: "Failed to fetch active alerts",
      details: error.message,
    });
  }
};

exports.createAlert = async (req, res) => {
  try {
    const { latitude, longitude, address, accuracy, type = "sos", caseId } = req.body;
    const userId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "Latitude and longitude are required",
      });
    }

    const alert = await prisma.alert.create({
      data: {
        userId,
        caseId: caseId || null,
        policeStationId: req.user.policeStationId || null,
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
          address: address || "Location captured",
          accuracy: accuracy || null,
        },
        type: type || "sos",
        status: "active",
      },
    });

    const populated = await fetchAlert(alert.id);

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      alert: serializeAlert(populated),
    });
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({
      error: "Failed to create alert",
      details: error.message,
    });
  }
};

exports.triggerAlert = async (req, res) => {
  const { lat, lng } = req.body;

  const alert = await prisma.alert.create({
    data: {
      userId: req.user.id,
      policeStationId: req.user.policeStationId || null,
      location: {
        type: "Point",
        coordinates: [lng, lat],
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: req.user.id,
      message: "Emergency alert triggered",
    },
  });

  res.json(serializeAlert(alert));
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const existingAlert = await prisma.alert.findUnique({
      where: { id: req.params.id },
    });
    const oldStatus = existingAlert?.status || "";

    const updateData = { status };
    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    } else if (status === "call initiated" || status === "acknowledged") {
      updateData.acknowledgedById = req.user.id;
      updateData.acknowledgedAt = new Date();
    }

    await prisma.alert.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Keep the linked SOS case in sync so reporters see the same status
    if (existingAlert?.caseId) {
      const caseUpdate = {};
      if (status === "resolved") {
        caseUpdate.status = "resolved";
      } else if (status === "call initiated" || status === "acknowledged") {
        caseUpdate.status = "assigned";
      } else if (status === "active") {
        caseUpdate.status = "active";
      }
      if (Object.keys(caseUpdate).length > 0) {
        await prisma.case.updateMany({
          where: { id: existingAlert.caseId },
          data: caseUpdate,
        });
      }
    }

    const alert = await fetchAlert(req.params.id);

    if (alert) {
      await logAudit({
        user: req.user,
        action: "case_status_changed",
        resourceType: "alert",
        resourceId: alert.id,
        resourceLabel: alert.case?.caseId || alert.id,
        details: `Changed alert status from ${oldStatus || "unknown"} to ${status}`,
        metadata: { oldStatus, newStatus: status },
      });
    }

    res.json({
      success: true,
      message: `Alert status updated to ${status}`,
      alert: serializeAlert(alert),
    });
  } catch (error) {
    console.error("Error updating alert status:", error);
    res.status(500).json({
      error: "Failed to update alert status",
      details: error.message,
    });
  }
};

exports.updateAlertLocation = async (req, res) => {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
    });

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    if (alert.userId !== req.user.id) {
      return res.status(403).json({ error: "You can only update the location for your own alert" });
    }

    const location = buildLocationUpdate(req.body, alert.location || {});

    await prisma.alert.update({
      where: { id: alert.id },
      data: { location },
    });

    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "alert",
      resourceId: alert.id,
      resourceLabel: alert.caseId ? alert.caseId.toString() : alert.id,
      details: "Updated alert location",
      metadata: { location },
    });

    if (alert.caseId) {
      await prisma.case.updateMany({
        where: { id: alert.caseId, userId: req.user.id },
        data: { location },
      });
    }

    const populated = await fetchAlert(alert.id);
    const serialized = serializeAlert(populated);

    const io = req.app.locals.io;
    if (io) {
      io.emit("alertLocationUpdated", {
        alertId: alert.id,
        caseId: populated.case?.id || alert.caseId,
        location,
        updatedAt: populated.updatedAt,
        userId: populated.user?.id || alert.userId,
      });
    }

    res.json({
      success: true,
      message: "Alert location updated",
      alert: serialized,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Error updating alert location:", error);
    res.status(500).json({
      error: "Failed to update alert location",
      details: error.message,
    });
  }
};

exports.resolveAlert = async (req, res) => {
  try {
    const existingAlert = await prisma.alert.findUnique({
      where: { id: req.params.id },
    });

    await prisma.alert.update({
      where: { id: req.params.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    });

    if (existingAlert?.caseId) {
      await prisma.case.updateMany({
        where: { id: existingAlert.caseId },
        data: { status: "resolved" },
      });
    }

    const alert = await fetchAlert(req.params.id);

    if (alert) {
      await logAudit({
        user: req.user,
        action: "case_status_changed",
        resourceType: "alert",
        resourceId: alert.id,
        resourceLabel: alert.case?.caseId || alert.id,
        details: `Changed alert status from ${existingAlert?.status || "unknown"} to resolved`,
        metadata: { oldStatus: existingAlert?.status || "", newStatus: "resolved" },
      });
    }

    res.json({
      success: true,
      message: "Alert resolved",
      alert: serializeAlert(alert),
    });
  } catch (error) {
    console.error("Error resolving alert:", error);
    res.status(500).json({
      error: "Failed to resolve alert",
      details: error.message,
    });
  }
};

exports.getAlert = async (req, res) => {
  try {
    const alert = await fetchAlert(req.params.id);

    if (!alert) {
      return res.status(404).json({
        error: "Alert not found",
      });
    }

    res.json({
      success: true,
      alert: serializeAlert(alert),
    });
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({
      error: "Failed to fetch alert",
      details: error.message,
    });
  }
};

exports.getUserAlerts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: ALERT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      total: alerts.length,
      alerts: alerts.map(serializeAlert),
    });
  } catch (error) {
    console.error("Error fetching user alerts:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      details: error.message,
    });
  }
};

exports.getAlertStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [totalAlerts, activeAlerts, resolvedAlerts] = await Promise.all([
      prisma.alert.count({ where: { userId } }),
      prisma.alert.count({ where: { userId, status: "active" } }),
      prisma.alert.count({ where: { userId, status: "resolved" } }),
    ]);

    res.json({
      success: true,
      stats: {
        total: totalAlerts,
        active: activeAlerts,
        resolved: resolvedAlerts,
      },
    });
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({
      error: "Failed to fetch alert stats",
      details: error.message,
    });
  }
};

exports.getSystemAlertStats = async (req, res) => {
  try {
    const stationFilter = await getSystemAlertFilter(req.user);

    const [activeAlerts, resolvedAlerts] = await Promise.all([
      prisma.alert.count({
        where: {
          ...stationFilter,
          status: { in: ["active", "call initiated"] },
        },
      }),
      prisma.alert.count({
        where: {
          ...stationFilter,
          status: "resolved",
        },
      }),
    ]);

    res.json({
      success: true,
      active: activeAlerts,
      resolved: resolvedAlerts,
    });
  } catch (error) {
    console.error("Error fetching system alert stats:", error);
    res.status(500).json({
      error: "Failed to fetch system alert stats",
      details: error.message,
    });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    if (req.user.role === "reporter") {
      return res.status(403).json({
        error: "Reporters cannot delete reports or cases.",
      });
    }

    const existing = await prisma.alert.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Alert not found",
      });
    }

    const alert = await prisma.alert.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: "Alert deleted successfully",
      alert: serializeAlert(alert),
    });
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({
      error: "Failed to delete alert",
      details: error.message,
    });
  }
};
