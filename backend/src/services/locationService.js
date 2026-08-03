const prisma = require("../config/prisma");

const buildLocation = (lat, lng) => ({
  type: "Point",
  coordinates: [lng, lat],
});

exports.updateLocationService = async (userId, lat, lng) => {
  return prisma.liveLocation.upsert({
    where: { userId },
    create: {
      userId,
      location: buildLocation(lat, lng),
    },
    update: {
      location: buildLocation(lat, lng),
    },
  });
};
