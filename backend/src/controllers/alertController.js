const Alert = require("../models/alert");
const Case = require("../models/case");
const Notification = require("../models/notifications");
const { logAudit } = require("../services/auditService");

const getAlertQueryFilter = (user) => {
  if (user.role === "authority" || user.role === "officer") {
    if (!user.policeStationId) return { _id: null };
    const stationId = String(user.policeStationId);
    return { policeStationId: stationId };
  }
  return { userId: user._id || user.id };
};

const getSystemAlertFilter = (user) => {
  if (user.role === "authority" || user.role === "officer") {
    if (!user.policeStationId) return { _id: null };
    return { policeStationId: String(user.policeStationId) };
  }
  return { _id: null };
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

exports.getResolvedAlerts = async (req, res) => {
  try {
    const stationFilter = getAlertQueryFilter(req.user);
    const alerts = await Alert.find({ ...stationFilter, status: "resolved" })
      .populate("userId caseId acknowledgedBy")
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      total: alerts.length,
      alerts
    });
  } catch (error) {
    console.error("Error fetching resolved alerts:", error);
    res.status(500).json({
      error: "Failed to fetch resolved alerts",
      details: error.message
    });
  }
};

exports.getAllActiveAlerts = async (req, res) => {
  try {
    const stationFilter = getAlertQueryFilter(req.user);
    const alerts = await Alert.find({ ...stationFilter, status: { $in: ["active", "call initiated"] } })
      .populate("userId caseId acknowledgedBy")
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      total: alerts.length,
      alerts
    });
  } catch (error) {
    console.error("Error fetching all active alerts:", error);
    res.status(500).json({
      error: "Failed to fetch active alerts",
      details: error.message
    });
  }
};

exports.createAlert = async (req, res) => {
  try {
    const { latitude, longitude, address, accuracy, type = "sos", caseId } = req.body;
    const userId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "Latitude and longitude are required"
      });
    }

    const alert = await Alert.create({
      userId,
      caseId: caseId || null,
      policeStationId: req.user.policeStationId || null,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
        address: address || "Location captured",
        accuracy: accuracy || null
      },
      type: type || "sos",
      status: "active"
    });

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      alert: await alert.populate("userId caseId")
    });
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({
      error: "Failed to create alert",
      details: error.message
    });
  }
};

exports.triggerAlert = async (req, res) => {
  const { lat, lng } = req.body;

  const alert = await Alert.create({
    userId: req.user.id,
    policeStationId: req.user.policeStationId || null,
    location: {
      type: "Point",
      coordinates: [lng, lat]
    }
  });

  // Notify authorities (simplified)
  await Notification.create({
    userId: req.user.id,
    message: "Emergency alert triggered"
  });

  res.json(alert);
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const existingAlert = await Alert.findById(req.params.id);
    const oldStatus = existingAlert?.status || "";
    const updateData = { status };

    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    } else if (status === "call initiated" || status === "acknowledged") {
      updateData.acknowledgedBy = req.user.id;
      updateData.acknowledgedAt = new Date();
    }

    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("userId caseId acknowledgedBy");

    if (alert) {
      await logAudit({
        user: req.user,
        action: "case_status_changed",
        resourceType: "alert",
        resourceId: alert._id,
        resourceLabel: alert.caseId?.caseId || alert._id.toString(),
        details: `Changed alert status from ${oldStatus || "unknown"} to ${status}`,
        metadata: { oldStatus, newStatus: status }
      });
    }

    res.json({
      success: true,
      message: `Alert status updated to ${status}`,
      alert
    });
  } catch (error) {
    console.error("Error updating alert status:", error);
    res.status(500).json({
      error: "Failed to update alert status",
      details: error.message
    });
  }
};

exports.updateAlertLocation = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    if (alert.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "You can only update the location for your own alert" });
    }

    const location = buildLocationUpdate(req.body, alert.location || {});
    alert.location = location;
    await alert.save();
    await logAudit({
      user: req.user,
      action: "location_updated",
      resourceType: "alert",
      resourceId: alert._id,
      resourceLabel: alert.caseId ? alert.caseId.toString() : alert._id.toString(),
      details: "Updated alert location",
      metadata: { location }
    });

    if (alert.caseId) {
      await Case.findOneAndUpdate(
        { _id: alert.caseId, userId: req.user.id },
        { location },
        { new: true }
      );
    }

    await alert.populate("userId caseId acknowledgedBy");

    const io = req.app.locals.io;
    if (io) {
      io.emit("alertLocationUpdated", {
        alertId: alert._id,
        caseId: alert.caseId?._id || alert.caseId,
        location: alert.location,
        updatedAt: alert.updatedAt,
        userId: alert.userId._id,
      });
    }

    res.json({
      success: true,
      message: "Alert location updated",
      alert,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Error updating alert location:", error);
    res.status(500).json({
      error: "Failed to update alert location",
      details: error.message
    });
  }
};

exports.resolveAlert = async (req, res) => {
  try {
    const existingAlert = await Alert.findById(req.params.id);
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { 
        status: "resolved",
        resolvedAt: new Date()
      },
      { new: true }
    ).populate("userId caseId acknowledgedBy");

    if (alert) {
      await logAudit({
        user: req.user,
        action: "case_status_changed",
        resourceType: "alert",
        resourceId: alert._id,
        resourceLabel: alert.caseId?.caseId || alert._id.toString(),
        details: `Changed alert status from ${existingAlert?.status || "unknown"} to resolved`,
        metadata: { oldStatus: existingAlert?.status || "", newStatus: "resolved" }
      });
    }

    res.json({
      success: true,
      message: "Alert resolved",
      alert
    });
  } catch (error) {
    console.error("Error resolving alert:", error);
    res.status(500).json({
      error: "Failed to resolve alert",
      details: error.message
    });
  }
};

exports.getAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate("userId caseId acknowledgedBy");
    
    if (!alert) {
      return res.status(404).json({
        error: "Alert not found"
      });
    }

    res.json({
      success: true,
      alert
    });
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({
      error: "Failed to fetch alert",
      details: error.message
    });
  }
};
exports.getUserAlerts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const alerts = await Alert.find(query)
      .populate("userId caseId acknowledgedBy")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: alerts.length,
      alerts
    });
  } catch (error) {
    console.error("Error fetching user alerts:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      details: error.message
    });
  }
};

exports.getAlertStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const totalAlerts = await Alert.countDocuments({ userId });
    const activeAlerts = await Alert.countDocuments({ userId, status: "active" });
    const resolvedAlerts = await Alert.countDocuments({ userId, status: "resolved" });

    res.json({
      success: true,
      stats: {
        total: totalAlerts,
        active: activeAlerts,
        resolved: resolvedAlerts
      }
    });
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({
      error: "Failed to fetch alert stats",
      details: error.message
    });
  }
};

exports.getSystemAlertStats = async (req, res) => {
  try {
    const stationFilter = getSystemAlertFilter(req.user);

    const activeAlerts = await Alert.countDocuments({
      ...stationFilter,
      status: { $in: ["active", "call initiated"] }
    });
    const resolvedAlerts = await Alert.countDocuments({
      ...stationFilter,
      status: "resolved"
    });

    res.json({
      success: true,
      active: activeAlerts,
      resolved: resolvedAlerts
    });
  } catch (error) {
    console.error("Error fetching system alert stats:", error);
    res.status(500).json({
      error: "Failed to fetch system alert stats",
      details: error.message
    });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndDelete(req.params.id);

    if (!alert) {
      return res.status(404).json({
        error: "Alert not found"
      });
    }

    res.json({
      success: true,
      message: "Alert deleted successfully",
      alert
    });
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({
      error: "Failed to delete alert",
      details: error.message
    });
  }
};
