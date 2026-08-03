const prisma = require("../config/prisma");
const { userIdOf } = require("../lib/serialize");

const OFF_TOPIC_REPLY =
  "I'm the SafeGuard Assistant. I can only help with SafeGuard features, reporting incidents, SOS alerts, case tracking, and support services.";

const SYSTEM_KEYWORDS = [
  "report",
  "case",
  "sos",
  "emergency",
  "alert",
  "track",
  "tracking",
  "status",
  "password",
  "reset",
  "forgot",
  "contact",
  "settings",
  "profile",
  "soshanguve",
  "location",
  "police",
  "station",
  "officer",
  "ngo",
  "support",
  "referral",
  "referred",
  "map",
  "help",
  "hello",
  "hi",
  "hey",
  "how many",
  "my name",
  "who am i",
  "account",
  "evidence",
  "submit",
  "create",
  "incident",
  "safeguard",
  "latest",
  "investigation",
  "investigating",
  "pending",
  "resolved",
];

const OFF_TOPIC_HINTS = [
  "mandela",
  "nelson",
  "calculate",
  "math",
  "weather",
  "joke",
  "jokes",
  "news",
  "president",
  "football",
  "soccer",
  "song",
  "movie",
  "capital of",
  "poem",
  "poetry",
  "write me",
  "recipe",
  "stock",
  "crypto",
  "translate",
];

const MATH_PATTERN = /\b\d+\s*[x×*+\-÷/]\s*\d+\b|\bwhat is\s+\d|\bsolve\b|\bequation\b/i;

const normalizeUserId = (userId) => {
  if (!userId) return null;
  if (typeof userId === "object") return userIdOf(userId);
  const asString = String(userId).trim();
  return asString || null;
};

const formatDate = (value) => {
  if (!value) return "unknown date";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const isSafeGuardQuestion = (question) => {
  const q = question.toLowerCase().trim();
  if (!q) return false;

  if (MATH_PATTERN.test(q)) return false;
  if (OFF_TOPIC_HINTS.some((hint) => q.includes(hint))) return false;

  if (
    /\b(my|mine|i have|do i|am i|who am i)\b/.test(q) &&
    /\b(report|case|sos|alert|status|contact|account|name|profile|referral|ngo)\b/.test(q)
  ) {
    return true;
  }

  if (/\b(who am i|my name|how many)\b/.test(q)) return true;

  return SYSTEM_KEYWORDS.some((keyword) => q.includes(keyword));
};

const loadReporterData = async (userIdInput) => {
  const userId = normalizeUserId(userIdInput);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      email: true,
      role: true,
      phone: true,
      policeStationId: true,
      policeStationName: true,
      preferredNgoId: true,
      preferredNgoName: true,
      ngoId: true,
      ngoName: true,
    },
  });

  if (!user) return null;

  const ownerFilter = { userId };

  const [reports, cases, alerts, contacts, reportCount, caseCount, alertCount, contactCount, statusGroups] =
    await Promise.all([
      prisma.report.findMany({
        where: ownerFilter,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          caseId: true,
          incidentType: true,
          status: true,
          location: true,
          createdAt: true,
        },
      }),
      prisma.case.findMany({
        where: ownerFilter,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          caseId: true,
          type: true,
          status: true,
          priority: true,
          location: true,
          createdAt: true,
          sosTriggeredAt: true,
        },
      }),
      prisma.alert.findMany({
        where: ownerFilter,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          type: true,
          status: true,
          createdAt: true,
          location: true,
        },
      }),
      prisma.emergencyContact.findMany({
        where: ownerFilter,
        select: {
          fullName: true,
          name: true,
          phone: true,
          email: true,
          relationship: true,
        },
      }),
      prisma.report.count({ where: ownerFilter }),
      prisma.case.count({ where: ownerFilter }),
      prisma.alert.count({ where: ownerFilter }),
      prisma.emergencyContact.count({ where: ownerFilter }),
      prisma.report.groupBy({
        by: ["status"],
        where: ownerFilter,
        _count: { status: true },
      }),
    ]);

  const statusCounts = statusGroups.reduce((acc, row) => {
    acc[row.status || "unknown"] = row._count.status;
    return acc;
  }, {});

  return {
    user,
    reports,
    cases,
    alerts,
    contacts,
    totals: {
      reports: reportCount,
      cases: caseCount,
      alerts: alertCount,
      contacts: contactCount,
      allCases: reportCount + caseCount,
      statusCounts,
      referredToNgo: statusCounts.referred_to_ngo || 0,
    },
  };
};

const summarizeReports = (reports) => {
  if (!reports.length) return "You have no submitted reports yet.";
  return reports
    .slice(0, 5)
    .map(
      (report, index) =>
        `${index + 1}. ${report.caseId || "No ID"} — ${report.incidentType || "Incident"} — status: ${report.status || "unknown"} — ${formatDate(report.createdAt)} — location: ${report.location?.address || "not set"}`
    )
    .join("\n");
};

const summarizeCases = (cases) => {
  if (!cases.length) return "You have no emergency/SOS cases yet.";
  return cases
    .slice(0, 5)
    .map(
      (item, index) =>
        `${index + 1}. ${item.caseId || "No ID"} — type: ${item.type || "case"} — status: ${item.status || "unknown"} — ${formatDate(item.createdAt)}`
    )
    .join("\n");
};

const summarizeContacts = (contacts) => {
  if (!contacts.length) {
    return "You have no emergency contacts saved. Add email and phone in Settings so SOS can notify them.";
  }
  return contacts
    .map(
      (contact, index) =>
        `${index + 1}. ${contact.fullName || contact.name || "Contact"} (${contact.relationship || "relationship not set"}) — email: ${contact.email || "missing"} — phone: ${contact.phone || "missing"}`
    )
    .join("\n");
};

const buildHowToAnswer = (question) => {
  const q = question.toLowerCase();

  if (q.includes("under investigation") || q.includes("investigating")) {
    return '"Under Investigation" / investigating means police at SAPS Soshanguve are actively reviewing your report.';
  }
  if (q.includes("report") || q.includes("submit") || q.includes("create") || q.includes("incident")) {
    return "To create a report: go to Create Report, choose incident type, enter a Soshanguve-only location, add date and description, attach evidence if available, then submit.";
  }
  if (q.includes("sos") || q.includes("emergency") || q.includes("alert")) {
    return "Use Emergency Alert for SOS. SafeGuard captures your location, notifies police, and can email/WhatsApp your emergency contacts. SOS works only inside Soshanguve.";
  }
  if (q.includes("password") || q.includes("reset") || q.includes("forgot")) {
    return "On Sign In, click Forgot Password, enter your email, then open the reset link emailed to you.";
  }
  if (q.includes("soshanguve") || q.includes("location")) {
    return "SafeGuard is localized to Soshanguve only. Reports and SOS outside Soshanguve are blocked. Police officers are assigned to SAPS Soshanguve Police Station.";
  }
  if (q.includes("track") || q.includes("status") || q.includes("tracking")) {
    return "Open Track Case to see your reports and updates from police/NGO workers.";
  }
  if (q.includes("settings") || q.includes("profile") || q.includes("contact")) {
    return "In Settings you can update your profile and emergency contacts (name, relationship, email, phone). Contacts are used for SOS notifications.";
  }
  if (q.includes("ngo") || q.includes("referral") || q.includes("referred") || q.includes("police")) {
    return "Police at SAPS Soshanguve assign an NGO when they refer your case. You cannot choose an NGO yourself. Check Track Case for referral status.";
  }

  return null;
};

exports.askChatbot = async (userId, questionInput) => {
  const question = String(questionInput || "").trim();
  if (!question) {
    return {
      answer: "Please ask a SafeGuard question about the system or your cases.",
      usedDatabase: false,
    };
  }

  if (!isSafeGuardQuestion(question)) {
    return { answer: OFF_TOPIC_REPLY, usedDatabase: false };
  }

  const data = await loadReporterData(userId);
  if (!data) {
    return { answer: "I could not load your account from the database.", usedDatabase: false };
  }

  const { user, reports, cases, alerts, contacts, totals } = data;
  const q = question.toLowerCase();

  if (
    q.includes("my name") ||
    q.includes("who am i") ||
    q.includes("my account") ||
    (q.includes("profile") && (q.includes("my") || q.includes("show")))
  ) {
    return {
      answer:
        `You are ${user.fullName || "a SafeGuard user"} (${user.email}). ` +
        `Role: ${user.role}. Police station: ${user.policeStationName || "SAPS Soshanguve Police Station"}. ` +
        `NGO is assigned by police when a case is referred. ` +
        `Database totals — reports: ${totals.reports}, emergency cases: ${totals.cases}, alerts: ${totals.alerts}, emergency contacts: ${totals.contacts}.`,
      usedDatabase: true,
      context: totals,
    };
  }

  if (
    q.includes("referred") ||
    q.includes("referral") ||
    (q.includes("ngo") && (q.includes("my") || q.includes("have i") || q.includes("been")))
  ) {
    const referredReports = reports.filter((r) => r.status === "referred_to_ngo");
    return {
      answer:
        totals.referredToNgo > 0
          ? `Yes — from the database, ${totals.referredToNgo} of your report(s) are referred to an NGO.` +
            (referredReports.length
              ? `\nLatest referred cases:\n${summarizeReports(referredReports)}`
              : "")
          : `No — none of your ${totals.reports} report(s) currently have status "referred_to_ngo". Police assign the NGO when they refer a case.`,
      usedDatabase: true,
      context: { referredToNgo: totals.referredToNgo, reports: totals.reports },
    };
  }

  if (q.includes("how many") || q.includes("case count") || q.includes("number of") || q.includes("how many reports")) {
    const statuses = Object.entries(totals.statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");
    return {
      answer:
        `From the database, ${user.fullName}: you have ${totals.reports} report(s), ${totals.cases} emergency/SOS case(s), and ${totals.alerts} alert(s). ` +
        (statuses ? `Report statuses — ${statuses}.` : "No report status breakdown yet."),
      usedDatabase: true,
      context: totals,
    };
  }

  if (
    q.includes("latest case") ||
    q.includes("latest report") ||
    q.includes("my latest") ||
    q.includes("most recent")
  ) {
    const latestReport = reports[0];
    const latestSos = cases[0];
    if (!latestReport && !latestSos) {
      return {
        answer: "You do not have any reports or SOS cases in the database yet.",
        usedDatabase: true,
      };
    }
    const parts = [];
    if (latestReport) {
      parts.push(
        `Latest report: ${latestReport.caseId || "No ID"} — ${latestReport.incidentType || "incident"} — status "${latestReport.status}" — ${formatDate(latestReport.createdAt)}.`
      );
    }
    if (latestSos) {
      parts.push(
        `Latest SOS/emergency case: ${latestSos.caseId || "No ID"} — status "${latestSos.status}" — ${formatDate(latestSos.createdAt)}.`
      );
    }
    return { answer: parts.join(" "), usedDatabase: true };
  }

  if (q.includes("my report") || q.includes("list report") || q.includes("show report") || q.includes("recent report")) {
    return {
      answer: `Here are your latest reports from the database (showing up to 5 of ${totals.reports}):\n${summarizeReports(reports)}`,
      usedDatabase: true,
      context: { reports: totals.reports },
    };
  }

  if (q.includes("sos") || q.includes("emergency case") || q.includes("my alert") || q.includes("my sos")) {
    return {
      answer:
        `Your emergency/SOS records from the database (${totals.cases} total):\n${summarizeCases(cases)}\n\n` +
        `Alerts (${totals.alerts} total): ${
          alerts.length
            ? alerts
                .slice(0, 3)
                .map((a) => `${a.type || "alert"} (${a.status || "unknown"}) on ${formatDate(a.createdAt)}`)
                .join("; ")
            : "none yet"
        }.`,
      usedDatabase: true,
      context: { cases: totals.cases, alerts: totals.alerts },
    };
  }

  if (q.includes("status")) {
    const latest = reports[0];
    if (!latest) {
      return {
        answer: "You have no reports in the database yet, so there is no status to show. Create a report first.",
        usedDatabase: true,
      };
    }
    return {
      answer:
        `Your latest report ${latest.caseId || ""} is currently "${latest.status || "unknown"}" ` +
        `(${latest.incidentType || "incident"}, submitted ${formatDate(latest.createdAt)}). ` +
        `Overall status counts: ${Object.entries(totals.statusCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}.`,
      usedDatabase: true,
    };
  }

  if (q.includes("contact")) {
    return {
      answer: `Emergency contacts saved in the database:\n${summarizeContacts(contacts)}`,
      usedDatabase: true,
      context: { contacts: totals.contacts },
    };
  }

  if (q.includes("station") || q.includes("police") || q.includes("ngo")) {
    return {
      answer:
        `From your account record: police station = ${user.policeStationName || "SAPS Soshanguve Police Station"}; ` +
        `NGO referrals are assigned by police only. SafeGuard only uses Soshanguve SAPS.`,
      usedDatabase: true,
    };
  }

  const howTo = buildHowToAnswer(question);
  if (howTo) {
    return {
      answer:
        `${howTo}\n\nYour live database snapshot: ${totals.reports} report(s), ${totals.cases} emergency case(s), ${totals.contacts} emergency contact(s).`,
      usedDatabase: true,
      context: totals,
    };
  }

  return {
    answer:
      `${OFF_TOPIC_REPLY}\n\nTry asking: "How many reports have I submitted?", "What is my latest case?", "What is the status of my report?", "Have I been referred to an NGO?", or "How do I trigger an SOS?".`,
    usedDatabase: false,
  };
};

exports.getChatbotGreeting = async (userId) => {
  const data = await loadReporterData(userId);
  if (!data) {
    return "Hi. I can help with SafeGuard system questions.";
  }

  const { user, totals } = data;
  return (
    `Hi ${user.fullName || "there"}. I am connected to the SafeGuard database. ` +
    `You currently have ${totals.reports} report(s) and ${totals.cases} emergency/SOS case(s). ` +
    `Ask me about your cases, status, contacts, or how to use the system.`
  );
};

exports._internal = {
  isSafeGuardQuestion,
  loadReporterData,
  normalizeUserId,
  OFF_TOPIC_REPLY,
};
