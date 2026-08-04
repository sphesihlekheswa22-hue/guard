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
    <div className="flex min-h-svh items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-white p-6 text-center shadow-sm sm:p-10 md:p-12">
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
                className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
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
