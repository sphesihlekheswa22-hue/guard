/** SafeGuard is localized to Soshanguve only. */

export const SOSHANGUVE_KEYWORDS = ["soshanguve"] as const;

/** Approximate geographic bounds for Soshanguve, Tshwane (WGS84). */
export const SOSHANGUVE_BOUNDS = {
  minLat: -25.58,
  maxLat: -25.48,
  minLng: 28.05,
  maxLng: 28.18,
};

export const SOSHANGUVE_STATION_NAME = "SAPS Soshanguve Police Station";

export const containsSoshanguve = (value = "") =>
  SOSHANGUVE_KEYWORDS.some((keyword) => String(value).toLowerCase().includes(keyword));

export const isWithinSoshanguveBounds = (latitude?: number | null, longitude?: number | null) => {
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

export const isSoshanguveLocation = ({
  address,
  latitude,
  longitude,
}: {
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
} = {}) => {
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

  return containsSoshanguve(address);
};

export const isSoshanguvePoliceStation = (station: { name?: string; address?: string; code?: string; label?: string } = {}) => {
  const haystack = `${station.name || ""} ${station.label || ""} ${station.address || ""} ${station.code || ""}`;
  return containsSoshanguve(haystack);
};

export const SOSHANGUVE_LOCATION_ERROR =
  "SafeGuard only accepts incidents inside Soshanguve. Please use a Soshanguve location.";
