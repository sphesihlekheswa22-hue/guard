import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/use-geolocation";
import { getMapLink, sosService, buildSosWhatsAppMessage, buildWhatsAppNotificationsFromContacts } from "@/services/sosService";
import { socketService } from "@/services/socketService";
import { apiUrl } from "@/lib/api";
import { sendSOSEmail } from "@/lib/emailService";
import { isSoshanguveLocation, SOSHANGUVE_LOCATION_ERROR } from "@/lib/soshanguve";

const openWhatsAppLinks = (links: Array<{ link: string }>) => {
  // Open immediately (no delay) so WhatsApp opens in the same user gesture chain.
  links.forEach((item) => {
    window.open(item.link, "_blank", "noopener,noreferrer");
  });
};

type SOSStatus = "idle" | "locating" | "sending" | "success" | "error";

const EmergencyAlert = () => {
  const { toast } = useToast();
  const { getCurrentLocation, loading: geoLoading, error: geoError } = useGeolocation();
  
  const [sosStatus, setSOSStatus] = useState<SOSStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [sosId, setSOSId] = useState<string | null>(null);
  const [sosCaseId, setSosCaseId] = useState<string | null>(null);
  const [cachedContacts, setCachedContacts] = useState<
    Array<{ _id?: string; name?: string; fullName?: string; email?: string; phone?: string }>
  >([]);
  const [reporterName, setReporterName] = useState("A SafeGuard user");
  
  // Get auth token (adjust based on your auth implementation)
  const token = localStorage.getItem("token") || "";
  const userId = localStorage.getItem("userId") || "";

  // Prefetch emergency contacts so WhatsApp can open instantly on SOS
  useEffect(() => {
    if (!token) return;
    const loadContacts = async () => {
      try {
        const res = await fetch(apiUrl("/users/profile"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const profile = await res.json();
        setReporterName(profile.fullName || profile.name || "A SafeGuard user");
        setCachedContacts(Array.isArray(profile.emergencyContacts) ? profile.emergencyContacts : []);
      } catch {
        // Keep SOS usable even if prefetch fails
      }
    };
    loadContacts();
  }, [token]);

  // Initialize socket connection on component mount
  useEffect(() => {
    if (userId) {
      socketService.connect(userId);
      
      // Listen for SOS acknowledgments
      socketService.onSOSAcknowledged((data) => {
        console.log("SOS Acknowledged:", data);
        toast({
          title: "✅ SOS Alert Sent",
          description: "Police officers and emergency contacts have been notified",
          variant: "default"
        });
      });

      // Listen for SOS errors
      socketService.onSOSError((data) => {
        console.error("SOS Error:", data);
        toast({
          title: "❌ Error",
          description: data.error || "Failed to send SOS alert",
          variant: "destructive"
        });
      });

      // Listen for emergency contact notifications
      socketService.onContactsNotified((data) => {
        console.log("Emergency contacts notified:", data);
        if (data.success === false) {
          toast({
            title: "Emergency email issue",
            description: data.error || "SOS was created, but emergency contact emails could not be sent.",
            variant: "destructive"
          });
          return;
        }

        toast({
          title: "📞 Contacts Notified",
          description: `${data.notifiedCount} emergency contact(s) have been notified`,
          variant: "default"
        });
      });
    }

    return () => {
      socketService.disconnect();
    };
  }, [userId, toast]);

  const handleSOSClick = async () => {
    try {
      // Verify user authentication first
      if (!token || !userId) {
        setSOSStatus("error");
        const errorMsg = !token ? "Authentication required. Please log in first." : "User ID not found. Please log out and log in again.";
        setStatusMessage(errorMsg);
        toast({
          title: "❌ Authentication Error",
          description: errorMsg,
          variant: "destructive"
        });
        return;
      }

      setSOSStatus("locating");
      setStatusMessage("Getting your location...");

      // Step 1: Get user's GPS location
      const location = await getCurrentLocation();

      if (!location) {
        setSOSStatus("error");
        setStatusMessage(geoError || "Failed to get location. Please enable location access.");
        toast({
          title: "❌ Location Error",
          description: geoError || "Unable to capture your location",
          variant: "destructive"
        });
        return;
      }

      if (
        !isSoshanguveLocation({
          address: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
        })
      ) {
        setSOSStatus("error");
        setStatusMessage(SOSHANGUVE_LOCATION_ERROR);
        toast({
          title: "Outside Soshanguve",
          description: SOSHANGUVE_LOCATION_ERROR,
          variant: "destructive",
        });
        return;
      }

      // Step 2: Open WhatsApp immediately with a live SOS message (before waiting on API).
      setSOSStatus("sending");
      setStatusMessage("Opening WhatsApp and notifying police...");

      const mapLink = getMapLink(location.latitude, location.longitude);
      const locationText = `${location.address || "Location captured"} (${mapLink})`;
      const instantMessage = buildSosWhatsAppMessage({
        reporterName,
        locationText,
        mapLink,
        time: new Date().toLocaleString(),
      });
      const instantWhatsApp = buildWhatsAppNotificationsFromContacts(cachedContacts, instantMessage);
      if (instantWhatsApp.length > 0) {
        openWhatsAppLinks(instantWhatsApp);
      }

      // Step 3: Send SOS alert to backend
      const sosResponse = await sosService.triggerSOS(location, token);

      if (!sosResponse.success) {
        setSOSStatus("error");
        setStatusMessage(sosResponse.error || "Failed to send SOS alert");
        toast({
          title: "❌ Alert Failed",
          description: sosResponse.error || "Failed to trigger SOS",
          variant: "destructive"
        });
        return;
      }

      // Step 4: Store SOS ID and continue email notifications
      const caseId = sosResponse.case?._id;
      const formattedCaseId = sosResponse.case?.caseId;
      const emergencyContacts = sosResponse.emergencyContacts || cachedContacts;
      const reporter = (sosResponse.case as any)?.userId;
      const resolvedReporterName = reporter?.fullName || reporter?.name || reporterName;
      const sosMessage = sosResponse.sosMessage || instantMessage;

      // If backend returned additional WhatsApp targets not opened yet, open them now.
      let whatsappNotifications = sosResponse.whatsappNotifications || [];
      if (whatsappNotifications.length === 0 && emergencyContacts.length > 0 && instantWhatsApp.length === 0) {
        whatsappNotifications = buildWhatsAppNotificationsFromContacts(emergencyContacts, sosMessage);
        if (whatsappNotifications.length > 0) {
          openWhatsAppLinks(whatsappNotifications);
        }
      }

      let emailNotifications = sosResponse.emailNotifications || {
        total: emergencyContacts.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        results: []
      };

      if (emergencyContacts.length > 0) {
        const results = await Promise.all(
          emergencyContacts.map(async (contact) => {
            try {
              if (!contact.email) {
                return {
                  contactId: contact._id,
                  contactName: contact.fullName || contact.name || "Emergency contact",
                  email: contact.email,
                  success: false,
                  skipped: true,
                  reason: "Missing email address"
                };
              }

              const contactName = contact.name || contact.fullName || "Emergency contact";

              await sendSOSEmail({
                email: contact.email,
                to_name: contactName,
                reporter_name: resolvedReporterName,
                message: sosMessage || "Emergency SOS Triggered",
                location: locationText,
                time: new Date().toLocaleString(),
              });

              return {
                contactId: contact._id,
                contactName: contact.fullName || contact.name || "Emergency contact",
                email: contact.email,
                success: true,
                skipped: false,
                reason: null
              };
            } catch (err) {
              console.error("Failed to send SOS email notification:", err);
              return {
                contactId: contact._id,
                contactName: contact.fullName || contact.name || "Emergency contact",
                email: contact.email,
                success: false,
                skipped: false,
                reason: err instanceof Error ? err.message : "Failed to send SOS email"
              };
            }
          })
        );

        emailNotifications = {
          total: emergencyContacts.length,
          sent: results.filter((result) => result.success).length,
          skipped: results.filter((result) => result.skipped).length,
          failed: results.filter((result) => !result.success && !result.skipped).length,
          results
        };
      }

      const emailSummary = emailNotifications
        ? emailNotifications.sent > 0
          ? ` Email alert sent to ${emailNotifications.sent} emergency contact(s).`
          : emailNotifications.total === 0
            ? " No emergency contacts are saved for email notification."
            : ` SOS was created, but no emergency contact email was sent. ${emailNotifications.results?.[0]?.reason || "Please check contact emails and email setup."}`
        : "";
      const openedWhatsAppCount = Math.max(instantWhatsApp.length, whatsappNotifications.length);
      const whatsappSummary = openedWhatsAppCount > 0
        ? ` WhatsApp alert opened for ${openedWhatsAppCount} contact(s).`
        : " No WhatsApp numbers available on emergency contacts.";
      setSOSId(caseId || null);
      setSosCaseId(formattedCaseId || null);

      // Step 4: Send continuous live location updates while SOS is active
      const locationInterval = setInterval(async () => {
        try {
          // Fetch fresh location data continuously
          const freshLocation = await getCurrentLocation();
          if (freshLocation) {
            // Send updated location via WebSocket with detailed data
            socketService.sendLocation(userId, freshLocation.latitude, freshLocation.longitude, freshLocation.address, freshLocation.accuracy);
            
            // Also update backend case with latest location
            try {
              await fetch(apiUrl(`/cases/${sosResponse.case?._id}/location`), {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  latitude: freshLocation.latitude,
                  longitude: freshLocation.longitude,
                  address: freshLocation.address,
                  accuracy: freshLocation.accuracy
                })
              });
            } catch (err) {
              console.warn("Failed to update live location on backend:", err);
            }
          }
        } catch (err) {
          console.warn("Error fetching live location update:", err);
        }
      }, 3000); // Update every 3 seconds for more accurate tracking

      // Store interval ID for cleanup
      window.sosLocationInterval = locationInterval;

      // Mark as success
      setSOSStatus("success");
      setStatusMessage(`Emergency alert sent! Police officers are being notified. Live location tracking active.${emailSummary}${whatsappSummary}`);

      toast({
        title: "SOS Activated",
        description: `Emergency alert sent to police officers. Location: ${location.address || "Location captured"}.${emailSummary}${whatsappSummary}`,
        variant: "default"
      });

      // Auto-reset after 5 seconds
      setTimeout(() => {
        setSOSStatus("idle");
        setStatusMessage("");
        setSosCaseId(null);
      }, 5000);
    } catch (error) {
      console.error("SOS Error:", error);
      setSOSStatus("error");
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setStatusMessage(errorMessage);
      toast({
        title: "❌ Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const getButtonText = () => {
    switch (sosStatus) {
      case "locating":
        return "📍 Getting your location...";
      case "sending":
        return "📤 Sending alert...";
      case "success":
        return "✅ Alert sent!";
      case "error":
        return "❌ Try again";
      default:
        return "🚨 ACTIVATE SOS";
    }
  };

  const getButtonState = () => {
    return sosStatus === "locating" || sosStatus === "sending" || geoLoading;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl border border-emergency/25 bg-gradient-to-br from-emergency/[0.08] to-destructive/[0.04] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Emergency Alert (SOS)</h2>
        <p className="text-base text-gray-700">
          Instantly alert police officers and your trusted contacts in case of immediate danger. Use only when you need immediate help.
        </p>
      </div>

      {/* Main SOS Button Card */}
      <div className="bg-card rounded-lg p-5 sm:p-8 border border-emergency/30 shadow-sm text-center space-y-6">
        <div className="flex justify-center">
          {sosStatus === "locating" || sosStatus === "sending" ? (
            <Loader2 className="h-16 w-16 text-emergency mx-auto animate-spin" />
          ) : sosStatus === "success" ? (
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          ) : sosStatus === "error" ? (
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
          ) : (
            <AlertTriangle className="h-16 w-16 text-emergency mx-auto" />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground">
            {statusMessage || "Tap the button below to instantly alert police officers and your trusted contacts."}
          </p>
          {sosCaseId && (
            <p className="text-sm text-gray-500">SOS Case ID: {sosCaseId}</p>
          )}
        </div>

        <Button
          variant="emergency"
          size="lg"
          className="text-base sm:text-lg px-4 sm:px-10 py-6 w-full"
          onClick={handleSOSClick}
          disabled={getButtonState()}
        >
          {getButtonText()}
        </Button>
      </div>

      {/* Information Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-blue-900">What happens when you activate SOS:</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">1.</span>
            <span>Your current GPS location is captured and shared with nearby police officers</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">2.</span>
            <span>Emergency contacts are notified immediately with your location</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">3.</span>
            <span>Your location is updated continuously for responders to track you</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">4.</span>
            <span>You'll receive confirmation when police officers and contacts are notified</span>
          </li>
        </ul>
      </div>

      {/* Warning Card */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-yellow-900">⚠️ Important:</h3>
        <p className="text-sm text-yellow-800">
          Only use SOS when you are in immediate danger. Misuse of this feature may result in legal action.
          Make sure location services and permissions are enabled on your device.
        </p>
      </div>
    </div>
  );
};

// Extend window interface for location interval
declare global {
  interface Window {
    sosLocationInterval?: NodeJS.Timeout;
  }
}

export default EmergencyAlert;
