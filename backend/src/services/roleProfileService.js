const prisma = require("../config/prisma");
const { userIdOf } = require("../lib/serialize");

exports.syncRoleProfile = async (user) => {
  if (!user) return null;
  const uid = userIdOf(user);
  if (!uid) return null;

  const role = user.role;

  if (role === "reporter") {
    return prisma.reporterProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || "",
        preferredNgoId: user.preferredNgoId || "",
        preferredNgoName: user.preferredNgoName || "",
      },
      update: {
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || "",
        preferredNgoId: user.preferredNgoId || "",
        preferredNgoName: user.preferredNgoName || "",
      },
    });
  }

  if (role === "authority" || role === "officer") {
    return prisma.policeOfficerProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || "",
      },
      update: {
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || "",
      },
    });
  }

  if (role === "ngo" || role === "ngo_worker") {
    return prisma.ngoProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        ngoId: user.ngoId || "",
        ngoName: user.ngoName || "",
      },
      update: {
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        ngoId: user.ngoId || "",
        ngoName: user.ngoName || "",
      },
    });
  }

  if (role === "admin") {
    return prisma.adminProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
      },
      update: {
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
      },
    });
  }

  return null;
};
