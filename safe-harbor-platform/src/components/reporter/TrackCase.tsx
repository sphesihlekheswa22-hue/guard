import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Eye, CheckCircle, Clock, Play, X, AlertTriangle, LocateFixed, MapPin, Download } from "lucide-react";
import { socketService } from "@/services/socketService";
import { evidenceUrl } from "@/lib/api";

const normalizePdfText = (value: any) =>
  String(value ?? "N/A")
    .replace(/\r?\n/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapePdfText = (value: any) =>
  normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrapPdfText = (text: any, width: number, fontSize = 8, maxLines?: number) => {
  const maxChars = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  const words = normalizePdfText(text).split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!word) return;
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  const wrapped = lines.length ? lines : ["N/A"];
  if (!maxLines || wrapped.length <= maxLines) return wrapped;
  const visible = wrapped.slice(0, maxLines);
  visible[visible.length - 1] = `${visible[visible.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  return visible;
};

const formatPdfDateTime = (date?: string) => (date ? new Date(date).toLocaleString() : "N/A");
const formatPdfDate = (date?: string) => (date ? new Date(date).toLocaleDateString() : "N/A");

const getStatusLabel = (status = "pending") => {
  const map: Record<string, string> = {
    pending: "Pending",
    investigating: "Investigating",
    referred_to_ngo: "Referred to NGO",
    call_initiated: "Call Initiated",
    arranged_counselling: "Counselling Arranged",
    resolved: "Resolved",
    active: "Active",
  };
  return map[status] || status.replace(/_/g, " ");
};

const formatCaseLocation = (location: any) => {
  if (!location) return "N/A";
  if (typeof location === "string") return location || "N/A";
  return location.address || (Array.isArray(location.coordinates) ? location.coordinates.join(", ") : "N/A");
};

const pdfText = (text: any, x: number, y: number, size = 8, color = "0.12 0.16 0.22", font = "F1") =>
  `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const pdfRect = (x: number, y: number, width: number, height: number, fill?: string, stroke = "0.78 0.82 0.88") => {
  const parts = [];
  if (fill) parts.push(`q ${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
  parts.push(`q ${stroke} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
  return parts.join("\n");
};

const buildPdfDocument = (pages: string[][], pageWidth: number, pageHeight: number) => {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageCommands, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      ...pageCommands,
      pdfText(`Page ${index + 1} of ${pages.length}`, pageWidth - 92, 18, 7, "0.45 0.49 0.56"),
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
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

const buildReporterCasesPdf = (reports: any[], reporterEmail = "") => {
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
    cardPurple: "0.94 0.91 1",
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
    commands.push(pdfText(text, x, textY, size, color, font));
  };
  const addRect = (x: number, rectY: number, width: number, height: number, fill?: string, stroke = colors.border) => {
    commands.push(pdfRect(x, rectY, width, height, fill, stroke));
  };

  const drawTableRow = (
    cells: any[],
    widths: number[],
    options: { header?: boolean; minHeight?: number; maxLines?: number; fill?: string } = {}
  ) => {
    const fontSize = options.header ? 7.5 : 7.2;
    const lineHeight = 9;
    const wrappedCells = cells.map((cell, index) => wrapPdfText(cell, widths[index] - 10, fontSize, options.maxLines));
    const rowHeight = Math.max(options.minHeight || 24, Math.max(...wrappedCells.map((lines) => lines.length)) * lineHeight + 12);
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

  const resolved = reports.filter((r) => r.status === "resolved").length;
  const investigating = reports.filter((r) => r.status === "investigating").length;
  const referred = reports.filter((r) =>
    ["referred_to_ngo", "call_initiated", "arranged_counselling"].includes(r.status)
  ).length;

  addRect(0, pageHeight - 78, pageWidth, 78, colors.navy, colors.navy);
  addText("SafeGuard Reporter Case Summary", margin, pageHeight - 38, 18, colors.white, "F2");
  addText(
    `${reporterEmail || "Reporter"} | Generated ${formatPdfDateTime(new Date().toISOString())}`,
    margin,
    pageHeight - 58,
    9,
    "0.86 0.91 0.98"
  );
  y = pageHeight - 104;

  const cardWidth = (contentWidth - 36) / 4;
  [
    ["Total Cases", reports.length, colors.cardBlue],
    ["Investigating", investigating, colors.cardAmber],
    ["Referred to NGO", referred, colors.cardPurple],
    ["Resolved", resolved, colors.cardGreen],
  ].forEach(([label, value, fill], index) => {
    const x = margin + index * (cardWidth + 12);
    addRect(x, y - 58, cardWidth, 58, fill as string);
    addText(label, x + 12, y - 19, 8, colors.muted, "F2");
    addText(value, x + 12, y - 43, 20, colors.navy, "F2");
  });
  y -= 82;

  drawSectionTitle("Case Summary");
  const summaryWidths = [90, 100, 120, 90, 150, contentWidth - 550];
  drawTableRow(["Case ID", "Status", "Type", "Date", "Location", "Description"], summaryWidths, {
    header: true,
    minHeight: 26,
  });
  reports.forEach((report) => {
    drawTableRow(
      [
        report.caseId || "N/A",
        getStatusLabel(report.status || "pending"),
        report.incidentType || report.type || "Report",
        formatPdfDate(report.createdAt || report.date),
        formatCaseLocation(report.location),
        report.description || "No description",
      ],
      summaryWidths,
      { minHeight: 34, maxLines: 3 }
    );
  });

  reports.forEach((report, index) => {
    const evidence = report.evidenceIds || report.evidenceFiles || [];
    drawKeyValueTable(`Case Detail ${index + 1}: ${report.caseId || "N/A"}`, [
      ["Case ID", report.caseId || "N/A"],
      ["Status", getStatusLabel(report.status || "pending")],
      ["Incident Type", report.incidentType || report.type || "N/A"],
      ["Description", report.description || "N/A"],
      ["Location", formatCaseLocation(report.location)],
      ["Created", formatPdfDateTime(report.createdAt || report.dateTime || report.date)],
      ["Last Updated", formatPdfDateTime(report.updatedAt)],
      ["Assigned NGO", report.referredNgoName || report.referredNgoId || "Not assigned by police yet"],
      ["Evidence Files", Array.isArray(evidence) ? evidence.length : report.evidence || 0],
    ]);

    if (Array.isArray(evidence) && evidence.length > 0) {
      drawSectionTitle(`Evidence - ${report.caseId || "N/A"}`);
      drawTableRow(["#", "Name", "Type"], [40, 420, contentWidth - 460], { header: true });
      evidence.forEach((item: any, evidenceIndex: number) => {
        drawTableRow(
          [evidenceIndex + 1, item.name || "Unnamed", item.type || "file"],
          [40, 420, contentWidth - 460],
          { maxLines: 2 }
        );
      });
    }

    if (Array.isArray(report.statusHistory) && report.statusHistory.length > 0) {
      drawSectionTitle(`Status History - ${report.caseId || "N/A"}`);
      drawTableRow(["Status", "Role", "Date", "Reason"], [130, 100, 150, contentWidth - 380], { header: true });
      report.statusHistory.forEach((entry: any) => {
        drawTableRow(
          [
            getStatusLabel(entry.status || "pending"),
            entry.changedByRole || "N/A",
            formatPdfDateTime(entry.changedAt),
            entry.reason || "N/A",
          ],
          [130, 100, 150, contentWidth - 380],
          { maxLines: 3 }
        );
      });
    }
  });

  if (commands.length) pages.push(commands);
  return buildPdfDocument(pages.length ? pages : [[]], pageWidth, pageHeight);
};

const TrackCase = () => {
  const { toast } = useToast();
  const socketRef = useRef<any>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [caseDetails, setCaseDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "audio" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  // Fetched cases from backend
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [locationAddress, setLocationAddress] = useState("");
  const [locationCoordinates, setLocationCoordinates] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [locationDetecting, setLocationDetecting] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  
  // Initialize deletedCaseIds from sessionStorage to persist across page refreshes
  const [deletedCaseIds, setDeletedCaseIds] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem("safeguard_deletedCaseIds");
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.warn("Failed to load deletedCaseIds from sessionStorage:", err);
    }
    return new Set();
  });

  const deletedCaseIdsRef = useRef<Set<string>>(deletedCaseIds);

  useEffect(() => {
    deletedCaseIdsRef.current = deletedCaseIds;
  }, [deletedCaseIds]);

  const getCaseIdentityValues = (item: any): string[] => {
    return [
      item?.id,
      item?._id,
      item?.caseId,
      item?.originalCaseId,
      item?.caseId?._id,
      item?.caseId?.id,
      item?.caseId?.caseId,
    ]
      .filter(Boolean)
      .map((value: any) => value.toString());
  };

  const isDeletedCaseItem = (item: any, deletedIds = deletedCaseIdsRef.current) => {
    return getCaseIdentityValues(item).some(id => deletedIds.has(id));
  };

  const dedupeCaseList = (items: any[]) => {
    return items.reduce((unique: any[], item: any) => {
      const itemIds = getCaseIdentityValues(item);
      const isDuplicateByIdentity = itemIds.length > 0 && unique.some(existing => {
        const existingIds = getCaseIdentityValues(existing);
        return existingIds.some(id => itemIds.includes(id));
      });
      const isDuplicateByCaseId = unique.some(existing =>
        existing.caseId &&
        item.caseId &&
        existing.caseId === item.caseId &&
        existing.type === item.type
      );

      if (!isDuplicateByIdentity && !isDuplicateByCaseId) {
        unique.push(item);
        console.log(`[dedup] Added case: ${item.caseId} (ID: ${item.id})`);
      } else {
        console.log(`[dedup] Skipped duplicate case: ${item.caseId} (ID: ${item.id})`);
      }

      return unique;
    }, []);
  };

  // Helper: update deletedCaseIds and persist to sessionStorage
  const addDeletedCaseIds = (caseIds: Array<string | null | undefined>) => {
    const idsToAdd = caseIds
      .filter(Boolean)
      .map(id => id!.toString());

    if (idsToAdd.length === 0) return;

    setDeletedCaseIds(prev => {
      const updated = new Set([...prev, ...idsToAdd]);
      deletedCaseIdsRef.current = updated;
      try {
        sessionStorage.setItem("safeguard_deletedCaseIds", JSON.stringify([...updated]));
        console.log(`[sessionStorage] Persisted deletedCaseIds:`, [...updated]);
      } catch (err) {
        console.error("Failed to save deletedCaseIds to sessionStorage:", err);
      }
      return updated;
    });
  };

  // Helper: clear deletedCaseIds from sessionStorage (for logout or reset)
  const clearDeletedCaseIds = () => {
    deletedCaseIdsRef.current = new Set();
    setDeletedCaseIds(new Set());
    try {
      sessionStorage.removeItem("safeguard_deletedCaseIds");
      console.log(`💾 [sessionStorage] Cleared deletedCaseIds`);
    } catch (err) {
      console.error("Failed to clear deletedCaseIds from sessionStorage:", err);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = {
        Authorization: token ? `Bearer ${token}` : "",
      };
      const deletedIds = deletedCaseIdsRef.current;

      console.log("🔄 [fetchReports] Starting fetch with token:", token ? `present (${token.slice(0, 20)}...)` : "missing");
      console.log(`🗑️  [fetchReports] Currently tracking deleted IDs (${deletedIds.size} total):`, [...deletedIds]);

      // Fetch user's reports
      const reportsRes = await fetch("/api/reports", { headers });
      console.log("🔄 [fetchReports] /api/reports status:", reportsRes.status);
      
      if (!reportsRes.ok) {
        console.error("🔄 [fetchReports] API returned error status:", reportsRes.status);
        if (reportsRes.status === 401) {
          console.error("🔄 [fetchReports] ⚠️  UNAUTHORIZED - Token may be invalid or expired");
        }
        if (reportsRes.status === 403) {
          console.error("🔄 [fetchReports] ⚠️  FORBIDDEN - You don't have permission");
        }
      }
      
      let reports: any[] = [];
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        console.log("📦 [API] Fetched reports from /api/reports:", data.length ? `${data.length} reports` : "empty array");
        if (data.length > 0) {
          console.log("📦 [API] First report:", data[0].caseId || data[0]._id);
          console.log("📦 [API] First report userId:", data[0].userId);
        }
        reports = (Array.isArray(data) ? data : [])
          .filter((r: any) => {
            const reportId = (r._id || r.id || "").toString();
            const isDeleted = isDeletedCaseItem(r, deletedIds);
            if (isDeleted) {
              console.log(`🗑️  [filter] Filtering out deleted report: ${r.caseId || reportId}`);
            }
            return !isDeleted;
          })
          .map((r: any) => ({
            id: (r._id || r.id || "").toString(),
            caseId: r.caseId || (r._id || r.id || "").toString().slice(-8).toUpperCase() || "",
            type: r.incidentType || "Report",
            date: r.createdAt ? r.createdAt.slice(0, 10) : "",
            dateTime: formatTimestamp(r.createdAt),
            status: r.status || "pending",
            lastUpdate: r.updatedAt ? timeAgo(r.updatedAt) : "",
            evidence: r.evidenceIds ? r.evidenceIds.length : 0,
            evidenceFiles: (r.evidenceIds || []).map((ev: any) => ({
              id: ev.id || ev._id,
              _id: ev._id || ev.id,
              fileUrl: ev.fileUrl,
              type: ev.type,
              name: ev.name || (ev.fileUrl ? ev.fileUrl.split("/").pop() : "evidence"),
            })),
            description: r.description || "",
            location: r.location?.address || r.location || "",
            coordinates: r.location?.coordinates || null,
            statusHistory: r.statusHistory || [],
            updates: [
              { date: r.updatedAt ? r.updatedAt.slice(0, 10) : "", message: "Case updated" },
              { date: r.createdAt ? r.createdAt.slice(0, 10) : "", message: "Case created" }
            ]
          }));
      }

      // Fetch user's SOS cases
      const casesRes = await fetch("/api/cases/me", { headers });
      let sosCases: any[] = [];
      if (casesRes.ok) {
        const data = await casesRes.json();
        sosCases = (data.cases || [])
          .filter((c: any) => {
            const caseId = (c._id || c.id || "").toString();
            const isDeleted = isDeletedCaseItem(c, deletedIds);
            if (isDeleted) {
              console.log(`🗑️  [filter] Filtering out deleted SOS case: ${c.caseId || caseId}`);
            }
            return !isDeleted;
          })
          .map((c: any) => ({
            id: (c._id || c.id || "").toString(),
            caseId: c.caseId || "SOS-UNKNOWN",
            type: c.incidentType || (c.type === "emergency" ? "Emergency Alert (SOS)" : "Case"),
            date: c.sosTriggeredAt ? c.sosTriggeredAt.slice(0, 10) : c.createdAt ? c.createdAt.slice(0, 10) : "",
            dateTime: c.sosTriggeredAt ? formatTimestamp(c.sosTriggeredAt) : formatTimestamp(c.createdAt),
            status: c.status || "active",
            lastUpdate: c.updatedAt ? timeAgo(c.updatedAt) : "",
            evidence: 0,
            evidenceFiles: [],
            priority: c.priority,
            sosTriggeredAt: c.sosTriggeredAt,
            description: c.description || "",
            location: c.location?.address || c.location || "",
            coordinates: c.location?.coordinates || null,
            updates: [
              { date: c.updatedAt ? c.updatedAt.slice(0, 10) : "", message: "Case updated" },
              { date: c.createdAt ? c.createdAt.slice(0, 10) : "", message: "SOS Triggered" }
            ]
          }));
      }

      // Fetch user's emergency alerts
      const alertsRes = await fetch("/api/alerts/me", { headers });
      let alerts: any[] = [];
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        console.log(`📦 [API] Fetched ${(data.alerts || []).length} alerts from /api/alerts/me`);
        console.log(`🗑️  [filter] Currently tracking ${deletedIds.size} deleted alert IDs:`, [...deletedIds]);
        
        alerts = (data.alerts || [])
          .filter((a: any) => {
            const alertId = (a._id || a.id || "").toString();
            
            // Check if this alert ID is deleted
            const isDeletedByAlertId = deletedIds.has(alertId);
            if (isDeletedByAlertId) {
              console.log(`🗑️  [filter] Filtering out deleted alert by ID: ${alertId}`);
              return false;
            }
            
            // Check if the underlying case ID is deleted (track both alert ID and case ID)
            const underlyingCaseId = (a.caseId?._id || a.caseId?.id || "").toString();
            const isDeletedByCaseId = underlyingCaseId && deletedIds.has(underlyingCaseId);
            if (isDeletedByCaseId) {
              console.log(`🗑️  [filter] Filtering out deleted alert by underlying case ID: ${alertId} (case: ${underlyingCaseId})`);
              return false;
            }
            
            // Also filter by caseId string if it looks like a hex ID (unpopulated reference)
            if (typeof a.caseId === "object" && a.caseId?.caseId && deletedIds.has(a.caseId.caseId.toString())) {
              console.log(`[filter] Filtering out deleted alert by display case ID: ${alertId} (${a.caseId.caseId})`);
              return false;
            }
            
            if (typeof a.caseId === 'string' && a.caseId && deletedIds.has(a.caseId)) {
              console.log(`🗑️  [filter] Filtering out deleted alert with string caseId: ${alertId} (caseId: ${a.caseId})`);
              return false;
            }
            
            return true;
          })
          .map((a: any) => {
            // STRICT CHECK: Only process alerts where caseId is a POPULATED OBJECT with a proper SOS case ID
            if (!a.caseId || typeof a.caseId !== 'object' || !a.caseId.caseId) {
              console.warn(`⚠️  [alert filter] Skipping unpopulated alert ${(a._id || a.id).toString()} - caseId is not populated object`);
              console.warn(`    caseId value:`, a.caseId);
              return null; // Filter this out - unpopulated reference
            }

            const displayCaseId = a.caseId.caseId; // "SOS-XXXXXX" format
            
            // Only include alerts with SOS-formatted case IDs (reject hex IDs)
            if (!displayCaseId || !displayCaseId.startsWith("SOS-")) {
              console.warn(`⚠️  [alert filter] Skipping alert ${(a._id || a.id).toString()} - invalid caseId format: "${displayCaseId}"`);
              return null;
            }
            
            return {
              id: (a._id || a.id || "").toString(),
              caseId: displayCaseId,
              type: a.type === "sos" ? "Emergency Alert (SOS)" : "Alert",
              date: a.createdAt ? a.createdAt.slice(0, 10) : "",
              dateTime: formatTimestamp(a.createdAt),
              status: a.status || "active",
              lastUpdate: a.acknowledgedAt || a.resolvedAt ? timeAgo(a.acknowledgedAt || a.resolvedAt) : timeAgo(a.createdAt),
              evidence: 0,
              evidenceFiles: [],
            location: a.location?.address || "Unknown location",
            coordinates: a.location?.coordinates || null,
            description: a.description || "SOS Emergency Alert",
              // Store the original case reference ID for deduplication AND deletion tracking
              originalCaseId: (a.caseId?._id || a.caseId?.id || "").toString(),
              updates: [
                a.resolvedAt && { date: a.resolvedAt.slice(0, 10), message: "Alert Resolved" },
                a.acknowledgedAt && { date: a.acknowledgedAt.slice(0, 10), message: `Call Initiated by Police Officer` },
                { date: a.createdAt ? a.createdAt.slice(0, 10) : "", message: "Alert Triggered" }
              ].filter(Boolean)
            };
          })
          .filter(a => a !== null); // Filter out alerts without proper populated caseIds
        
        // Final validation: log any alerts that somehow have invalid format
        console.log(`✅ [alerts] After filtering: ${alerts.length} valid alerts remain`);
        if (alerts.length > 0) {
          console.log(`✅ [alerts] First valid alert caseId format:`, alerts[0].caseId);
        }
      }

      // Merge and sort by date - deduplicate by ID and handle SOS cases
      // Important: SOS cases appear in both /api/cases/me and /api/alerts/me
      // We should use the Alert as the single source of truth for SOS alerts
      
      // Get all alert case IDs to filter out duplicate SOS cases
      const alertCaseIds = new Set(
        alerts
          .filter(a => a.type === "sos" || (a.originalCaseId && typeof a.originalCaseId === 'string'))
          .map(a => a.originalCaseId || "")
          .filter(id => id) // Remove empty strings
      );

      // Filter out SOS cases that have a corresponding alert
      const sosCasesWithoutAlert = sosCases.filter(c => 
        !alertCaseIds.has((c._id || c.id || "").toString())
      );

      // Now merge only non-duplicate items
      // CRITICAL: Also filter out any items with hex-formatted IDs (unpopulated alerts)
      const hexIdPattern = /^[a-f0-9]{8}$/i; // Matches format like "C962B060"
      
      const allCases = dedupeCaseList([...reports, ...sosCasesWithoutAlert, ...alerts]
        .filter((item: any) => !isDeletedCaseItem(item, deletedIds))
        // First pass: reject hex-formatted IDs which indicate unpopulated alerts
        .filter((item: any) => {
          if (hexIdPattern.test(item.caseId)) {
            console.warn(`❌ [validation] Rejecting item with hex-formatted caseId: ${item.caseId} (ID: ${item.id})`);
            return false;
          }
          return true;
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      console.log("✅ [fetchReports] Final merged cases:", allCases.map(c => `${c.caseId}(${c.id})`));
      setCases(allCases);
    } catch (err) {
      toast({ title: "Failed to load cases", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [refreshCount]);

  // Setup WebSocket connection for real-time alert updates - only once on mount
  useEffect(() => {
    try {
      socketRef.current = socketService.connect("");

      // Track socket connection status
      socketRef.current.on("connect", () => {
        console.log("✅ TrackCase socket connected:", socketRef.current?.id);
      });

      socketRef.current.on("disconnect", () => {
        console.log("❌ TrackCase socket disconnected");
      });

      // Listen for alert status updates from authority
      socketRef.current.on("alertStatusUpdated", (data: any) => {
        console.log("Alert status updated via WebSocket:", data);
        // Convert incoming alertId to string for comparison
        const incomingAlertId = (data.alertId || "").toString();
        
        // Skip if this alert has been deleted
        if (deletedCaseIdsRef.current.has(incomingAlertId)) {
          console.log(`🗑️  [socket] Ignoring update for deleted alert: ${incomingAlertId}`);
          return;
        }
        
        // Update the cases list with the new alert data
        setCases((prevCases) => {
          const updated = prevCases.map((c) =>
            c.id === incomingAlertId
              ? {
                  ...c,
                  status: data.status,
                  lastUpdate: timeAgo(new Date().toISOString()),
                  updates: [
                    { date: new Date().toISOString().slice(0, 10), message: data.status === "call initiated" ? "📞 Call Initiated by Police Officer" : `Status changed to ${data.status}` },
                    ...c.updates,
                  ],
                }
              : c
          );
          
          // Deduplicate in case the same alert appears multiple times
          return updated.reduce((unique: any[], item: any) => {
            const isDuplicate = unique.some(u => u.id === item.id);
            if (!isDuplicate) {
              unique.push(item);
            }
            return unique;
          }, []);
        });
        
        // If the alert detail modal is open, update it too
        setCaseDetails((prev: any) =>
          prev && prev.id === incomingAlertId
            ? {
                ...prev,
                status: data.status,
                updatedAt: new Date().toISOString(),
                lastUpdate: timeAgo(new Date().toISOString()),
                updates: [
                  { date: new Date().toISOString().slice(0, 10), message: data.status === "call initiated" ? "📞 Call Initiated by Police Officer" : `Status changed to ${data.status}` },
                  ...(prev.updates || []),
                ],
              }
            : prev
        );
      });

      // Listen for alert resolved event
      socketRef.current.on("alertResolved", (data: any) => {
        console.log("Alert resolved via WebSocket:", data);
        // Convert incoming alertId to string for comparison
        const incomingAlertId = (data.alertId || "").toString();
        
        // Skip if this alert has been deleted
        if (deletedCaseIdsRef.current.has(incomingAlertId)) {
          console.log(`🗑️  [socket] Ignoring resolved event for deleted alert: ${incomingAlertId}`);
          return;
        }
        
        setCases((prevCases) => {
          const updated = prevCases.map((c) =>
            c.id === incomingAlertId
              ? {
                  ...c,
                  status: "resolved",
                  lastUpdate: timeAgo(new Date().toISOString()),
                  updates: [
                    { date: new Date().toISOString().slice(0, 10), message: "✓ Alert Resolved" },
                    ...c.updates,
                  ],
                }
              : c
          );
          
          // Deduplicate in case the same alert appears multiple times
          return updated.reduce((unique: any[], item: any) => {
            const isDuplicate = unique.some(u => u.id === item.id);
            if (!isDuplicate) {
              unique.push(item);
            }
            return unique;
          }, []);
        });
        
        setCaseDetails((prev: any) =>
          prev && prev.id === incomingAlertId
            ? {
                ...prev,
                status: "resolved",
                updatedAt: new Date().toISOString(),
                lastUpdate: timeAgo(new Date().toISOString()),
                updates: [
                  { date: new Date().toISOString().slice(0, 10), message: "✓ Alert Resolved" },
                  ...(prev.updates || []),
                ],
              }
            : prev
        );
      });

      // Listen for new report submission event
      socketRef.current.on("reportSubmitted", (data: any) => {
        console.log("🔔 [TrackCase] reportSubmitted event received:", data);
        console.log("🔔 Report ID:", data.reportId, "Case ID:", data.caseId);
        
        if (!data.reportId || !data.caseId) {
          console.warn("⚠️  Received reportSubmitted event with missing reportId or caseId");
          return;
        }

        const currentUserId = localStorage.getItem("userId");
        const incomingUserId = data.userId ? data.userId.toString() : "";
        if (incomingUserId && currentUserId && incomingUserId !== currentUserId) {
          console.log("[TrackCase] Ignoring reportSubmitted event for another reporter");
          return;
        }
        
        // Create a new case object from the submitted report data
        const newCase = {
          id: data.reportId || "",
          caseId: data.caseId || (data.reportId?.toString().slice(-8).toUpperCase()) || "",
          type: data.incidentType || "Report",
          date: data.date || new Date().toISOString().slice(0, 10),
          dateTime: data.createdAt ? new Date(data.createdAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          }) : new Date().toLocaleString(),
          status: data.status || "pending",
          lastUpdate: "just now",
          evidence: data.evidenceIds?.length || 0,
          evidenceFiles: data.evidenceIds || [],
          description: data.description || "",
          location: typeof data.location === "string" ? data.location : (data.location?.address || ""),
          coordinates: typeof data.location === "string" ? null : (data.location?.coordinates || null),
          updates: [
            { date: new Date().toISOString().slice(0, 10), message: "Report submitted" }
          ]
        };

        if (isDeletedCaseItem(newCase)) {
          console.log(`[TrackCase] Ignoring reportSubmitted event for deleted case: ${newCase.caseId}`);
          return;
        }
        
        console.log("✅ [TrackCase] Adding new case to list:", newCase);
        
        // Add the new case to the beginning of the cases list
        setCases((prevCases) => {
          const newCases = dedupeCaseList([newCase, ...prevCases])
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          console.log("📊 [TrackCase] Updated cases list, total:", newCases.length);
          return newCases;
        });
        
        toast({ title: "✅ New report submitted", description: `Case ID: ${newCase.caseId}` });
      });

      // Listen for report status updates from authority
      socketRef.current.on("reportStatusUpdated", (data: any) => {
        console.log("Report status updated via WebSocket:", data);
        const incomingReportId = (data.reportId || "").toString();
        
        // Refetch the full case details to get the updated statusHistory from backend
        const fetchUpdatedCase = async () => {
          try {
            const token = localStorage.getItem("token");
            const headers = {
              Authorization: token ? `Bearer ${token}` : "",
            };
            
            const res = await fetch(`/api/reports/${incomingReportId}`, { headers });
            if (!res.ok) {
              console.error("Failed to fetch updated case:", res.status);
              return;
            }
            
            const updatedCase = await res.json();
            console.log("📥 [reportStatusUpdated] Fetched updated case with statusHistory:", updatedCase.statusHistory?.length || 0, "entries");
            
            // Update the cases list with the complete updated case
            setCases((prevCases) => {
              const updated = prevCases.map((c) =>
                c.id === incomingReportId
                  ? {
                      ...c,
                      ...updatedCase,
                      id: incomingReportId,
                      status: updatedCase.status,
                      lastUpdate: timeAgo(updatedCase.updatedAt || new Date().toISOString()),
                      statusHistory: updatedCase.statusHistory || [],
                    }
                  : c
              );
              
              // Deduplicate
              return updated.reduce((unique: any[], item: any) => {
                const isDuplicate = unique.some(u => u.id === item.id);
                if (!isDuplicate) {
                  unique.push(item);
                }
                return unique;
              }, []);
            });
            
            // If the case detail modal is open, update it with the fresh data including statusHistory
            setCaseDetails((prev: any) =>
              prev && prev.id === incomingReportId
                ? {
                    ...prev,
                    ...updatedCase,
                    id: incomingReportId,
                    status: updatedCase.status,
                    statusHistory: updatedCase.statusHistory || [],
                    updatedAt: updatedCase.updatedAt,
                    lastUpdate: timeAgo(updatedCase.updatedAt || new Date().toISOString()),
                  }
                : prev
            );
          } catch (err) {
            console.error("Error fetching updated case:", err);
          }
        };
        
        fetchUpdatedCase();
      });

      // Listen for new interactions/progress notes
      socketRef.current.on("reportInteractionAdded", (data: any) => {
        console.log("Report interaction added via WebSocket:", data);
        const incomingReportId = (data.reportId || "").toString();
        
        setCaseDetails((prev: any) => {
          const currentReportId = (prev?.id || prev?._id || "").toString();
          if (!prev || currentReportId !== incomingReportId) return prev;

          const existingInteractions = prev.interactions || [];
          const incomingInteractionId = (data.interaction?._id || data.interaction?.id || "").toString();
          const alreadyExists = incomingInteractionId && existingInteractions.some((interaction: any) =>
            (interaction?._id || interaction?.id || "").toString() === incomingInteractionId
          );

          return {
            ...prev,
            interactions: alreadyExists ? existingInteractions : [...existingInteractions, data.interaction],
          };
        });
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      console.error("Failed to connect to WebSocket:", err);
    }
  }, []);

  // Set up periodic refresh to fetch latest data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Auto-refresh: fetching latest cases");
      fetchReports();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Helper: time ago string
  function timeAgo(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }

  // Helper: format timestamp with date and time
  function formatTimestamp(dateStr: string | undefined) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  const statusStyles: Record<string, string> = {
    new: "bg-primary/10 text-primary",
    investigating: "bg-warning/10 text-warning",
    resolved: "bg-safe/10 text-safe",
    pending: "bg-primary/10 text-primary",
    active: "bg-emergency/10 text-emergency",
    "call initiated": "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    assigned: "bg-warning/10 text-warning",
    closed: "bg-safe/10 text-safe",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    new: <Clock className="h-4 w-4" />,
    investigating: <Clock className="h-4 w-4" />,
    resolved: <CheckCircle className="h-4 w-4" />,
    pending: <Clock className="h-4 w-4" />,
    active: <AlertTriangle className="h-4 w-4" />,
    assigned: <Clock className="h-4 w-4" />,
    closed: <CheckCircle className="h-4 w-4" />,
  };

  const filteredCases = cases
    .filter(c => !isDeletedCaseItem(c)) // Exclude deleted alerts and their linked SOS cases
    .filter(c => {
      // Reject hex-formatted case IDs (unpopulated alerts in format "C962B060")
      const hexIdPattern = /^[a-f0-9]{8}$/i;
      if (hexIdPattern.test(c.caseId)) {
        console.warn(`❌ [display] Filtering out hex-formatted caseId: ${c.caseId}`);
        return false;
      }
      return true;
    })
    .filter(c => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        String(c.caseId || "").toLowerCase().includes(term) ||
        String(c.id || "").toLowerCase().includes(term) ||
        String(c.type || "").toLowerCase().includes(term) ||
        String(c.status || "").toLowerCase().includes(term)
      );
    });

  // Separate active and resolved cases
  const activeCases = filteredCases.filter(c => 
    c.status !== "resolved" && c.status !== "closed"
  );
  const resolvedCases = filteredCases.filter(c => 
    c.status === "resolved" || c.status === "closed"
  );

  // Fetch full case details when selectedCase changes
  useEffect(() => {
    if (!selectedCase) {
      setCaseDetails(null);
      return;
    }
    setDetailsLoading(true);
    
    // Find the case data from the cases list (we already have it!)
    const caseFromList = cases.find(c => c.id === selectedCase);
    
    const fetchCaseDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = {
          Authorization: token ? `Bearer ${token}` : "",
        };

        let data = caseFromList;
        
        // If not in list, fetch from backend
        if (!data) {
          // Try to fetch from reports first
          let res = await fetch(`/api/reports/${selectedCase}`, { headers });

          // If report not found, try to fetch from alerts
          if (!res.ok) {
            console.log("Report not found, trying alerts...");
            res = await fetch(`/api/alerts/${selectedCase}`, { headers });
            if (res.ok) {
              const alertData = await res.json();
              data = alertData.alert;
            }
          } else {
            data = await res.json();
          }

          // If alert not found, try to fetch the full case details
          if (!data) {
            console.log("Alert not found, trying cases...");
            res = await fetch(`/api/cases/me`, { headers });
            if (res.ok) {
              const casesData = await res.json();
              data = casesData.cases?.find((c: any) => c._id === selectedCase);
            }
          }

          if (!data) {
            throw new Error(`Case with ID ${selectedCase} not found in any collection`);
          }
        }

        const detailType = (data?.type || data?.incidentType || "").toString();
        const reportIdForInteractions = (data?._id || data?.id || "").toString();
        const isReportDetail = data && reportIdForInteractions && !(
          detailType.includes("Emergency") ||
          detailType.includes("SOS") ||
          detailType.includes("Alert")
        );

        // Fetch progress notes for reporter-owned reports, including referred cases.
        if (isReportDetail) {
          try {
            const interactionsRes = await fetch(`/api/reports/${reportIdForInteractions}/interactions`, { headers });
            if (interactionsRes.ok) {
              const interactions = await interactionsRes.json();
              data = {
                ...data,
                interactions: Array.isArray(interactions) ? interactions : [],
              };
            }
          } catch (interactionErr) {
            console.warn("Could not fetch interactions:", interactionErr);
            // Not critical, continue without them
          }
        }

        setCaseDetails(data);
      } catch (err) {
        console.error("Error fetching case details:", err);
        toast({ title: "Failed to load case details", description: (err as Error).message, variant: "destructive" });
        setCaseDetails(null);
      } finally {
        setDetailsLoading(false);
      }
    };
    
    fetchCaseDetails();
  }, [selectedCase, cases, toast]);

  const currentCase = caseDetails
    ? {
        id: caseDetails.id || caseDetails._id || "",
        caseId: caseDetails.caseId || caseDetails._id?.toString().slice(-8).toUpperCase() || "",
        type: caseDetails.type || caseDetails.incidentType || "",
        date: caseDetails.date || (caseDetails.createdAt ? caseDetails.createdAt.slice(0, 10) : ""),
        dateTime: caseDetails.dateTime || formatTimestamp(caseDetails.createdAt),
        sosTriggeredAtTime: caseDetails.sosTriggeredAtTime || formatTimestamp(caseDetails.sosTriggeredAt),
        status: caseDetails.status || "pending",
        priority: caseDetails.priority || "normal",
        lastUpdate: caseDetails.lastUpdate || (caseDetails.updatedAt ? timeAgo(caseDetails.updatedAt) : ""),
        evidence: caseDetails.evidence || (caseDetails.evidenceIds ? caseDetails.evidenceIds.length : 0),
        evidenceFiles: caseDetails.evidenceFiles || (caseDetails.evidenceIds || []).map((ev: any) => ({
          id: ev.id || ev._id,
          _id: ev._id || ev.id,
          fileUrl: ev.fileUrl,
          type: ev.type,
          name: ev.name || (ev.fileUrl ? ev.fileUrl.split("/").pop() : "evidence"),
        })),
        description: caseDetails.description || (caseDetails.type?.includes("emergency") || caseDetails.type?.includes("Emergency") ? "SOS Emergency Alert" : ""),
        location: typeof caseDetails.location === "string" ? caseDetails.location : (caseDetails.location?.address || ""),
        coordinates: caseDetails.coordinates || (caseDetails.location?.coordinates || null),
        originalCaseId: caseDetails.originalCaseId || caseDetails.caseId?._id || caseDetails.caseId?.id || "",
        sosTriggeredAt: caseDetails.sosTriggeredAt,
        statusHistory: caseDetails.statusHistory || [],
        interactions: caseDetails.interactions || [],
        updates: caseDetails.updates || [
          { date: caseDetails.updatedAt ? caseDetails.updatedAt.slice(0, 10) : (caseDetails.date || ""), message: "Case updated" },
          { date: caseDetails.createdAt ? caseDetails.createdAt.slice(0, 10) : (caseDetails.date || ""), message: caseDetails.type?.includes("emergency") || caseDetails.type?.includes("Emergency") ? "SOS Triggered" : "Case created" }
        ]
      }
    : null;

  useEffect(() => {
    if (!currentCase) {
      setLocationAddress("");
      setLocationCoordinates(null);
      return;
    }

    setLocationAddress(currentCase.location || "");
    if (Array.isArray(currentCase.coordinates) && currentCase.coordinates.length >= 2) {
      setLocationCoordinates({
        longitude: Number(currentCase.coordinates[0]),
        latitude: Number(currentCase.coordinates[1]),
      });
    } else {
      setLocationCoordinates(null);
    }
  }, [currentCase?.id, currentCase?.location]);

  const getApiErrorMessage = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null);
    return data?.message || data?.error || data?.details || fallback;
  };

  const isEmergencyOrAlertCase = (item: any) => {
    const type = (item?.type || "").toString().toLowerCase();
    return type.includes("emergency") || type.includes("sos") || type.includes("alert");
  };

  const getLocationUpdateEndpoint = (item: any) => {
    if (isEmergencyOrAlertCase(item)) {
      return item.originalCaseId ? `/api/alerts/${item.id}/location` : `/api/cases/${item.id}/location`;
    }

    return `/api/reports/${item.id}/location`;
  };

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
      if (!res.ok) throw new Error("Reverse geocoding failed");
      const data = await res.json();
      return data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    } catch {
      return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
  };

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location not supported", description: "Your browser does not support location detection.", variant: "destructive" });
      return;
    }

    setLocationDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setLocationCoordinates({ latitude, longitude, accuracy });
        setLocationAddress(await reverseGeocode(latitude, longitude));
        setLocationDetecting(false);
      },
      (error) => {
        setLocationDetecting(false);
        toast({
          title: "Location access failed",
          description: error.message || "Please allow location access or type the address manually.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const saveCaseLocation = async () => {
    if (!currentCase) return;

    const address = locationAddress.trim().replace(/\s+/g, " ");
    if (!address && !locationCoordinates) {
      toast({ title: "Location required", description: "Enter an address or detect your current location.", variant: "destructive" });
      return;
    }

    setLocationSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload: Record<string, string | number> = { address };
      if (locationCoordinates) {
        payload.latitude = locationCoordinates.latitude;
        payload.longitude = locationCoordinates.longitude;
        if (locationCoordinates.accuracy !== undefined) payload.accuracy = locationCoordinates.accuracy;
      }

      const res = await fetch(getLocationUpdateEndpoint(currentCase), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update location"));
      }

      const data = await res.json();
      const updatedRecord = data.report || data.alert || data.case || {};
      const updatedLocation = updatedRecord.location || {
        address,
        coordinates: locationCoordinates ? [locationCoordinates.longitude, locationCoordinates.latitude] : currentCase.coordinates,
      };
      const updatedAddress = updatedLocation.address || address;
      const updatedCoordinates = updatedLocation.coordinates || (locationCoordinates ? [locationCoordinates.longitude, locationCoordinates.latitude] : null);
      const updatedAt = updatedRecord.updatedAt || new Date().toISOString();

      setCases((prevCases) => prevCases.map((item) =>
        item.id === currentCase.id
          ? {
              ...item,
              location: updatedAddress,
              coordinates: updatedCoordinates,
              lastUpdate: timeAgo(updatedAt),
            }
          : item
      ));

      setCaseDetails((prev: any) =>
        prev && (prev.id || prev._id || "").toString() === currentCase.id
          ? {
              ...prev,
              location: updatedLocation,
              coordinates: updatedCoordinates,
              updatedAt,
              lastUpdate: timeAgo(updatedAt),
            }
          : prev
      );

      toast({ title: "Location updated", description: `${currentCase.caseId} now uses the new location.` });
    } catch (err) {
      toast({ title: "Failed to update location", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLocationSaving(false);
    }
  };

  const handleSearch = () => {
    if (filteredCases.length === 0) {
      toast({ title: "No cases found", description: "Please check the case ID and try again" });
    }
  };

  const handleDelete = (caseId: string) => {
    setDeleteConfirm(caseId);
  };

  const confirmDelete = async (caseId: string) => {
    try {
      setDeleteLoading(true);
      const token = localStorage.getItem("token");
      const headers = {
        Authorization: token ? `Bearer ${token}` : "",
      };

      // Find the case to determine its type
      const caseToDelete = cases.find(c => c.id === caseId);
      if (!caseToDelete) {
        toast({ title: "Error", description: "Case not found", variant: "destructive" });
        setDeleteLoading(false);
        return;
      }

      console.log(`🗑️  [confirmDelete] Attempting to delete case ${caseToDelete.caseId} (ID: ${caseId}, Type: ${caseToDelete.type})`);

      // Determine if it's a report, alert, or SOS case and call appropriate delete endpoint
      let deleteRes = null;
      let deleted = false;
      let deleteAttempts = [];
      
      if (caseToDelete.type.includes("Emergency") || caseToDelete.type.includes("SOS") || caseToDelete.type.includes("Alert")) {
        const linkedCaseId = caseToDelete.originalCaseId || caseId;
        console.log(`🗑️  [confirmDelete] Detected SOS/Alert case, attempting deletion...`);
        
        // Delete the SOS case first. The backend case delete also removes associated alerts.
        deleteRes = await fetch(`/api/cases/${linkedCaseId}`, { 
          method: "DELETE", 
          headers 
        });
        deleteAttempts.push(`cases (${deleteRes.status})`);
        
        // If alert not found (404), treat as already deleted and remove from frontend
        if (deleteRes.status === 404) {
          console.log(`🗑️  [confirmDelete] Alert not found on backend (404) - was already deleted`);
          deleted = true;
        } else if (deleteRes.ok) {
          console.log(`✅ [confirmDelete] Alert successfully deleted from /api/alerts`);
          deleted = true;
        } else if (!deleteRes.ok && deleteRes.status !== 404) {
          console.log(`⚠️  [confirmDelete] Alert deletion failed (${deleteRes.status}), trying cases endpoint...`);
          // Try to delete from cases instead
          deleteRes = await fetch(`/api/cases/${caseId}`, { 
            method: "DELETE", 
            headers 
          });
          deleteAttempts.push(`cases (${deleteRes.status})`);
          
          if (deleteRes.status === 404 || deleteRes.ok) {
            console.log(`✅ [confirmDelete] Case successfully deleted from /api/cases`);
            deleted = true;
          }
        }

        // Also try the alert endpoint for rows where the visible ID is the alert ID.
        const alertDeleteRes = await fetch(`/api/alerts/${caseId}`, { 
          method: "DELETE", 
          headers 
        });
        deleteAttempts.push(`alerts (${alertDeleteRes.status})`);
        
        if (alertDeleteRes.status === 404 || alertDeleteRes.ok) {
          console.log(`[confirmDelete] Alert cleanup completed from /api/alerts`);
          deleted = true;
        }
      } else {
        console.log(`🗑️  [confirmDelete] Detected report case, attempting deletion...`);
        // Delete from reports collection
        deleteRes = await fetch(`/api/reports/${caseId}`, { 
          method: "DELETE", 
          headers 
        });
        deleteAttempts.push(`reports (${deleteRes.status})`);
        
        if (deleteRes.status === 404 || deleteRes.ok) {
          console.log(`✅ [confirmDelete] Report successfully deleted from /api/reports`);
          deleted = true;
        }
      }

      if (!deleted) {
        const attemptLog = deleteAttempts.join(", ");
        console.error(`❌ [confirmDelete] Failed to delete case after attempts: ${attemptLog}`);
        throw new Error(`Failed to delete case from database (tried: ${attemptLog})`);
      }

      // Add to deleted cases set and persist to sessionStorage
      // Track BOTH the alert ID and the underlying case ID to prevent new alerts for same case from reappearing
      const deletedIdentityValues = getCaseIdentityValues(caseToDelete);
      addDeletedCaseIds([caseId, ...deletedIdentityValues]);
      
      // Also track the underlying case ID if this is an SOS alert
      if (caseToDelete.type.includes("Emergency") || caseToDelete.type.includes("SOS") || caseToDelete.type.includes("Alert")) {
        const underlyingCaseId = caseToDelete.originalCaseId;
        if (underlyingCaseId) {
          console.log(`🗑️  [confirmDelete] Also tracking underlying case ID: ${underlyingCaseId}`);
          addDeletedCaseIds([underlyingCaseId]);
        }
      }
      
      // Remove from local state (whether it was deleted from DB or already gone)
      const deletedIdentitySet = new Set([caseId, ...deletedIdentityValues]);
      setCases(prevCases => prevCases.filter(c => 
        !getCaseIdentityValues(c).some(id => deletedIdentitySet.has(id))
      ));
      if (selectedCase === caseId) {
        setSelectedCase(null);
        setCaseDetails(null);
      }
      setDeleteConfirm(null);
      
      console.log(`✅ [confirmDelete] Case ${caseToDelete.caseId} successfully removed from UI`);
      toast({ title: "✅ Case deleted", description: `${caseToDelete.type} ${caseToDelete.caseId} has been permanently removed` });
    } catch (err) {
      console.error(`❌ [confirmDelete] Error during deletion:`, err);
      toast({ 
        title: "Failed to delete case", 
        description: (err as Error).message, 
        variant: "destructive" 
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportPdf = async () => {
    const reportCases = cases.filter(
      (c) =>
        !String(c.type || "").toLowerCase().includes("emergency") &&
        !String(c.type || "").toLowerCase().includes("sos") &&
        !String(c.type || "").toLowerCase().includes("alert")
    );

    if (reportCases.length === 0) {
      toast({
        title: "Nothing to export",
        description: "You have no incident reports to export yet.",
        variant: "destructive",
      });
      return;
    }

    setExporting(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: token ? `Bearer ${token}` : "" };
      const reporterEmail = localStorage.getItem("safeguard_user") || "";

      const detailedReports = await Promise.all(
        reportCases.map(async (report) => {
          const reportId = report.id || report._id;
          if (!reportId) return report;
          try {
            const [detailRes, interactionsRes] = await Promise.all([
              fetch(`/api/reports/${reportId}`, { headers }),
              fetch(`/api/reports/${reportId}/interactions`, { headers }),
            ]);
            const detail = detailRes.ok ? await detailRes.json() : report;
            const interactions = interactionsRes.ok
              ? await interactionsRes.json()
              : detail.interactions || report.interactions || [];
            return {
              ...report,
              ...detail,
              caseId: detail.caseId || report.caseId,
              evidenceIds: detail.evidenceIds || report.evidenceFiles || [],
              interactions: Array.isArray(interactions) ? interactions : [],
            };
          } catch (err) {
            console.error("Failed to fetch report details for export:", err);
            return report;
          }
        })
      );

      const blob = buildReporterCasesPdf(detailedReports, reporterEmail);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-safeguard-cases-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);

      toast({
        title: "PDF exported",
        description: `Downloaded summary of ${detailedReports.length} case(s).`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: (err as Error).message || "Could not generate PDF.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
  <div className="space-y-6">
    {/* Welcome Card */}
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col md:flex-row md:items-start md:justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Track Your Case</h2>
        <p className="text-base text-gray-700">Monitor the progress of your reported case. Check status updates, evidence review progress, and communication from police officers.</p>
      </div>
      <Button
        variant="outline"
        onClick={handleExportPdf}
        disabled={exporting || cases.length === 0}
        className="shrink-0"
      >
        <Download className="h-4 w-4 mr-2" />
        {exporting ? "Exporting..." : "Export PDF"}
      </Button>
    </div>

    {/* Search Section */}
    <div className="bg-card rounded-lg p-4 sm:p-6 border border-border/50 shadow-sm space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-semibold">Search Cases</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input 
            placeholder="Enter case ID or type..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button onClick={handleSearch} className="sm:w-auto">Search</Button>
          <Button 
            variant="outline" 
            onClick={() => setRefreshCount(prev => prev + 1)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>
    </div>

    {/* Cases List */}
    <div className="space-y-6">
      {/* Active Cases Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Active Cases ({activeCases.length})
        </h3>
        {loading ? (
          <div className="bg-muted/30 rounded-lg p-6 sm:p-8 text-center">
            <p className="text-muted-foreground">Loading cases...</p>
          </div>
        ) : activeCases.length > 0 ? (
          <div className="space-y-4">
            {activeCases.map((c) => (
              <div key={c.id} className="bg-card rounded-lg p-4 sm:p-5 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <p className="font-bold text-lg text-foreground">{c.caseId}</p>
                      <Badge className={`${statusStyles[c.status]} border-0 capitalize`}>{c.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{c.type} • {c.dateTime || c.date}</p>
                    <p className="text-xs text-muted-foreground">Last updated: {c.lastUpdate} • {c.evidence} evidence files</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedCase(c.id)}
                      disabled={detailsLoading && selectedCase === c.id}
                    >
                      <Eye className="h-4 w-4 mr-2" /> Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : searchTerm ? (
          <div className="bg-muted/30 rounded-lg p-6 sm:p-8 text-center">
            <p className="text-muted-foreground">No active cases found matching "{searchTerm}"</p>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-6 sm:p-8 text-center">
            <p className="text-muted-foreground">No active cases</p>
          </div>
        )}
      </div>

      {/* Resolved Cases Section */}
      {resolvedCases.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-safe" />
            Handled Cases ({resolvedCases.length})
          </h3>
          <div className="space-y-4">
            {resolvedCases.map((c) => (
              <div key={c.id} className="bg-card rounded-lg p-4 sm:p-5 border border-border/50 shadow-sm hover:shadow-md transition-shadow opacity-75">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <p className="font-bold text-lg text-foreground">{c.caseId}</p>
                      <Badge className={`${statusStyles[c.status]} border-0 capitalize`}>{c.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{c.type} • {c.dateTime || c.date}</p>
                    <p className="text-xs text-muted-foreground">Completed: {c.lastUpdate} • {c.evidence} evidence files</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedCase(c.id)}
                      disabled={detailsLoading && selectedCase === c.id}
                    >
                      <Eye className="h-4 w-4 mr-2" /> Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Case Details Section */}
    {selectedCase && (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-3 sm:p-4">
        <div className="bg-white dark:bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-md mx-auto max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
          {detailsLoading ? (
            <div className="relative p-8 text-center text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                onClick={() => setSelectedCase(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
              Loading details...
            </div>
          ) : currentCase ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-4 flex-shrink-0">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Case ID</div>
                  <div className="font-semibold text-lg text-foreground break-all">{currentCase.caseId}</div>
                  <div className="text-xs text-muted-foreground mt-1">{currentCase.type}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedCase(null)} aria-label="Close">
                  <span className="text-lg">×</span>
                </Button>
              </div>
              <div className="overflow-y-auto px-6 py-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className={`${statusStyles[currentCase.status]} border-0 capitalize`}>{currentCase.status}</Badge>
                  {currentCase.priority && currentCase.priority !== "normal" && (
                    <Badge className={`border-0 capitalize ${currentCase.priority === "critical" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {currentCase.priority}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{currentCase.type?.includes("Emergency") ? currentCase.sosTriggeredAtTime : currentCase.dateTime}</span>
                </div>
                <div className="text-sm text-foreground mb-2">
                  <span className="font-medium">Description:</span> {currentCase.description || <span className="text-muted-foreground">—</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Created Date & Time</span>
                  <span className="text-sm font-semibold text-foreground">
                    {currentCase.type?.includes("Emergency") ? currentCase.sosTriggeredAtTime : currentCase.dateTime}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Location</span>
                  <span className="text-sm text-foreground">{currentCase.location || <span className="text-muted-foreground">—</span>}</span>
                  {currentCase.coordinates && (
                    <span className="text-xs text-muted-foreground">
                      ({currentCase.coordinates[1]?.toFixed(4)}, {currentCase.coordinates[0]?.toFixed(4)})
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-3 mb-3">
                    <Label htmlFor="caseLocation" className="text-xs text-muted-foreground">Update Location</Label>
                    <div className="space-y-2">
                      <Input
                        id="caseLocation"
                        value={locationAddress}
                        onChange={(event) => {
                          setLocationAddress(event.target.value);
                          setLocationCoordinates(null);
                        }}
                        onBlur={() => setLocationAddress(locationAddress.trim().replace(/\s+/g, " "))}
                        placeholder="Type the current address"
                      />
                      {locationCoordinates && (
                        <p className="text-xs text-muted-foreground">
                          Detected: {locationCoordinates.latitude.toFixed(4)}, {locationCoordinates.longitude.toFixed(4)}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={detectCurrentLocation}
                        disabled={locationDetecting || locationSaving}
                      >
                        {locationDetecting ? (
                          "Detecting..."
                        ) : (
                          <>
                            <LocateFixed className="h-4 w-4 mr-2" /> Detect Current
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveCaseLocation}
                        disabled={locationSaving || locationDetecting}
                      >
                        <MapPin className="h-4 w-4 mr-2" /> {locationSaving ? "Saving..." : "Save Location"}
                      </Button>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Evidence</span>
                  {currentCase.evidenceFiles && currentCase.evidenceFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {currentCase.evidenceFiles.map((ev, idx) => {
                        const kind =
                          String(ev.type || "").toLowerCase() === "image" ||
                          /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(String(ev.name || ev.fileUrl || ""))
                            ? "image"
                            : String(ev.type || "").toLowerCase() === "audio" ||
                                /\.(mp3|wav|ogg|webm|m4a)$/i.test(String(ev.name || ev.fileUrl || ""))
                              ? "audio"
                              : "file";

                        const openEvidence = async () => {
                          try {
                            const url = evidenceUrl(ev);
                            if (!url) throw new Error("No evidence file URL");
                            const response = await fetch(url);
                            if (!response.ok) {
                              const errBody = await response.json().catch(() => ({}));
                              throw new Error(errBody.msg || errBody.message || `Failed to load (${response.status})`);
                            }
                            const blob = await response.blob();
                            if (audioBlob && previewUrl?.startsWith("blob:")) {
                              URL.revokeObjectURL(previewUrl);
                            }
                            const objectUrl = URL.createObjectURL(blob);
                            setAudioBlob(blob);
                            setPreviewUrl(objectUrl);
                            setPreviewType(kind === "audio" ? "audio" : "image");
                          } catch (err) {
                            toast({
                              title: "Cannot preview evidence",
                              description: (err as Error).message,
                              variant: "destructive",
                            });
                          }
                        };

                        return (
                        <div key={ev.id || ev._id || idx} className="flex items-center gap-2 border border-border/30 rounded-lg px-3 py-2 bg-muted/20">
                          {kind === "audio" ? (
                            <>
                              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                <Play className="w-3 h-3 text-blue-600 dark:text-blue-300" />
                              </div>
                              <span className="text-xs font-medium text-foreground">Audio</span>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-6 px-2 text-xs"
                                onClick={openEvidence}
                              >
                                Play
                              </Button>
                            </>
                          ) : kind === "image" ? (
                            <>
                              <img
                                src={evidenceUrl(ev)}
                                alt={ev.name}
                                className="h-8 w-8 rounded object-cover border bg-muted"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                                }}
                              />
                              <span className="text-xs font-medium text-foreground truncate max-w-[120px]">{ev.name || "Image"}</span>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-6 px-2 text-xs"
                                onClick={openEvidence}
                              >
                                Preview
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs truncate max-w-[140px]">{ev.name || "File"}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => window.open(evidenceUrl(ev), "_blank")}
                              >
                                Open
                              </Button>
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No evidence</span>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-border/40">
                  <span className="text-xs text-muted-foreground font-medium block mb-3">Case Timeline</span>
                  <div className="space-y-3">
                    {/* Use statusHistory if available (from backend), otherwise fall back to old logic */}
                    {caseDetails?.statusHistory && caseDetails.statusHistory.length > 0 ? (
                      <>
                        {/* Display all actual status transitions from statusHistory */}
                        {caseDetails.statusHistory.map((entry: any, idx: number) => {
                          const statusColorMap: Record<string, { bg: string; border: string; icon: string }> = {
                            pending: { bg: "bg-blue-500", border: "border-blue-200", icon: "📝" },
                            investigating: { bg: "bg-amber-500", border: "border-amber-200", icon: "🔍" },
                            referred_to_ngo: { bg: "bg-purple-500", border: "border-purple-200", icon: "🤝" },
                            call_initiated: { bg: "bg-blue-600", border: "border-blue-300", icon: "📞" },
                            arranged_counselling: { bg: "bg-indigo-500", border: "border-indigo-200", icon: "💬" },
                            resolved: { bg: "bg-green-500", border: "border-green-200", icon: "✓" }
                          };
                          
                          const colors = statusColorMap[entry.status] || { bg: "bg-gray-500", border: "border-gray-200", icon: "•" };
                          const isLastEntry = idx === caseDetails.statusHistory.length - 1;
                          const statusLabel = entry.status.replace(/_/g, " ").charAt(0).toUpperCase() + entry.status.replace(/_/g, " ").slice(1);
                          const timestamp = entry.changedAt ? new Date(entry.changedAt).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false
                          }) : currentCase.dateTime;
                          
                          return (
                            <div key={idx} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${colors.bg} border-2 ${colors.border}`} />
                                <div className={`w-0.5 ${isLastEntry ? "h-0" : "h-8"} ${colors.border.replace("border-", "bg-")}`} />
                              </div>
                              <div className="pt-0.5">
                                <div className="text-xs font-semibold text-foreground">{colors.icon} {statusLabel}</div>
                                <div className="text-xs text-muted-foreground">{timestamp}</div>
                                {entry.changedBy && (
                                  <div className="text-xs text-muted-foreground">by {entry.changedByRole}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : currentCase.type?.includes("SOS") || currentCase.type?.includes("Emergency") || currentCase.type?.includes("Alert") ? (
                      <>
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-red-200" />
                            <div className={`w-0.5 ${["call initiated", "resolved"].includes(currentCase.status) ? "h-8" : "h-0"} bg-emergency/10`} />
                          </div>
                          <div className="pt-0.5">
                            <div className="text-xs font-semibold text-foreground">🚨 SOS Alert Triggered</div>
                            <div className="text-xs text-muted-foreground">{currentCase.sosTriggeredAtTime || currentCase.date}</div>
                          </div>
                        </div>
                        {/* Police Officers Notified - shown for active, call initiated, and resolved */}
                        {["active", "call initiated", "resolved"].includes(currentCase.status) && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-200" />
                              <div className={`w-0.5 ${["call initiated", "resolved"].includes(currentCase.status) ? "h-8" : "h-0"} bg-amber-200`} />
                            </div>
                            <div className="pt-0.5">
                              <div className="text-xs font-semibold text-foreground">⚠️ Police Officers Notified</div>
                              <div className="text-xs text-muted-foreground">{currentCase.lastUpdate}</div>
                            </div>
                          </div>
                        )}
                        {/* Call Initiated */}
                        {["call initiated", "resolved"].includes(currentCase.status) && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-200" />
                              <div className={`w-0.5 ${currentCase.status === "resolved" ? "h-8" : "h-0"} bg-primary/10`} />
                            </div>
                            <div className="pt-0.5">
                              <div className="text-xs font-semibold text-foreground">📞 Call Initiated</div>
                              <div className="text-xs text-muted-foreground">{currentCase.lastUpdate}</div>
                            </div>
                          </div>
                        )}
                        {/* Resolved */}
                        {currentCase.status === "resolved" && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-green-200" />
                            </div>
                            <div className="pt-0.5">
                              <div className="text-xs font-semibold text-foreground">✓ Alert Resolved</div>
                              <div className="text-xs text-muted-foreground">{currentCase.lastUpdate}</div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Created */}
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-200" />
                            <div className="w-0.5 h-8 bg-primary/10" />
                          </div>
                          <div className="pt-0.5">
                            <div className="text-xs font-semibold text-foreground">Case Created</div>
                            <div className="text-xs text-muted-foreground">{currentCase.dateTime || currentCase.date}</div>
                          </div>
                        </div>
                        {/* Current status only - do not infer additional steps */}
                        {currentCase.status && currentCase.status !== "pending" && currentCase.status !== "new" && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-200" />
                            </div>
                            <div className="pt-0.5">
                              <div className="text-xs font-semibold text-foreground">{currentCase.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
                              <div className="text-xs text-muted-foreground">{currentCase.lastUpdate}</div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Interactions/Notes Section */}
                {currentCase.interactions && currentCase.interactions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <span className="text-xs text-muted-foreground font-medium block mb-3">Progress & Notes from Police Officers & NGO</span>
                    <div className="space-y-2 bg-muted/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                      {currentCase.interactions.map((note: any, idx: number) => (
                        <div key={idx} className="text-sm border-l-2 border-primary pl-3 py-1">
                          <p className="text-xs text-muted-foreground">
                            {new Date(note.createdAt).toLocaleString()} • {note.createdBy?.fullName || note.createdBy?.name || "Police Officer/NGO"}
                          </p>
                          <p className="text-foreground">{note.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-4">
                  <p className="text-xs text-muted-foreground text-center">
                    Reporters cannot delete submitted cases. Contact support if a report was submitted in error.
                  </p>
                </div>
              </div>
              <div className="border-t border-border/40 px-6 py-4 flex-shrink-0">
                <Button variant="outline" onClick={() => setSelectedCase(null)} className="w-full">
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    )}

    {/* Evidence Preview Modal */}
    {previewUrl && previewType && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-lg mx-auto p-6 relative">
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-4 right-4"
            onClick={() => {
              if (audioBlob && previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setAudioBlob(null);
              }
              setPreviewUrl(null);
              setPreviewType(null);
            }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
          {previewType === "image" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-foreground">Image Preview</h3>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full rounded-lg border border-border/30 max-h-[80vh] max-w-full object-contain bg-muted/20"
                onError={() => {
                  toast({
                    title: "Image failed to load",
                    description: "The file may be missing after a server restart. Re-upload the evidence on a new report.",
                    variant: "destructive",
                  });
                }}
              />
              <Button variant="outline" onClick={() => window.open(previewUrl || "", "_blank")}>
                Open in new tab
              </Button>
            </div>
          )}
          {previewType === "audio" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-foreground">Audio Playback</h3>
              <audio 
                controls 
                src={previewUrl || undefined} 
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

export default TrackCase;
