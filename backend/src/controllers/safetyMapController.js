const { assessPoint, getHotspots } = require("../services/safetyMapService");

exports.assessLocation = async (req, res) => {
  try {
    const { lat, lng, latitude, longitude, radius } = req.query;
    const result = await assessPoint(latitude ?? lat, longitude ?? lng, radius);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Could not assess location" });
  }
};

exports.listHotspots = async (req, res) => {
  try {
    const hotspots = await getHotspots(req.query.radius);
    res.json({ hotspots });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Could not load hotspots" });
  }
};
