const LiveLocation = require("../models/liveLocation");

exports.updateLocation = async (req, res) => {
  const { lat, lng } = req.body;

  const location = await LiveLocation.findOneAndUpdate(
    { userId: req.user.id },
    {
      location: {
        type: "Point",
        coordinates: [lng, lat]
      },
      updatedAt: new Date()
    },
    { upsert: true, returnDocument: 'after' }
  );

  res.json(location);
};
