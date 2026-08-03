import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FileText,
  Bell,
  Search,
  LayoutDashboard,
  Map,
  Settings,
} from "lucide-react";
import { ReporterLanguageProvider } from "@/lib/reporterLanguage";
import { removeChatbaseWidget } from "@/lib/chatbot";
import ReporterHelpChat from "@/components/reporter/ReporterHelpChat";

const Overview = lazy(() => import("@/components/reporter/Overview"));
const CreateReport = lazy(() => import("@/components/reporter/CreateReport"));
const EmergencyAlert = lazy(() => import("@/components/reporter/EmergencyAlert"));
const TrackCase = lazy(() => import("@/components/reporter/TrackCase"));
const SafetyMap = lazy(() => import("@/components/reporter/SafetyMap"));
const SettingsPage = lazy(() => import("@/components/reporter/Settings"));

const ReporterViewLoader = () => (
  <div className="rounded-lg border border-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const navItems = [
  { to: "/dashboard/reporter", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/reporter/report", label: "Create Report", icon: FileText },
  { to: "/dashboard/reporter/emergency", label: "Emergency Alert", icon: Bell },
  { to: "/dashboard/reporter/track", label: "Track Case", icon: Search },
  { to: "/dashboard/reporter/safety-map", label: "Safety Map", icon: Map },
  { to: "/dashboard/reporter/settings", label: "Settings", icon: Settings },
];

const ReporterDashboardContent = () => {
  useEffect(() => {
    removeChatbaseWidget();
  }, []);

  return (
    <>
      <DashboardLayout
        title="Reporter Dashboard"
        subtitle="Report, track, and access support"
        navItems={navItems}
        showTranslator
      >
        <Suspense fallback={<ReporterViewLoader />}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="report" element={<CreateReport />} />
            <Route path="emergency" element={<EmergencyAlert />} />
            <Route path="track" element={<TrackCase />} />
            <Route path="safety-map" element={<SafetyMap />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard/reporter" replace />} />
          </Routes>
        </Suspense>
      </DashboardLayout>
      <ReporterHelpChat />
    </>
  );
};

const ReporterDashboard = () => (
  <ReporterLanguageProvider>
    <ReporterDashboardContent />
  </ReporterLanguageProvider>
);

export default ReporterDashboard;
