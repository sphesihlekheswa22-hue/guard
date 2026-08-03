const SupportResources = () => (
  <div className="space-y-6">
    {/* Welcome Card */}
    <div className="rounded-2xl border border-safe/20 bg-gradient-to-br from-safe/[0.08] to-secondary/[0.05] p-6 shadow-soft flex flex-col gap-1">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Support Resources</h2>
      <p className="text-base text-gray-700">Access counseling, legal aid, emergency shelters, and other support services designed to help you and your family.</p>
    </div>

    <div className="grid gap-4">
      {[
        { title: "Emergency Shelters", desc: "Safe housing for survivors", count: "3 available" },
        { title: "Legal Aid", desc: "Free legal representation and advice", count: "7 partners" },
        { title: "Counseling Services", desc: "Mental health support", count: "12 counselors" },
        { title: "National Hotline", desc: "24/7 crisis support line", count: "1-800-799-7233" },
      ].map((r) => (
        <div key={r.title} className="bg-card rounded-lg p-5 border border-border/50 shadow-sm flex justify-between items-center">
          <div>
            <h4 className="font-semibold text-foreground">{r.title}</h4>
            <p className="text-sm text-muted-foreground">{r.desc}</p>
          </div>
          <span className="text-sm font-medium text-primary">{r.count}</span>
        </div>
      ))}
    </div>
  </div>
);

export default SupportResources;
