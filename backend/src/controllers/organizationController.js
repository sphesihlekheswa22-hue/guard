const prisma = require("../config/prisma");
const { serializeOrg } = require("../lib/serialize");
const { isSoshanguvePoliceStation } = require("../constants/soshanguve");

const normalizeOrganization = (doc, type) => ({
  ...serializeOrg(doc),
  type,
});

exports.getPublicOrganizations = async (req, res, next) => {
  try {
    const type = req.query.type;
    if (type && !["police_station", "ngo"].includes(type)) {
      return res.status(400).json({ message: "Organization type must be police_station or ngo." });
    }

    let organizations = [];

    if (!type || type === "police_station") {
      const policeStations = await prisma.policeStation.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      organizations.push(
        ...policeStations
          .filter(isSoshanguvePoliceStation)
          .map((doc) => normalizeOrganization(doc, "police_station"))
      );
    }

    if (!type || type === "ngo") {
      const ngos = await prisma.ngoOrg.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      organizations.push(...ngos.map((doc) => normalizeOrganization(doc, "ngo")));
    }

    if (!type) {
      organizations.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    }

    res.json(organizations);
  } catch (err) {
    next(err);
  }
};
