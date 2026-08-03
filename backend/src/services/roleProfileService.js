const ReporterProfile = require("../models/reporterProfile");
const PoliceOfficerProfile = require("../models/policeOfficerProfile");
const NgoProfile = require("../models/ngoProfile");
const AdminProfile = require("../models/adminProfile");

const baseProfileFields = (user) => ({
  userId: user._id,
  fullName: user.fullName || "",
  email: user.email || "",
  phone: user.phone || "",
  address: user.address || "",
  idNumber: user.idNumber || "",
  gender: user.gender || "",
  role: user.role,
  emergencyContacts: user.emergencyContacts || []
});

const getRoleProfileConfig = (role) => {
  if (role === "reporter") {
    return {
      Model: ReporterProfile,
      fields: (user) => ({
        ...baseProfileFields(user),
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || "",
        preferredNgoId: user.preferredNgoId || "",
        preferredNgoName: user.preferredNgoName || ""
      })
    };
  }

  if (role === "authority" || role === "officer") {
    return {
      Model: PoliceOfficerProfile,
      fields: (user) => ({
        ...baseProfileFields(user),
        policeStationId: user.policeStationId || "",
        policeStationName: user.policeStationName || ""
      })
    };
  }

  if (role === "ngo" || role === "ngo_worker") {
    return {
      Model: NgoProfile,
      fields: (user) => ({
        ...baseProfileFields(user),
        ngoId: user.ngoId || "",
        ngoName: user.ngoName || ""
      })
    };
  }

  if (role === "admin") {
    return {
      Model: AdminProfile,
      fields: (user) => baseProfileFields(user)
    };
  }

  return null;
};

exports.syncRoleProfile = async (user) => {
  if (!user) return null;

  const config = getRoleProfileConfig(user.role);
  if (!config) return null;

  return config.Model.findOneAndUpdate(
    { userId: user._id },
    { $set: config.fields(user) },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};
