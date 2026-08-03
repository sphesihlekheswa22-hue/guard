import { Shield, Heart } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-card border-t border-border py-12">
    <div className="container">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-foreground">SafeGuard</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Empowering communities to stand against gender-based violence through technology.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Report</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <Link to="/report" className="block hover:text-primary transition-colors">File a Report</Link>
            <Link to="/track" className="block hover:text-primary transition-colors">Track Your Case</Link>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Resources</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="hover:text-primary transition-colors cursor-pointer">Safety Planning</p>
            <p className="hover:text-primary transition-colors cursor-pointer">Legal Aid</p>
            <p className="hover:text-primary transition-colors cursor-pointer">Counseling Services</p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-foreground">Emergency</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>National Hotline: <span className="text-emergency font-semibold">1-800-799-7233</span></p>
            <p>Crisis Text Line: Text HOME to <span className="font-semibold">741741</span></p>
          </div>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-border flex items-center justify-center gap-1 text-sm text-muted-foreground">
        Built with <Heart className="h-4 w-4 text-emergency" /> for social impact
      </div>
    </div>
  </footer>
);

export default Footer;
