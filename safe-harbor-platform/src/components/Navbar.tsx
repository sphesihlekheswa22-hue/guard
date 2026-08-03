import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Menu, X } from "lucide-react";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const links = [
    { to: "/", label: "Home" },
    { to: "/report", label: "Report Incident" },
    { to: "/track", label: "Track Case" },
    { to: "/dashboard/authority", label: "Police Officers" },
    { to: "/dashboard/ngo", label: "NGO Dashboard" },
  ];

  const [user, setUser] = useState<{ fullName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) return setLoading(false);
        const res = await fetch("/api/users/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) return setLoading(false);
        const data = await res.json();
        setUser(data);
      } catch {
        // ignore error
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">SafeGuard</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              <Button
                variant={location.pathname === link.to ? "default" : "ghost"}
                size="sm"
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading..." : user?.fullName ? `Welcome, ${user.fullName}` : ""}
          </span>
          <Link to="/report">
            <Button variant="emergency" size="sm">
              🚨 Emergency
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-card border-b border-border p-4 space-y-2">
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" className="w-full justify-start" size="sm">
                {link.label}
              </Button>
            </Link>
          ))}
          <Link to="/report" onClick={() => setMobileOpen(false)}>
            <Button variant="emergency" className="w-full mt-2">
              🚨 Emergency
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
