const prisma = require("../config/prisma");
const { withId, serializeCase } = require("../lib/serialize");

const buildLocation = (lng, lat, address, accuracy) => ({
  type: "Point",
  coordinates: [lng, lat],
  address: address || "Location captured",
  accuracy: accuracy ?? null,
});

const upsertLiveLocation = async (userId, lng, lat) => {
  await prisma.liveLocation.upsert({
    where: { userId },
    create: {
      userId,
      location: buildLocation(lng, lat),
    },
    update: {
      location: buildLocation(lng, lat),
    },
  });
};

const upsertEmergencyCase = async (userId, longitude, latitude, address, accuracy) => {
  const location = buildLocation(longitude, latitude, address, accuracy);
  const existing = await prisma.case.findFirst({
    where: { userId, type: "emergency", status: "active" },
  });

  if (existing) {
    return prisma.case.update({
      where: { id: existing.id },
      data: {
        priority: "critical",
        location,
        sosTriggeredAt: new Date(),
      },
    });
  }

  return prisma.case.create({
    data: {
      userId,
      type: "emergency",
      priority: "critical",
      status: "active",
      location,
      sosTriggeredAt: new Date(),
    },
  });
};

module.exports = (io) => {
  const userConnections = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("userConnected", (userId) => {
      userConnections.set(userId, socket.id);
      console.log(`User ${userId} connected with socket ${socket.id}`);
    });

    socket.on("sendLocation", async ({ userId, lat, lng }) => {
      try {
        await upsertLiveLocation(userId, lng, lat);
        io.emit("locationUpdate", { userId, lat, lng });
      } catch (error) {
        console.error("Error updating location:", error);
      }
    });

    socket.on("sosTriggered", async (sosData) => {
      try {
        const { userId, latitude, longitude, address, accuracy } = sosData;

        if (!userId) {
          console.error("SOS triggered without userId");
          socket.emit("sosError", { success: false, error: "User ID is required" });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { emergencyContacts: true },
        });

        const sosCase = await upsertEmergencyCase(userId, longitude, latitude, address, accuracy);
        const serializedCase = serializeCase(sosCase);

        const sosAlert = {
          sosId: serializedCase._id,
          userId,
          userName: user?.fullName || "Unknown User",
          userPhone: user?.phone || "N/A",
          location: {
            latitude,
            longitude,
            address: address || "Location captured",
            accuracy,
          },
          timestamp: new Date(),
          emergencyContacts: (user?.emergencyContacts || []).map(withId),
          mapLink: `https://maps.google.com/?q=${latitude},${longitude}`,
        };

        io.emit("sosAlertReceived", sosAlert);
        console.log("🚨 SOS Alert broadcast:", sosAlert);

        await upsertLiveLocation(userId, longitude, latitude);

        socket.emit("sosAcknowledged", {
          success: true,
          message: "SOS alert sent to police officers",
          sosId: serializedCase._id,
        });
      } catch (error) {
        console.error("Error handling SOS:", error);
        socket.emit("sosError", {
          success: false,
          error: error.message,
        });
      }
    });

    socket.on("reportSubmitted", (reportData) => {
      if (!reportData) {
        console.warn("Received empty reportSubmitted payload");
        return;
      }

      io.emit("reportSubmitted", reportData);
      console.log("Broadcasting reportSubmitted event:", reportData);
    });

    socket.on("notifyEmergencyContacts", async (notificationData) => {
      try {
        const { sosId, userId, locationLink } = notificationData;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const emergencyContacts = await prisma.emergencyContact.findMany({ where: { userId } });

        const notificationMessage = `🚨 Emergency Alert: ${user?.fullName || "Someone"} may be in danger. Last known location: ${locationLink}. Please act immediately.`;

        emergencyContacts.forEach((contact) => {
          io.emit("emergencyContactNotification", {
            contact: {
              name: contact.fullName || contact.name,
              phone: contact.phone,
              email: contact.email,
            },
            message: notificationMessage,
            sosId,
            timestamp: new Date(),
          });
        });

        socket.emit("contactsNotified", {
          success: true,
          notifiedCount: emergencyContacts.length,
        });
      } catch (error) {
        console.error("Error notifying emergency contacts:", error);
        socket.emit("notificationError", {
          success: false,
          error: error.message,
        });
      }
    });

    socket.on("disconnect", () => {
      for (const [userId, socketId] of userConnections.entries()) {
        if (socketId === socket.id) {
          userConnections.delete(userId);
          console.log(`User ${userId} disconnected`);
        }
      }
    });
  });
};
