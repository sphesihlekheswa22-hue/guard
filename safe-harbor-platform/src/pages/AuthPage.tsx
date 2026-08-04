import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowLeft, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast"; 
import { API_BASE_URL, apiUrl } from "@/lib/api";
import { sendResetPasswordEmail } from "@/lib/emailService";
import { isSoshanguvePoliceStation, SOSHANGUVE_STATION_NAME } from "@/lib/soshanguve";

type OrganizationOption = {
  id: string;
  label: string;
};

const roleTitles: Record<string, string> = {
  reporter: "Reporter",
  authority: "Police Officer",
  ngo: "NGO Worker",
  admin: "Admin",
};

const roleRedirects: Record<string, string> = {
  reporter: "/dashboard/reporter",
  authority: "/dashboard/authority",
  ngo: "/dashboard/ngo",
  admin: "/dashboard/admin",
};

const roleSignupMap: Record<string, string> = {
  reporter: "reporter",
  authority: "officer",
  ngo: "ngo_worker",
  admin: "admin",
};

const roleAcceptMap: Record<string, string[]> = {
  reporter: ["reporter"],
  authority: ["authority", "officer"],
  ngo: ["ngo", "ngo_worker"],
  admin: ["admin"],
};

const normalizeEmail = (value = "") => value.trim().toLowerCase();

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

const normalizeFullName = (value = "") => value.trim().replace(/\s+/g, " ");

const isValidFullName = (value = "") => /^[\p{L}]+(?: [\p{L}]+)*$/u.test(normalizeFullName(value));

const normalizeIdNumber = (value = "") => value.replace(/\D/g, "").slice(0, 13);
const isValidIdNumber = (value = "") => /^\d{13}$/.test(normalizeIdNumber(value));

const normalizeSouthAfricanPhone = (value = "") => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0027")) return `0${digits.slice(4)}`.slice(0, 10);
  if (digits.startsWith("27")) return `0${digits.slice(2)}`.slice(0, 10);
  return digits.slice(0, 10);
};
const isValidSouthAfricanPhone = (value = "") => /^0[678]\d{8}$/.test(normalizeSouthAfricanPhone(value));

const AUTH_API_URL = `${API_BASE_URL}/auth`;

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "reporter";
  const staffLoginOnly = role === "authority" || role === "ngo" || role === "admin";

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [selectedPoliceStation, setSelectedPoliceStation] = useState("");
  const [selectedNgo, setSelectedNgo] = useState("");
  const [policeStations, setPoliceStations] = useState<OrganizationOption[]>([]);
  const [ngoOptions, setNgoOptions] = useState<OrganizationOption[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (staffLoginOnly) {
      setIsLogin(true);
    }
  }, [staffLoginOnly]);

  useEffect(() => {
    const loadOrganizations = async () => {
      setOrganizationsLoading(true);
      setOrganizationsError("");
      try {
        const [stationsRes, ngosRes] = await Promise.all([
          fetch(apiUrl("/organizations/public?type=police_station")),
          fetch(apiUrl("/organizations/public?type=ngo")),
        ]);

        if (!stationsRes.ok || !ngosRes.ok) {
          throw new Error("Failed to load police stations or NGOs.");
        }

        const [stations, ngos] = await Promise.all([stationsRes.json(), ngosRes.json()]);
        const mappedStations = Array.isArray(stations)
          ? stations
              .map((item: any) => ({ id: item._id || item.code, label: item.name, address: item.address, code: item.code, name: item.name }))
              .filter((station: any) => isSoshanguvePoliceStation(station))
          : [];
        setPoliceStations(mappedStations);
        setNgoOptions(Array.isArray(ngos) ? ngos.map((item: any) => ({ id: item._id || item.code, label: item.name })) : []);
        if (mappedStations.length === 1) {
          setSelectedPoliceStation(mappedStations[0].id);
        }
      } catch (err) {
        setPoliceStations([]);
        setNgoOptions([]);
        setOrganizationsError((err as Error).message || "Failed to load police stations and NGOs.");
      } finally {
        setOrganizationsLoading(false);
      }
    };

    loadOrganizations();
  }, []);

  const clearAuthFields = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    setPhone("");
    setIdNumber("");
    setSelectedPoliceStation("");
    setSelectedNgo("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    const checks = {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    score = Object.values(checks).filter(Boolean).length;

    if (score <= 2) return { level: "weak", color: "text-red-500", bgColor: "bg-red-500" };
    if (score <= 4) return { level: "medium", color: "text-yellow-500", bgColor: "bg-yellow-500" };
    return { level: "strong", color: "text-green-500", bgColor: "bg-green-500" };
  };

  const validatePassword = (password: string) => {
    if (!password) return { isValid: false, message: "" };

    const isLongEnough = password.length >= 8;

    if (!isLongEnough) {
      return {
        isValid: false,
        message: "Password must be at least 8 characters long"
      };
    }

    return { isValid: true, message: "" };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      toast({
        title: "Invalid email address",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate password strength on signup
    if (!isLogin) {
      const normalizedName = normalizeFullName(name);
      if (!isValidFullName(normalizedName)) {
        toast({
          title: "Invalid full name",
          description: "Full name can only contain letters and spaces.",
          variant: "destructive",
        });
        return;
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        toast({
          title: "Password too short",
          description: passwordValidation.message,
          variant: "destructive",
        });
        return;
      }
    }

    // Validate password confirmation on signup
    if (!isLogin && password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both password fields are identical",
        variant: "destructive",
      });
      return;
    }

    // Validate required registration selections
    if (!isLogin) {
      if (staffLoginOnly || role === "admin" || role === "authority" || role === "ngo") {
        toast({
          title: "Registration disabled",
          description:
            role === "reporter"
              ? "Use Sign up as Reporter."
              : "Police officer and NGO staff accounts can only be created by an admin.",
          variant: "destructive",
        });
        return;
      }

      const normalizedPhone = normalizeSouthAfricanPhone(phone);
      if (!isValidSouthAfricanPhone(normalizedPhone)) {
        toast({
          title: "Invalid phone number",
          description: "Enter a valid South African mobile number starting with 06, 07, or 08.",
          variant: "destructive",
        });
        return;
      }

      const normalizedId = normalizeIdNumber(idNumber);
      if (!isValidIdNumber(normalizedId)) {
        toast({
          title: "Invalid ID number",
          description: "Enter a valid 13-digit South African ID number.",
          variant: "destructive",
        });
        return;
      }

      if (role === "reporter" && !selectedPoliceStation) {
        toast({
          title: "Police station required",
          description: policeStations.length === 0 ? "No police stations are available from the database yet." : "Please select the police station for your report.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    let keepSubmitting = false;

    try {
      let response;
      let data;

      if (isLogin) {
        response = await fetch(`${AUTH_API_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }),
        });

        data = await response.json();

        if (!response.ok) {
          toast({
            title: response.status === 403 ? "Access denied" : "Authentication failed",
            description: data.msg || "An error occurred. Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Store JWT token and user info
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
        if (data.user?._id) {
          localStorage.setItem("userId", data.user._id);
        }
        localStorage.setItem("safeguard_user", normalizedEmail);

        if (data.user && roleAcceptMap[role]?.includes(data.user.role)) {
          toast({
            title: "Welcome back!",
            description: `Redirecting to ${roleTitles[role]} dashboard...`,
          });

          keepSubmitting = true;
          setTimeout(() => {
            navigate(roleRedirects[role] || "/");
          }, 500);
        } else {
          toast({
            title: "Access Denied",
            description: `You do not have access to the ${roleTitles[role]} dashboard.`,
            variant: "destructive",
          });
        }
      } else {
        const signupRole = roleSignupMap[role] || "reporter";
        const normalizedName = normalizeFullName(name);
        const signupPayload: any = {
          fullName: normalizedName,
          email: normalizedEmail,
          password,
          phone: normalizeSouthAfricanPhone(phone),
          idNumber: normalizeIdNumber(idNumber),
          role: signupRole,
        };

        if (signupRole === "reporter") {
          signupPayload.policeStationId = selectedPoliceStation;
          signupPayload.policeStationName = SOSHANGUVE_STATION_NAME;
        }

        response = await fetch(`${AUTH_API_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signupPayload),
        });

        data = await response.json();

        if (!response.ok) {
          toast({
            title: "Registration failed",
            description: data.msg || data.error || "An error occurred. Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Store JWT token and user info
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
        if (data.user?._id) {
          localStorage.setItem("userId", data.user._id);
        }
        localStorage.setItem("safeguard_user", normalizedEmail);

        if (data.user && roleAcceptMap[role]?.includes(data.user.role)) {
          toast({
            title: "Account created!",
            description: `Redirecting to ${roleTitles[role]} dashboard...`,
          });

          keepSubmitting = true;
          setTimeout(() => {
            navigate(roleRedirects[role] || "/");
          }, 500);
        } else {
          toast({
            title: "Access Denied",
            description: `You do not have access to the ${roleTitles[role]} dashboard.`,
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({
        title: "Network error",
        description: "Could not connect to server. Please try again later.",
        variant: "destructive",
      });
    } finally {
      if (!keepSubmitting) {
        setIsSubmitting(false);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedResetEmail = normalizeEmail(resetEmail);
    if (!normalizedResetEmail) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    if (!isValidEmail(normalizedResetEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedResetEmail }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: "Failed to send reset email",
          description: data.error || "Please try again later",
          variant: "destructive",
        });
        return;
      }

      if (data.resetToken) {
        try {
          await sendResetPasswordEmail({
            email: data.email || normalizedResetEmail,
            to_name: data.toName || "User",
            reset_link: `${window.location.origin}/reset-password/${data.resetToken}`,
          });
        } catch (emailError) {
          console.error("Reset email send failed:", emailError);
          toast({
            title: "Could not send reset email",
            description:
              emailError instanceof Error
                ? emailError.message
                : "Password reset was prepared, but the email could not be delivered. Check EmailJS settings and try again.",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Reset email sent",
        description: data.resetToken
          ? "Check your email for password reset instructions. The link expires in 5 minutes."
          : "If an account exists for that email, a reset link has been sent.",
      });
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (err) {
      toast({
        title: "Network error",
        description: "Could not connect to server. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-white px-4 py-6">
      <div className="relative z-10 w-full max-w-md animate-fade-up space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:space-y-6 sm:p-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            {isLogin ? "Sign In" : "Create Account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            as{" "}
            <span className="font-semibold text-primary">
              {roleTitles[role]}
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {!isLogin && organizationsError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {organizationsError}
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="full-name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setName(normalizeFullName(name))}
                autoComplete="off"
                pattern="[A-Za-z ]+"
                title="Full name can only contain letters and spaces."
                required
              />
            </div>
          )}

          {!isLogin && role === "reporter" && (
            <div className="space-y-2">
              <Label htmlFor="policeStation">Police Station</Label>
              <select
                id="policeStation"
                value={selectedPoliceStation}
                onChange={(e) => setSelectedPoliceStation(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                disabled={organizationsLoading || policeStations.length === 0}
                required
              >
                <option value="">{organizationsLoading ? "Loading police stations..." : policeStations.length === 0 ? "No police stations available" : "Select your police station"}</option>
                {policeStations.map((station) => (
                  <option key={station.id} value={station.id}>{station.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Police officers assign an NGO to your case when needed. You do not choose an NGO.
              </p>
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="06XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhone(normalizeSouthAfricanPhone(phone))}
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">South African mobile number starting with 06, 07, or 08.</p>
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="idNumber">ID Number</Label>
              <Input
                id="idNumber"
                name="id-number"
                inputMode="numeric"
                placeholder="13-digit South African ID"
                value={idNumber}
                onChange={(e) => setIdNumber(normalizeIdNumber(e.target.value))}
                autoComplete="off"
                maxLength={13}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail(normalizeEmail(email))}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="auth-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={isLogin ? undefined : 8}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!isLogin && password && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Password strength:</span>
                  <span className={`font-medium ${getPasswordStrength(password).color}`}>
                    {getPasswordStrength(password).level}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      getPasswordStrength(password).level === "weak"
                        ? "w-1/3"
                        : getPasswordStrength(password).level === "medium"
                        ? "w-2/3"
                        : "w-full"
                    } ${getPasswordStrength(password).bgColor}`}
                  />
                </div>
                {!validatePassword(password).isValid && (
                  <p className="text-xs text-red-500">
                    {validatePassword(password).message}
                  </p>
                )}
              </div>
            )}
          </div>

          {isLogin && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="auth-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password &&
                confirmPassword &&
                password !== confirmPassword && (
                  <p className="text-xs text-destructive">
                    Passwords do not match
                  </p>
                )}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? (isLogin ? "Logging in..." : "Signing up...") : (isLogin ? "Sign In" : "Create Account")}
          </Button>
        </form>

        {staffLoginOnly ? (
          <p className="text-center text-sm text-muted-foreground">
            {role === "admin"
              ? "Admin accounts are managed separately and cannot be created here."
              : "Police officer and NGO staff accounts are created by an admin. Sign in with your issued account."}
          </p>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {isLogin
              ? "Don't have an account?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (isSubmitting) return;
                setIsLogin(!isLogin);
                clearAuthFields();
              }}
              className="text-primary font-medium hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-lg border border-border p-5 space-y-5 sm:p-8 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Reset Password</h2>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email</Label>
                <Input
                  id="resetEmail"
                  name="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isResetting}>
                {isResetting ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>

            <button
              onClick={() => setShowForgotPassword(false)}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
