/**
 * Builds SOS notification payloads for email + WhatsApp channels.
 * WhatsApp uses wa.me deep links (opened by the client) so no paid API key is required.
 */

const normalizePhoneForWhatsApp = (phone = "") => {
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";

  // South African local format 0XXXXXXXXX -> 27XXXXXXXXX
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `27${digits.slice(1)}`;
  }

  return digits;
};

const buildSosMessage = ({ reporterName, locationText, mapLink, time }) =>
  `🚨 SafeGuard SOS Emergency\n\n` +
  `${reporterName || "A SafeGuard user"} may be in danger.\n` +
  `Time: ${time || new Date().toLocaleString()}\n` +
  `Location: ${locationText || "Location captured"}\n` +
  (mapLink ? `Map: ${mapLink}\n` : "") +
  `\nPlease respond immediately.`;

exports.buildWhatsAppLink = (phone, message) => {
  const digits = normalizePhoneForWhatsApp(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

exports.buildSosNotifications = ({
  emergencyContacts = [],
  reporterName,
  locationText,
  mapLink,
  time,
}) => {
  const message = buildSosMessage({ reporterName, locationText, mapLink, time });

  const whatsapp = emergencyContacts
    .map((contact) => {
      const link = exports.buildWhatsAppLink(contact.phone, message);
      if (!link) return null;
      return {
        contactId: contact._id,
        contactName: contact.fullName || contact.name || "Emergency contact",
        phone: contact.phone,
        link,
        message,
      };
    })
    .filter(Boolean);

  const emailTargets = emergencyContacts.filter((contact) => contact.email);

  return {
    message,
    whatsapp,
    emailTargets,
    summary: {
      contacts: emergencyContacts.length,
      whatsappLinks: whatsapp.length,
      emailTargets: emailTargets.length,
    },
  };
};
