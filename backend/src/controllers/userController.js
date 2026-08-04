
const prisma = require("../config/prisma");
const { serializeUser, userIdOf } = require("../lib/serialize");
const { syncRoleProfile } = require("../services/roleProfileService");
const { logAudit } = require("../services/auditService");

const allowedGenders = new Set(["", "female", "male", "other", "prefer_not_to_say"]);

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

const normalizeFullName = (value = "") => String(value).trim().replace(/\s+/g, " ");

const isValidFullName = (value = "") => /^[\p{L}]+(?: [\p{L}]+)*$/u.test(normalizeFullName(value));
const normalizeOptionalText = (value = "") => String(value).trim().replace(/\s+/g, " ");
const normalizeIdNumber = (value = "") => String(value).replace(/\D/g, "").slice(0, 13);
const isValidIdNumber = (value = "") => /^\d{13}$/.test(normalizeIdNumber(value));
const normalizeAssignmentId = (value = "") => String(value).trim();

const normalizeSouthAfricanPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");

  if (digits.startsWith("0027")) {
    return `0${digits.slice(4)}`.slice(0, 10);
  }

  if (digits.startsWith("27")) {
    return `0${digits.slice(2)}`.slice(0, 10);
  }

  return digits.slice(0, 10);
};

const isValidSouthAfricanPhone = (value = "") => /^0[678]\d{8}$/.test(normalizeSouthAfricanPhone(value));

exports.getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { emergencyContacts: true },
    });
    res.json(serializeUser(user));
  } catch (err) {
    next(err);
  }
};

exports.getChatbotContext = async (req, res, next) => {
  try {
    if (req.user.role !== "reporter") {
      return res.status(403).json({
        message: "Help chatbot is only available for reporter accounts.",
      });
    }

    const userId = userIdOf(req.user);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        email: true,
        role: true,
        policeStationName: true,
        preferredNgoName: true,
      },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [reportCount, caseCount] = await Promise.all([
      prisma.report.count({ where: { userId } }),
      prisma.case.count({ where: { userId } }),
    ]);

    res.json({
      fullName: user.fullName || "Reporter",
      email: user.email,
      role: user.role,
      policeStationName: user.policeStationName || "SAPS Soshanguve Police Station",
      preferredNgoName: user.preferredNgoName || "",
      caseCount: reportCount + caseCount,
      reportCount,
      emergencyCaseCount: caseCount,
      assistantScope:
        "Answer only SafeGuard system and how-to questions for Soshanguve users. Refuse unrelated topics.",
    });
  } catch (err) {
    next(err);
  }
};

exports.askChatbot = async (req, res, next) => {
  try {
    if (req.user.role !== "reporter") {
      return res.status(403).json({
        message: "Help chatbot is only available for reporter accounts.",
      });
    }

    const { askChatbot, getChatbotGreeting } = require("../services/chatbotService");
    const question = req.body?.question || req.body?.message || "";
    const userId = userIdOf(req.user);

    if (!String(question).trim()) {
      const greeting = await getChatbotGreeting(userId);
      return res.json({ answer: greeting, usedDatabase: true });
    }

    const result = await askChatbot(userId, question);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { emergencyContact, ...userFields } = req.body;
    const updateFields = {};

    if (Object.prototype.hasOwnProperty.call(userFields, "fullName")) {
      const normalizedFullName = normalizeFullName(userFields.fullName);
      if (!isValidFullName(normalizedFullName)) {
        return res.status(400).json({ message: "Full name can only contain letters and spaces." });
      }
      updateFields.fullName = normalizedFullName;
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "phone")) {
      const normalizedPhone = normalizeSouthAfricanPhone(userFields.phone);
      if (!isValidSouthAfricanPhone(normalizedPhone)) {
        return res.status(400).json({ message: "Phone number must be a valid South African mobile number starting with 06, 07, or 08." });
      }
      updateFields.phone = normalizedPhone;
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "email")) {
      const normalizedEmail = normalizeEmail(userFields.email);
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Email address must be valid." });
      }
      updateFields.email = normalizedEmail;
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "gender") && !allowedGenders.has(userFields.gender)) {
      return res.status(400).json({ message: "Invalid gender selection." });
    }
    if (Object.prototype.hasOwnProperty.call(userFields, "gender")) {
      updateFields.gender = userFields.gender;
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "address")) {
      updateFields.address = normalizeOptionalText(userFields.address);
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "idNumber")) {
      const normalizedIdNumber = normalizeIdNumber(userFields.idNumber);
      if (!isValidIdNumber(normalizedIdNumber)) {
        return res.status(400).json({ message: "ID number must be 13 digits." });
      }
      updateFields.idNumber = normalizedIdNumber;
    }

    const canUpdatePoliceStation = ["reporter", "authority", "officer"].includes(req.user.role);
    const canUpdateAssignedNgo = ["ngo", "ngo_worker"].includes(req.user.role);

    if (Object.prototype.hasOwnProperty.call(userFields, "policeStationId") || Object.prototype.hasOwnProperty.call(userFields, "policeStationName")) {
      if (!canUpdatePoliceStation) {
        return res.status(403).json({ message: "This account role cannot update a police station." });
      }

      const policeStationId = normalizeAssignmentId(userFields.policeStationId);
      if (!policeStationId) {
        return res.status(400).json({ message: "Police station is required." });
      }

      updateFields.policeStationId = policeStationId;
      updateFields.policeStationName = normalizeOptionalText(userFields.policeStationName);
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "preferredNgoId") || Object.prototype.hasOwnProperty.call(userFields, "preferredNgoName")) {
      return res.status(403).json({
        message: "Reporters cannot choose an NGO. Police assign an NGO when referring a case.",
      });
    }

    if (Object.prototype.hasOwnProperty.call(userFields, "ngoId") || Object.prototype.hasOwnProperty.call(userFields, "ngoName")) {
      if (!canUpdateAssignedNgo) {
        return res.status(403).json({ message: "This account role cannot update an assigned NGO." });
      }

      const ngoId = normalizeAssignmentId(userFields.ngoId);
      if (!ngoId) {
        return res.status(400).json({ message: "NGO is required." });
      }

      updateFields.ngoId = ngoId;
      updateFields.ngoName = normalizeOptionalText(userFields.ngoName);
    }

    if (emergencyContact) {
      const normalizedEmergencyEmail = normalizeEmail(emergencyContact.email);
      if (!isValidEmail(normalizedEmergencyEmail)) {
        return res.status(400).json({ message: "Emergency contact email address must be valid." });
      }
      emergencyContact.email = normalizedEmergencyEmail;

      const normalizedEmergencyPhone = normalizeSouthAfricanPhone(emergencyContact.phone);
      if (!isValidSouthAfricanPhone(normalizedEmergencyPhone)) {
        return res.status(400).json({ message: "Emergency contact number must be a valid South African mobile number starting with 06, 07, or 08." });
      }
      emergencyContact.phone = normalizedEmergencyPhone;
    }

    let user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateFields,
    }).catch(() => null);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (emergencyContact) {
      const contactId = emergencyContact._id || emergencyContact.id;

      if (contactId) {
        const contactDoc = await prisma.emergencyContact.updateMany({
          where: { id: contactId, userId: user.id },
          data: {
            name: emergencyContact.fullName,
            fullName: emergencyContact.fullName,
            phone: emergencyContact.phone,
            relationship: emergencyContact.relationship,
            email: emergencyContact.email,
          },
        });

        if (contactDoc.count === 0) {
          return res.status(404).json({ message: "Emergency contact not found." });
        }
      } else {
        await prisma.emergencyContact.create({
          data: {
            name: emergencyContact.fullName,
            fullName: emergencyContact.fullName,
            phone: emergencyContact.phone,
            relationship: emergencyContact.relationship,
            email: emergencyContact.email,
            userId: user.id,
          },
        });
      }
    }

    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { emergencyContacts: true },
    });

    await syncRoleProfile(user);
    await logAudit({
      user: req.user,
      action: "profile_updated",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      details: "Updated profile information",
      metadata: { updatedFields: Object.keys(updateFields), emergencyContactUpdated: Boolean(emergencyContact) },
    });
    res.json(serializeUser(user));
  } catch (err) {
    next(err);
  }
};

exports.requestAccountDeletion = async (req, res, next) => {
  try {
    if (req.user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts cannot request deletion from this page." });
    }

    let user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        accountDeletionStatus: "scheduled",
        accountDeletionRequestedAt: new Date(),
      },
    }).catch(() => null);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { emergencyContacts: true },
    });

    await syncRoleProfile(user);
    await logAudit({
      user: req.user,
      action: "account_deletion_requested",
      resourceType: "user",
      resourceId: user.id,
      resourceLabel: user.email,
      details: "Account scheduled for permanent deletion",
    });

    res.json({
      message: "Account scheduled for permanent deletion.",
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
};
