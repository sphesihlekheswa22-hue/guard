const LiveLocation = require("../models/liveLocation");

exports.updateLocationService = async (userId, lat, lng) => {
  return await LiveLocation.findOneAndUpdate(
    { userId },
    {
      location: {
        type: "Point",
        coordinates: [lng, lat]
      },
      updatedAt: new Date()
    },
    { upsert: true, returnDocument: 'after' }
  );
};
