import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Shield, LogOut, ChevronLeft, Menu, X, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { reporterLanguages, useReporterLanguage } from "@/lib/reporterLanguage";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  navItems: NavItem[];
  accentColor?: string;
  showTranslator?: boolean;
}

const DashboardLayout = ({ children, title, subtitle, navItems, accentColor = "text-primary", showTranslator = false }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage } = useReporterLanguage();
  const showSidebarLabels = sidebarOpen || !isDesktop;

  const fetchProfile = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch("/api/users/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      setUser(data);
    } catch {
      // ignore error
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("safeguard_role");
    localStorage.removeItem("safeguard_user");
    localStorage.removeItem("token");
    navigate("/");
  };

  const [user, setUser] = useState<{ fullName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ fullName?: string }>).detail;
      if (detail) {
        setUser((current) => ({ ...(current || {}), ...detail }));
        return;
      }

      fetchProfile(false);
    };

    window.addEventListener("safeguard:profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("safeguard:profile-updated", handleProfileUpdated);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncViewport = () => {
      setIsDesktop(mediaQuery.matches);
      if (mediaQuery.matches) {
        setMobileSidebarOpen(false);
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setLanguageMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen surface-gradient" data-reporter-translate-scope={showTranslator ? "true" : undefined}>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/70 bg-white/90 backdrop-blur-xl transition-all duration-300 shadow-soft",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarOpen ? "lg:w-64" : "lg:w-20"
        )}
      >
        <div className="h-16 flex items-center gap-3 px-4 border-b border-border/70">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/5">
            <Shield className={cn("h-5 w-5 text-primary", accentColor)} />
          </div>
          {showSidebarLabels && (
            <span className="font-display text-xl font-extrabold tracking-tight text-primary">SafeGuard</span>
          )}
          <button
            type="button"
            className="ml-auto rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-200",
                  active
                    ? "premium-nav-active"
                    : "text-muted-foreground hover:bg-primary/[0.05] hover:text-primary"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {showSidebarLabels && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border/70 p-2.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
          >
            <ChevronLeft className={cn("h-5 w-5 shrink-0 transition-transform", !sidebarOpen && "rotate-180")} />
            {showSidebarLabels && <span>Collapse</span>}
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {showSidebarLabels && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <div className={cn("flex min-h-screen flex-col transition-all duration-300", sidebarOpen ? "lg:ml-64" : "lg:ml-20")}>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-white/80 px-3 py-3 shadow-soft backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold text-foreground sm:text-lg">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            {showTranslator && (
              <div className="relative" data-no-reporter-translate>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setLanguageMenuOpen((open) => !open)}
                  aria-label="Change language"
                  title="Change language"
                >
                  <Languages className="h-5 w-5" />
                </button>

                {languageMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-border/80 bg-white shadow-elevated">
                    {reporterLanguages.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                          item.code === language ? "bg-primary/10 font-semibold text-primary" : "text-foreground"
                        )}
                        onClick={() => {
                          setLanguage(item.code);
                          setLanguageMenuOpen(false);
                        }}
                      >
                        {item.label}
                        {item.code === language && <span className="text-xs">Selected</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="min-w-0 rounded-xl border border-border/70 bg-white/80 px-3 py-2 text-right shadow-sm">
              <span className="block truncate text-xs text-muted-foreground sm:text-sm">
                {loading ? "Loading..." : "Welcome"}
                {!loading && (
                  <>
                    {" "}
                    <b className="text-foreground">{user?.fullName || "User"}</b>
                  </>
                )}
              </span>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-start justify-center px-3 py-4 sm:px-4 sm:py-6 lg:py-8">
          <div className="page-enter premium-panel w-full min-w-0 max-w-6xl p-4 sm:p-6 lg:min-h-[70vh] lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
