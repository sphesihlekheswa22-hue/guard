const prisma = require("../config/prisma");

const normalizeOrgName = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Collect every NGO id that should match this worker's organization
 * (handles old Mongo ids vs seed cuids / codes).
 */
const resolveNgoIdsForUser = async (user) => {
  const ownId = user?.ngoId ? String(user.ngoId) : "";
  const ids = new Set();
  if (ownId) ids.add(ownId);

  const ngos = await prisma.ngoOrg.findMany({
    select: { id: true, name: true, code: true, active: true },
  });

  const ownNgo = ngos.find((n) => n.id === ownId) || null;
  const targetName = normalizeOrgName(user?.ngoName || ownNgo?.name || "");

  for (const ngo of ngos) {
    const sameId = ownId && ngo.id === ownId;
    const sameCode = ownId && String(ngo.code || "") === ownId;
    const sameName = targetName && normalizeOrgName(ngo.name) === targetName;
    if (sameId || sameCode || sameName) {
      ids.add(ngo.id);
      if (ngo.code) ids.add(String(ngo.code));
    }
  }

  return [...ids].filter(Boolean);
};

const buildNgoReferralWhere = async (user) => {
  const ids = await resolveNgoIdsForUser(user);
  const name = String(user?.ngoName || "").trim();

  if (!ids.length && !name) {
    return { id: { in: [] } };
  }

  const or = [];
  if (ids.length) {
    or.push({ referredNgoId: { in: ids } });
  }
  if (name) {
    or.push({ referredNgoName: name });
  }

  return { OR: or };
};

/**
 * Resolve a referral target to the canonical NGO org row.
 */
const resolveCanonicalNgo = async (ngoIdOrCode, ngoName = "") => {
  const key = String(ngoIdOrCode || "").trim();
  const name = String(ngoName || "").trim();

  let ngo = null;
  if (key) {
    ngo = await prisma.ngoOrg.findFirst({
      where: { OR: [{ id: key }, { code: key }] },
    });
  }
  if (!ngo && name) {
    const all = await prisma.ngoOrg.findMany({ select: { id: true, name: true, code: true } });
    const target = normalizeOrgName(name);
    ngo = all.find((row) => normalizeOrgName(row.name) === target) || null;
    if (ngo) {
      ngo = await prisma.ngoOrg.findUnique({ where: { id: ngo.id } });
    }
  }
  return ngo;
};

/**
 * Rewrite users/reports that point at duplicate NGO ids for the same org name.
 */
const unifyNgoOrgIds = async () => {
  const ngos = await prisma.ngoOrg.findMany({
    select: { id: true, name: true, code: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map();
  for (const ngo of ngos) {
    const key = normalizeOrgName(ngo.name) || String(ngo.code || "").toLowerCase() || ngo.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ngo);
  }

  let totalUsers = 0;
  let totalReports = 0;
  let deactivated = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const preferred =
      group.find((n) => String(n.code || "").includes("hope")) ||
      group.find((n) => n.active !== false) ||
      group[0];
    const duplicates = group.map((n) => n.id).filter((id) => id !== preferred.id);
    const legacyIds = [
      ...duplicates,
      ...group.map((n) => n.code).filter(Boolean),
    ].filter((id) => id && id !== preferred.id);
    const uniqueLegacy = [...new Set(legacyIds.map(String))];

    if (!uniqueLegacy.length) continue;

    const [users, reports] = await Promise.all([
      prisma.user.updateMany({
        where: { ngoId: { in: uniqueLegacy } },
        data: { ngoId: preferred.id, ngoName: preferred.name },
      }),
      prisma.report.updateMany({
        where: { referredNgoId: { in: uniqueLegacy } },
        data: { referredNgoId: preferred.id, referredNgoName: preferred.name },
      }),
    ]);

    // Also fix preferredNgoId on reporters
    await prisma.user.updateMany({
      where: { preferredNgoId: { in: uniqueLegacy } },
      data: { preferredNgoId: preferred.id, preferredNgoName: preferred.name },
    });

    if (duplicates.length) {
      await prisma.ngoOrg.updateMany({
        where: { id: { in: duplicates } },
        data: { active: false },
      });
      deactivated += duplicates.length;
    }

    totalUsers += users.count;
    totalReports += reports.count;
    console.log(
      `🔧 Unified NGO "${preferred.name}" → ${preferred.id}. users=${users.count}, reports=${reports.count}`
    );
  }

  return { users: totalUsers, reports: totalReports, deactivated };
};

module.exports = {
  resolveNgoIdsForUser,
  buildNgoReferralWhere,
  resolveCanonicalNgo,
  unifyNgoOrgIds,
  normalizeOrgName,
};
