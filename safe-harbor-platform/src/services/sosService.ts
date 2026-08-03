import { GeolocationData } from "@/hooks/use-geolocation";
import { API_BASE_URL } from "@/lib/api";

export interface SOSResponse {
  success: boolean;
  message?: string;
  emailNotifications?: {
    total: number;
    sent: number;
    skipped: number;
    failed: number;
    pending?: boolean;
    results?: Array<{
      contactId?: string;
      contactName?: string;
      email?: string;
      success: boolean;
      skipped: boolean;
      reason?: string | null;
    }>;
  };
  whatsappNotifications?: Array<{
    contactId?: string;
    contactName?: string;
    phone?: string;
    link: string;
    message?: string;
  }>;
  sosMessage?: string;
  emergencyContacts?: Array<{
    _id?: string;
    name?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  }>;
  case?: {
    _id: string;
    caseId?: string;
    userId: string;
    type: string;
    priority: string;
    status: string;
    location: {
      latitude: number;
      longitude: number;
      address: string;
      accuracy: number;
    };
    sosTriggeredAt: string;
  };
  error?: string;
}

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Service for handling SOS operations
 */
export const sosService = {
  /**
   * Trigger SOS emergency alert
   */
  triggerSOS: async (
    locationData: GeolocationData,
    token: string
  ): Promise<SOSResponse> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/cases/sos/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          address: locationData.address,
          accuracy: locationData.accuracy
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || error.msg || "Failed to trigger SOS");
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message,
        case: data.case,
        emailNotifications: data.emailNotifications,
        whatsappNotifications: data.whatsappNotifications || [],
        sosMessage: data.sosMessage,
        emergencyContacts: data.emergencyContacts || []
      };
    } catch (error) {
      console.error("SOS trigger error:", error);
      return {
        success: false,
        error: error instanceof DOMException && error.name === "AbortError"
          ? "SOS request timed out. Please check your connection and try again."
          : error instanceof Error ? error.message : "Failed to trigger SOS"
      };
    }
  },

  /**
   * Get nearby responders for SOS location
   */
  getNearbyResponders: async (
    latitude: number,
    longitude: number,
    maxDistance: number = 5000,
    token: string
  ) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/cases/sos/nearby?latitude=${latitude}&longitude=${longitude}&maxDistance=${maxDistance}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch nearby responders");
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching responders:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch responders"
      };
    }
  }
};

/**
 * Get Google Maps link for location sharing
 */
export function getMapLink(latitude: number, longitude: number): string {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

/**
 * Get OpenStreetMap link for location sharing
 */
export function getOpenStreetMapLink(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=18&layers=M`;
}

const normalizePhoneForWhatsApp = (phone = "") => {
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `27${digits.slice(1)}`;
  }
  return digits;
};

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const digits = normalizePhoneForWhatsApp(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildSosWhatsAppMessage(params: {
  reporterName?: string;
  locationText?: string;
  mapLink?: string;
  time?: string;
}) {
  return (
    `🚨 SafeGuard SOS Emergency\n\n` +
    `${params.reporterName || "A SafeGuard user"} may be in danger.\n` +
    `Time: ${params.time || new Date().toLocaleString()}\n` +
    `Location: ${params.locationText || "Location captured"}\n` +
    (params.mapLink ? `Map: ${params.mapLink}\n` : "") +
    `\nPlease respond immediately.`
  );
}

export function buildWhatsAppNotificationsFromContacts(
  contacts: Array<{ _id?: string; fullName?: string; name?: string; phone?: string }>,
  message: string
) {
  return contacts
    .map((contact) => {
      const link = buildWhatsAppLink(contact.phone || "", message);
      if (!link) return null;
      return {
        contactId: contact._id,
        contactName: contact.fullName || contact.name || "Emergency contact",
        phone: contact.phone,
        link,
        message,
      };
    })
    .filter(Boolean) as Array<{
    contactId?: string;
    contactName?: string;
    phone?: string;
    link: string;
    message?: string;
  }>;
}
