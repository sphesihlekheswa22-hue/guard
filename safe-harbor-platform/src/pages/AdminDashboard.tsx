import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import ProfileSettings from "@/components/reporter/Settings";
import { removeChatbaseWidget } from "@/lib/chatbot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Building2,
  Download,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Shield,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";

const navItems = [
  { to: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/admin/police-officers", label: "Manage Police Officers", icon: Shield },
  { to: "/dashboard/admin/reporters", label: "Manage Reporters", icon: UserRound },
  { to: "/dashboard/admin/ngo-workers", label: "Manage NGO Workers", icon: HeartHandshake },
  { to: "/dashboard/admin/audit-logs", label: "Audit Logs", icon: FileText },
  { to: "/dashboard/admin/organizations", label: "Manage Police Stations & NGOs", icon: Building2 },
  { to: "/dashboard/admin/profile", label: "Profile", icon: UserCog },
];

const organizationTypes = [
  { value: "police_station", label: "Police Station" },
  { value: "ngo", label: "NGO Organization" },
];

const roleGroups: Record<string, string[]> = {
  reporter: ["reporter"],
  police_officer: ["authority", "officer"],
  ngo_worker: ["ngo", "ngo_worker"],
};

const roleLabel = (role = "") => {
  const labels: Record<string, string> = {
    reporter: "Reporter",
    authority: "Police Officer",
    officer: "Police Officer",
    ngo: "NGO Worker",
    ngo_worker: "NGO Worker",
    admin: "Admin",
  };
  return labels[role] || role || "Unknown";
};

const userBelongsToGroup = (user: any, group: keyof typeof roleGroups) =>
  roleGroups[group].includes(user.role);

const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : "Not available";

const normalizePdfText = (value: any) => String(value ?? "N/A").replace(/\r?\n/g, " ").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
const escapePdfText = (value: any) => normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

const textCommand = (text: any, x: number, y: number, size = 8, color = "0.12 0.16 0.22", font = "F1") =>
  `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const rectCommand = (x: number, y: number, width: number, height: number, fill?: string, stroke = "0.78 0.82 0.88") => {
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
    const contentObjectNumber = 4 + index * 2;
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

const buildUsersPdf = (users: any[], title = "System Users Report") => {
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

  const drawSectionTitle = (sectionTitle: string) => {
    ensureSpace(32);
    y -= 12;
    addRect(margin, y - 20, contentWidth, 20, colors.navy, colors.navy);
    addText(sectionTitle, margin + 8, y - 14, 10, colors.white, "F2");
    y -= 20;
  };

  const drawTableRow = (cells: any[], widths: number[], options: { header?: boolean; minHeight?: number; maxLines?: number; fill?: string } = {}) => {
    const fontSize = options.header ? 7.5 : 7.2;
    const lineHeight = 9;
    const wrappedCells = cells.map((cell, index) => wrapPdfText(cell, widths[index] - 10, fontSize, options.maxLines));
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

  const drawKeyValueTable = (sectionTitle: string, rows: Array<[string, any]>) => {
    drawSectionTitle(sectionTitle);
    rows.forEach(([label, value], index) => {
      const labelWidth = 138;
      const valueWidth = contentWidth - labelWidth;
      const valueLines = wrapPdfText(value, valueWidth - 12, 7.5);
      const rowHeight = Math.max(24, valueLines.length * 10 + 12);
      ensureSpace(rowHeight);
      addRect(margin, y - rowHeight, labelWidth, rowHeight, colors.headerFill);
      addRect(margin + labelWidth, y - rowHeight, valueWidth, rowHeight, index % 2 === 0 ? colors.white : colors.softFill);
      addText(label, margin + 6, y - 15, 7.5, colors.navy, "F2");
      valueLines.forEach((line, lineIndex) => addText(line, margin + labelWidth + 6, y - 15 - lineIndex * 10, 7.5));
      y -= rowHeight;
    });
  };

  const scheduledDeletionCount = users.filter(user => user.accountDeletionStatus === "scheduled").length;
  const activeCount = users.length - scheduledDeletionCount;

  addRect(0, pageHeight - 78, pageWidth, 78, colors.navy, colors.navy);
  addText(title, margin, pageHeight - 38, 18, colors.white, "F2");
  addText(`Generated ${formatDate(new Date().toISOString())}`, margin, pageHeight - 58, 9, "0.86 0.91 0.98");
  y = pageHeight - 104;

  const cardWidth = (contentWidth - 24) / 3;
  [
    ["Total Users", users.length, colors.cardBlue],
    ["Active Accounts", activeCount, colors.cardGreen],
    ["Deletion Requests", scheduledDeletionCount, colors.cardPurple],
  ].forEach(([label, value, fill], index) => {
    const x = margin + index * (cardWidth + 12);
    addRect(x, y - 58, cardWidth, 58, fill as string);
    addText(label, x + 12, y - 19, 8, colors.muted, "F2");
    addText(value, x + 12, y - 43, 20, colors.navy, "F2");
  });
  y -= 82;

  drawSectionTitle("User Summary Table");
  const summaryWidths = [128, 176, 92, 92, 150, 70, 70];
  drawTableRow(["Name", "Email", "Role", "Phone", "Police Station / NGO", "Deletion", "Created"], summaryWidths, { header: true, minHeight: 26 });
  users.forEach((user) => {
    drawTableRow(
      [
        user.fullName || "Not provided",
        user.email || "Not provided",
        roleLabel(user.role),
        user.phone || "Not provided",
        user.policeStationName || user.ngoName || user.preferredNgoName || "Not assigned",
        user.accountDeletionStatus === "scheduled" ? "Scheduled" : "None",
        user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A",
      ],
      summaryWidths,
      { minHeight: 34, maxLines: 3 }
    );
  });

  users.forEach((user, index) => {
    drawKeyValueTable(`User Detail ${index + 1}: ${user.fullName || user.email || "N/A"}`, [
      ["Name", user.fullName || "Not provided"],
      ["Email", user.email || "Not provided"],
      ["Role", roleLabel(user.role)],
      ["Phone", user.phone || "Not provided"],
      ["Address", user.address || "Not provided"],
      ["ID Number", user.idNumber || "Not provided"],
      ["Police Station", user.policeStationName || user.policeStationId || "Not assigned"],
      ["NGO", user.ngoName || user.ngoId || user.preferredNgoName || user.preferredNgoId || "Not assigned"],
      ["Deletion Status", user.accountDeletionStatus === "scheduled" ? "Scheduled for permanent deletion" : "None"],
      ["Deletion Requested", formatDate(user.accountDeletionRequestedAt)],
      ["Last Login Activity", formatDate(user.lastLoginAt)],
      ["Account Created", formatDate(user.createdAt)],
      ["Last Updated", formatDate(user.updatedAt)],
    ]);
  });

  if (commands.length) pages.push(commands);
  return buildPdfDocument(pages.length ? pages : [[]], pageWidth, pageHeight);
};

const emptyOrganizationForm = {
  _id: "",
  type: "police_station",
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
};

const AdminDashboard = () => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [orgTypeFilter, setOrgTypeFilter] = useState("");
  const [orgForm, setOrgForm] = useState(emptyOrganizationForm);
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingOrg, setSavingOrg] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    removeChatbaseWidget();
  }, []);

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  const fetchJson = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || data?.error || "Request failed.");
    }
    return res.json();
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, userData, auditData] = await Promise.all([
        fetchJson("/api/admin/dashboard"),
        fetchJson("/api/admin/users"),
        fetchJson("/api/admin/audit-logs"),
      ]);
      setDashboard(dashboardData);
      setUsers(userData);
      setAuditLogs(auditData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadOrganizations = async () => {
    const [adminOrganizations, publicPoliceStations, publicNgos] = await Promise.all([
      fetchJson("/api/admin/organizations").catch(() => []),
      fetchJson("/api/organizations/public?type=police_station").catch(() => []),
      fetchJson("/api/organizations/public?type=ngo").catch(() => []),
    ]);

    const combinedOrganizations = Array.isArray(adminOrganizations) && adminOrganizations.length > 0
      ? adminOrganizations
      : [
          ...(Array.isArray(publicPoliceStations) ? publicPoliceStations : []),
          ...(Array.isArray(publicNgos) ? publicNgos : []),
        ];

    setOrganizations(combinedOrganizations);
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const cards = useMemo(() => [
    { label: "Total Users", value: dashboard?.totals?.users ?? 0, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Total Reports", value: dashboard?.totals?.reports ?? 0, icon: FileText, color: "text-warning", bgColor: "bg-warning/10" },
    { label: "SOS Alerts", value: dashboard?.totals?.alerts ?? 0, icon: AlertTriangle, color: "text-emergency", bgColor: "bg-emergency/10" },
    { label: "Resolved Cases", value: dashboard?.totals?.resolvedCases ?? 0, icon: Shield, color: "text-safe", bgColor: "bg-safe/10" },
  ], [dashboard]);

  const submitOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingOrg(true);
    setError("");
    try {
      const payload = {
        type: orgForm.type,
        name: orgForm.name,
        code: orgForm.code,
        phone: orgForm.phone,
        email: orgForm.email,
        address: orgForm.address,
      };
      if (orgForm._id) {
        await fetchJson(`/api/admin/organizations/${orgForm._id}?type=${orgForm.type}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await fetchJson("/api/admin/organizations", { method: "POST", body: JSON.stringify(payload) });
      }
      setOrgForm(emptyOrganizationForm);
      setShowOrgForm(false);
      await loadOrganizations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingOrg(false);
    }
  };

  const deleteOrganization = async (id: string) => {
    setError("");
    try {
      const organization = organizations.find((item) => item._id === id);
      const confirmed = window.confirm(`Permanently remove ${organization?.name || "this organization"}? This cannot be undone.`);
      if (!confirmed) return;

      const typeQuery = organization?.type ? `?type=${organization.type}` : "";
      await fetchJson(`/api/admin/organizations/${id}${typeQuery}`, { method: "DELETE" });
      if (orgForm._id === id) {
        setOrgForm(emptyOrganizationForm);
        setShowOrgForm(false);
      }
      await loadOrganizations();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const exportUsersPdf = (sectionUsers: any[], group: string) => {
    const exportTitles: Record<string, string> = {
      reporter: "Reporter Users Report",
      police_officer: "Police Officer Users Report",
      ngo_worker: "NGO Worker Users Report",
    };
    const blob = buildUsersPdf(sectionUsers, exportTitles[group] || "System Users Report");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group}-users-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteUserPermanently = async (user: any) => {
    const confirmed = window.confirm(`Permanently delete ${user.email}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingUserId(user._id);
    setError("");
    try {
      await fetchJson(`/api/admin/users/${user._id}`, { method: "DELETE" });
      await loadDashboard();
      setSelectedUser(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingUserId("");
    }
  };

  const renderError = () => error ? (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      {error}
    </div>
  ) : null;

  const renderOverview = () => (
    <div className="space-y-8">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Admin Overview</h2>
          <p className="text-base text-gray-700">System stats, health, and recent activity</p>
          {error && <span className="text-sm text-red-500 mt-1">{error}</span>}
        </div>
        <Button
          variant="outline"
          onClick={loadDashboard}
          disabled={loading}
          className="bg-white/80 border-blue-300 text-gray-800 hover:bg-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-border/80 bg-white/90 p-4 shadow-soft transition-shadow hover:shadow-elevated sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{loading ? "..." : card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/80 bg-white/90 p-6 shadow-soft">
        <h3 className="font-bold text-xl text-foreground mb-5">Recent Admin Activity</h3>
        {(dashboard?.recentActivity || []).length > 0 ? (
          <div className="space-y-3">
            {dashboard.recentActivity.map((item: any) => {
              const isDeleteAction = String(item.action || "").includes("deleted") || String(item.action || "").includes("removed");
              return (
                <div
                  key={item._id}
                  className={`flex flex-col gap-3 p-3 rounded-lg border transition sm:flex-row sm:items-center sm:justify-between ${
                    isDeleteAction
                      ? "border-emergency/20 bg-emergency/[0.04] hover:bg-emergency/[0.07]"
                      : "border-primary/15 bg-primary/[0.04] hover:bg-primary/[0.07]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isDeleteAction ? (
                      <AlertTriangle className="h-5 w-5 text-emergency shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="block text-sm text-gray-700 font-medium">{item.details || item.action}</span>
                      <span className="block text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <Badge className={`${isDeleteAction ? "bg-emergency/10 text-red-800" : "bg-primary/10 text-blue-800"} w-fit border-0 font-semibold`}>
                    {item.action ? String(item.action).replace(/_/g, " ") : "activity"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p>No recent admin activity yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const getUserDetailRows = (user: any) => {
    const rows: Array<[string, string]> = [
      ["Name", user.fullName || "Not provided"],
      ["Email", user.email || "Not provided"],
      ["Role", roleLabel(user.role)],
    ];

    if (userBelongsToGroup(user, "police_officer")) {
      rows.push(["Police Station", user.policeStationName || user.policeStationId || "Not assigned"]);
    }

    if (userBelongsToGroup(user, "reporter")) {
      rows.push(
        ["Police Station", user.policeStationName || user.policeStationId || "Not assigned"],
        ["Preferred NGO", user.preferredNgoName || user.preferredNgoId || "Not assigned"],
      );
    }

    if (userBelongsToGroup(user, "ngo_worker")) {
      rows.push(["NGO", user.ngoName || user.ngoId || "Not assigned"]);
    }

    rows.push(
      ["Phone", user.phone || "Not provided"],
      ["Address", user.address || "Not provided"],
      ["ID Number", user.idNumber || "Not provided"],
      ["Deletion Status", user.accountDeletionStatus === "scheduled" ? "Scheduled for permanent deletion" : "None"],
      ["Deletion Requested", formatDate(user.accountDeletionRequestedAt)],
      ["Last Login Activity", formatDate(user.lastLoginAt)],
      ["Session Expires", formatDate(user.lastLoginSessionExpiresAt)],
      ["Date Account Was Created", formatDate(user.createdAt)],
      ["Last Profile Update", formatDate(user.updatedAt)],
    );

    return rows;
  };

  const renderUserDetails = () => selectedUser ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl border border-border/60 w-full max-w-2xl max-h-[86vh] overflow-y-auto mx-auto p-5 relative space-y-4">
        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="absolute top-4 right-4 p-1 hover:bg-muted rounded"
          aria-label="Close user details"
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <h3 className="text-lg font-bold text-foreground">{roleLabel(selectedUser.role)} Details</h3>
          <p className="text-sm text-muted-foreground">{selectedUser.fullName || "Not provided"} - {selectedUser.email}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border pt-4">
          {getUserDetailRows(selectedUser).map(([label, value]) => (
            <div key={label}>
              <span className="text-sm text-muted-foreground">{label}</span>
              <p className="font-semibold text-foreground break-words">{value}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Action</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deletingUserId === selectedUser._id || selectedUser._id === localStorage.getItem("userId")}
              onClick={() => deleteUserPermanently(selectedUser)}
            >
              {deletingUserId === selectedUser._id ? "Deleting..." : "Delete Permanently"}
            </Button>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const renderUserManagement = (group: keyof typeof roleGroups, title: string, description: string) => {
    const sectionUsers = users.filter((user) => userBelongsToGroup(user, group));
    const assignmentColumns = group === "reporter"
      ? [
          { label: "Police Station", value: (user: any) => user.policeStationName || "Not assigned" },
          { label: "Preferred NGO", value: (user: any) => user.preferredNgoName || user.preferredNgoId || "Not assigned" },
        ]
      : group === "ngo_worker"
        ? [{ label: "NGO", value: (user: any) => user.ngoName || user.ngoId || "Not assigned" }]
        : [{ label: "Police Station", value: (user: any) => user.policeStationName || "Not assigned" }];
    const tableColumnCount = 4 + assignmentColumns.length;

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{title}</h2>
            <p className="text-base text-gray-700">{description}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => exportUsersPdf(sectionUsers, group)}
              disabled={sectionUsers.length === 0}
              className="bg-white/80 border-blue-300 text-gray-800 hover:bg-white"
            >
              <Download className="mr-2 h-4 w-4" /> Export PDF
            </Button>
            <Button variant="outline" onClick={loadDashboard} disabled={loading} className="bg-white/80 border-blue-300 text-gray-800 hover:bg-white">
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {renderError()}

        <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${group === "reporter" ? "min-w-[860px]" : "min-w-[720px]"}`}>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pl-5 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Role</th>
                  {assignmentColumns.map((column) => (
                    <th key={column.label} className="py-3 pr-4">{column.label}</th>
                  ))}
                  <th className="py-3 pr-5">View</th>
                </tr>
              </thead>
              <tbody>
                {sectionUsers.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-muted-foreground" colSpan={tableColumnCount}>
                      No users found.
                    </td>
                  </tr>
                ) : sectionUsers.map((user) => (
                  <tr key={user._id} className="border-b last:border-0">
                    <td className="py-3 pl-5 pr-4 font-medium">{user.fullName || "Not provided"}</td>
                    <td className="py-3 pr-4">{user.email}</td>
                    <td className="py-3 pr-4"><Badge variant="outline">{roleLabel(user.role)}</Badge></td>
                    {assignmentColumns.map((column) => (
                      <td key={column.label} className="py-3 pr-4">{column.value(user)}</td>
                    ))}
                    <td className="py-3 pr-5">
                      <Button size="sm" variant="outline" onClick={() => setSelectedUser(user)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {renderUserDetails()}
      </div>
    );
  };

  const renderOrganizations = () => {
    const visibleOrganizations = orgTypeFilter
      ? organizations.filter((organization) => organization.type === orgTypeFilter)
      : organizations;
    const currentPoliceStations = organizations.filter((organization) => organization.type === "police_station");
    const currentNgos = organizations.filter((organization) => organization.type === "ngo");

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-safe/20 bg-gradient-to-br from-safe/[0.08] to-secondary/[0.05] p-6 shadow-soft flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Manage Police Stations & NGOs</h2>
          <p className="text-base text-gray-700">Add, edit, or remove police stations and NGOs used during signup and profile updates.</p>
        </div>

        {renderError()}

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Current Lists</h3>
                <p className="text-sm text-muted-foreground">
                  {currentPoliceStations.length} police stations and {currentNgos.length} NGOs saved.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={orgTypeFilter} onChange={(event) => setOrgTypeFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">All Police Stations & NGOs</option>
                  {organizationTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <Button
                  type="button"
                  onClick={() => {
                    setOrgForm(emptyOrganizationForm);
                    setShowOrgForm(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Organization
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {visibleOrganizations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No police stations or NGOs saved yet.</p>
              ) : visibleOrganizations.map((organization) => (
                <div key={organization._id} className="bg-card rounded-lg p-4 border border-border/50 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium text-foreground">{organization.name}</p>
                        <Badge variant="outline">{organization.type === "police_station" ? "Police Station" : "NGO"}</Badge>
                        {!organization.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{organization.code} - {organization.email || "No email"} - {organization.phone || "No phone"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{organization.address || "No address"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOrgForm(organization);
                          setShowOrgForm(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteOrganization(organization._id)}>Remove</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showOrgForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <form onSubmit={submitOrganization} className="bg-card rounded-xl border border-border/60 shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5 space-y-4 relative">
                <button
                  type="button"
                  onClick={() => {
                    setOrgForm(emptyOrganizationForm);
                    setShowOrgForm(false);
                  }}
                  className="absolute right-4 top-4 rounded p-1 hover:bg-muted"
                  aria-label="Close organization form"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="pr-8">
                  <h3 className="font-semibold text-foreground">{orgForm._id ? "Edit Organization" : "Add Organization"}</h3>
                  <p className="text-sm text-muted-foreground">Complete the fields below to save a police station or NGO.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <select
                      value={orgForm.type}
                      onChange={(event) => setOrgForm((current) => ({ ...current, type: event.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={Boolean(orgForm._id)}
                    >
                      {organizationTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input value={orgForm.code} onChange={(event) => setOrgForm((current) => ({ ...current, code: event.target.value }))} placeholder="unique-code" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={orgForm.name} onChange={(event) => setOrgForm((current) => ({ ...current, name: event.target.value }))} placeholder="Police station or NGO name" required />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={orgForm.email} onChange={(event) => setOrgForm((current) => ({ ...current, email: event.target.value }))} placeholder="contact@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={orgForm.phone} onChange={(event) => setOrgForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={orgForm.address} onChange={(event) => setOrgForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOrgForm(emptyOrganizationForm);
                      setShowOrgForm(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingOrg}>{savingOrg ? "Saving..." : orgForm._id ? "Update Organization" : "Add Organization"}</Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAuditLogs = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-muted p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Audit Logs</h2>
        <p className="text-base text-gray-700">See who changed case statuses, viewed evidence, and updated profile or location information.</p>
      </div>

      {renderError()}

      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pl-5 pr-4 font-semibold">Date & Time</th>
                <th className="py-3 pr-4 font-semibold">User</th>
                <th className="py-3 pr-4 font-semibold">Email</th>
                <th className="py-3 pr-4 font-semibold">Role</th>
                <th className="py-3 pr-4 font-semibold">Action</th>
                <th className="py-3 pr-4 font-semibold">Resource</th>
                <th className="py-3 pr-5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                    No audit logs yet.
                  </td>
                </tr>
              ) : auditLogs.map((log) => (
                <tr key={log._id} className="border-b transition-colors hover:bg-muted/20 last:border-0">
                  <td className="py-4 pl-5 pr-4 align-top whitespace-nowrap text-muted-foreground">{formatDate(log.createdAt)}</td>
                  <td className="py-4 pr-4 align-top font-medium text-foreground">{log.actorName || log.userId?.fullName || "System"}</td>
                  <td className="py-4 pr-4 align-top text-muted-foreground">{log.actorEmail || log.userId?.email || "Not available"}</td>
                  <td className="py-4 pr-4 align-top">
                    <Badge variant="secondary">{roleLabel(log.actorRole || log.userId?.role)}</Badge>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <Badge variant="outline" className="capitalize">{String(log.action || "activity").replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <div className="font-medium text-foreground capitalize">{String(log.resourceType || "N/A").replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{log.resourceLabel || log.resourceId || "No resource reference"}</div>
                  </td>
                  <td className="py-4 pr-5 align-top text-muted-foreground">{log.details || "No details"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout
      title="Admin Dashboard"
      subtitle="System Monitoring & Oversight"
      navItems={navItems}
      accentColor="text-secondary"
    >
      <Routes>
        <Route index element={renderOverview()} />
        <Route path="police-officers" element={renderUserManagement("police_officer", "Manage Police Officers", "View police officer accounts, deletion requests, and account information.")} />
        <Route path="reporters" element={renderUserManagement("reporter", "Manage Reporters", "View reporter accounts, deletion requests, and account information.")} />
        <Route path="ngo-workers" element={renderUserManagement("ngo_worker", "Manage NGO Workers", "View NGO worker accounts, deletion requests, and account information.")} />
        <Route path="audit-logs" element={renderAuditLogs()} />
        <Route path="organizations" element={renderOrganizations()} />
        <Route path="profile" element={<ProfileSettings />} />
        <Route path="*" element={<Navigate to="/dashboard/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default AdminDashboard;
