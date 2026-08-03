/** SafeGuard is localized to Soshanguve only. */

const SOSHANGUVE_KEYWORDS = ["soshanguve"];

/** Approximate geographic bounds for Soshanguve, Tshwane (WGS84). */
const SOSHANGUVE_BOUNDS = {
  minLat: -25.58,
  maxLat: -25.48,
  minLng: 28.05,
  maxLng: 28.18,
};

const SOSHANGUVE_STATION_NAME = "SAPS Soshanguve Police Station";

const containsSoshanguve = (value = "") =>
  SOSHANGUVE_KEYWORDS.some((keyword) => String(value).toLowerCase().includes(keyword));

const isWithinSoshanguveBounds = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= SOSHANGUVE_BOUNDS.minLat &&
    lat <= SOSHANGUVE_BOUNDS.maxLat &&
    lng >= SOSHANGUVE_BOUNDS.minLng &&
    lng <= SOSHANGUVE_BOUNDS.maxLng
  );
};

/**
 * Accepts a location if the address mentions Soshanguve and/or coordinates fall inside the local bounds.
 * When only an address is provided, the address must mention Soshanguve.
 */
const isSoshanguveLocation = ({ address, latitude, longitude } = {}) => {
  const hasCoords =
    latitude !== undefined &&
    latitude !== null &&
    longitude !== undefined &&
    longitude !== null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  if (hasCoords && isWithinSoshanguveBounds(latitude, longitude)) {
    return true;
  }

  if (containsSoshanguve(address)) {
    return true;
  }

  return false;
};

const isSoshanguvePoliceStation = (station = {}) => {
  const haystack = `${station.name || ""} ${station.address || ""} ${station.code || ""}`;
  return containsSoshanguve(haystack);
};

module.exports = {
  SOSHANGUVE_KEYWORDS,
  SOSHANGUVE_BOUNDS,
  SOSHANGUVE_STATION_NAME,
  containsSoshanguve,
  isWithinSoshanguveBounds,
  isSoshanguveLocation,
  isSoshanguvePoliceStation,
};
