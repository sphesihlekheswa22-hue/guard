import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Shield, Loader2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom icons for different marker types
const userIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const riskColor = (risk: string) => {
  switch (risk) {
    case "High":
      return "bg-emergency/10 text-emergency border-emergency/30";
    case "Medium":
      return "bg-warning/10 text-warning border-warning/30";
    default:
      return "bg-safe/10 text-safe border-safe/30";
  }
};

// Generate fake risk areas around a given location
const generateRiskAreas = (centerLat: number, centerLng: number) => {
  const riskAreas = [
    { name: "Downtown District", risk: "High", offset: { lat: 0.005, lng: 0.005 } },
    { name: "Industrial Zone", risk: "High", offset: { lat: -0.008, lng: 0.012 } },
    { name: "Market Area", risk: "Medium", offset: { lat: 0.002, lng: -0.003 } },
    { name: "Bus Terminal", risk: "High", offset: { lat: -0.003, lng: 0.008 } },
    { name: "Residential Block C", risk: "Medium", offset: { lat: -0.007, lng: -0.008 } },
    { name: "University Surroundings", risk: "Low", offset: { lat: 0.008, lng: -0.006 } },
    { name: "Shopping Center", risk: "Medium", offset: { lat: 0.010, lng: 0.003 } },
    { name: "Park Area", risk: "Low", offset: { lat: -0.010, lng: 0.010 } },
    { name: "Railway Station", risk: "High", offset: { lat: 0.006, lng: -0.010 } },
  ];

  return riskAreas.map((area) => ({
    ...area,
    lat: centerLat + area.offset.lat,
    lng: centerLng + area.offset.lng,
    incidents:
      area.risk === "High"
        ? Math.floor(Math.random() * 15) + 15
        : area.risk === "Medium"
          ? Math.floor(Math.random() * 8) + 5
          : Math.floor(Math.random() * 4) + 1,
  }));
};

interface RiskArea {
  name: string;
  risk: "High" | "Medium" | "Low";
  lat: number;
  lng: number;
  incidents: number;
}

const SafetyMap = () => {
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [riskAreas, setRiskAreas] = useState<RiskArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLat(lat);
          setUserLng(lng);
          // Generate risk areas around user's location
          setRiskAreas(generateRiskAreas(lat, lng));
          setLoading(false);
        },
        (error) => {
          console.warn("Geolocation error:", error);
          // Fallback to default location (Nairobi, Kenya)
          const defaultLat = -1.2921;
          const defaultLng = 36.8219;
          setUserLat(defaultLat);
          setUserLng(defaultLng);
          setRiskAreas(generateRiskAreas(defaultLat, defaultLng));
          setLoading(false);
        }
      );
    }
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading map...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="rounded-2xl border border-warning/25 bg-gradient-to-br from-warning/[0.1] to-accent/[0.05] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Safety Map</h2>
        <p className="text-base text-gray-700">
          View high-risk areas and safety information around your current location. Make informed decisions about your safety and surroundings.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">High-risk areas for gender-based violence near you</p>
          {userLat && userLng && (
            <p className="text-xs text-muted-foreground mt-1">
              📍 Your location: {userLat.toFixed(4)}, {userLng.toFixed(4)}
            </p>
          )}
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

      {/* Interactive Leaflet Map */}
      {userLat !== null && userLng !== null && (
        <div className="h-[320px] overflow-hidden rounded-lg border border-border shadow-sm sm:h-[400px]">
          <MapContainer
            center={[userLat, userLng] as [number, number]}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* User Location Marker */}
            <Marker position={[userLat, userLng] as [number, number]} icon={userIcon}>
              <Popup>
                <div className="text-sm font-medium">Your Current Location</div>
              </Popup>
            </Marker>

            {/* Risk Area Markers */}
            {riskAreas.map((area) => {
              const riskColors: { [key: string]: { color: string; fillColor: string } } = {
                High: { color: "#ef4444", fillColor: "#fca5a5" },
                Medium: { color: "#f59e0b", fillColor: "#fcd34d" },
                Low: { color: "#10b981", fillColor: "#a7f3d0" },
              };
              const colors = riskColors[area.risk] || riskColors.Low;
              
              return (
                <CircleMarker
                  key={area.name}
                  center={[area.lat, area.lng] as [number, number]}
                  radius={10}
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
      )}

      {/* Risk areas list */}
      <div className="grid gap-3">
        <h3 className="font-semibold text-foreground">Reported High-Risk Areas Near You</h3>
        {riskAreas.length > 0 ? (
          riskAreas.map((area) => {
            const distance = (
              Math.sqrt(Math.pow(area.lat - userLat!, 2) + Math.pow(area.lng - userLng!, 2)) * 111
            ).toFixed(1);
            return (
              <div
                key={area.name}
                className="bg-card rounded-lg p-4 border border-border/50 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow sm:flex-row sm:items-center sm:justify-between"
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
              </div>
            );
          })
        ) : (
          <div className="text-center text-muted-foreground py-4">No risk areas found</div>
        )}
      </div>

      {/* Safety Statistics */}
      <div className="grid grid-cols-1 gap-4 mt-6 sm:grid-cols-3">
        {[
          {
            label: "Total Incidents",
            value: riskAreas.reduce((sum, area) => sum + area.incidents, 0),
            color: "text-emergency",
          },
          {
            label: "High Risk Areas",
            value: riskAreas.filter((a) => a.risk === "High").length,
            color: "text-emergency",
          },
          { label: "Safe Zones", value: riskAreas.filter((a) => a.risk === "Low").length, color: "text-safe" },
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
