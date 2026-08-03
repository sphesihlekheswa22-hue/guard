const Alert = require("../models/alert");
const Notification = require("../models/notifications");

exports.triggerAlertService = async (userId, lat, lng) => {
  const alert = await Alert.create({
    userId,
    location: {
      type: "Point",
      coordinates: [lng, lat]
    }
  });

  await Notification.create({
    userId,
    message: "Emergency alert triggered"
  });

  return alert;
};
