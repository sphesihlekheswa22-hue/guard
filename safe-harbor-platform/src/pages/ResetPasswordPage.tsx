import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api";

const AUTH_API_URL = `${API_BASE_URL}/auth`;
const MIN_PASSWORD_LENGTH = 8;

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const token = params.token || searchParams.get("token");
  const pageBackground = {
    backgroundImage: `url(/gbv-bg.png)`,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  };

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid reset link",
        description: "No reset token provided",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    // Verify token is valid
    const verifyToken = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/verify-reset-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (response.ok) {
          const data = await response.json();
          const expiryTime = data.expiresAt ? new Date(data.expiresAt).getTime() : 0;
          const serverTime = data.serverTime ? new Date(data.serverTime).getTime() : Date.now();

          if (!expiryTime || expiryTime <= serverTime) {
            toast({
              title: "Reset link expired",
              description: "Please request a new password reset link.",
              variant: "destructive",
            });
            navigate("/auth");
            return;
          }

          setExpiresAt(expiryTime);
          setServerOffset(serverTime - Date.now());
          setRemainingSeconds(Math.max(0, Math.ceil((expiryTime - serverTime) / 1000)));
          setIsValidToken(true);
        } else {
          const data = await response.json();
          toast({
            title: "Invalid or expired reset link",
            description: data.error || "Please request a new password reset",
            variant: "destructive",
          });
          navigate("/auth");
        }
      } catch (err) {
        toast({
          title: "Network error",
          description: "Could not verify reset link",
          variant: "destructive",
        });
        navigate("/auth");
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token, navigate, toast]);

  useEffect(() => {
    if (!expiresAt || !isValidToken) return;

    const updateCountdown = () => {
      const syncedNow = Date.now() + serverOffset;
      const secondsLeft = Math.max(0, Math.ceil((expiresAt - syncedNow) / 1000));
      setRemainingSeconds(secondsLeft);

      if (secondsLeft <= 0) {
        setIsValidToken(false);
        toast({
          title: "Reset link expired",
          description: "The 5 minute reset window has ended. Please request a new link.",
          variant: "destructive",
        });
        navigate("/auth");
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt, isValidToken, navigate, serverOffset, toast]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    if (remainingSeconds <= 0) {
      toast({
        title: "Reset link expired",
        description: "Please request a new password reset link.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Password too short",
        description: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Password reset successful",
          description: "You can now log in with your new password",
        });
        navigate("/auth");
      } else {
        toast({
          title: "Failed to reset password",
          description: data.error || "Please try again",
          variant: "destructive",
        });
      }
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

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center p-4" style={pageBackground}>
        <div className="text-center bg-card/80 rounded-2xl border border-border p-8 shadow-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4" style={pageBackground}>
      <Card className="w-full max-w-md bg-card/85 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Reset Your Password</CardTitle>
          <CardDescription>
            Enter your new password below
          </CardDescription>
          <p className={`text-sm font-medium ${remainingSeconds <= 60 ? "text-destructive" : "text-muted-foreground"}`}>
            Reset link expires in {formatTime(remainingSeconds)}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isResetting || remainingSeconds <= 0}>
              {isResetting ? "Resetting..." : "Reset Password"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => navigate("/auth")}
              className="text-sm text-primary hover:underline"
            >
              Back to Sign In
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
