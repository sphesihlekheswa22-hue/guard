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
        backgroundImage: `linear-gradient(180deg, rgba(8, 28, 42, 0.55), rgba(8, 28, 42, 0.72)), url(/gbv-bg.png)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(199_89%_48%/0.22),transparent_40%)]" />

      <div className="relative z-10 w-full max-w-3xl animate-fade-up rounded-[1.75rem] border border-white/25 bg-slate-950/45 p-6 text-center shadow-elevated backdrop-blur-xl sm:p-10 md:p-12">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/35 bg-white/90 shadow-soft">
          <Shield className="h-7 w-7 text-primary" />
        </div>

        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white drop-shadow-sm md:text-5xl">
          SafeGuard
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
          Reporting. Recovery. Justice. — A localized GBV response platform for Soshanguve.
        </p>

        <div className="mt-8">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-white/70">
            Select your role
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <Link
                key={role.title}
                to={role.link}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-white/30 bg-white/85 p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:bg-white hover:shadow-elevated"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <role.icon className="h-6 w-6" />
                </div>
                <span className="font-display text-sm font-semibold text-foreground">
                  {role.title}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {role.description}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
