import { useState, useCallback } from "react";

export interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  error?: string;
}

/**
 * Reverse geocode coordinates to get address using OpenStreetMap Nominatim
 */
async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      {
        signal: controller.signal,
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("Failed to reverse geocode location");
    }

    const data = await response.json();
    return data.address?.road || data.address?.village || data.address?.city || `${latitude}, ${longitude}`;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Custom hook for getting user's geolocation with reverse geocoding
 */
export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentLocation = useCallback(
    async (): Promise<GeolocationData | null> => {
      setLoading(true);
      setError(null);

      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          const errorMsg = "Geolocation is not supported by this browser";
          setError(errorMsg);
          setLoading(false);
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude, accuracy } = position.coords;

              // Get address via reverse geocoding
              const address = await reverseGeocode(latitude, longitude);

              const locationData: GeolocationData = {
                latitude,
                longitude,
                accuracy,
                address
              };

              setLoading(false);
              resolve(locationData);
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : "Failed to process location";
              setError(errorMsg);
              setLoading(false);
              resolve(null);
            }
          },
          (err) => {
            let errorMsg = "Unable to retrieve your location";

            switch (err.code) {
              case err.PERMISSION_DENIED:
                errorMsg = "Location permission denied. Please enable location access.";
                break;
              case err.POSITION_UNAVAILABLE:
                errorMsg = "Location information is unavailable.";
                break;
              case err.TIMEOUT:
                errorMsg = "The request to get location timed out.";
                break;
            }

            setError(errorMsg);
            setLoading(false);
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      });
    },
    []
  );

  return {
    getCurrentLocation,
    loading,
    error
  };
}
