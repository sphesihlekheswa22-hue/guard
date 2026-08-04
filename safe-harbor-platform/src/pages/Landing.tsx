import { Link } from "react-router-dom";
import { Shield, UserPlus, Gavel, HandHeart, Settings } from "lucide-react";

const roles = [
  {
    icon: UserPlus,
    title: "Reporter",
    description: "Report incidents and trigger SOS.",
    link: "/auth?role=reporter",
  },
  {
    icon: Gavel,
    title: "Police Officer",
    description: "Manage cases and emergencies.",
    link: "/auth?role=authority",
  },
  {
    icon: HandHeart,
    title: "Support NGO",
    description: "Support survivors and referrals.",
    link: "/auth?role=ngo",
  },
  {
    icon: Settings,
    title: "Admin",
    description: "Monitor users and system activity.",
    link: "/auth?role=admin",
  },
];

const Landing = () => {
  return (
    <div
      className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-8"
      style={{
        backgroundImage: `url(/gbv-bg.png)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
    >
      {/* Light overlay so the photo doesn't look dark */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.92))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(199_89%_48%/0.16),transparent_45%)]" />

      <div className="relative z-10 w-full max-w-3xl rounded-[1.75rem] border border-white/25 bg-white/85 p-6 text-center backdrop-blur-sm shadow-soft sm:p-10 md:p-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-7 w-7 text-primary" />
        </div>

        <h1 className="text-3xl font-bold text-foreground md:text-4xl">SafeGuard</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Reporting. Recovery. Justice. — A localized GBV response platform for Soshanguve.
        </p>

        <div className="mt-8">
          <p className="mb-4 text-sm font-medium text-muted-foreground">Select your role</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <Link
                key={role.title}
                to={role.link}
                className="group flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-white/90 p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <role.icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-semibold text-foreground">{role.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{role.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
