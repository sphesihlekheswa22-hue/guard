import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileSettings from "@/components/reporter/Settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { io } from "socket.io-client";
import { uploadUrl, evidenceUrl } from "@/lib/api";
import { removeChatbaseWidget } from "@/lib/chatbot";
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  UserCheck,
  FileText,
  Eye,
  CheckCircle,
  Phone,
  X,
  CheckSquare2,
  Settings as SettingsIcon,
} from "lucide-react";

const navItems = [
  { to: "/dashboard/ngo", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/ngo/referrals", label: "Referrals", icon: Users },
  { to: "/dashboard/ngo/update-status", label: "Update Status", icon: CheckCircle },
  { to: "/dashboard/ngo/resolved", label: "Resolved Referrals", icon: CheckSquare2 },
  { to: "/dashboard/ngo/settings", label: "Profile", icon: SettingsIcon },
];

const survivors = [
  { id: "SRV-001", caseId: "SG-A3F8K2", counselor: "Dr. Amara N.", status: "active", sessions: 4 },
  { id: "SRV-002", caseId: "SG-D4R6T3", counselor: "Sarah K.", status: "active", sessions: 1 },
  { id: "SRV-003", caseId: "SG-C1P5Q8", counselor: "Dr. Amara N.", status: "completed", sessions: 12 },
  { id: "SRV-004", caseId: "SG-E8W1Y6", counselor: "Pending", status: "awaiting", sessions: 0 },
];

const statusStyles: Record<string, string> = {
  active: "bg-safe/10 text-safe",
  completed: "bg-primary/10 text-primary",
  awaiting: "bg-warning/10 text-warning",
};

const isResolvedReferral = (referral: any) => referral?.status === "resolved";

const getStatusDisplay = (status?: string) => {
  const statusMap: Record<string, string> = {
    referred_to_ngo: "Pending",
    call_initiated: "Call Initiated",
    arranged_counselling: "Counselling Arranged",
    resolved: "Resolved",
  };
  return status ? statusMap[status] || status.replace(/_/g, " ") : "N/A";
};

const formatDateTime = (date?: string) => {
  return date ? new Date(date).toLocaleString() : "N/A";
};

const formatLocation = (location: any) => {
  if (!location) return "N/A";
  if (typeof location === "string") return location || "N/A";
  return location.address || (Array.isArray(location.coordinates) ? location.coordinates.join(", ") : "N/A");
};

const getReporterName = (user: any) => {
  return user?.fullName || user?.name || "Not provided";
};

const EvidencePreviewList = ({ evidenceIds = [] }: { evidenceIds?: any[] }) => {
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);

  const handleViewEvidence = (evidence: any) => {
    const evidenceId = evidence?._id || evidence?.id;
    const token = localStorage.getItem("token");
    if (evidenceId) {
      fetch(`/api/evidence/${evidenceId}/view`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      }).catch(() => null);
    }
    setViewingEvidence(evidence);
  };

  if (!evidenceIds || evidenceIds.length === 0) {
    return <p className="text-muted-foreground text-sm mt-1">No evidence files</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {evidenceIds.map((evidence: any, index: number) => (
        <div key={evidence._id || index} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{evidence.name || `Evidence ${index + 1}`}</p>
              <p className="text-xs text-muted-foreground capitalize">{evidence.type || "file"}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewEvidence(evidence)}
            disabled={!evidence.fileUrl}
          >
            <Eye className="h-4 w-4 mr-1" /> View
          </Button>
        </div>
      ))}

      {viewingEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg p-6 border border-border/50 shadow-sm space-y-3 max-w-2xl w-full relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              onClick={() => setViewingEvidence(null)}
              aria-label="Close evidence preview"
            >
              <X className="h-5 w-5" />
            </Button>
            <h3 className="font-semibold text-foreground pr-10">{viewingEvidence.name || "Evidence"}</h3>
            {viewingEvidence.type === "image" ? (
              <img src={evidenceUrl(viewingEvidence)} alt="Evidence" className="w-full rounded-lg border border-border max-h-[70vh] object-contain" />
            ) : viewingEvidence.type === "audio" ? (
              <audio controls src={evidenceUrl(viewingEvidence)} className="w-full" autoPlay controlsList="nodownload" />
            ) : (
              <div className="bg-muted/50 rounded-lg p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">File type: {viewingEvidence.type || "file"}</p>
                <Button variant="outline" onClick={() => window.open(evidenceUrl(viewingEvidence), "_blank")}>
                  Open File
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const normalizePdfText = (value: any) => {
  return String(value ?? "N/A")
    .replace(/\r?\n/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapePdfText = (value: any) => {
  return normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
};

const pdfTextWidth = (text: string, fontSize: number) => normalizePdfText(text).length * fontSize * 0.52;

const wrapPdfText = (text: any, width: number, fontSize = 8, maxLines?: number) => {
  const maxChars = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  const words = normalizePdfText(text).split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!word) return;
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });

  if (current) lines.push(current);

  const wrapped = lines.length ? lines : ["N/A"];
  if (!maxLines || wrapped.length <= maxLines) return wrapped;

  const visibleLines = wrapped.slice(0, maxLines);
  const lastLine = visibleLines[visibleLines.length - 1];
  visibleLines[visibleLines.length - 1] = `${lastLine.slice(0, Math.max(0, maxChars - 3))}...`;
  return visibleLines;
};

const formatPdfDate = (date?: string) => {
  return date ? new Date(date).toLocaleDateString() : "N/A";
};

const textCommand = (
  text: any,
  x: number,
  y: number,
  size = 8,
  color = "0.12 0.16 0.22",
  font = "F1"
) => `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const rectCommand = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
  stroke = "0.78 0.82 0.88"
) => {
  const commands = [];
  if (fill) commands.push(`q ${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
  commands.push(`q ${stroke} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
  return commands.join("\n");
};

const buildPdfDocument = (pages: string[][], pageWidth: number, pageHeight: number) => {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageCommands, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      ...pageCommands,
      textCommand(`Page ${index + 1} of ${pages.length}`, pageWidth - 92, 18, 7, "0.45 0.49 0.56"),
    ].join("\n");

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

const buildReferralReportPdf = (referrals: any[]) => {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 32;
  const contentWidth = pageWidth - margin * 2;
  const colors = {
    navy: "0.08 0.16 0.28",
    text: "0.12 0.16 0.22",
    muted: "0.42 0.46 0.53",
    border: "0.78 0.82 0.88",
    headerFill: "0.91 0.94 0.98",
    softFill: "0.97 0.98 1",
    cardBlue: "0.90 0.95 1",
    cardGreen: "0.91 0.98 0.94",
    cardPurple: "0.95 0.93 0.99",
    white: "1 1 1",
  };
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;

  const addPage = () => {
    if (commands.length) pages.push(commands);
    commands = [];
    y = pageHeight - margin;
  };

  const ensureSpace = (height: number) => {
    if (y - height < margin + 18) addPage();
  };

  const addText = (text: any, x: number, textY: number, size = 8, color = colors.text, font = "F1") => {
    commands.push(textCommand(text, x, textY, size, color, font));
  };

  const addRect = (x: number, rectY: number, width: number, height: number, fill?: string, stroke = colors.border) => {
    commands.push(rectCommand(x, rectY, width, height, fill, stroke));
  };

  const drawWrappedText = (text: any, x: number, topY: number, width: number, size = 8, lineHeight = 10, maxLines?: number) => {
    const lines = wrapPdfText(text, width, size, maxLines);
    lines.forEach((line, index) => addText(line, x, topY - size - index * lineHeight, size));
  };

  const drawTableRow = (
    cells: any[],
    widths: number[],
    options: { header?: boolean; minHeight?: number; maxLines?: number; fill?: string } = {}
  ) => {
    const fontSize = options.header ? 7.5 : 7.2;
    const lineHeight = 9;
    const wrappedCells = cells.map((cell, index) =>
      wrapPdfText(cell, widths[index] - 10, fontSize, options.maxLines)
    );
    const rowHeight = Math.max(options.minHeight || 24, Math.max(...wrappedCells.map(lines => lines.length)) * lineHeight + 12);

    ensureSpace(rowHeight);

    let x = margin;
    wrappedCells.forEach((lines, index) => {
      addRect(x, y - rowHeight, widths[index], rowHeight, options.fill || (options.header ? colors.headerFill : colors.white));
      lines.forEach((line, lineIndex) => {
        addText(
          line,
          x + 5,
          y - 14 - lineIndex * lineHeight,
          fontSize,
          options.header ? colors.navy : colors.text,
          options.header ? "F2" : "F1"
        );
      });
      x += widths[index];
    });
    y -= rowHeight;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(32);
    y -= 12;
    addRect(margin, y - 20, contentWidth, 20, colors.navy, colors.navy);
    addText(title, margin + 8, y - 14, 10, colors.white, "F2");
    y -= 20;
  };

  const drawKeyValueTable = (title: string, rows: Array<[string, any]>) => {
    drawSectionTitle(title);
    rows.forEach(([label, value], index) => {
      const labelWidth = 138;
      const valueWidth = contentWidth - labelWidth;
      const valueLines = wrapPdfText(value, valueWidth - 12, 7.5);
      const rowHeight = Math.max(24, valueLines.length * 10 + 12);
      ensureSpace(rowHeight);
      addRect(margin, y - rowHeight, labelWidth, rowHeight, colors.headerFill);
      addRect(margin + labelWidth, y - rowHeight, valueWidth, rowHeight, index % 2 === 0 ? colors.white : colors.softFill);
      addText(label, margin + 6, y - 15, 7.5, colors.navy, "F2");
      valueLines.forEach((line, lineIndex) => {
        addText(line, margin + labelWidth + 6, y - 15 - lineIndex * 10, 7.5);
      });
      y -= rowHeight;
    });
  };

  const activeCount = referrals.filter(r => !isResolvedReferral(r)).length;
  const resolvedCount = referrals.filter(isResolvedReferral).length;

  addRect(0, pageHeight - 78, pageWidth, 78, colors.navy, colors.navy);
  addText("NGO Referral Cases Report", margin, pageHeight - 38, 18, colors.white, "F2");
  addText(`Generated ${formatDateTime(new Date().toISOString())}`, margin, pageHeight - 58, 9, "0.86 0.91 0.98");
  y = pageHeight - 104;

  const cardWidth = (contentWidth - 24) / 3;
  [
    ["Total Referrals", referrals.length, colors.cardBlue],
    ["Active Referrals", activeCount, colors.cardGreen],
    ["Resolved Referrals", resolvedCount, colors.cardPurple],
  ].forEach(([label, value, fill], index) => {
    const x = margin + index * (cardWidth + 12);
    addRect(x, y - 58, cardWidth, 58, fill as string);
    addText(label, x + 12, y - 19, 8, colors.muted, "F2");
    addText(value, x + 12, y - 43, 20, colors.navy, "F2");
  });
  y -= 82;

  drawSectionTitle("Referral Summary Table");
  const summaryWidths = [72, 88, 110, 118, 122, 86, 182];
  drawTableRow(
    ["Case ID", "Status", "Incident", "Reporter", "Contact", "Date", "Location / Description"],
    summaryWidths,
    { header: true, minHeight: 26 }
  );
  referrals.forEach((referral) => {
    const user = referral.userId || {};
    drawTableRow(
      [
        referral.caseId || "N/A",
        getStatusDisplay(referral.status),
        referral.incidentType || "N/A",
        getReporterName(user),
        `${user.email || "No email"} | ${user.phone || "No phone"}`,
        formatPdfDate(referral.createdAt),
        `${formatLocation(referral.location)}. ${referral.description || "No description"}`,
      ],
      summaryWidths,
      { minHeight: 34, maxLines: 3 }
    );
  });

  referrals.forEach((referral, index) => {
    const user = referral.userId || {};
    drawKeyValueTable(`Referral Detail ${index + 1}: ${referral.caseId || "N/A"}`, [
      ["Case ID", referral.caseId || "N/A"],
      ["Status", `${getStatusDisplay(referral.status)} (${isResolvedReferral(referral) ? "Resolved" : "Active"})`],
      ["Incident Type", referral.incidentType || "N/A"],
      ["Description", referral.description || "N/A"],
      ["Location", formatLocation(referral.location)],
      ["Created", formatDateTime(referral.createdAt)],
      ["Last Updated", formatDateTime(referral.updatedAt)],
      ["Reporter Name", getReporterName(user)],
      ["Reporter Email", user.email || "Not provided"],
      ["Reporter Phone", user.phone || "Not provided"],
      ["Reporter Role", user.role || "Not provided"],
      ["Police Station", user.policeStationName || referral.policeStationId || "Not provided"],
      ["Assigned NGO", referral.referredNgoName || referral.referredNgoId || user.preferredNgoName || "Not assigned"],
      ["Evidence Files", referral.evidenceIds?.length || 0],
    ]);

    if (referral.evidenceIds?.length) {
      drawSectionTitle(`Evidence - ${referral.caseId || "N/A"}`);
      drawTableRow(["#", "Name", "Type", "File URL"], [34, 230, 90, contentWidth - 354], { header: true });
      referral.evidenceIds.forEach((evidence: any, evidenceIndex: number) => {
        drawTableRow(
          [evidenceIndex + 1, evidence.name || "Unnamed", evidence.type || "File", evidenceUrl(evidence) || "No URL"],
          [34, 230, 90, contentWidth - 354],
          { maxLines: 2 }
        );
      });
    }

    if (referral.statusHistory?.length) {
      drawSectionTitle(`Status History - ${referral.caseId || "N/A"}`);
      drawTableRow(["Status", "Changed By", "Date", "Reason"], [130, 110, 138, contentWidth - 378], { header: true });
      referral.statusHistory.forEach((entry: any) => {
        drawTableRow(
          [getStatusDisplay(entry.status), entry.changedByRole || "Unknown", formatDateTime(entry.changedAt), entry.reason || "N/A"],
          [130, 110, 138, contentWidth - 378],
          { maxLines: 3 }
        );
      });
    }

    if (referral.interactions?.length) {
      drawSectionTitle(`Progress Notes - ${referral.caseId || "N/A"}`);
      drawTableRow(["Date", "Added By", "Type", "Note"], [140, 150, 70, contentWidth - 360], { header: true });
      referral.interactions.forEach((interaction: any) => {
        const createdBy = interaction.createdBy?.fullName || interaction.createdBy?.name || interaction.createdBy?.email || "Unknown";
        drawTableRow(
          [formatDateTime(interaction.createdAt), createdBy, interaction.type || "note", interaction.description || "N/A"],
          [140, 150, 70, contentWidth - 360],
          { maxLines: 4 }
        );
      });
    }
  });

  if (commands.length) pages.push(commands);
  return buildPdfDocument(pages.length ? pages : [[]], pageWidth, pageHeight);
};

const Overview = () => {
  const [user, setUser] = useState<{ fullName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/users/profile", {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        });
        if (!res.ok) throw new Error("Failed to fetch user profile");
        const data = await res.json();
        setUser(data);
      } catch (err: any) {
        setError(err.message || "Error fetching user");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // Fetch referrals for stats
  useEffect(() => {
    const fetchReferrals = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/reports", {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (res.ok) {
          const data = await res.json();
          setReferrals(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Error fetching referrals:", err);
      } finally {
        setReferralsLoading(false);
      }
    };
    fetchReferrals();
  }, []);

  // Calculate stats from real data. A referral remains active until it is resolved.
  const activeCases = referrals.filter(r => !isResolvedReferral(r)).length;
  const resolvedCases = referrals.filter(isResolvedReferral).length;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">
          {loading
            ? "Loading..."
            : error
            ? "Welcome back"
            : `Welcome back, ${user?.fullName || "User"}`}
        </h2>
        <p className="text-base text-gray-700">Survivor support and resource management overview</p>
        {error && <span className="text-sm text-red-500 mt-1">{error}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {[
          { label: "Total Referrals", value: referralsLoading ? "..." : referrals.length, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
          { label: "Active Referrals", value: referralsLoading ? "..." : activeCases, icon: Calendar, color: "text-safe", bgColor: "bg-safe/10" },
          { label: "Resolved Cases", value: referralsLoading ? "..." : resolvedCases, icon: TrendingUp, color: "text-primary", bgColor: "bg-primary/10" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/80 bg-white/90 p-4 shadow-soft transition-shadow hover:shadow-elevated sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bgColor}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{s.value}</p>
          </div>
        ))}
      </div>
      <SurvivorTable referrals={referrals} />
    </div>
  );
};

const SurvivorTable = ({ referrals }: { referrals: any[] }) => {
  const [exporting, setExporting] = useState(false);

  // Sort by date (newest first) and take latest 3
  const latestReferrals = [...referrals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const handleExport = async () => {
    if (referrals.length === 0) return;

    setExporting(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: token ? `Bearer ${token}` : "" };

      const detailedReferrals = await Promise.all(referrals.map(async (referral) => {
        try {
          const [detailRes, interactionsRes] = await Promise.all([
            fetch(`/api/reports/${referral._id || referral.id}`, { headers }),
            fetch(`/api/reports/${referral._id || referral.id}/interactions`, { headers }),
          ]);

          const detail = detailRes.ok ? await detailRes.json() : referral;
          const interactions = interactionsRes.ok ? await interactionsRes.json() : referral.interactions || [];

          return {
            ...referral,
            ...detail,
            interactions: Array.isArray(interactions) ? interactions : [],
          };
        } catch (err) {
          console.error("Failed to fetch referral details for export:", err);
          return referral;
        }
      }));

      const blob = buildReferralReportPdf(detailedReferrals);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `referral-cases-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setExporting(false);
    }
  };

  const tableStatusStyles: Record<string, string> = {
    referred_to_ngo: "bg-purple/10 text-purple",
    pending: "bg-primary/10 text-primary",
    investigating: "bg-warning/10 text-warning",
    call_initiated: "bg-blue/10 text-blue",
    arranged_counselling: "bg-indigo/10 text-indigo",
    resolved: "bg-safe/10 text-safe",
  };

  return (
  <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
    <div className="p-4 sm:p-5 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="font-semibold text-foreground">Referral Cases</h3>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const sorted = [...referrals].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            const rows = [
              ["Case ID", "Incident Type", "Status", "Created At", "Description"],
              ...sorted.map((r) => [
                r.caseId || r.id || "",
                r.incidentType || r.type || "",
                r.status || "",
                r.createdAt ? new Date(r.createdAt).toISOString() : "",
                (r.description || "").replace(/\s+/g, " ").slice(0, 200),
              ]),
            ];
            const csv = rows
              .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
              .join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `ngo-referrals-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          disabled={referrals.length === 0}
        >
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || referrals.length === 0}>
          <FileText className="h-4 w-4 mr-2" /> {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-[680px] w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left p-4 font-semibold text-muted-foreground">Case ID</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Incident Type</th>
            <th className="text-left p-4 font-semibold text-muted-foreground hidden md:table-cell">Description</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Date</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {latestReferrals.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-center text-muted-foreground">No referral cases yet</td>
            </tr>
          ) : (
            latestReferrals.map((r) => (
              <tr key={r._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-4 font-medium text-foreground">{r.caseId || "N/A"}</td>
                <td className="p-4 font-semibold text-foreground">{r.incidentType || "N/A"}</td>
                <td className="p-4 text-muted-foreground hidden md:table-cell">{r.description ? r.description.slice(0, 50) + (r.description.length > 50 ? "..." : "") : "N/A"}</td>
                <td className="p-4 text-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "N/A"}</td>
                <td className="p-4"><Badge className={`${tableStatusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>{getStatusDisplay(r.status)}</Badge></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
  );
};

const Referrals = () => {
  const { toast } = useToast();
  const [selectedReferral, setSelectedReferral] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<any>(null);

  const fetchReferrals = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch referrals");
      const data = await res.json();
      // Backend returns all cases referred to this NGO; UI separates active/resolved.
      setReferrals(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Error fetching referrals:", err);
      toast({
        title: "Failed to load referrals",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, []);

  // Setup WebSocket connection for real-time referral updates
  useEffect(() => {
    try {
      socketRef.current = io(window.location.origin, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for report status updates (when authority refers cases)
      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated:", data);
        fetchReferrals();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket:", err);
    }
  }, [toast]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReferrals();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const selectedCase = selectedReferral ? referrals.find(r => r._id === selectedReferral) : null;

  const priorityStyles: Record<string, string> = {
    critical: "bg-emergency/10 text-emergency",
    high: "bg-warning/10 text-warning",
    medium: "bg-primary/10 text-primary",
  };

  const statusStyles: Record<string, string> = {
    pending: "bg-primary/10 text-primary",
    investigating: "bg-warning/10 text-warning",
    referred_to_ngo: "bg-purple/10 text-purple",
    call_initiated: "bg-blue/10 text-blue",
    arranged_counselling: "bg-indigo/10 text-indigo",
    resolved: "bg-safe/10 text-safe",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800">Referrals</h2>
        <p className="text-base text-gray-700">Review and manage cases referred to your organization</p>
      </div>
      {loading ? (
        <div className="p-6 text-center text-muted-foreground">Loading referrals...</div>
      ) : referrals.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
          No referrals at this time
        </div>
      ) : (
        <div className="space-y-4">
          {referrals.map((r) => (
            <div key={r._id} className="bg-card rounded-lg p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-bold text-lg text-foreground">{r.caseId}</p>
                    <Badge className="bg-purple/10 text-purple border-0 capitalize">referred</Badge>
                  </div>
                  <p className="font-semibold text-foreground text-base mb-2">{r.incidentType}</p>
                  <p className="text-sm text-muted-foreground">Date Referred: <span className="font-medium">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</span></p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedReferral(r._id)}>
                    <Eye className="h-4 w-4 mr-2" /> View
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCase && (
        <div className="bg-card rounded-lg p-6 border border-border/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Referral Details</h3>
            <Button variant="outline" size="sm" onClick={() => setSelectedReferral(null)}>Close</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Case ID</span>
              <p className="font-semibold text-foreground">{selectedCase.caseId}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Incident Type</span>
              <p className="font-semibold text-foreground">{selectedCase.incidentType}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={`${statusStyles[selectedCase.status] || "bg-gray-100 text-gray-600"} border-0 capitalize w-fit`}>{selectedCase.status}</Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Date Referred</span>
              <p className="font-semibold text-foreground">{selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleDateString() : "—"}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Description</span>
              <p className="font-semibold text-foreground">{selectedCase.description || "No description provided"}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Location</span>
              <p className="font-semibold text-foreground">{typeof selectedCase.location === "string" ? selectedCase.location : (selectedCase.location?.address || "Unknown")}</p>
            </div>
            <div className="md:col-span-2">
              <span className="text-sm text-muted-foreground">Evidence Files ({selectedCase.evidenceIds?.length || 0})</span>
              <EvidencePreviewList evidenceIds={selectedCase.evidenceIds || []} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const UpdateStatus = () => {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [progressNote, setProgressNote] = useState<string>("");
  const [progressNotes, setProgressNotes] = useState<any[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const socketRef = useRef<any>(null);

  const fetchReferrals = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (res.ok) {
        const data = await res.json();
        setReferrals(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching referrals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, []);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    try {
      socketRef.current = io(window.location.origin, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated in UpdateStatus:", data);
        fetchReferrals();
        // Update selected case if it was updated
        if (selectedCase && selectedCase._id === data.reportId) {
          fetchCaseDetails(data.reportId);
        }
      });

      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added:", data);
        // Update selected case if it was updated
        if (selectedCase && selectedCase._id === data.reportId) {
          fetchCaseDetails(data.reportId);
        }
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket:", err);
    }
  }, [selectedCase?._id]);

  // Fetch full case details when modal opens
  const fetchCaseDetails = async (caseId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/reports/${caseId}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCase(data);
        
        // Fetch interactions for this case
        const interactionsRes = await fetch(`/api/reports/${caseId}/interactions`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (interactionsRes.ok) {
          const interactions = await interactionsRes.json();
          // Convert interactions to progress notes format
          const notes = interactions
            .filter((i: any) => i.type === "note")
            .map((i: any) => ({
              id: i._id,
              text: i.description,
              date: new Date(i.createdAt).toLocaleString(),
              createdBy: i.createdBy?.fullName || i.createdBy?.name || "Unknown",
            }));
          setProgressNotes(notes);
        }
      }
    } catch (err) {
      console.error("Error fetching case details:", err);
    }
  };

  const handleStatusUpdate = async (caseId: string, status: string) => {
    if (!status) {
      toast({ title: "Please select a status", variant: "destructive" });
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/reports/${caseId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: `Status updated to ${status.replace("_", " ")}` });
        setNewStatus("");
        setSelectedCase(data.report);
        fetchReferrals();
      } else {
        throw new Error("Failed to update status");
      }
    } catch (err: any) {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    }
  };

  const handleCall = async () => {
    if (!selectedCase?.userId?.phone) {
      toast({ title: "Phone number not available", description: "No phone number on file for this victim", variant: "destructive" });
      return;
    }
    
    setIsCalling(true);
    
    try {
      // Update status to call_initiated
      await handleStatusUpdate(selectedCase._id, "call_initiated");
      
      // Open phone app with tel: protocol
      window.location.href = `tel:${selectedCase.userId.phone}`;
      
      toast({ title: "Call initiated", description: "Attempting to connect to " + selectedCase.userId.phone });
    } catch (err: any) {
      toast({ title: "Failed to initiate call", description: err.message, variant: "destructive" });
    } finally {
      setIsCalling(false);
    }
  };

  const handleAddProgressNote = async () => {
    if (!progressNote.trim()) {
      toast({ title: "Please enter a progress note", variant: "destructive" });
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/reports/${selectedCase._id}/interactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ 
          type: "note",
          description: progressNote 
        }),
      });
      if (res.ok) {
        const newInteraction = await res.json();
        const newNote = {
          id: newInteraction._id || Date.now(),
          text: newInteraction.description,
          date: new Date(newInteraction.createdAt).toLocaleString(),
          createdBy: newInteraction.createdBy?.name || "NGO Worker",
        };
        setProgressNotes([...progressNotes, newNote]);
        setProgressNote("");
        toast({ title: "Progress note saved successfully" });
      } else {
        throw new Error("Failed to save progress note");
      }
    } catch (err: any) {
      toast({ title: "Failed to save progress note", description: err.message, variant: "destructive" });
    }
  };

  // Separate active and resolved referrals
  const activeReferrals = referrals.filter(r => r.status !== "resolved");
  const resolvedReferrals = referrals.filter(r => r.status === "resolved");

  const statusStyles: Record<string, string> = {
    pending: "bg-primary/10 text-primary",
    investigating: "bg-warning/10 text-warning",
    referred_to_ngo: "bg-purple/10 text-purple",
    call_initiated: "bg-blue/10 text-blue",
    arranged_counselling: "bg-indigo/10 text-indigo",
    resolved: "bg-safe/10 text-safe",
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      referred_to_ngo: "Pending",
      call_initiated: "Call Initiated",
      arranged_counselling: "Counselling Arranged",
      resolved: "Resolved",
    };
    return statusMap[status] || status.replace("_", " ");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-muted p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800">Update Referral Status</h2>
        <p className="text-base text-gray-700">Manage cases, contact victims, and track interactions</p>
      </div>
      
      {/* Active Referrals Section */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
          Active Referrals
        </h3>
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading referrals...</div>
        ) : activeReferrals.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
            No active referrals
          </div>
        ) : (
          <div className="space-y-4">
            {activeReferrals.map((r) => (
              <div key={r._id} className="bg-card rounded-lg p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-bold text-lg text-foreground">{r.caseId}</p>
                      <Badge className={`${statusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                        {getStatusDisplay(r.status)}
                      </Badge>
                    </div>
                    <p className="font-semibold text-foreground text-base">{r.incidentType}</p>
                    <p className="text-sm text-muted-foreground mt-1">Date: {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchCaseDetails(r._id)}>
                      Manage
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Referrals Section */}
      {resolvedReferrals.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border/30">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-safe rounded-full"></span>
            Resolved Referrals
          </h3>
          <div className="space-y-4">
            {resolvedReferrals.map((r) => (
              <div key={r._id} className="bg-card rounded-lg p-6 border border-border/50 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-bold text-lg text-foreground">{r.caseId}</p>
                      <Badge className={`${statusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                        {getStatusDisplay(r.status)}
                      </Badge>
                    </div>
                    <p className="font-semibold text-foreground text-base">{r.incidentType}</p>
                    <p className="text-sm text-muted-foreground mt-1">Resolved: {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchCaseDetails(r._id)}>
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-4">
          <div className="bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-lg mx-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-foreground">Update Case Status</h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedCase(null);
                  setNewStatus("");
                }}
                className="rounded p-1 hover:bg-muted"
                aria-label="Close update case status"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Case #{selectedCase.caseId} — {selectedCase.incidentType}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Current Status:</span>
                  <Badge className={`${statusStyles[selectedCase.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                    {getStatusDisplay(selectedCase.status)}
                  </Badge>
                </div>
              </div>

              {/* Victim/Reporter Details */}
              {selectedCase.userId && (
                <div className="bg-blue-50 rounded-lg p-4 space-y-2 border border-blue-200">
                  <p className="text-sm font-semibold text-foreground">Reporter/Victim Details</p>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground"><strong>Name:</strong> {selectedCase.userId.fullName || selectedCase.userId.name || "Not provided"}</p>
                    <p className="text-sm text-muted-foreground"><strong>Email:</strong> {selectedCase.userId.email || "Not provided"}</p>
                    <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {selectedCase.userId.phone || "Not provided"}</p>
                  </div>
                </div>
              )}
              
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground"><strong>Location:</strong> {typeof selectedCase.location === "string" ? selectedCase.location : (selectedCase.location?.address || "Unknown")}</p>
                <p className="text-sm text-muted-foreground"><strong>Date:</strong> {selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleString() : "—"}</p>
                <div>
                  <p className="text-sm text-muted-foreground"><strong>Evidence Files:</strong> {selectedCase.evidenceIds ? selectedCase.evidenceIds.length : 0}</p>
                  <EvidencePreviewList evidenceIds={selectedCase.evidenceIds || []} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Actions:</p>
                {selectedCase.status === "resolved" ? (
                  <div className="p-4 bg-safe/10 rounded-lg text-center">
                    <p className="text-sm text-safe font-semibold">This case has been resolved</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button 
                      variant={selectedCase.status === "call_initiated" ? "default" : "outline"} 
                      size="sm"
                      onClick={handleCall}
                      disabled={isCalling || selectedCase.status === "call_initiated"}
                    >
                      <Phone className="h-4 w-4 mr-1" /> 
                      {isCalling ? "Calling..." : "Call"}
                    </Button>
                    <Button 
                      variant={selectedCase.status === "arranged_counselling" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleStatusUpdate(selectedCase._id, "arranged_counselling")}
                      disabled={selectedCase.status === "arranged_counselling"}
                    >
                      Counselling
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusUpdate(selectedCase._id, "resolved")}
                    >
                      Resolved
                    </Button>
                  </div>
                )}
              </div>

              {/* Progress Notes Section */}
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">Progress Notes</p>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Add progress note..."
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    size="sm"
                    onClick={handleAddProgressNote}
                  >
                    Add
                  </Button>
                </div>

                {/* Progress Notes List */}
                {progressNotes.length > 0 && (
                  <div className="mt-3 space-y-2 bg-muted/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {progressNotes.map((note) => (
                      <div key={note.id} className="text-sm border-l-2 border-primary pl-3 py-1">
                        <p className="text-xs text-muted-foreground">{note.date} {note.createdBy ? `• ${note.createdBy}` : ""}</p>
                        <p className="text-foreground">{note.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
            <div className="border-t border-border px-6 py-4 flex-shrink-0">
              <Button
                onClick={() => {
                  setSelectedCase(null);
                  setNewStatus("");
                  setProgressNote("");
                  setProgressNotes([]);
                }}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ResolvedReferrals = () => {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const socketRef = useRef<any>(null);

  const fetchResolvedReferrals = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (res.ok) {
        const data = await res.json();
        const resolved = Array.isArray(data) ? data.filter(r => r.status === "resolved") : [];
        setReferrals(resolved);
      }
    } catch (err) {
      console.error("Error fetching resolved referrals:", err);
      toast({
        title: "Failed to load resolved referrals",
        description: "Unable to fetch resolved cases",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResolvedReferrals();
  }, []);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    try {
      socketRef.current = io(window.location.origin, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated in ResolvedReferrals:", data);
        fetchResolvedReferrals();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket:", err);
    }
  }, [toast]);

  // Fetch full case details when modal opens
  const fetchCaseDetails = async (caseId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/reports/${caseId}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCase(data);
      }
    } catch (err) {
      console.error("Error fetching case details:", err);
    }
  };

  const statusStyles: Record<string, string> = {
    pending: "bg-primary/10 text-primary",
    investigating: "bg-warning/10 text-warning",
    referred_to_ngo: "bg-purple/10 text-purple",
    call_initiated: "bg-blue/10 text-blue",
    arranged_counselling: "bg-indigo/10 text-indigo",
    resolved: "bg-safe/10 text-safe",
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      referred_to_ngo: "Pending",
      call_initiated: "Call Initiated",
      arranged_counselling: "Counselling Arranged",
      resolved: "Resolved",
    };
    return statusMap[status] || status.replace("_", " ");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-safe/20 bg-gradient-to-br from-safe/[0.08] to-secondary/[0.05] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800">Resolved Referrals</h2>
        <p className="text-base text-gray-700">View completed cases and resolutions</p>
      </div>

      {loading ? (
        <div className="p-6 text-center text-muted-foreground">Loading resolved referrals...</div>
      ) : referrals.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
          No resolved referrals yet
        </div>
      ) : (
        <div className="space-y-4">
          {referrals.map((r) => (
            <div key={r._id} className="bg-card rounded-lg p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-bold text-lg text-foreground">{r.caseId}</p>
                    <Badge className={`${statusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                      {getStatusDisplay(r.status)}
                    </Badge>
                  </div>
                  <p className="font-semibold text-foreground text-base">{r.incidentType}</p>
                  <p className="text-sm text-muted-foreground mt-1">Resolved: {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchCaseDetails(r._id)}>
                    <Eye className="h-4 w-4 mr-2" /> View
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-lg mx-auto p-6 relative space-y-4">
            <button 
              onClick={() => setSelectedCase(null)}
              className="absolute top-4 right-4 p-1 hover:bg-muted rounded"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-foreground">Case Details</h3>

            <div className="border-t border-border pt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Case #{selectedCase.caseId} — {selectedCase.incidentType}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Badge className={`${statusStyles[selectedCase.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                    {getStatusDisplay(selectedCase.status)}
                  </Badge>
                </div>
              </div>

              {/* Victim/Reporter Details */}
              {selectedCase.userId && (
                <div className="bg-blue-50 rounded-lg p-4 space-y-2 border border-blue-200">
                  <p className="text-sm font-semibold text-foreground">Reporter/Victim Details</p>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground"><strong>Name:</strong> {selectedCase.userId.fullName || selectedCase.userId.name || "Not provided"}</p>
                    <p className="text-sm text-muted-foreground"><strong>Email:</strong> {selectedCase.userId.email || "Not provided"}</p>
                    <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {selectedCase.userId.phone || "Not provided"}</p>
                  </div>
                </div>
              )}
              
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground"><strong>Location:</strong> {typeof selectedCase.location === "string" ? selectedCase.location : (selectedCase.location?.address || "Unknown")}</p>
                <p className="text-sm text-muted-foreground"><strong>Created:</strong> {selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleString() : "—"}</p>
                <p className="text-sm text-muted-foreground"><strong>Resolved:</strong> {selectedCase.updatedAt ? new Date(selectedCase.updatedAt).toLocaleString() : "—"}</p>
                <div>
                  <p className="text-sm text-muted-foreground"><strong>Evidence Files:</strong> {selectedCase.evidenceIds ? selectedCase.evidenceIds.length : 0}</p>
                  <EvidencePreviewList evidenceIds={selectedCase.evidenceIds || []} />
                </div>
              </div>

              <div className="bg-safe/10 rounded-lg p-4 text-center">
                <p className="text-sm text-safe font-semibold">✓ Case Resolved</p>
              </div>

              <Button 
                onClick={() => setSelectedCase(null)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NgoDashboard = () => {
  useEffect(() => {
    removeChatbaseWidget();
  }, []);

  return (
  <DashboardLayout
    title="NGO Support Dashboard"
    subtitle="Survivor Support & Resource Management"
    navItems={navItems}
    accentColor="text-safe"
  >
    <Routes>
      <Route index element={<Overview />} />
      <Route path="referrals" element={<Referrals />} />
      <Route path="update-status" element={<UpdateStatus />} />
      <Route path="resolved" element={<ResolvedReferrals />} />
      <Route path="settings" element={<ProfileSettings />} />
      <Route path="*" element={<Navigate to="/dashboard/ngo" replace />} />
    </Routes>
  </DashboardLayout>
  );
};

export default NgoDashboard;
