const LiveLocation = require("../models/liveLocation");
const Case = require("../models/case");
const User = require("../models/users");
const EmergencyContact = require("../models/emergencyContacts");

module.exports = (io) => {
  // Store active user connections
  const userConnections = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Track user connection
    socket.on("userConnected", (userId) => {
      userConnections.set(userId, socket.id);
      console.log(`User ${userId} connected with socket ${socket.id}`);
    });

    // Update live location
    socket.on("sendLocation", async ({ userId, lat, lng }) => {
      try {
        await LiveLocation.findOneAndUpdate(
          { userId },
          {
            location: {
              type: "Point",
              coordinates: [lng, lat]
            },
            updatedAt: new Date()
          },
          { upsert: true }
        );

        io.emit("locationUpdate", { userId, lat, lng });
      } catch (error) {
        console.error("Error updating location:", error);
      }
    });

    // Handle SOS alert
    socket.on("sosTriggered", async (sosData) => {
      try {
        const { userId, latitude, longitude, address, accuracy } = sosData;

        if (!userId) {
          console.error("SOS triggered without userId");
          socket.emit("sosError", { success: false, error: "User ID is required" });
          return;
        }

        // Get user details
        const user = await User.findById(userId).populate("emergencyContacts");

        // Create/update SOS case in database
        const sosCase = await Case.findOneAndUpdate(
          { userId, type: "emergency", status: "active" },
          {
            userId,
            type: "emergency",
            priority: "critical",
            status: "active",
            location: {
              type: "Point",
              coordinates: [longitude, latitude],
              address: address || "Location captured",
              accuracy: accuracy || null
            },
            sosTriggeredAt: new Date()
          },
          { upsert: true, new: true }
        );

        // Broadcast SOS alert to all connected authorities
        const sosAlert = {
          sosId: sosCase._id,
          userId: userId,
          userName: user?.fullName || "Unknown User",
          userPhone: user?.phone || "N/A",
          location: {
            latitude,
            longitude,
            address: address || "Location captured",
            accuracy
          },
          timestamp: new Date(),
          emergencyContacts: user?.emergencyContacts || [],
          mapLink: `https://maps.google.com/?q=${latitude},${longitude}`
        };

        // Emit to all authorities and admins
        io.emit("sosAlertReceived", sosAlert);
        console.log("🚨 SOS Alert broadcast:", sosAlert);

        // Update live location for the SOS user
        await LiveLocation.findOneAndUpdate(
          { userId },
          {
            location: {
              type: "Point",
              coordinates: [longitude, latitude]
            },
            updatedAt: new Date()
          },
          { upsert: true }
        );

        // Acknowledge to client
        socket.emit("sosAcknowledged", {
          success: true,
          message: "SOS alert sent to police officers",
          sosId: sosCase._id
        });
      } catch (error) {
        console.error("Error handling SOS:", error);
        socket.emit("sosError", {
          success: false,
          error: error.message
        });
      }
    });

    // Broadcast new report submissions to connected clients
    socket.on("reportSubmitted", (reportData) => {
      if (!reportData) {
        console.warn("Received empty reportSubmitted payload");
        return;
      }

      io.emit("reportSubmitted", reportData);
      console.log("Broadcasting reportSubmitted event:", reportData);
    });

    // Handle emergency contact notification
    socket.on("notifyEmergencyContacts", async (notificationData) => {
      try {
        const { sosId, userId, locationLink } = notificationData;
        const user = await User.findById(userId);
        const emergencyContacts = await EmergencyContact.find({ userId });

        const notificationMessage = `🚨 Emergency Alert: ${user?.fullName || "Someone"} may be in danger. Last known location: ${locationLink}. Please act immediately.`;

        // Emit notification for each emergency contact
        emergencyContacts.forEach(contact => {
          io.emit("emergencyContactNotification", {
            contact: {
              name: contact.fullName || contact.name,
              phone: contact.phone,
              email: contact.email
            },
            message: notificationMessage,
            sosId,
            timestamp: new Date()
          });
        });

        socket.emit("contactsNotified", {
          success: true,
          notifiedCount: emergencyContacts.length
        });
      } catch (error) {
        console.error("Error notifying emergency contacts:", error);
        socket.emit("notificationError", {
          success: false,
          error: error.message
        });
      }
    });

    socket.on("disconnect", () => {
      // Remove from connections
      for (const [userId, socketId] of userConnections.entries()) {
        if (socketId === socket.id) {
          userConnections.delete(userId);
          console.log(`User ${userId} disconnected`);
        }
      }
    });
  });
};
