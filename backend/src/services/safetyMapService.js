const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const { isWithinSoshanguveBounds } = require("../constants/soshanguve");

const DEFAULT_RADIUS_METERS = 800;
const LOOKBACK_DAYS = 90;

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const extractCoords = (location) => {
  if (!location || typeof location !== "object") return null;
  const coords = location.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng, address: location.address || null };
    }
  }
  const lat = Number(location.latitude ?? location.lat);
  const lng = Number(location.longitude ?? location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return { lat, lng, address: location.address || null };
  }
  return null;
};

const lookbackDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d;
};

const loadIncidentPoints = async () => {
  const since = lookbackDate();

  const [reports, alerts, cases] = await Promise.all([
    prisma.report.findMany({
      where: { createdAt: { gte: since }, NOT: { location: { equals: Prisma.DbNull } } },
      select: { id: true, location: true, incidentType: true, status: true, createdAt: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.findMany({
      where: { createdAt: { gte: since }, NOT: { location: { equals: Prisma.DbNull } } },
      select: { id: true, location: true, type: true, status: true, createdAt: true },
      take: 300,
      orderBy: { createdAt: "desc" },
    }),
    prisma.case.findMany({
      where: {
        createdAt: { gte: since },
        NOT: { location: { equals: Prisma.DbNull } },
        type: "sos",
      },
      select: { id: true, location: true, type: true, status: true, priority: true, createdAt: true },
      take: 300,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const points = [];

  for (const report of reports) {
    const coords = extractCoords(report.location);
    if (!coords) continue;
    points.push({
      id: report.id,
      source: "report",
      ...coords,
      label: report.incidentType || "GBV report",
      weight: 1,
      createdAt: report.createdAt,
    });
  }

  for (const alert of alerts) {
    const coords = extractCoords(alert.location);
    if (!coords) continue;
    points.push({
      id: alert.id,
      source: "alert",
      ...coords,
      label: alert.type || "SOS alert",
      weight: 2,
      createdAt: alert.createdAt,
    });
  }

  for (const sosCase of cases) {
    const coords = extractCoords(sosCase.location);
    if (!coords) continue;
    points.push({
      id: sosCase.id,
      source: "sos",
      ...coords,
      label: "Emergency / SOS",
      weight: sosCase.priority === "high" ? 3 : 2,
      createdAt: sosCase.createdAt,
    });
  }

  return points;
};

const scoreRisk = ({ nearbyCount, weightedScore, sosNearby }) => {
  if (sosNearby >= 1 || weightedScore >= 8 || nearbyCount >= 5) {
    return {
      risk: "High",
      summary:
        "Higher risk based on recent SafeGuard reports and/or SOS activity near this spot. Prefer well-lit routes and stay with someone you trust.",
    };
  }
  if (weightedScore >= 3 || nearbyCount >= 2) {
    return {
      risk: "Medium",
      summary:
        "Caution advised. There have been some recent reports near this location. Stay alert and share your location with a trusted contact if needed.",
    };
  }
  return {
    risk: "Low",
    summary:
      "Fewer recent reports near this location in SafeGuard. This is not a guarantee of safety — stay aware of your surroundings.",
  };
};

const assessPoint = async (latitude, longitude, radiusMeters = DEFAULT_RADIUS_METERS) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error("Valid latitude and longitude are required");
    err.status = 400;
    throw err;
  }

  const inSoshanguve = isWithinSoshanguveBounds(lat, lng);
  const radius = Math.min(Math.max(Number(radiusMeters) || DEFAULT_RADIUS_METERS, 200), 3000);
  const allPoints = await loadIncidentPoints();

  const nearby = allPoints
    .map((point) => ({
      ...point,
      distanceMeters: haversineDistanceMeters(lat, lng, point.lat, point.lng),
    }))
    .filter((point) => point.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearbyCount = nearby.length;
  const weightedScore = nearby.reduce((sum, p) => sum + (p.weight || 1), 0);
  const sosNearby = nearby.filter((p) => p.source === "alert" || p.source === "sos").length;
  const { risk, summary } = scoreRisk({ nearbyCount, weightedScore, sosNearby });

  const nearest = nearby[0]
    ? {
        distanceMeters: Math.round(nearby[0].distanceMeters),
        label: nearby[0].label,
        source: nearby[0].source,
      }
    : null;

  return {
    latitude: lat,
    longitude: lng,
    inSoshanguve,
    radiusMeters: radius,
    lookbackDays: LOOKBACK_DAYS,
    risk: inSoshanguve ? risk : "Unknown",
    summary: inSoshanguve
      ? summary
      : "This point is outside SafeGuard's Soshanguve coverage area. Safety scoring is only available inside Soshanguve.",
    nearbyIncidents: nearbyCount,
    sosNearby,
    nearest,
    disclaimer:
      "Assessment is based on recent SafeGuard reports only. It does not guarantee safety and is not a substitute for official SAPS guidance.",
  };
};

const getHotspots = async (radiusMeters = 600) => {
  const allPoints = await loadIncidentPoints();
  const clusters = [];

  for (const point of allPoints) {
    if (!isWithinSoshanguveBounds(point.lat, point.lng)) continue;

    let matched = null;
    for (const cluster of clusters) {
      const d = haversineDistanceMeters(point.lat, point.lng, cluster.lat, cluster.lng);
      if (d <= radiusMeters) {
        matched = cluster;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        lat: point.lat,
        lng: point.lng,
        address: point.address,
        incidents: 1,
        weightedScore: point.weight || 1,
        sosCount: point.source === "alert" || point.source === "sos" ? 1 : 0,
        label: point.address || point.label || "Reported area",
      });
      continue;
    }

    matched.incidents += 1;
    matched.weightedScore += point.weight || 1;
    if (point.source === "alert" || point.source === "sos") matched.sosCount += 1;
    if (!matched.address && point.address) matched.address = point.address;
  }

  return clusters
    .map((cluster) => {
      const { risk } = scoreRisk({
        nearbyCount: cluster.incidents,
        weightedScore: cluster.weightedScore,
        sosNearby: cluster.sosCount,
      });
      return {
        name: cluster.address || cluster.label || "Reported area",
        lat: cluster.lat,
        lng: cluster.lng,
        incidents: cluster.incidents,
        risk,
      };
    })
    .sort((a, b) => b.incidents - a.incidents)
    .slice(0, 40);
};

module.exports = {
  assessPoint,
  getHotspots,
  DEFAULT_RADIUS_METERS,
};
