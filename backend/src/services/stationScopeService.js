const prisma = require("../config/prisma");
const {
  containsSoshanguve,
  isSoshanguvePoliceStation,
  SOSHANGUVE_STATION_NAME,
} = require("../constants/soshanguve");

const SOSHANGUVE_STATION_CODES = new Set(["0152", "soshanguve-0152", "soshanguve"]);

const isSoshanguveStationRecord = (station = {}) =>
  isSoshanguvePoliceStation(station) ||
  SOSHANGUVE_STATION_CODES.has(String(station.code || "").toLowerCase()) ||
  containsSoshanguve(station.name) ||
  containsSoshanguve(station.policeStationName);

/**
 * Collect every police-station id that should be treated as the same
 * Soshanguve station for officer dashboards (handles old Mongo ids vs seed cuids).
 */
const resolveOfficerStationIds = async (user) => {
  const ownId = user?.policeStationId ? String(user.policeStationId) : "";
  const ids = new Set();
  if (ownId) ids.add(ownId);

  const stations = await prisma.policeStation.findMany({
    select: { id: true, name: true, code: true, address: true, active: true },
  });

  const ownStation = stations.find((s) => s.id === ownId) || null;
  const officerLooksSoshanguve =
    containsSoshanguve(user?.policeStationName) ||
    (ownStation && isSoshanguveStationRecord(ownStation)) ||
    SOSHANGUVE_STATION_CODES.has(ownId.toLowerCase());

  for (const station of stations) {
    if (!officerLooksSoshanguve && !ownId) break;
    if (officerLooksSoshanguve && isSoshanguveStationRecord(station)) {
      ids.add(station.id);
      if (station.code) ids.add(String(station.code));
      continue;
    }
    // Same exact station row only
    if (ownId && station.id === ownId) {
      ids.add(station.id);
      if (station.code) ids.add(String(station.code));
    }
  }

  // Legacy / alternate ids that may appear on report rows
  if (officerLooksSoshanguve) {
    ids.add("0152");
    ids.add("soshanguve-0152");
  }

  return [...ids].filter(Boolean);
};

const buildOfficerStationWhere = async (user) => {
  const ids = await resolveOfficerStationIds(user);
  if (!ids.length) return { id: { in: [] } }; // match nothing if used wrongly
  return { policeStationId: { in: ids } };
};

/**
 * Pick one canonical Soshanguve station and rewrite users/reports/alerts/cases
 * that still point at duplicate Soshanguve station ids (common after Mongo→Postgres).
 */
const unifySoshanguveStationIds = async () => {
  const stations = await prisma.policeStation.findMany({
    select: { id: true, name: true, code: true, address: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const soshanguveStations = stations.filter(isSoshanguveStationRecord);
  if (soshanguveStations.length === 0) return { updated: false, reason: "no-soshanguve-station" };

  const preferred =
    soshanguveStations.find((s) => String(s.code).toLowerCase() === "soshanguve-0152") ||
    soshanguveStations.find((s) => String(s.code).toLowerCase() === "0152") ||
    soshanguveStations.find((s) => s.name === SOSHANGUVE_STATION_NAME) ||
    soshanguveStations[0];

  const duplicateIds = soshanguveStations.map((s) => s.id).filter((id) => id !== preferred.id);
  // Also rewrite rows that stored station codes instead of ids
  const legacyIds = ["0152", "soshanguve-0152", ...duplicateIds];
  const uniqueLegacy = [...new Set(legacyIds)].filter((id) => id && id !== preferred.id);

  if (uniqueLegacy.length === 0) {
    return { updated: false, canonicalId: preferred.id, duplicates: 0 };
  }

  const [users, reports, alerts, cases] = await Promise.all([
    prisma.user.updateMany({
      where: { policeStationId: { in: uniqueLegacy } },
      data: {
        policeStationId: preferred.id,
        policeStationName: preferred.name || SOSHANGUVE_STATION_NAME,
      },
    }),
    prisma.report.updateMany({
      where: { policeStationId: { in: uniqueLegacy } },
      data: { policeStationId: preferred.id },
    }),
    prisma.alert.updateMany({
      where: { policeStationId: { in: uniqueLegacy } },
      data: { policeStationId: preferred.id },
    }),
    prisma.case.updateMany({
      where: { policeStationId: { in: uniqueLegacy } },
      data: { policeStationId: preferred.id },
    }),
  ]);

  // Soft-deactivate exact duplicate station rows (keep canonical)
  if (duplicateIds.length > 0) {
    await prisma.policeStation.updateMany({
      where: { id: { in: duplicateIds } },
      data: { active: false },
    });
  }

  console.log(
    `🔧 Unified Soshanguve station → ${preferred.id} (${preferred.name}). ` +
      `users=${users.count}, reports=${reports.count}, alerts=${alerts.count}, cases=${cases.count}`
  );

  return {
    updated: true,
    canonicalId: preferred.id,
    canonicalName: preferred.name,
    users: users.count,
    reports: reports.count,
    alerts: alerts.count,
    cases: cases.count,
    deactivatedStations: duplicateIds.length,
  };
};

module.exports = {
  resolveOfficerStationIds,
  buildOfficerStationWhere,
  unifySoshanguveStationIds,
  isSoshanguveStationRecord,
};
