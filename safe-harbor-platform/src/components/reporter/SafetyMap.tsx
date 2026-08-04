import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Shield, Loader2, MousePointerClick } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const userIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const clickIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const SOSHANGUVE_CENTER: [number, number] = [-25.5228, 28.0995];

type RiskLevel = "High" | "Medium" | "Low" | "Unknown";

interface RiskArea {
  name: string;
  risk: RiskLevel;
  lat: number;
  lng: number;
  incidents: number;
}

interface SafetyAssessment {
  latitude: number;
  longitude: number;
  inSoshanguve: boolean;
  radiusMeters: number;
  lookbackDays: number;
  risk: RiskLevel;
  summary: string;
  nearbyIncidents: number;
  sosNearby: number;
  nearest: { distanceMeters: number; label: string; source: string } | null;
  disclaimer: string;
}

const riskColor = (risk: string) => {
  switch (risk) {
    case "High":
      return "bg-emergency/10 text-emergency border-emergency/30";
    case "Medium":
      return "bg-warning/10 text-warning border-warning/30";
    case "Unknown":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-safe/10 text-safe border-safe/30";
  }
};

const riskPathColors: Record<string, { color: string; fillColor: string }> = {
  High: { color: "#ef4444", fillColor: "#fca5a5" },
  Medium: { color: "#f59e0b", fillColor: "#fcd34d" },
  Low: { color: "#10b981", fillColor: "#a7f3d0" },
  Unknown: { color: "#94a3b8", fillColor: "#cbd5e1" },
};

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const SafetyMap = () => {
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [riskAreas, setRiskAreas] = useState<RiskArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState<SafetyAssessment | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    const loadHotspots = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/safety-map/hotspots`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.hotspots)) {
          setRiskAreas(data.hotspots);
        }
      } catch {
        // Keep map usable even if hotspots fail
      }
    };

    loadHotspots();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setLoading(false);
        },
        () => {
          setUserLat(SOSHANGUVE_CENTER[0]);
          setUserLng(SOSHANGUVE_CENTER[1]);
          setLoading(false);
        }
      );
    } else {
      setUserLat(SOSHANGUVE_CENTER[0]);
      setUserLng(SOSHANGUVE_CENTER[1]);
      setLoading(false);
    }
  }, []);

  const assessLocation = async (lat: number, lng: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please sign in again to check area safety.");
      return;
    }

    setPicked({ lat, lng });
    setAssessing(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/safety-map/assess?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.msg || "Could not assess this location");
      }
      setAssessment(data as SafetyAssessment);
    } catch (err) {
      setAssessment(null);
      setError(err instanceof Error ? err.message : "Could not assess this location");
    } finally {
      setAssessing(false);
    }
  };

  if (loading || userLat === null || userLng === null) {
    return (
      <div className="p-8 text-center flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading map...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-warning/25 bg-gradient-to-br from-warning/[0.1] to-accent/[0.05] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Safety Map</h2>
        <p className="text-base text-gray-700">
          Tap any place on the map to check whether that area has fewer or more recent SafeGuard reports.
          Especially useful if you are new to Soshanguve and want a quick local safety signal.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MousePointerClick className="h-4 w-4 shrink-0" />
            Click the map to check if a spot looks safer or higher risk
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Your location: {userLat.toFixed(4)}, {userLng.toFixed(4)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-emergency/10 text-emergency border-emergency/30 gap-1">
            <AlertTriangle className="h-3 w-3" /> High
          </Badge>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
            <AlertTriangle className="h-3 w-3" /> Medium
          </Badge>
          <Badge variant="outline" className="bg-safe/10 text-safe border-safe/30 gap-1">
            <Shield className="h-3 w-3" /> Low
          </Badge>
        </div>
      </div>

      <div className="h-[320px] overflow-hidden rounded-lg border border-border shadow-sm sm:h-[400px]">
        <MapContainer center={[userLat, userLng]} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPick={assessLocation} />

          <Marker position={[userLat, userLng]} icon={userIcon}>
            <Popup>
              <div className="text-sm font-medium">Your Current Location</div>
            </Popup>
          </Marker>

          {picked && (
            <Marker position={[picked.lat, picked.lng]} icon={clickIcon}>
              <Popup>
                <div className="text-sm space-y-1">
                  <p className="font-medium">Selected spot</p>
                  {assessing ? (
                    <p className="text-xs text-muted-foreground">Checking safety…</p>
                  ) : assessment ? (
                    <>
                      <Badge variant="outline" className={riskColor(assessment.risk)}>
                        {assessment.risk === "Low" ? "Lower risk" : `${assessment.risk} risk`}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {assessment.nearbyIncidents} nearby report(s) in ~{assessment.radiusMeters}m
                      </p>
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          )}

          {riskAreas.map((area) => {
            const colors = riskPathColors[area.risk] || riskPathColors.Low;
            return (
              <CircleMarker
                key={`${area.name}-${area.lat}-${area.lng}`}
                center={[area.lat, area.lng]}
                radius={10}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    assessLocation(area.lat, area.lng);
                  },
                }}
                pathOptions={{
                  color: colors.color,
                  fillColor: colors.fillColor,
                  fillOpacity: 0.8,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{area.name}</p>
                    <p className="text-xs text-muted-foreground">{area.incidents} incidents reported</p>
                    <Badge variant="outline" className={riskColor(area.risk)}>
                      {area.risk} Risk
                    </Badge>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {(assessing || assessment || error) && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground">Area safety check</h3>
            {assessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : assessment ? (
              <Badge variant="outline" className={riskColor(assessment.risk)}>
                {assessment.risk === "Low" ? "Lower risk" : `${assessment.risk} risk`}
              </Badge>
            ) : null}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {assessment && !assessing && (
            <>
              <p className="text-sm text-foreground">{assessment.summary}</p>
              <p className="text-xs text-muted-foreground">
                {assessment.nearbyIncidents} incident(s) within ~{assessment.radiusMeters}m
                {assessment.sosNearby ? ` · ${assessment.sosNearby} SOS/emergency nearby` : ""}
                {assessment.nearest
                  ? ` · nearest ~${assessment.nearest.distanceMeters}m (${assessment.nearest.label})`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">{assessment.disclaimer}</p>
            </>
          )}
        </div>
      )}

      <div className="grid gap-3">
        <h3 className="font-semibold text-foreground">Reported areas near Soshanguve</h3>
        {riskAreas.length > 0 ? (
          riskAreas.map((area) => {
            const distance = (
              Math.sqrt(Math.pow(area.lat - userLat, 2) + Math.pow(area.lng - userLng, 2)) * 111
            ).toFixed(1);
            return (
              <button
                key={`${area.name}-${area.lat}-${area.lng}`}
                type="button"
                onClick={() => assessLocation(area.lat, area.lng)}
                className="bg-card rounded-lg p-4 border border-border/50 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow sm:flex-row sm:items-center sm:justify-between text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{area.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {area.incidents} incidents reported • {distance} km away
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`${riskColor(area.risk)} w-fit`}>
                  {area.risk} Risk
                </Badge>
              </button>
            );
          })
        ) : (
          <div className="text-center text-muted-foreground py-4 rounded-lg border border-dashed">
            No clustered hotspots yet. Tap the map to check any spot using recent reports.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 mt-6 sm:grid-cols-3">
        {[
          {
            label: "Mapped Incidents",
            value: riskAreas.reduce((sum, area) => sum + area.incidents, 0),
            color: "text-emergency",
          },
          {
            label: "High Risk Areas",
            value: riskAreas.filter((a) => a.risk === "High").length,
            color: "text-emergency",
          },
          {
            label: "Lower Risk Zones",
            value: riskAreas.filter((a) => a.risk === "Low").length,
            color: "text-safe",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-lg p-4 border border-border/50 shadow-sm text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SafetyMap;
