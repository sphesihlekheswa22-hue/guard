import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Upload,
  Mic,
  X,
  FileText,
  Image,
  Film,
  File,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Languages,
} from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useToast } from "@/hooks/use-toast";
import { uploadUrl } from "@/lib/api";
import {
  isSoshanguveLocation,
  SOSHANGUVE_LOCATION_ERROR,
} from "@/lib/soshanguve";

const INCIDENT_TYPES = [
  "Domestic Violence",
  "Sexual Assault",
  "Stalking",
  "Harassment",
  "Human Trafficking",
  "Child Abuse",
  "Forced Marriage",
  "Honor-Based Violence",
  "Online / Cyber Abuse",
  "Other",
];

const STEPS = ["Incident Details", "Attach Evidence", "Review & Submit"];

interface EvidenceFile {
  file: File;
  preview?: string;
  type: "image" | "video" | "audio" | "document";
}

const fileIcon = (type: EvidenceFile["type"]) => {
  switch (type) {
    case "image": return Image;
    case "video": return Film;
    case "audio": return Mic;
    default: return File;
  }
};

const classifyFile = (file: File): EvidenceFile["type"] => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
};

const createClientRequestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getTodayDateString = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};

const getMinimumIncidentDateString = () => {
  const minimumDate = new Date();
  minimumDate.setFullYear(minimumDate.getFullYear() - 10);
  minimumDate.setMinutes(minimumDate.getMinutes() - minimumDate.getTimezoneOffset());
  return minimumDate.toISOString().slice(0, 10);
};

const isFutureDate = (value: string) => Boolean(value) && value > getTodayDateString();

const isTooOldDate = (value: string) => Boolean(value) && value < getMinimumIncidentDateString();

const CreateReport = () => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitRequestIdRef = useRef<string | null>(null);
  // Store evidence files returned from backend after submission
  const [submittedEvidence, setSubmittedEvidence] = useState<Array<{ fileUrl: string; type: string; name?: string }>>([]);
  const [submittedCaseId, setSubmittedCaseId] = useState<string | null>(null);

  // Step 1 – details
  const [incidentType, setIncidentType] = useState("");
  const [location, setLocation] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 – evidence
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  // Preview modal state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [playAudio, setPlayAudio] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    isRecording,
    audioUrl,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    clearRecording,
  } = useVoiceRecorder();
  const [translateAudio, setTranslateAudio] = useState(false);

  // Auto-fill location (Soshanguve only)
  const fetchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();
          const address = data.display_name || `${latitude}, ${longitude}`;

          if (!isSoshanguveLocation({ address, latitude, longitude })) {
            toast({
              title: "Outside Soshanguve",
              description: SOSHANGUVE_LOCATION_ERROR,
              variant: "destructive",
            });
            setLocation("");
            setLocationCoords(null);
            setLocationLoading(false);
            return;
          }

          setLocation(address);
          setLocationCoords({ latitude, longitude });
        } catch {
          if (!isSoshanguveLocation({ latitude, longitude })) {
            toast({
              title: "Outside Soshanguve",
              description: SOSHANGUVE_LOCATION_ERROR,
              variant: "destructive",
            });
            setLocation("");
            setLocationCoords(null);
            setLocationLoading(false);
            return;
          }
          setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          setLocationCoords({ latitude, longitude });
        }
        setLocationLoading(false);
      },
      () => {
        toast({ title: "Location access denied", variant: "destructive" });
        setLocationLoading(false);
      }
    );
  }, [toast]);

  // Handle file selection
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles: EvidenceFile[] = Array.from(e.target.files).map((f) => {
      const type = classifyFile(f);
      const preview = type === "image" ? URL.createObjectURL(f) : undefined;
      return { file: f, preview, type };
    });
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const copy = [...prev];
      if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!);
      copy.splice(idx, 1);
      return copy;
    });
  };

  // Save audio as evidence
  const saveAudioEvidence = () => {
    if (!audioBlob) return;
    const audioFile = new window.File([audioBlob], `voice-testimony-${Date.now()}.webm`, {
      type: "audio/webm",
    });
    // Create a fresh blob URL from the audioBlob for playback
    const blobUrl = URL.createObjectURL(audioBlob);
    setFiles((prev) => [...prev, { file: audioFile, type: "audio", preview: blobUrl }]);
    clearRecording();
    toast({ title: "Voice recording added to evidence" });
  };

  const todayDate = getTodayDateString();
  const minimumIncidentDate = getMinimumIncidentDateString();
  const canProceedStep0 = incidentType && location && date && description && !isFutureDate(date) && !isTooOldDate(date);
  const mins = String(Math.floor(duration / 60)).padStart(2, "0");
  const secs = String(duration % 60).padStart(2, "0");

  const handleDateChange = (value: string) => {
    if (isFutureDate(value)) {
      toast({
        title: "Invalid date",
        description: "Please select today or a past date. Future dates are not allowed.",
        variant: "destructive",
      });
      setDate("");
      return;
    }

    if (isTooOldDate(value)) {
      toast({
        title: "Invalid date",
        description: "Please select a date within the last 10 years.",
        variant: "destructive",
      });
      setDate("");
      return;
    }

    setDate(value);
  };

  const handleContinueToEvidence = () => {
    if (isFutureDate(date)) {
      toast({
        title: "Invalid date",
        description: "Please select today or a past date before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (isTooOldDate(date)) {
      toast({
        title: "Invalid date",
        description: "Please select a date within the last 10 years before continuing.",
        variant: "destructive",
      });
      return;
    }

    setStep(1);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (isFutureDate(date)) {
      toast({
        title: "Invalid date",
        description: "Please select today or a past date before submitting.",
        variant: "destructive",
      });
      setStep(0);
      return;
    }

    if (isTooOldDate(date)) {
      toast({
        title: "Invalid date",
        description: "Please select a date within the last 10 years before submitting.",
        variant: "destructive",
      });
      setStep(0);
      return;
    }

    const clientRequestId = submitRequestIdRef.current || createClientRequestId();
    submitRequestIdRef.current = clientRequestId;
    setIsSubmitting(true);

    if (
      !isSoshanguveLocation({
        address: location,
        latitude: locationCoords?.latitude,
        longitude: locationCoords?.longitude,
      })
    ) {
      toast({
        title: "Location not allowed",
        description: SOSHANGUVE_LOCATION_ERROR,
        variant: "destructive",
      });
      setIsSubmitting(false);
      setStep(0);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("incidentType", incidentType);
      formData.append("location", location);
      if (locationCoords) {
        formData.append("lat", String(locationCoords.latitude));
        formData.append("lng", String(locationCoords.longitude));
      }
      formData.append("date", date);
      formData.append("description", description);
      formData.append("clientRequestId", clientRequestId);
      // Attach evidence files
      files.forEach((f) => {
        formData.append("evidence", f.file);
      });
      // Send request
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Failed to submit report", description: err.msg || err.message || err.error || "Please try again.", variant: "destructive" });
        return;
      }
      const data = await res.json();
      toast({ title: "✅ Report submitted successfully!", description: `Case ID: ${data.report?.caseId || "-"}` });
      
      // Store evidence files and case ID for playback
      let evidenceArr = [];
      if (data.evidenceIds && Array.isArray(data.evidenceIds)) {
        evidenceArr = data.evidenceIds.map((ev: any) => ({
          fileUrl: ev.fileUrl,
          type: ev.type,
          name: ev.name || ev.fileUrl?.split("/").pop() || "evidence"
        }));
      }
      setSubmittedEvidence(evidenceArr);
      setSubmittedCaseId(data.report?.caseId || null);
      
      // Backend will emit the socket event after saving the report
      // No need to emit from frontend anymore
      
      // reset form
      setStep(0);
      setIncidentType("");
      setLocation("");
      setLocationCoords(null);
      setDate("");
      setDescription("");
      setFiles([]);
      clearRecording();
      submitRequestIdRef.current = null;
    } catch (err) {
      toast({ title: "Failed to submit report", description: "Network or server error.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Submission Success Section: Show audio playback for submitted evidence */}
      {submittedCaseId && (
        <div className="rounded-2xl border border-safe/20 bg-gradient-to-br from-safe/[0.08] to-secondary/[0.05] p-6 shadow-soft flex flex-col gap-2">
          <h2 className="text-xl font-bold text-green-800 mb-1">Report Submitted!</h2>
          <p className="text-base text-green-700">Case ID: <span className="font-mono">{submittedCaseId}</span></p>
          {submittedEvidence.length > 0 && (
            <div className="mt-2">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Submitted Evidence:</h3>
              <div className="flex flex-wrap gap-4">
                {submittedEvidence.map((ev, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    {ev.type === "audio" ? (
                      <audio controls src={uploadUrl(ev.fileUrl)} className="w-40 mb-1" />
                    ) : ev.type === "image" ? (
                      <img src={uploadUrl(ev.fileUrl)} alt={ev.name} className="h-12 w-12 rounded object-cover border mb-1" />
                    ) : (
                      <span className="text-xs">{ev.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{ev.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Welcome Card */}
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-secondary/[0.06] p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">File Your Report</h2>
        <p className="text-base text-gray-700">Report an incident confidentially. Your safety is our priority. Provide as much detail as you're comfortable sharing.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                i < step
                  ? "bg-safe text-safe-foreground"
                  : i === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {s}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step 1 – Incident Details */}
      {step === 0 && (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-4 sm:p-6 lg:p-8 border border-blue-100 shadow-md space-y-6">
          <div className="mb-2">
            <h2 className="text-2xl font-bold text-gray-800">Incident Details</h2>
            <p className="text-sm text-gray-600 mt-1">Please provide detailed information about the incident</p>
          </div>

          <div className="h-px bg-gradient-to-r from-blue-200 to-transparent"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Incident Type <span className="text-red-500">*</span></Label>
              <Select value={incidentType} onValueChange={setIncidentType}>
                <SelectTrigger className="bg-white border border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-md text-sm">
                  <SelectValue placeholder="Select the type of incident..." />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Date <span className="text-red-500">*</span></Label>
              <Input 
                type="date" 
                value={date} 
                onChange={(e) => handleDateChange(e.target.value)}
                min={minimumIncidentDate}
                max={todayDate}
                className="bg-white border border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-md text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Location (Soshanguve only) <span className="text-red-500">*</span></Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Soshanguve address only"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setLocationCoords(null);
                  }}
                  className="bg-white border border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-md text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchLocation}
                  disabled={locationLoading}
                  title="Use my current location"
                  className="px-2 border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  {locationLoading ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> : <MapPin className="h-5 w-5 text-blue-600" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                💡 SafeGuard only accepts Soshanguve locations. Click the pin to auto-fill your current location.
              </p>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-gray-700">Description <span className="text-red-500">*</span></Label>
            <Textarea
              placeholder="Describe what happened in detail. Include who, what, when, and where..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white border border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-md p-2 text-sm"
            />
            <p className="text-xs text-gray-500">Your information remains confidential unless you provide personal details.</p>
          </div>

          <div className="flex justify-end pt-4">
            <Button 
              onClick={handleContinueToEvidence} 
              disabled={!canProceedStep0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md shadow-sm hover:shadow-md transition-all text-sm sm:w-auto"
            >
              Continue to Evidence <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 – Attach Evidence */}
      {step === 1 && (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-4 sm:p-6 lg:p-8 border border-blue-100 shadow-md space-y-6">
          <div className="mb-2">
            <h2 className="text-2xl font-bold text-gray-800">Attach Evidence</h2>
            <p className="text-sm text-gray-600 mt-1">Upload files, photos, videos, or record a voice testimony. This step is optional.</p>
          </div>
          <div className="h-px bg-gradient-to-r from-blue-200 to-transparent"></div>

          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFiles}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all space-y-2 bg-white sm:p-8"
          >
            <Upload className="h-10 w-10 mx-auto text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Upload Evidence</p>
              <p className="text-xs text-gray-600 mt-1">Drag & drop or click to upload</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs">Browse</Button>
          </div>

          {/* Uploaded files list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-800">Attached Files ({files.length})</Label>
                <div className="grid gap-2">
                  {files.map((f, i) => {
                    const Icon = fileIcon(f.type);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-white border border-blue-100 rounded-md hover:shadow-sm transition-all">
                        {f.type === "image" && f.preview && (
                          <>
                            <img src={f.preview} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{f.file.name}</span>
                            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setPreviewImage(f.preview!)}>Preview</Button>
                            <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {f.type !== "image" && (
                          <>
                            {f.type === "audio" && (
                              <Button size="sm" variant="outline" onClick={() => f.preview && setPlayAudio(f.preview)}>Play</Button>
                            )}
                            {f.type !== "audio" && (
                              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{f.file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(f.file.size / 1024).toFixed(0)} KB · {f.type}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0">{f.type}</Badge>
                            <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Image Preview Modal */}
                {previewImage && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-4xl w-full flex flex-col items-center max-h-[90vh] overflow-auto">
                      <img src={previewImage} alt="Preview" className="max-h-[80vh] max-w-full rounded mb-6 object-contain" />
                      <Button onClick={() => setPreviewImage(null)} className="w-full">Close</Button>
                    </div>
                  </div>
                )}
                {/* Audio Play Modal */}
                {playAudio && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-white rounded-lg shadow-lg p-4 max-w-xs w-full flex flex-col items-center">
                      <audio controls autoPlay src={uploadUrl(playAudio)} className="w-full mb-4" />
                      <Button onClick={() => setPlayAudio(null)} className="w-full">Close</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Voice recording */}
          <div className="border border-blue-200 rounded-md p-4 space-y-3 bg-white">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 rounded-md">
                <Mic className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-gray-800">Voice Testimony</h3>
                <p className="text-xs text-gray-600">Record your statement</p>
              </div>
            </div>

            {!audioUrl ? (
              <div className="flex items-center gap-3">
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={isRecording ? "emergency-pulse" : ""}
                  size="sm"
                >
                  <Mic className="h-4 w-4 mr-1" />
                  {isRecording ? "Stop" : "Record"}
                </Button>
                {isRecording && (
                  <span className="text-lg font-mono text-foreground">{mins}:{secs}</span>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <audio controls src={audioUrl} className="w-full" />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="translate"
                    className="w-3 h-3 rounded"
                    checked={translateAudio}
                    onChange={(e) => setTranslateAudio(e.target.checked)}
                  />
                  <Label htmlFor="translate" className="text-xs flex items-center gap-1 text-gray-700">
                    <Languages className="h-3 w-3" /> Translate
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearRecording} className="text-xs">Re-record</Button>
                  <Button size="sm" onClick={saveAudioEvidence} className="text-xs">
                    <Check className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setStep(0)} className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 text-sm sm:w-auto">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep(2)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm sm:w-auto">
              Continue to Review <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 – Review & Submit */}
      {step === 2 && (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-4 sm:p-6 lg:p-8 border border-blue-100 shadow-md space-y-6">
          <div className="mb-2">
            <h2 className="text-2xl font-bold text-gray-800">Review & Submit</h2>
            <p className="text-sm text-gray-600 mt-1">Please review your report details before submission</p>
          </div>
          <div className="h-px bg-gradient-to-r from-blue-200 to-transparent"></div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-md p-3 border border-blue-100">
                <span className="text-xs text-gray-600 font-medium">Incident Type</span>
                <p className="text-sm font-semibold text-gray-800 mt-1.5">{incidentType || '—'}</p>
              </div>
              <div className="bg-white rounded-md p-3 border border-blue-100">
                <span className="text-xs text-gray-600 font-medium">Date</span>
                <p className="text-sm font-semibold text-gray-800 mt-1.5">{date || '—'}</p>
              </div>
              <div className="bg-white rounded-md p-3 border border-blue-100 md:col-span-2">
                <span className="text-xs text-gray-600 font-medium">Location</span>
                <p className="text-sm font-semibold text-gray-800 mt-1.5">{location || '—'}</p>
              </div>
              <div className="bg-white rounded-md p-3 border border-blue-100 md:col-span-2">
                <span className="text-xs text-gray-600 font-medium">Description</span>
                <p className="text-sm text-gray-800 mt-1.5 leading-relaxed">{description || '—'}</p>
              </div>
            </div>

            {files.length > 0 && (
              <div className="bg-white rounded-md p-3 border border-blue-100">
                <span className="text-xs text-gray-600 font-medium">Evidence ({files.length} file{files.length > 1 ? "s" : ""})</span>
                <div className="flex flex-col gap-2 mt-2">
                  {files.map((f, i) => {
                    if (f.type === "image" && f.preview) {
                      return (
                        <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                          <img src={f.preview} alt="evidence" className="h-12 w-12 rounded object-cover border shrink-0" />
                          <span className="text-xs text-muted-foreground truncate flex-1">{f.file.name}</span>
                          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setPreviewImage(f.preview!)}>Preview</Button>
                        </div>
                      );
                    }
                    if (f.type === "audio") {
                      return (
                        <div key={i} className="flex flex-col gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">Audio:</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">{f.file.name}</span>
                          </div>
                          <Button size="sm" variant="outline" className="w-full" onClick={() => f.preview && setPlayAudio(f.preview)}>Play Audio</Button>
                        </div>
                      );
                    }
                    const Icon = fileIcon(f.type);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs text-foreground truncate flex-1">{f.file.name}</span>
                        <Badge variant="outline" className="shrink-0 text-xs">{f.type}</Badge>
                      </div>
                    );
                  })}
                </div>
                {/* Image Preview Modal */}
                {previewImage && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-4xl w-full flex flex-col items-center max-h-[90vh] overflow-auto">
                      <img src={previewImage} alt="Preview" className="max-h-[80vh] max-w-full rounded mb-6 object-contain" />
                      <Button onClick={() => setPreviewImage(null)} className="w-full">Close</Button>
                    </div>
                  </div>
                )}
                {/* Audio Play Modal */}
                {playAudio && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-white rounded-lg shadow-lg p-4 max-w-xs w-full flex flex-col items-center">
                      <audio controls autoPlay src={uploadUrl(playAudio)} className="w-full mb-4" />
                      <Button onClick={() => setPlayAudio(null)} className="w-full">Close</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {translateAudio && (
              <div className="bg-white rounded-md p-3 border border-blue-100">
                <Badge className="bg-blue-100 text-blue-700 border-0 font-semibold gap-1 text-xs">
                  <Languages className="h-3 w-3" /> Audio translation requested
                </Badge>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 text-sm sm:w-auto">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 text-sm sm:w-auto">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" /> Submit Report
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateReport;
