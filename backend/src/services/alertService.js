const prisma = require("../config/prisma");
const { serializeAlert } = require("../lib/serialize");

exports.triggerAlertService = async (userId, lat, lng) => {
  const alert = await prisma.alert.create({
    data: {
      userId,
      location: {
        type: "Point",
        coordinates: [lng, lat],
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId,
      message: "Emergency alert triggered",
    },
  });

  return serializeAlert(alert);
};
