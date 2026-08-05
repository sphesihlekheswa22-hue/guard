import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileSettings from "@/components/reporter/Settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { io } from "socket.io-client";
import { API_ROOT, uploadUrl, evidenceUrl } from "@/lib/api";
import { removeChatbaseWidget } from "@/lib/chatbot";
import {
  LayoutDashboard,
  FileText,
  RefreshCw,
  AlertTriangle,
  Search,
  Building2,
  Filter,
  X,
  Share2,
  Settings as SettingsIcon,
  ArrowUpDown,
  Download,
} from "lucide-react";

const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  API_ROOT ||
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");

const navItems = [
  { to: "/dashboard/authority", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/authority/reports", label: "View Reports", icon: FileText },
  { to: "/dashboard/authority/status", label: "Update Status", icon: RefreshCw },
  { to: "/dashboard/authority/referrals", label: "Referrals", icon: Share2 },
  { to: "/dashboard/authority/emergencies", label: "Emergencies", icon: AlertTriangle },
  { to: "/dashboard/authority/settings", label: "Profile", icon: SettingsIcon },
];

const priorityStyles: Record<string, string> = {
  critical: "bg-emergency/10 text-emergency",
  high: "bg-warning/10 text-warning",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

const statusStyles: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  investigating: "bg-warning/10 text-warning",
  "referred to ngo": "bg-purple/10 text-purple",
  referred_to_ngo: "bg-purple/10 text-purple",
  resolved: "bg-safe/10 text-safe",
  dismissed: "bg-muted text-muted-foreground",
  pending: "bg-primary/10 text-primary",
};

// Helper function to filter out excluded reports/alerts
const EXCLUDED_IDS = ["5497C1EC"];
const filterExcludedReports = (items: any[]) => {
  return items.filter(item => {
    const itemId = (item._id || item.id || item.caseId || "").toString().toUpperCase();
    return !EXCLUDED_IDS.includes(itemId);
  });
};

const EvidencePreviewList = ({ evidenceIds = [] }: { evidenceIds?: any[] }) => {
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);

  const getEvidenceKind = (evidence: any): "image" | "audio" | "video" | "file" => {
    const type = String(evidence?.type || "").toLowerCase();
    const name = String(evidence?.name || evidence?.fileUrl || "").toLowerCase();
    if (type === "image" || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name)) return "image";
    if (type === "audio" || /\.(mp3|wav|ogg|webm|m4a)$/i.test(name)) return "audio";
    if (type === "video" || /\.(mp4|mov|avi|mkv)$/i.test(name)) return "video";
    return "file";
  };

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
        <div key={evidence._id || evidence.id || index} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{evidence.name || `Evidence ${index + 1}`}</p>
              <p className="text-xs text-muted-foreground capitalize">{getEvidenceKind(evidence)}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewEvidence(evidence)}
            disabled={!evidence.fileUrl}
          >
            View
          </Button>
        </div>
      ))}

      {viewingEvidence && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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
            {getEvidenceKind(viewingEvidence) === "image" ? (
              <img
                src={evidenceUrl(viewingEvidence)}
                alt="Evidence"
                className="w-full rounded-lg border border-border max-h-[70vh] object-contain bg-muted/20"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).alt = "Preview failed — use Open File";
                }}
              />
            ) : getEvidenceKind(viewingEvidence) === "audio" ? (
              <audio controls src={evidenceUrl(viewingEvidence)} className="w-full" autoPlay controlsList="nodownload" />
            ) : getEvidenceKind(viewingEvidence) === "video" ? (
              <video controls src={evidenceUrl(viewingEvidence)} className="w-full max-h-[70vh] rounded-lg border border-border" />
            ) : (
              <div className="bg-muted/50 rounded-lg p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">File type: {viewingEvidence.type || "file"}</p>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => window.open(evidenceUrl(viewingEvidence), "_blank")}>
              Open File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const getEvidenceKind = (evidence: any): "image" | "audio" | "video" | "file" => {
  const type = String(evidence?.type || "").toLowerCase();
  const name = String(evidence?.name || evidence?.fileUrl || "").toLowerCase();
  if (type === "image" || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name)) return "image";
  if (type === "audio" || /\.(mp3|wav|ogg|webm|m4a)$/i.test(name)) return "audio";
  if (type === "video" || /\.(mp4|mov|avi|mkv)$/i.test(name)) return "video";
  return "file";
};

const NGO_REFERRAL_STATUSES = ["referred_to_ngo", "call_initiated", "arranged_counselling"];

const isNgoReferralCase = (report: any) => {
  const status = report?.status || "";
  const statusHistory = Array.isArray(report?.statusHistory) ? report.statusHistory : [];

  return (
    NGO_REFERRAL_STATUSES.includes(status) ||
    statusHistory.some((entry: any) => entry?.status === "referred_to_ngo")
  );
};

// Helper function to format status display text
const getStatusDisplayText = (status: string): string => {
  const statusMap: Record<string, string> = {
    new: "New",
    investigating: "Investigating",
    referred_to_ngo: "Referred to NGO",
    call_initiated: "Call Initiated",
    arranged_counselling: "Counselling Arranged",
    resolved: "Resolved",
    dismissed: "Dismissed",
    pending: "Pending",
  };
  return statusMap[status] || status;
};

const isHandledPoliceStatus = (status: string) =>
  status === "resolved" || status === "dismissed";

const formatAuthorityDateTime = (date?: string) => {
  return date ? new Date(date).toLocaleString() : "N/A";
};

const formatAuthorityDate = (date?: string) => {
  return date ? new Date(date).toLocaleDateString() : "N/A";
};

const formatAuthorityLocation = (location: any) => {
  if (!location) return "N/A";
  if (typeof location === "string") return location || "N/A";
  return location.address || (Array.isArray(location.coordinates) ? location.coordinates.join(", ") : "N/A");
};

const getPersonName = (person: any) => {
  return person?.fullName || person?.name || person?.email || "Not provided";
};

const getHandledBy = (report: any) => {
  const history = Array.isArray(report.statusHistory) ? report.statusHistory : [];
  const handlerEntry = [...history].reverse().find((entry: any) => entry.changedBy || entry.changedByRole);
  if (!handlerEntry) return "Not handled yet";

  const handler = handlerEntry.changedBy;
  const handlerName = typeof handler === "object" ? getPersonName(handler) : "Unknown user";
  const handlerRole = handlerEntry.changedByRole || (typeof handler === "object" ? handler.role : "") || "Unknown role";
  return `${handlerName} (${handlerRole})`;
};

const normalizeAuthorityPdfText = (value: any) => {
  return String(value ?? "N/A")
    .replace(/\r?\n/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeAuthorityPdfText = (value: any) => {
  return normalizeAuthorityPdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
};

const wrapAuthorityPdfText = (text: any, width: number, fontSize = 8, maxLines?: number) => {
  const maxChars = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  const words = normalizeAuthorityPdfText(text).split(" ");
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
  visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  return visibleLines;
};

const authorityTextCommand = (
  text: any,
  x: number,
  y: number,
  size = 8,
  color = "0.12 0.16 0.22",
  font = "F1"
) => `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapeAuthorityPdfText(text)}) Tj ET`;

const authorityRectCommand = (
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

const buildAuthorityPdfDocument = (pages: string[][], pageWidth: number, pageHeight: number) => {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageCommands, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      ...pageCommands,
      authorityTextCommand(`Page ${index + 1} of ${pages.length}`, pageWidth - 92, 18, 7, "0.45 0.49 0.56"),
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

const buildAuthorityCasesPdf = (reports: any[], user: any, alertStats: { active: number; resolved: number }) => {
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
    cardAmber: "1 0.96 0.86",
    cardRed: "1 0.92 0.92",
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
    commands.push(authorityTextCommand(text, x, textY, size, color, font));
  };

  const addRect = (x: number, rectY: number, width: number, height: number, fill?: string, stroke = colors.border) => {
    commands.push(authorityRectCommand(x, rectY, width, height, fill, stroke));
  };

  const drawTableRow = (
    cells: any[],
    widths: number[],
    options: { header?: boolean; minHeight?: number; maxLines?: number; fill?: string } = {}
  ) => {
    const fontSize = options.header ? 7.5 : 7.2;
    const lineHeight = 9;
    const wrappedCells = cells.map((cell, index) =>
      wrapAuthorityPdfText(cell, widths[index] - 10, fontSize, options.maxLines)
    );
    const rowHeight = Math.max(options.minHeight || 24, Math.max(...wrappedCells.map(lines => lines.length)) * lineHeight + 12);

    ensureSpace(rowHeight);
    let x = margin;
    wrappedCells.forEach((lines, index) => {
      addRect(x, y - rowHeight, widths[index], rowHeight, options.fill || (options.header ? colors.headerFill : colors.white));
      lines.forEach((line, lineIndex) => {
        addText(line, x + 5, y - 14 - lineIndex * lineHeight, fontSize, options.header ? colors.navy : colors.text, options.header ? "F2" : "F1");
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
      const valueLines = wrapAuthorityPdfText(value, valueWidth - 12, 7.5);
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

  const resolvedReports = reports.filter((report) => report.status === "resolved").length;
  const referredReports = reports.filter(isNgoReferralCase).length;

  addRect(0, pageHeight - 78, pageWidth, 78, colors.navy, colors.navy);
  addText("Police Station Case Report", margin, pageHeight - 38, 18, colors.white, "F2");
  addText(`${user?.policeStationName || "Police Station"} | Generated ${formatAuthorityDateTime(new Date().toISOString())}`, margin, pageHeight - 58, 9, "0.86 0.91 0.98");
  y = pageHeight - 104;

  const cardWidth = (contentWidth - 36) / 4;
  [
    ["Total Reports", reports.length, colors.cardBlue],
    ["Resolved", resolvedReports + (alertStats.resolved || 0), colors.cardGreen],
    ["Referrals", referredReports, colors.cardRed],
    ["Alerts", (alertStats.active || 0) + (alertStats.resolved || 0), colors.cardAmber],
  ].forEach(([label, value, fill], index) => {
    const x = margin + index * (cardWidth + 12);
    addRect(x, y - 58, cardWidth, 58, fill as string);
    addText(label, x + 12, y - 19, 8, colors.muted, "F2");
    addText(value, x + 12, y - 43, 20, colors.navy, "F2");
  });
  y -= 82;

  drawSectionTitle("Case Summary Table");
  const summaryWidths = [74, 92, 102, 105, 132, 82, 191];
  drawTableRow(["Case ID", "Status", "Incident", "Reporter", "Handled By", "Date", "Location / Description"], summaryWidths, { header: true, minHeight: 26 });
  reports.forEach((report) => {
    const reporter = report.userId || {};
    drawTableRow(
      [
        report.caseId || "N/A",
        getStatusDisplayText(report.status || "pending"),
        report.incidentType || "N/A",
        getPersonName(reporter),
        getHandledBy(report),
        formatAuthorityDate(report.createdAt),
        `${formatAuthorityLocation(report.location)}. ${report.description || "No description"}`,
      ],
      summaryWidths,
      { minHeight: 34, maxLines: 3 }
    );
  });

  reports.forEach((report, index) => {
    const reporter = report.userId || {};
    drawKeyValueTable(`Case Detail ${index + 1}: ${report.caseId || "N/A"}`, [
      ["Case ID", report.caseId || "N/A"],
      ["Status", getStatusDisplayText(report.status || "pending")],
      ["Incident Type", report.incidentType || "N/A"],
      ["Description", report.description || "N/A"],
      ["Location", formatAuthorityLocation(report.location)],
      ["Created", formatAuthorityDateTime(report.createdAt)],
      ["Last Updated", formatAuthorityDateTime(report.updatedAt)],
      ["Reporter Name", getPersonName(reporter)],
      ["Reporter Email", reporter.email || "Not provided"],
      ["Reporter Phone", reporter.phone || "Not provided"],
      ["Police Station", reporter.policeStationName || report.policeStationId || user?.policeStationName || "Not provided"],
      ["Assigned NGO", reporter.referredNgoName || report.referredNgoName || report.referredNgoId || "Not assigned by police yet"],
      ["Handled By", getHandledBy(report)],
      ["Evidence Files", report.evidenceIds?.length || 0],
    ]);

    if (report.evidenceIds?.length) {
      drawSectionTitle(`Evidence - ${report.caseId || "N/A"}`);
      drawTableRow(["#", "Name", "Type", "File URL"], [34, 230, 90, contentWidth - 354], { header: true });
      report.evidenceIds.forEach((evidence: any, evidenceIndex: number) => {
        drawTableRow([evidenceIndex + 1, evidence.name || "Unnamed", evidence.type || "File", evidenceUrl(evidence) || "No URL"], [34, 230, 90, contentWidth - 354], { maxLines: 2 });
      });
    }

    if (report.statusHistory?.length) {
      drawSectionTitle(`Status History - ${report.caseId || "N/A"}`);
      drawTableRow(["Status", "Handled By", "Role", "Date", "Reason"], [112, 145, 88, 130, contentWidth - 475], { header: true });
      report.statusHistory.forEach((entry: any) => {
        drawTableRow(
          [
            getStatusDisplayText(entry.status || "pending"),
            typeof entry.changedBy === "object" ? getPersonName(entry.changedBy) : "Unknown user",
            entry.changedByRole || entry.changedBy?.role || "Unknown",
            formatAuthorityDateTime(entry.changedAt),
            entry.reason || "N/A",
          ],
          [112, 145, 88, 130, contentWidth - 475],
          { maxLines: 3 }
        );
      });
    }

    if (report.interactions?.length) {
      drawSectionTitle(`Progress Notes - ${report.caseId || "N/A"}`);
      drawTableRow(["Date", "Added By", "Type", "Note"], [140, 150, 70, contentWidth - 360], { header: true });
      report.interactions.forEach((interaction: any) => {
        drawTableRow(
          [
            formatAuthorityDateTime(interaction.createdAt),
            getPersonName(interaction.createdBy),
            interaction.type || "note",
            interaction.description || "N/A",
          ],
          [140, 150, 70, contentWidth - 360],
          { maxLines: 4 }
        );
      });
    }
  });

  if (commands.length) pages.push(commands);
  return buildAuthorityPdfDocument(pages.length ? pages : [[]], pageWidth, pageHeight);
};

const Overview = () => {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [user, setUser] = useState<{ fullName?: string } | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertStats, setAlertStats] = useState({ active: 0, resolved: 0 });
  const [stats, setStats] = useState({
    totalReports: 0,
    totalAlerts: 0,
    resolved: 0,
    referrals: 0,
  });
  const socketRef = useRef<any>(null);

  // Recalculate stats whenever reports or alert stats change
  useEffect(() => {
    const totalReports = reports.length;
    const totalAlerts = (alertStats.active || 0) + (alertStats.resolved || 0);
    const resolvedReports = reports.filter((r: any) => r.status === "resolved").length;
    const resolvedCombined = resolvedReports + (alertStats.resolved || 0);
    const referrals = reports.filter(isNgoReferralCase).length;

    setStats({
      totalReports,
      totalAlerts,
      resolved: resolvedCombined,
      referrals,
    });
  }, [reports, alertStats]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: token ? `Bearer ${token}` : "" };

      // Fetch user profile
      const userRes = await fetch("/api/users/profile", { headers });
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      // Fetch all reports for authority view
      let reportsData: any[] = [];
      try {
        const reportsRes = await fetch("/api/reports", { headers });
        if (reportsRes.ok) {
          reportsData = await reportsRes.json();
        }
      } catch (err) {
        console.error("Error fetching reports:", err);
      }

      // Ensure reportsData is an array
      if (!Array.isArray(reportsData)) {
        reportsData = [];
      }

      // Filter out excluded reports
      reportsData = filterExcludedReports(reportsData);

      setReports(reportsData);

      // Fetch total emergency alerts for all users (including resolved)
      let alertStatsData = { active: 0, resolved: 0 };
      try {
        const alertsRes = await fetch("/api/alerts/stats", { headers });
        if (alertsRes.ok) {
          const data = await alertsRes.json();
          alertStatsData = {
            active: data?.active || 0,
            resolved: data?.resolved || 0,
          };
        }
      } catch (err) {
        console.error("Error fetching alerts:", err);
      }

      setAlertStats(alertStatsData);
    } catch (err: any) {
      console.error("Error in fetchData:", err);
      setError(err.message || "Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Setup WebSocket connection for real-time report updates
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for new report submission event
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("New report received in Overview:", data);
        
        // Add the new report to the list
        setReports((prevReports) => {
          const isDuplicate = prevReports.some(r => r._id === data.reportId);
          if (isDuplicate) return prevReports;
          
          return [{
            _id: data.reportId,
            caseId: data.caseId,
            incidentType: data.incidentType,
            location: data.location,
            date: data.date,
            description: data.description,
            status: data.status || "pending",
            evidenceIds: data.evidenceIds || [],
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          }, ...prevReports];
        });
        // Stats will automatically recalculate via useEffect dependency
      });

      // Listen for report status updates (when authority or NGO updates status)
      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated in Overview:", data);
        // Update the report in the list with new status
        setReports((prevReports) =>
          prevReports.map((r) =>
            r._id === data.reportId
              ? { ...r, status: data.status, updatedAt: data.updatedAt }
              : r
          )
        );
      });

      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added in Overview:", data);
        // Refresh reports to get updated interactions
        fetchData();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket in Overview:", err);
    }
  }, []);

  // Periodic refresh to keep stats accurate
  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem("token");
      const headers = { Authorization: token ? `Bearer ${token}` : "" };

      // Fetch latest reports
      fetch("/api/reports", { headers })
        .then(res => res.ok && res.json())
        .then(data => {
          if (data) {
            const filteredReports = filterExcludedReports(Array.isArray(data) ? data : []);
            setReports(filteredReports);
          }
        })
        .catch(err => console.error("Error refreshing reports:", err));

      // Fetch latest alert stats
      fetch("/api/alerts/stats", { headers })
        .then(res => res.ok && res.json())
        .then(data => {
          if (data) {
            setAlertStats({
              active: data?.active || 0,
              resolved: data?.resolved || 0,
            });
          }
        })
        .catch(err => console.error("Error refreshing alert stats:", err));
    }, 15000); // Refresh every 15 seconds for faster updates

    return () => clearInterval(interval);
  }, []);

  const handleExportCases = async () => {
    if (reports.length === 0) return;

    setExporting(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: token ? `Bearer ${token}` : "" };

      const detailedReports = await Promise.all(reports.map(async (report) => {
        try {
          const [detailRes, interactionsRes] = await Promise.all([
            fetch(`/api/reports/${report._id || report.id}`, { headers }),
            fetch(`/api/reports/${report._id || report.id}/interactions`, { headers }),
          ]);

          const detail = detailRes.ok ? await detailRes.json() : report;
          const interactions = interactionsRes.ok ? await interactionsRes.json() : detail.interactions || report.interactions || [];

          return {
            ...report,
            ...detail,
            interactions: Array.isArray(interactions) ? interactions : [],
          };
        } catch (err) {
          console.error("Failed to fetch report details for export:", err);
          return report;
        }
      }));

      const blob = buildAuthorityCasesPdf(detailedReports, user, alertStats);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `police-station-cases-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">
            {loading
              ? "Loading..."
              : error
              ? "Welcome back"
              : `Welcome back, ${user?.fullName || "User"}`}
          </h2>
          <p className="text-base text-gray-700">Your safety overview and quick access to emergency features</p>
          {error && <span className="text-sm text-red-500 mt-1">{error}</span>}
        </div>
        <Button
          variant="outline"
          onClick={handleExportCases}
          disabled={loading || exporting || reports.length === 0}
          className="bg-white/80 border-blue-300 text-gray-800 hover:bg-white"
        >
          <FileText className="h-4 w-4 mr-2" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        {[
          { label: "Total Reports", value: stats.totalReports, icon: FileText, color: "text-primary", bgColor: "bg-primary/10" },
          { label: "Total Alerts", value: stats.totalAlerts, icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/10" },
          { label: "Resolved", value: stats.resolved, icon: RefreshCw, color: "text-safe", bgColor: "bg-safe/10" },
          { label: "Referrals", value: stats.referrals, icon: Building2, color: "text-emergency", bgColor: "bg-emergency/10" },
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
      {!loading && <CaseTable cases={reports} filterStatus={filterStatus} onFilterChange={setFilterStatus} />}
    </div>
  );
};

const CaseTable = ({ 
  cases = [],
  onViewDetails, 
  filterStatus = "", 
  onFilterChange 
}: { 
  cases?: any[];
  onViewDetails?: (caseId: string) => void;
  filterStatus?: string;
  onFilterChange?: (status: string) => void;
}) => {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showLimitDropdown, setShowLimitDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [reportLimit, setReportLimit] = useState(10);
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "status" | "type">("date_desc");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "audio" | null>(null);
  
  // Debug log
  console.log("CaseTable received cases:", cases);
  
  const filteredCases = cases.filter(c => {
    // Filter out excluded IDs
    const itemId = (c._id || c.id || c.caseId || "").toString().toUpperCase();
    if (EXCLUDED_IDS.includes(itemId)) return false;
    
    const matchesStatus = !filterStatus || c.status === filterStatus;
    const caseId = c.caseId || c.id || "";
    const incidentType = c.incidentType || c.type || "";
    const createdAt = c.createdAt ? c.createdAt.slice(0, 10) : "";
    const matchesSearch = !searchTerm || 
      caseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incidentType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      createdAt.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  const sortedCases = [...filteredCases].sort((a, b) => {
    if (sortBy === "status") {
      return String(a.status || "").localeCompare(String(b.status || ""));
    }
    if (sortBy === "type") {
      return String(a.incidentType || a.type || "").localeCompare(String(b.incidentType || b.type || ""));
    }
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return sortBy === "date_asc" ? aTime - bTime : bTime - aTime;
  });

  // Apply report limit
  const displayedCases = reportLimit === 0 ? sortedCases : sortedCases.slice(0, reportLimit);

  const handleExportCsv = () => {
    const rows = [
      ["Case ID", "Incident Type", "Status", "Created At", "Location"],
      ...sortedCases.map((c) => [
        c.caseId || c.id || "",
        c.incidentType || c.type || "",
        c.status || "",
        c.createdAt ? new Date(c.createdAt).toISOString() : "",
        typeof c.location === "string" ? c.location : (c.location?.address || ""),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `safeguard-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  
  return (
  <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
    <div className="p-4 sm:p-5 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 relative">
        <h3 className="font-semibold text-foreground">Reports</h3>
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Filter reports by status"
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
          </button>
          {showFilterDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-border rounded-lg shadow-lg z-10 min-w-48">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    onFilterChange?.("");
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filterStatus === "" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  All Reports
                </button>
                <button
                  onClick={() => {
                    onFilterChange?.("pending");
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filterStatus === "pending" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => {
                    onFilterChange?.("investigating");
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filterStatus === "investigating" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Investigating
                </button>
                <button
                  onClick={() => {
                    onFilterChange?.("resolved");
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filterStatus === "resolved" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Resolved
                </button>
                <button
                  onClick={() => {
                    onFilterChange?.("dismissed");
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    filterStatus === "dismissed"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  Dismissed
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Sort reports"
          >
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {showSortDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-border rounded-lg shadow-lg z-10 min-w-52">
              <div className="p-2 space-y-1">
                {[
                  { id: "date_desc", label: "Newest first" },
                  { id: "date_asc", label: "Oldest first" },
                  { id: "status", label: "Status A-Z" },
                  { id: "type", label: "Incident type A-Z" },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setSortBy(option.id as typeof sortBy);
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      sortBy === option.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={sortedCases.length === 0}
          className="h-8"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          CSV
        </Button>
        <div className="relative">
          <button
            onClick={() => setShowLimitDropdown(!showLimitDropdown)}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-xs font-medium text-muted-foreground"
            title="Limit number of reports displayed"
          >
            Show: {reportLimit === 0 ? "All" : reportLimit}
          </button>
          {showLimitDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-border rounded-lg shadow-lg z-10 min-w-32">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    setReportLimit(5);
                    setShowLimitDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    reportLimit === 5 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Show 5
                </button>
                <button
                  onClick={() => {
                    setReportLimit(10);
                    setShowLimitDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    reportLimit === 10 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Show 10
                </button>
                <button
                  onClick={() => {
                    setReportLimit(15);
                    setShowLimitDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    reportLimit === 15 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Show 15
                </button>
                <button
                  onClick={() => {
                    setReportLimit(20);
                    setShowLimitDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    reportLimit === 20 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Show 20
                </button>
                <button
                  onClick={() => {
                    setReportLimit(0);
                    setShowLimitDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    reportLimit === 0 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
                  Show All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Input 
        placeholder="Search cases..." 
        className="w-full sm:max-w-xs" 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left p-4 font-semibold text-muted-foreground">Case ID</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Type</th>
            <th className="text-left p-4 font-semibold text-muted-foreground hidden md:table-cell">Date</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Status</th>
            <th className="text-left p-4 font-semibold text-muted-foreground">Evidence</th>
            {onViewDetails && <th className="text-left p-4 font-semibold text-muted-foreground">Action</th>}
          </tr>
        </thead>
        <tbody>
          {displayedCases.map((c) => (
            <tr key={c._id || c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="p-4 font-mono text-primary text-xs">{c.caseId || c.id}</td>
              <td className="p-4 font-medium text-foreground">{c.incidentType || c.type}</td>
              <td className="p-4 text-muted-foreground hidden md:table-cell">{c.createdAt ? c.createdAt.slice(0, 10) : c.date}</td>
              <td className="p-4"><Badge className={`${statusStyles[c.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>{c.status}</Badge></td>
              <td className="p-4">
                {c.evidenceIds && c.evidenceIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.evidenceIds.map((ev: any, idx: number) => {
                      const kind = getEvidenceKind(ev);
                      return (
                        <button
                          key={ev._id || ev.id || idx}
                          onClick={() => {
                            if (!ev.fileUrl && !(ev.id || ev._id)) return;
                            if (kind === "image" || kind === "audio" || kind === "video") {
                              setPreviewUrl(evidenceUrl(ev));
                              setPreviewType(kind === "audio" ? "audio" : "image");
                            } else {
                              window.open(evidenceUrl(ev), "_blank");
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                          title={ev.name || "Evidence file"}
                        >
                          {kind === "image" ? "📷" : kind === "audio" ? "🎤" : kind === "video" ? "🎬" : "📄"}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              {onViewDetails && (
                <td className="p-4">
                  <Button size="sm" variant="outline" onClick={() => onViewDetails(c._id || c.id)}>View</Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {displayedCases.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          <p>No reports found</p>
        </div>
      )}
    </div>

    {/* Evidence Preview Modal */}
    {previewUrl && previewType && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-2xl mx-auto p-6 relative">
          <button 
            onClick={() => {
              setPreviewUrl(null);
              setPreviewType(null);
            }}
            className="absolute top-4 right-4 p-1 hover:bg-muted rounded"
          >
            <X className="h-5 w-5" />
          </button>
          {previewType === "image" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-foreground">Image Preview</h3>
              <img src={previewUrl} alt="Preview" className="w-full rounded-lg border border-border/30 max-h-[70vh] object-contain" />
            </div>
          )}
          {previewType === "audio" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-foreground">Audio Playback</h3>
              <audio 
                controls 
                src={previewUrl} 
                className="w-full" 
                autoPlay
                controlsList="nodownload"
              />
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
};

const ViewReports = () => {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const socketRef = useRef<any>(null);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      const filteredReports = filterExcludedReports(Array.isArray(data) ? data : []);
      setReports(filteredReports);
    } catch (err: any) {
      toast({
        title: "Failed to load reports",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchReports().finally(() => setLoading(false));
  }, []);

  // Setup WebSocket connection for real-time report updates
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for new report submission event
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("New report received via WebSocket:", data);
        
        // Check if the report is excluded
        const reportId = (data.reportId || "").toString().toUpperCase();
        if (EXCLUDED_IDS.includes(reportId)) {
          console.log("Excluded report received, skipping:", reportId);
          return;
        }
        
        // Add the new report to the beginning of the reports list
        setReports((prevReports) => {
          // Check if report already exists (avoid duplicates)
          const isDuplicate = prevReports.some(r => r._id === data.reportId || r.id === data.reportId);
          if (isDuplicate) return prevReports;
          
          return [{
            _id: data.reportId,
            id: data.reportId,
            caseId: data.caseId,
            incidentType: data.incidentType,
            location: data.location,
            date: data.date,
            description: data.description,
            status: data.status || "pending",
            evidenceIds: data.evidenceIds || [],
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          }, ...prevReports];
        });
        
        toast({ 
          title: "✅ New Report Submitted", 
          description: `Case ID: ${data.caseId}` 
        });
      });

      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added in ViewReports:", data);
        // Refetch to get updated interactions
        fetchReports();
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

  // Setup periodic refresh to fetch latest reports every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/reports", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
        .then(res => res.ok && res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setReports(filterExcludedReports(data));
          }
        })
        .catch(err => console.error("Error refreshing reports:", err));
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const selectedCase = selectedCaseId
    ? reports.find((c) => c._id === selectedCaseId || c.id === selectedCaseId || c.caseId === selectedCaseId)
    : null;

  return (
  <div className="space-y-6">
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col gap-1">
      <h2 className="text-2xl font-bold text-gray-800">All Reports</h2>
      <p className="text-base text-gray-700">View and manage all incoming incident reports</p>
    </div>
    {!loading && <CaseTable cases={reports} filterStatus={filterStatus} onFilterChange={setFilterStatus} onViewDetails={setSelectedCaseId} />}
    
    {selectedCase && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
        <div className="bg-card rounded-xl border border-border/50 shadow-xl p-6 space-y-4 w-full max-w-2xl my-8 relative">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Case Details</h3>
          <Button variant="outline" size="sm" onClick={() => setSelectedCaseId(null)}>Close</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Case ID</span>
            <p className="font-semibold text-foreground">{selectedCase.caseId}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Type</span>
            <p className="font-semibold text-foreground">{selectedCase.incidentType}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Created Date & Time</span>
            <p className="font-semibold text-foreground">{selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleString() : "—"}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge className={`${statusStyles[selectedCase.status] || "bg-gray-100 text-gray-600"} border-0 capitalize w-fit`}>{selectedCase.status}</Badge>
          </div>
          <div className="md:col-span-2">
            <span className="text-sm text-muted-foreground">Description</span>
            <p className="font-semibold text-foreground whitespace-pre-wrap">{selectedCase.description || "—"}</p>
          </div>
          <div className="md:col-span-2">
            <span className="text-sm text-muted-foreground">Location</span>
            <p className="font-semibold text-foreground">{formatAuthorityLocation(selectedCase.location)}</p>
          </div>
          <div className="md:col-span-2">
            <span className="text-sm text-muted-foreground">Evidence Files</span>
            <p className="font-semibold text-foreground">{selectedCase.evidenceIds ? selectedCase.evidenceIds.length : 0} files</p>
            <EvidencePreviewList evidenceIds={selectedCase.evidenceIds || []} />
          </div>
        </div>
        {/* Interactions/Progress Notes Section */}
        {selectedCase.interactions && selectedCase.interactions.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border/40 space-y-3">
            <span className="text-sm text-muted-foreground font-medium block">Progress & Notes from NGO</span>
            <div className="space-y-2 bg-muted/20 rounded-lg p-3 max-h-48 overflow-y-auto">
              {selectedCase.interactions
                .filter((i: any) => i.type === "note")
                .map((note: any, idx: number) => (
                  <div key={idx} className="text-sm border-l-2 border-primary pl-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()} • {note.createdBy?.fullName || note.createdBy?.name || "NGO Worker"}
                    </p>
                    <p className="text-foreground">{note.description}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
        </div>
      </div>
    )}
  </div>
);
};

const AccessEvidence = () => {
  const [searchCaseId, setSearchCaseId] = useState<string>("");
  const [reports, setReports] = useState<any[]>([]);
  const [viewingEvidence, setViewingEvidence] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const socketRef = useRef<any>(null);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      const filteredReports = filterExcludedReports(Array.isArray(data) ? data : []);
      setReports(filteredReports);
    } catch (err: any) {
      toast({
        title: "Failed to load reports",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Setup WebSocket connection for real-time report updates
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for new report submission event
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("New report received with evidence:", data);
        
        // Check if the report is excluded
        const reportId = (data.reportId || "").toString().toUpperCase();
        if (EXCLUDED_IDS.includes(reportId)) {
          console.log("Excluded report received, skipping:", reportId);
          return;
        }
        
        setReports((prevReports) => {
          const isDuplicate = prevReports.some(r => r._id === data.reportId);
          if (isDuplicate) return prevReports;
          
          return [{
            _id: data.reportId,
            caseId: data.caseId,
            incidentType: data.incidentType,
            location: data.location,
            date: data.date,
            description: data.description,
            status: data.status || "pending",
            evidenceIds: data.evidenceIds || [],
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          }, ...prevReports];
        });
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket in AccessEvidence:", err);
    }
  }, []);

  // Setup periodic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReports();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const selectedCase = searchCaseId
    ? reports.find(
        (c) =>
          c.caseId?.toLowerCase().includes(searchCaseId.toLowerCase()) ||
          c._id === searchCaseId
      )
    : null;

  return (
  <div className="space-y-6">
    <div className="rounded-2xl border border-safe/20 bg-gradient-to-br from-safe/[0.08] to-secondary/[0.05] p-6 shadow-soft flex flex-col gap-1">
      <h2 className="text-2xl font-bold text-gray-800">Access Evidence</h2>
      <p className="text-base text-gray-700">View and manage evidence files for investigations</p>
    </div>
    <div className="bg-card rounded-lg p-6 border border-border/50 shadow-sm space-y-4">
      <div className="flex gap-2">
        <Input 
          placeholder="Enter Case ID..." 
          value={searchCaseId}
          onChange={(e) => setSearchCaseId(e.target.value)}
        />
        <Button onClick={() => setSearchCaseId(searchCaseId)}>Search</Button>
      </div>
      <div className="border-t border-border pt-4">
        {selectedCase && selectedCase.evidenceIds && selectedCase.evidenceIds.length > 0 ? (
          <>
            <p className="text-sm font-semibold text-foreground mb-3">Evidence files for case <span className="text-primary">{selectedCase.caseId}</span>:</p>
            <div className="space-y-2">
              {selectedCase.evidenceIds.map((evidence: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-foreground">{evidence.name || `Evidence ${idx + 1}`} ({evidence.type})</span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewEvidence(evidence)}
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">Enter a case ID and click Search to view evidence files</p>
        )}
      </div>
    </div>
    
    {viewingEvidence && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-card rounded-lg p-6 border border-border/50 shadow-sm space-y-3 max-w-2xl w-full">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{viewingEvidence.name || `Evidence`}</h3>
            <Button variant="outline" size="sm" onClick={() => setViewingEvidence(null)}>Close</Button>
          </div>
          {getEvidenceKind(viewingEvidence) === "image" ? (
            <img src={evidenceUrl(viewingEvidence)} alt="Evidence" className="w-full rounded-lg border border-border max-h-[70vh] object-contain" />
          ) : getEvidenceKind(viewingEvidence) === "audio" ? (
            <audio 
              controls 
              src={evidenceUrl(viewingEvidence)}
              className="w-full" 
              autoPlay
              controlsList="nodownload"
            />
          ) : getEvidenceKind(viewingEvidence) === "video" ? (
            <video controls src={evidenceUrl(viewingEvidence)} className="w-full max-h-[70vh] rounded-lg border border-border" />
          ) : (
            <div className="bg-muted/50 rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground">File type: {viewingEvidence.type || "file"}</p>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => window.open(evidenceUrl(viewingEvidence), "_blank")}>
            Open File
          </Button>
        </div>
      </div>
    )}
  </div>
);
};

const UpdateStatus = () => {
  const [searchCaseId, setSearchCaseId] = useState<string>("");
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [caseDetails, setCaseDetails] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [dismissalReason, setDismissalReason] = useState<string>("");
  const [selectedNgoId, setSelectedNgoId] = useState<string>("");
  const [ngoOptions, setNgoOptions] = useState<{ id: string; label: string }[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const socketRef = useRef<any>(null);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      const filteredReports = filterExcludedReports(Array.isArray(data) ? data : []);
      setReports(filteredReports);
    } catch (err: any) {
      toast({
        title: "Failed to load reports",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    const loadNgos = async () => {
      try {
        const res = await fetch("/api/organizations/public?type=ngo");
        if (!res.ok) return;
        const data = await res.json();
        setNgoOptions(
          Array.isArray(data)
            ? data.map((item: any) => ({ id: item._id || item.id || item.code, label: item.name }))
            : []
        );
      } catch {
        setNgoOptions([]);
      }
    };
    loadNgos();
  }, []);

  // Setup WebSocket connection for real-time report updates
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for new report submission event
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("New report received in UpdateStatus:", data);
        
        // Check if the report is excluded
        const reportId = (data.reportId || "").toString().toUpperCase();
        if (EXCLUDED_IDS.includes(reportId)) {
          console.log("Excluded report received, skipping:", reportId);
          return;
        }
        
        setReports((prevReports) => {
          const isDuplicate = prevReports.some(r => r._id === data.reportId);
          if (isDuplicate) return prevReports;
          
          return [{
            _id: data.reportId,
            caseId: data.caseId,
            incidentType: data.incidentType,
            location: data.location,
            date: data.date,
            description: data.description,
            status: data.status || "pending",
            evidenceIds: data.evidenceIds || [],
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          }, ...prevReports];
        });
      });

      // Listen for report status updates (when authority or NGO updates status)
      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated in Authority UpdateStatus:", data);
        // Refetch all reports to reflect status changes
        fetchReports();
      });

      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added in UpdateStatus:", data);
        // Refetch to get updated interactions
        fetchReports();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket in UpdateStatus:", err);
    }
  }, []);

  // Setup periodic refresh to keep data in sync
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReports();
    }, 15000); // Refresh every 15 seconds for faster updates

    return () => clearInterval(interval);
  }, []);

  // Filter reports based on search term
  const filteredReports = reports.filter(r => {
    const caseId = r.caseId || r._id || "";
    const incidentType = r.incidentType || "";
    return !searchCaseId || 
      caseId.toLowerCase().includes(searchCaseId.toLowerCase()) ||
      incidentType.toLowerCase().includes(searchCaseId.toLowerCase());
  });

  // Referred cases leave this workflow and are managed from the Referrals tab.
  const activeReports = filteredReports.filter(r => !isHandledPoliceStatus(r.status) && !isNgoReferralCase(r));
  const handledReports = filteredReports.filter(r => isHandledPoliceStatus(r.status) && !isNgoReferralCase(r));

  const resetStatusForm = () => {
    setSelectedCase(null);
    setCaseDetails(null);
    setNewStatus("");
    setSelectedNgoId("");
    setDismissalReason("");
  };

  const handleSelectCase = (report: any) => {
    setSelectedCase(report);
    setCaseDetails(report);
    setNewStatus("");
    setSelectedNgoId("");
    setDismissalReason("");
  };

  const handleUpdateStatus = async () => {
    if (!selectedCase || !newStatus) return;

    if (newStatus === "referred_to_ngo" && !selectedNgoId) {
      toast({
        title: "NGO required",
        description: "Select which NGO should receive this referral.",
        variant: "destructive",
      });
      return;
    }

    const trimmedDismissalReason = dismissalReason.trim();
    if (newStatus === "dismissed" && !trimmedDismissalReason) {
      toast({
        title: "Dismissal details required",
        description: "Explain why this case is being dismissed.",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const selectedNgo = ngoOptions.find((ngo) => ngo.id === selectedNgoId);
      const payload: Record<string, string> = { status: newStatus };
      if (newStatus === "referred_to_ngo") {
        payload.referredNgoId = selectedNgoId;
        payload.referredNgoName = selectedNgo?.label || "";
      }
      if (newStatus === "dismissed") {
        payload.reason = trimmedDismissalReason;
        payload.details = trimmedDismissalReason;
      }

      const res = await fetch(`/api/reports/${selectedCase._id}`, {
        method: "PATCH",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.msg || "Failed to update status");

      toast({
        title: "✅ Case Status Updated",
        description:
          newStatus === "referred_to_ngo"
            ? `Case ${selectedCase.caseId} referred to ${selectedNgo?.label || "NGO"}`
            : newStatus === "dismissed"
              ? `Case ${selectedCase.caseId} dismissed`
              : `Case ${selectedCase.caseId} status changed to ${newStatus}`,
      });

      // Update reports list
      setReports(prevReports => 
        prevReports.map(r => 
          r._id === selectedCase._id 
            ? {
                ...r,
                status: newStatus,
                referredNgoId: payload.referredNgoId || r.referredNgoId,
                referredNgoName: payload.referredNgoName || r.referredNgoName,
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );

      // Emit WebSocket event to notify reporter and all users of status update
      if (socketRef.current) {
        socketRef.current.emit("reportStatusUpdated", {
          reportId: selectedCase._id,
          caseId: selectedCase.caseId,
          status: newStatus,
          reason: newStatus === "dismissed" ? trimmedDismissalReason : undefined,
          updatedAt: new Date().toISOString(),
        });
        console.log(`Broadcasted report ${selectedCase._id} status update to ${newStatus}`);
      }

      resetStatusForm();
    } catch (err: any) {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
  <div className="space-y-6">
    <div className="rounded-2xl border border-warning/25 bg-gradient-to-br from-warning/[0.08] to-accent/[0.05] p-6 shadow-soft flex flex-col gap-1">
      <h2 className="text-2xl font-bold text-gray-800">Update Case Status</h2>
      <p className="text-base text-gray-700">Change investigation status and track case progress</p>
    </div>

    {/* Active Cases Section */}
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <span className="text-warning">●</span>
        Active Cases ({activeReports.length})
      </h3>
      {loading ? (
        <div className="p-6 text-center text-muted-foreground">Loading reports...</div>
      ) : activeReports.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
          {reports.length === 0 ? "No reports available" : "No active reports match your search"}
        </div>
      ) : (
        activeReports.map((report) => (
          <div 
            key={report._id} 
            className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center justify-between hover:border-primary transition-colors cursor-pointer"
            onClick={() => handleSelectCase(report)}
          >
            <div className="flex-1">
              <p className="font-semibold text-foreground">
                {report.caseId || report._id?.slice(-6) || "UNKNOWN"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${statusStyles[report.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                {report.status}
              </Badge>
              <Button size="sm" onClick={(e) => {
                e.stopPropagation();
                handleSelectCase(report);
              }}>
                View Details
              </Button>
            </div>
          </div>
        ))
      )}
    </div>

    {/* Handled Cases Section */}
    {handledReports.length > 0 && (
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="text-safe">✓</span>
          Handled Cases ({handledReports.length})
        </h3>
        <div className="space-y-4">
          {handledReports.map((report) => (
            <div 
              key={report._id} 
              className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center justify-between hover:border-primary transition-colors cursor-pointer opacity-75"
              onClick={() => handleSelectCase(report)}
            >
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {report.caseId || report._id?.slice(-6) || "UNKNOWN"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${statusStyles[report.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>
                  {report.status}
                </Badge>
                <Button size="sm" onClick={(e) => {
                  e.stopPropagation();
                  handleSelectCase(report);
                }}>
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Status Update Modal */}
    {selectedCase && caseDetails && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-2xl mx-auto p-6 relative space-y-4">
          <button 
            onClick={resetStatusForm}
            className="absolute top-4 right-4 p-1 hover:bg-muted rounded"
          >
            <X className="h-5 w-5" />
          </button>

          <h3 className="text-lg font-bold text-foreground">Update Case Status</h3>

          <div className="border-t border-border pt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Case #{caseDetails.caseId} — {caseDetails.incidentType}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Current Status:</span>
                <Badge className={`${statusStyles[caseDetails.status] || "bg-gray-100 text-gray-600"} border-0 capitalize`}>{caseDetails.status}</Badge>
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <p className="text-sm text-muted-foreground"><strong>Location:</strong> {typeof caseDetails.location === "string" ? caseDetails.location : (caseDetails.location?.address || "Unknown")}</p>
              <p className="text-sm text-muted-foreground"><strong>Created Date & Time:</strong> {caseDetails.createdAt ? new Date(caseDetails.createdAt).toLocaleString() : "—"}</p>
              <div>
                <p className="text-sm text-muted-foreground"><strong>Evidence Files:</strong> {caseDetails.evidenceIds ? caseDetails.evidenceIds.length : 0}</p>
                <EvidencePreviewList evidenceIds={caseDetails.evidenceIds || []} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Update Status:</p>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant={newStatus === "investigating" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    setNewStatus("investigating");
                    setSelectedNgoId("");
                    setDismissalReason("");
                  }}
                >
                  Investigating
                </Button>
                <Button 
                  variant={newStatus === "referred_to_ngo" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    setNewStatus("referred_to_ngo");
                    setDismissalReason("");
                  }}
                >
                  Refer to NGO
                </Button>
                <Button 
                  variant={newStatus === "resolved" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    setNewStatus("resolved");
                    setSelectedNgoId("");
                    setDismissalReason("");
                  }}
                >
                  Resolved
                </Button>
                <Button 
                  variant={newStatus === "dismissed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    setNewStatus("dismissed");
                    setSelectedNgoId("");
                  }}
                >
                  Dismissed
                </Button>
              </div>
            </div>

            {newStatus === "referred_to_ngo" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Assign NGO</p>
                <select
                  value={selectedNgoId}
                  onChange={(e) => setSelectedNgoId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  required
                >
                  <option value="">
                    {ngoOptions.length === 0 ? "No NGOs available" : "Select NGO for this referral"}
                  </option>
                  {ngoOptions.map((ngo) => (
                    <option key={ngo.id} value={ngo.id}>
                      {ngo.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Only police can assign an NGO. The reporter cannot choose one.
                </p>
              </div>
            )}

            {newStatus === "dismissed" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Dismissal details <span className="text-emergency">*</span>
                </p>
                <Textarea
                  value={dismissalReason}
                  onChange={(e) => setDismissalReason(e.target.value)}
                  placeholder="Explain why this case is being dismissed..."
                  className="min-h-[100px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Required. The reporter will see this reason in their case timeline.
                </p>
              </div>
            )}

            <Button 
              onClick={handleUpdateStatus}
              disabled={
                !newStatus ||
                (newStatus === "referred_to_ngo" && !selectedNgoId) ||
                (newStatus === "dismissed" && !dismissalReason.trim())
              }
              className="w-full"
            >
              Save Status Update
            </Button>

            {/* Interactions/Progress Notes Section */}
            {caseDetails.interactions && caseDetails.interactions.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border/40 space-y-3">
                <span className="text-sm text-muted-foreground font-medium block">Progress & Notes from NGO</span>
                <div className="space-y-2 bg-muted/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {caseDetails.interactions
                    .filter((i: any) => i.type === "note")
                    .map((note: any, idx: number) => (
                      <div key={idx} className="text-sm border-l-2 border-primary pl-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleString()} • {note.createdBy?.fullName || note.createdBy?.name || "NGO Worker"}
                        </p>
                        <p className="text-foreground">{note.description}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
);
};

const Referrals = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const { toast } = useToast();
  const socketRef = useRef<any>(null);

  const fetchReferredReports = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      const data = await res.json();
      const referredReports = (Array.isArray(data) ? data : []).filter(isNgoReferralCase);
      const filteredReports = filterExcludedReports(referredReports);
      setReports(filteredReports);
    } catch (err: any) {
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
    fetchReferredReports();
  }, []);

  // Setup WebSocket connection for real-time report updates
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
      });

      // Listen for report status updates (when NGO or authority updates status)
      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated in Authority Referrals:", data);
        // Refetch to update the list when any referral status changes
        fetchReferredReports();
      });

      // Also listen for new report submissions
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("New report submitted:", data);
        // Refetch to include newly referred cases
        if (data.status === "referred_to_ngo") {
          fetchReferredReports();
        }
      });

      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added in Referrals:", data);
        // Refetch to get updated interactions
        fetchReferredReports();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to setup WebSocket:", err);
    }
  }, []);

  // Setup periodic refresh to ensure data stays in sync
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReferredReports();
    }, 15000); // Refresh every 15 seconds for faster updates

    return () => clearInterval(interval);
  }, []);

  const selectedCase = selectedCaseId
    ? reports.find(c => c._id === selectedCaseId)
    : null;

  // Separate active and resolved referrals
  const activeReferrals = reports.filter(r => r.status !== "resolved");
  const resolvedReferrals = reports.filter(r => r.status === "resolved");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-muted p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800">NGO Referrals</h2>
        <p className="text-base text-gray-700">Cases referred to non-governmental organizations</p>
      </div>

      {/* Active Referrals Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
          Active Referrals ({activeReferrals.length})
        </h3>
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading referrals...</div>
        ) : activeReferrals.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
            No active referrals
          </div>
        ) : (
          <div className="space-y-3">
            {activeReferrals.map((r) => (
              <div 
                key={r._id} 
                className="bg-card rounded-lg p-4 border border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedCaseId(r._id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-bold text-foreground">{r.caseId}</p>
                      <Badge className={`${statusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize text-xs`}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.incidentType}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCaseId(r._id);
                    }}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Referrals Section */}
      {resolvedReferrals.length > 0 && (
        <div className="space-y-4 border-t border-border/30 pt-6">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="w-2 h-2 bg-safe rounded-full"></span>
            Resolved Referrals ({resolvedReferrals.length})
          </h3>
          <div className="space-y-3">
            {resolvedReferrals.map((r) => (
              <div 
                key={r._id} 
                className="bg-card rounded-lg p-4 border border-border/50 shadow-sm opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => setSelectedCaseId(r._id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-bold text-foreground">{r.caseId}</p>
                      <Badge className={`${statusStyles[r.status] || "bg-gray-100 text-gray-600"} border-0 capitalize text-xs`}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.incidentType}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCaseId(r._id);
                    }}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCase && (
        <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">Case Details</h3>
            <Button variant="outline" size="sm" onClick={() => setSelectedCaseId(null)}>Close</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Case ID</span>
              <p className="font-semibold text-foreground">{selectedCase.caseId}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Type</span>
              <p className="font-semibold text-foreground">{selectedCase.incidentType}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Created Date & Time</span>
              <p className="font-semibold text-foreground">{selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleString() : "—"}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={`${statusStyles[selectedCase.status] || "bg-gray-100 text-gray-600"} border-0 capitalize w-fit`}>{selectedCase.status.replace("_", " ")}</Badge>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Evidence Files</span>
              <p className="font-semibold text-foreground">{selectedCase.evidenceIds ? selectedCase.evidenceIds.length : 0} files</p>
              <EvidencePreviewList evidenceIds={selectedCase.evidenceIds || []} />
            </div>
          </div>
          {/* Interactions/Progress Notes Section */}
          {selectedCase.interactions && selectedCase.interactions.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border/40 space-y-3">
              <span className="text-sm text-muted-foreground font-medium block">Progress & Notes from NGO</span>
              <div className="space-y-2 bg-muted/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                {selectedCase.interactions
                  .filter((i: any) => i.type === "note")
                  .map((note: any, idx: number) => (
                    <div key={idx} className="text-sm border-l-2 border-primary pl-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.createdAt).toLocaleString()} • {note.createdBy?.fullName || note.createdBy?.name || "NGO Worker"}
                      </p>
                      <p className="text-foreground">{note.description}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Emergencies = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [resolvedAlerts, setResolvedAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResolved, setLoadingResolved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [alertDetails, setAlertDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { toast } = useToast();
  const socketRef = useRef<any>(null);

  const fetchActiveAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/alerts/active", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch active alerts");
      const data = await res.json();
      const filteredAlerts = filterExcludedReports(Array.isArray(data.alerts) ? data.alerts : []);
      setAlerts(filteredAlerts);
    } catch (err: any) {
      setError(err.message || "Error fetching alerts");
    } finally {
      setLoading(false);
    }
  };

  const fetchResolvedAlerts = async () => {
    setLoadingResolved(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/alerts/resolved", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Failed to fetch resolved alerts");
      const data = await res.json();
      const filteredResolvedAlerts = filterExcludedReports(Array.isArray(data.alerts) ? data.alerts : []);
      setResolvedAlerts(filteredResolvedAlerts);
    } catch (err) {
      console.error("Error fetching resolved alerts:", err);
    } finally {
      setLoadingResolved(false);
    }
  };

  useEffect(() => {
    fetchActiveAlerts();
    fetchResolvedAlerts();
  }, []);

  // Setup WebSocket connection for live SOS alerts + status broadcasts
  useEffect(() => {
    try {
      socketRef.current = io(SOCKET_URL, {
        auth: {
          token: localStorage.getItem("token"),
        },
        reconnection: true,
        transports: ["websocket", "polling"],
      });

      socketRef.current.on("sosAlertReceived", (payload: any) => {
        console.log("Live SOS received:", payload);
        toast({
          title: "🚨 New SOS Alert",
          description: `${payload?.userName || "A reporter"} triggered ${payload?.caseId || "an SOS"} nearby.`,
          variant: "destructive",
        });
        fetchActiveAlerts();
      });

      socketRef.current.on("caseLocationUpdated", () => {
        fetchActiveAlerts();
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to connect to WebSocket:", err);
    }
  }, [toast]);

  const handleViewDetails = async (alert: any) => {
    setSelectedAlert(alert);
    setDetailsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const userRes = await fetch(`/api/users/profile`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setAlertDetails({
          ...alert,
          reporterPhone: alert.userId?.phone || userData?.phone || "N/A",
          reporterName: alert.userId?.fullName || userData?.fullName || "Unknown",
        });
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
      setAlertDetails(alert);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCall = async (phone: string) => {
    if (phone && phone !== "N/A") {
      window.location.href = `tel:${phone}`;
      toast({
        title: "📞 Call Initiated",
        description: `Calling ${phone}...`,
      });
      // Auto-update status to call initiated (reporter will see this)
      await handleUpdateStatus("call initiated");
    } else {
      toast({
        title: "No phone number available",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedAlert) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/alerts/${selectedAlert._id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update alert status");
      
      const data = await res.json();
      
      // Update the alert details immediately with the new status
      if (data.alert) {
        setAlertDetails(prev => prev ? { ...prev, status: data.alert.status } : null);
      }

      // Emit WebSocket event to notify reporter
      if (socketRef.current) {
        socketRef.current.emit("alertStatusUpdated", {
          alertId: selectedAlert._id,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
        console.log(`Broadcasted alert ${selectedAlert._id} status update to ${newStatus}`);
      }

      // Refetch alerts to reflect status change in lists
      await fetchActiveAlerts();
      await fetchResolvedAlerts();

      // Close modal after refetch completes
      setSelectedAlert(null);
      setAlertDetails(null);

      toast({
        title: "✅ Alert Status Updated",
        description: `Alert status changed to ${newStatus}`,
      });
    } catch (err: any) {
      console.error("Error updating alert status:", err);
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emergency/25 bg-gradient-to-br from-emergency/[0.08] to-destructive/[0.04] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800">Active Emergencies</h2>
        <p className="text-base text-gray-700">Monitor and respond to emergency alerts</p>
      </div>

      {/* Active Alerts Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Incoming Alerts</h3>
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-500">{error}</div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground bg-card rounded-lg border border-border/50">
            No active emergencies
          </div>
        ) : (
          alerts.map((e) => (
            <div key={e._id} className="bg-card rounded-lg p-5 border border-emergency/30 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">
                  {e.type?.toUpperCase() || "SOS"} - {e.caseId?.caseId || e._id?.slice(-6) || "UNKNOWN"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {e.location?.address || "Unknown location"}
                  {e.createdAt && (
                    <span> — {new Date(e.createdAt).toLocaleString()}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emergency/10 text-emergency border-0 capitalize">{e.status}</Badge>
                <Button size="sm" onClick={() => handleViewDetails(e)}>View Details</Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Resolved Alerts Section */}
      {resolvedAlerts.length > 0 && (
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-lg font-semibold text-foreground">Resolved Emergencies</h3>
          <div className="space-y-3">
            {loadingResolved ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : (
              resolvedAlerts.map((e) => (
                <div key={e._id} className="bg-card rounded-lg p-4 border border-safe/30 shadow-sm opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{e.type?.toUpperCase() || "SOS"} - {e.caseId?.caseId || e._id?.slice(-6) || "UNKNOWN"}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.location?.address || "Unknown location"}
                      </p>
                    </div>
                    <Badge className="bg-safe/10 text-safe">
                      {e.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-2xl mx-auto p-6 relative space-y-4">
            <button 
              onClick={() => {
                setSelectedAlert(null);
                setAlertDetails(null);
              }}
              className="absolute top-4 right-4 p-1 hover:bg-muted rounded"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-foreground">Emergency Alert Details</h3>

            {detailsLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading details...</div>
            ) : alertDetails ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Alert Type</span>
                    <p className="font-semibold text-foreground">{alertDetails.type?.toUpperCase() || "SOS"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className="capitalize">{alertDetails.status}</Badge>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Location</span>
                    <p className="font-semibold text-foreground">{alertDetails.location?.address || "Unknown"}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Time</span>
                    <p className="font-semibold text-foreground">
                      {alertDetails.createdAt ? new Date(alertDetails.createdAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Reporter Name</span>
                    <p className="font-semibold text-foreground">{alertDetails.reporterName}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Phone Number</span>
                    <p className="font-semibold text-foreground">{alertDetails.reporterPhone}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Actions:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      onClick={() => handleCall(alertDetails.reporterPhone)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      📞 Call User
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleUpdateStatus("resolved")}
                      className="border-green-200 text-green-700 hover:bg-green-50"
                    >
                      ✓ Mark Resolved
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

const AuthorityDashboard = () => {
  useEffect(() => {
    removeChatbaseWidget();
  }, []);

  return (
  <DashboardLayout
    title="Police Officer Dashboard"
    subtitle="Case Management & Emergency Response"
    navItems={navItems}
    accentColor="text-secondary"
  >
    <Routes>
      <Route index element={<Overview />} />
      <Route path="reports" element={<ViewReports />} />
      <Route path="status" element={<UpdateStatus />} />
      <Route path="referrals" element={<Referrals />} />
      <Route path="emergencies" element={<Emergencies />} />
      <Route path="settings" element={<ProfileSettings />} />
      <Route path="*" element={<Navigate to="/dashboard/authority" replace />} />
    </Routes>
  </DashboardLayout>
  );
};

export default AuthorityDashboard;
