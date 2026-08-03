import { useState, useEffect } from "react";
import { FileText, Search, Bell, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Overview = () => {
  const [user, setUser] = useState<{ fullName?: string } | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    resolvedReports: 0,
    resolvedAlerts: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const headers = {
          Authorization: token ? `Bearer ${token}` : "",
        };

        const userRes = await fetch("/api/users/profile", { headers });
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        }

        const reportsRes = await fetch("/api/reports", { headers });
        if (reportsRes.ok) {
          const reportsData = await reportsRes.json();
          const userReports = Array.isArray(reportsData) ? reportsData : [];
          setReports(userReports);

          const total = userReports.length;
          const resolvedReports = userReports.filter((r: any) => r.status === "resolved").length;

          setStats((prev) => ({ ...prev, total, resolvedReports }));
        }

        const casesRes = await fetch("/api/cases/me", { headers });
        if (casesRes.ok) {
          const casesData = await casesRes.json();
          const userCases = casesData.cases || [];
          setCases(userCases);
        }

        const alertsRes = await fetch("/api/alerts/me", { headers });
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          const resolvedAlerts = (alertsData.alerts || []).filter((a: any) => a.status === "resolved").length;
          setStats((prev) => ({ ...prev, resolvedAlerts }));
        }
      } catch (err: any) {
        setError(err.message || "Error fetching data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const recentActivity = [
    ...reports.map((report) => ({
      id: report.caseId || report._id?.toString().slice(-8).toUpperCase() || "",
      type: "report",
      message: `Report ${report.caseId || report._id?.toString().slice(-8).toUpperCase() || ""} filed`,
      badge: report.status === "referred_to_ngo" ? "Referred to NGO" : report.status === "investigating" ? "Under Investigation" : "Submitted",
      badgeClass: report.status === "referred_to_ngo" ? "bg-purple/10 text-purple" : report.status === "investigating" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary",
      timestamp: report.updatedAt || report.createdAt,
    })),
    ...cases.map((sosCase) => ({
      id: sosCase.caseId || sosCase._id?.toString().slice(-8).toUpperCase() || "",
      type: "sos",
      message: `SOS Alert ${sosCase.caseId || sosCase._id?.toString().slice(-8).toUpperCase() || ""} triggered`,
      badge: sosCase.status === "resolved" ? "Resolved" : sosCase.status === "assigned" ? "Assigned" : "Active",
      badgeClass: sosCase.status === "resolved" ? "bg-safe/10 text-safe" : sosCase.status === "assigned" ? "bg-warning/10 text-warning" : "bg-emergency/10 text-emergency",
      timestamp: sosCase.sosTriggeredAt || sosCase.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {loading
            ? "Loading..."
            : error
            ? "Welcome back"
            : `Welcome back, ${user?.fullName || "User"}`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Your reporting and support overview</p>
        {error && <span className="mt-2 block text-sm text-destructive">{error}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Reports Filed", value: stats.total, icon: FileText, color: "text-primary", tint: "bg-primary/10" },
          { label: "Resolved Reports", value: stats.resolvedReports, icon: Search, color: "text-safe", tint: "bg-safe/10" },
          { label: "Resolved Alerts", value: stats.resolvedAlerts, icon: Bell, color: "text-emergency", tint: "bg-emergency/10" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border/80 bg-white/90 p-5 shadow-soft transition-shadow hover:shadow-elevated sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tint}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </div>
            <p className="mt-4 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/80 bg-white/90 p-6 shadow-soft">
        <h3 className="mb-5 font-display text-lg font-bold text-foreground">Recent Activity</h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((activity, idx) => (
              <div
                key={idx}
                className={`flex flex-col gap-3 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  activity.type === "sos"
                    ? "border-emergency/20 bg-emergency/[0.04] hover:bg-emergency/[0.07]"
                    : "border-primary/15 bg-primary/[0.04] hover:bg-primary/[0.07]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {activity.type === "sos" ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-emergency" />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                  )}
                  <span className="text-sm font-medium text-foreground">{activity.message}</span>
                </div>
                <Badge className={`${activity.badgeClass} w-fit border-0 font-semibold`}>{activity.badge}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p>No activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
