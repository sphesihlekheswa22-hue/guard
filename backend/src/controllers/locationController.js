const prisma = require("../config/prisma");
const { withId } = require("../lib/serialize");

const buildLocation = (lat, lng) => ({
  type: "Point",
  coordinates: [lng, lat],
});

exports.updateLocation = async (req, res) => {
  const { lat, lng } = req.body;

  const location = await prisma.liveLocation.upsert({
    where: { userId: req.user.id },
    create: {
      userId: req.user.id,
      location: buildLocation(lat, lng),
    },
    update: {
      location: buildLocation(lat, lng),
    },
  });

  res.json(withId(location));
};
