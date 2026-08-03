import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";
import { apiUrl } from "@/lib/api";

type EmergencyContact = {
  _id?: string;
  name?: string;
  fullName?: string;
  phone?: string;
  relationship?: string;
  email?: string;
};

type UserProfile = {
  _id?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  idNumber?: string;
  gender?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  policeStationId?: string;
  policeStationName?: string;
  ngoId?: string;
  ngoName?: string;
  preferredNgoId?: string;
  preferredNgoName?: string;
  emergencyContacts?: EmergencyContact[];
  accountDeletionStatus?: string;
  accountDeletionRequestedAt?: string;
};

const PHONE_FORMAT_DESCRIPTION = "Use a 10-digit South African mobile number starting with 06, 07, or 08.";
const EMAIL_FORMAT_DESCRIPTION = "Enter a valid email address, for example name@example.com.";
const ID_NUMBER_FORMAT_DESCRIPTION = "Use a 13-digit ID number with no spaces.";

type OrganizationOption = {
  id: string;
  label: string;
};


const sanitizeSouthAfricanPhone = (value = "") => {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("0027")) {
    return `0${digits.slice(4)}`.slice(0, 10);
  }

  if (digits.startsWith("27")) {
    return `0${digits.slice(2)}`.slice(0, 10);
  }

  return digits.slice(0, 10);
};

const isValidSouthAfricanPhone = (value = "") => /^0[678]\d{8}$/.test(sanitizeSouthAfricanPhone(value));

const normalizeEmail = (value = "") => value.trim().toLowerCase();

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

const normalizeFullName = (value = "") => value.trim().replace(/\s+/g, " ");

const isValidFullName = (value = "") => /^[\p{L}]+(?: [\p{L}]+)*$/u.test(normalizeFullName(value));

const sanitizeIdNumber = (value = "") => value.replace(/\D/g, "").slice(0, 13);

const isValidIdNumber = (value = "") => !value || /^\d{13}$/.test(sanitizeIdNumber(value));

const formatDisplayDate = (value?: string) => {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatRole = (value?: string) => {
  const labels: Record<string, string> = {
    reporter: "Reporter",
    authority: "Police Officer",
    officer: "Police Officer",
    ngo: "NGO",
    ngo_worker: "NGO Worker",
    admin: "Admin",
  };

  return labels[value || ""] || "Not assigned";
};

const formatGender = (value?: string) => {
  const labels: Record<string, string> = {
    female: "Female",
    male: "Male",
    other: "Other",
    prefer_not_to_say: "Prefer not to say",
  };

  return labels[value || ""] || "Not provided";
};

const getApiErrorMessage = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => null);
  return data?.message || data?.msg || data?.error || fallback;
};

const Settings = () => {
  const { toast } = useToast();
  const [name, setName] = useState("SafeGuard User");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [selectedPoliceStation, setSelectedPoliceStation] = useState("");
  const [selectedPreferredNgo, setSelectedPreferredNgo] = useState("");
  const [selectedAssignedNgo, setSelectedAssignedNgo] = useState("");
  const [policeStations, setPoliceStations] = useState<OrganizationOption[]>([]);
  const [ngoOptions, setNgoOptions] = useState<OrganizationOption[]>([]);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [emergencyContactEmail, setEmergencyContactEmail] = useState("");
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null);
  const [allEmergencyContacts, setAllEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [editingAccountInfo, setEditingAccountInfo] = useState(false);
  const [editingRoleInfo, setEditingRoleInfo] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const [stationsRes, ngosRes] = await Promise.all([
          fetch(apiUrl("/organizations/public?type=police_station")),
          fetch(apiUrl("/organizations/public?type=ngo")),
        ]);

        if (stationsRes.ok) {
          const stations = await stationsRes.json();
          if (Array.isArray(stations) && stations.length > 0) {
            setPoliceStations(stations.map((item: any) => ({ id: item.code, label: item.name })));
          }
        }

        if (ngosRes.ok) {
          const ngos = await ngosRes.json();
          if (Array.isArray(ngos) && ngos.length > 0) {
            setNgoOptions(ngos.map((item: any) => ({ id: item.code, label: item.name })));
          }
        }
      } catch {
        setPoliceStations([]);
        setNgoOptions([]);
      }
    };

    loadOrganizations();
  }, []);

  const refreshProfile = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    setError(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users/profile", {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) throw new Error("Failed to fetch user profile");

      const data: UserProfile = await res.json();
      setProfile(data);
      setName(data.fullName || "SafeGuard User");
      setEmail(data.email || "");
      setPhone(sanitizeSouthAfricanPhone(data.phone || ""));
      setAddress(data.address || "");
      setIdNumber(sanitizeIdNumber(data.idNumber || ""));
      setGender(data.gender || "");
      setSelectedPoliceStation(data.policeStationId || "");
      setSelectedPreferredNgo(data.preferredNgoId || "");
      setSelectedAssignedNgo(data.ngoId || "");
      setAllEmergencyContacts(data.emergencyContacts || []);
      setShowContactForm(false);
      setEditingContactIdx(null);
      setEditingAccountInfo(false);
      setEditingRoleInfo(false);
    } catch (err: any) {
      setError(err.message || "Error fetching user");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshProfile(true);
  }, []);

  const clearContactForm = () => {
    setEmergencyContactName("");
    setEmergencyContactRelationship("");
    setEmergencyContactEmail("");
    setEmergencyContact("");
  };

  const saveAccountInformation = async () => {
    const sanitizedPhone = sanitizeSouthAfricanPhone(phone);
    const normalizedProfileEmail = normalizeEmail(email);
    const normalizedName = normalizeFullName(name);
    const normalizedAddress = address.trim().replace(/\s+/g, " ");

    if (!isValidFullName(normalizedName)) {
      toast({
        title: "Invalid Full Name",
        description: "Full name can only contain letters and spaces.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidEmail(normalizedProfileEmail)) {
      toast({
        title: "Invalid Email Address",
        description: EMAIL_FORMAT_DESCRIPTION,
        variant: "destructive",
      });
      return;
    }

    if (!isValidSouthAfricanPhone(sanitizedPhone)) {
      toast({
        title: "Invalid Phone Number",
        description: PHONE_FORMAT_DESCRIPTION,
        variant: "destructive",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const token = localStorage.getItem("token");
      const profileRes = await fetch("/api/users/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          fullName: normalizedName,
          email: normalizedProfileEmail,
          phone: sanitizedPhone,
          address: normalizedAddress,
        }),
      });

      if (!profileRes.ok) {
        throw new Error(await getApiErrorMessage(profileRes, "Failed to update account information"));
      }

      const updatedProfile = await profileRes.json();
      setProfile(updatedProfile);
      setName(updatedProfile.fullName || normalizedName);
      setEmail(updatedProfile.email || normalizedProfileEmail);
      setPhone(sanitizeSouthAfricanPhone(updatedProfile.phone || sanitizedPhone));
      setAddress(updatedProfile.address || normalizedAddress);
      setEditingAccountInfo(false);
      window.dispatchEvent(new CustomEvent("safeguard:profile-updated", { detail: updatedProfile }));
      toast({ title: "Account information saved!" });
    } catch (err: any) {
      toast({
        title: "Failed to save account information",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveRoleInformation = async () => {
    const normalizedIdNumber = sanitizeIdNumber(idNumber);
    const selectedPoliceStationName = policeStations.find((station) => station.id === selectedPoliceStation)?.label || "";
    const selectedPreferredNgoName = ngoOptions.find((ngo) => ngo.id === selectedPreferredNgo)?.label || "";
    const selectedAssignedNgoName = ngoOptions.find((ngo) => ngo.id === selectedAssignedNgo)?.label || "";

    if (!isValidIdNumber(normalizedIdNumber)) {
      toast({
        title: "Invalid ID Number",
        description: ID_NUMBER_FORMAT_DESCRIPTION,
        variant: "destructive",
      });
      return;
    }

    if (canUpdatePoliceStation && !selectedPoliceStation) {
      toast({
        title: "Police Station Required",
        description: "Please select your current police station.",
        variant: "destructive",
      });
      return;
    }

    if (canUpdatePreferredNgo && !selectedPreferredNgo) {
      toast({
        title: "Preferred NGO Required",
        description: "Please select your preferred NGO.",
        variant: "destructive",
      });
      return;
    }

    if (canUpdateAssignedNgo && !selectedAssignedNgo) {
      toast({
        title: "NGO Required",
        description: "Please select your current NGO.",
        variant: "destructive",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const token = localStorage.getItem("token");
      const payload: Record<string, string> = {
        idNumber: normalizedIdNumber,
        gender,
      };

      if (canUpdatePoliceStation) {
        payload.policeStationId = selectedPoliceStation;
        payload.policeStationName = selectedPoliceStationName;
      }

      if (canUpdatePreferredNgo) {
        payload.preferredNgoId = selectedPreferredNgo;
        payload.preferredNgoName = selectedPreferredNgoName;
      }

      if (canUpdateAssignedNgo) {
        payload.ngoId = selectedAssignedNgo;
        payload.ngoName = selectedAssignedNgoName;
      }

      const profileRes = await fetch("/api/users/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      if (!profileRes.ok) {
        throw new Error(await getApiErrorMessage(profileRes, "Failed to update role information"));
      }

      const updatedProfile = await profileRes.json();
      setProfile(updatedProfile);
      setIdNumber(sanitizeIdNumber(updatedProfile.idNumber || normalizedIdNumber));
      setGender(updatedProfile.gender || gender);
      setSelectedPoliceStation(updatedProfile.policeStationId || selectedPoliceStation);
      setSelectedPreferredNgo(updatedProfile.preferredNgoId || selectedPreferredNgo);
      setSelectedAssignedNgo(updatedProfile.ngoId || selectedAssignedNgo);
      setEditingRoleInfo(false);
      window.dispatchEvent(new CustomEvent("safeguard:profile-updated", { detail: updatedProfile }));
      toast({ title: "Role information saved!" });
    } catch (err: any) {
      toast({
        title: "Failed to save role information",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveEmergencyContact = async (contactId?: string) => {
    const sanitizedPhone = sanitizeSouthAfricanPhone(emergencyContact);
    const normalizedContactEmail = normalizeEmail(emergencyContactEmail);

    if (!isValidEmail(normalizedContactEmail)) {
      toast({
        title: "Invalid Emergency Contact Email",
        description: EMAIL_FORMAT_DESCRIPTION,
        variant: "destructive",
      });
      return;
    }

    if (!isValidSouthAfricanPhone(sanitizedPhone)) {
      toast({
        title: "Invalid Emergency Contact",
        description: PHONE_FORMAT_DESCRIPTION,
        variant: "destructive",
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const profileRes = await fetch("/api/users/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          emergencyContact: {
            fullName: emergencyContactName,
            relationship: emergencyContactRelationship,
            email: normalizedContactEmail,
            phone: sanitizedPhone,
            ...(contactId ? { _id: contactId } : {}),
          },
        }),
      });

      if (!profileRes.ok) {
        throw new Error(await getApiErrorMessage(profileRes, contactId ? "Failed to update contact" : "Failed to add contact"));
      }

      toast({ title: contactId ? "Contact updated!" : "Contact added!" });
      setShowContactForm(false);
      setEditingContactIdx(null);
      clearContactForm();
      await refreshProfile();
    } catch (err: any) {
      toast({
        title: contactId ? "Failed to update contact" : "Failed to add contact",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  const accountInfo = [
    ["Name", profile?.fullName || name || "Not provided"],
    ["Email", profile?.email || email || "Not provided"],
    ["Phone", profile?.phone || phone || "Not provided"],
    ["Address", profile?.address || address || "Not provided"],
    ["Role", formatRole(profile?.role)],
    ["Profile Created", formatDisplayDate(profile?.createdAt)],
    ["Last Updated", formatDisplayDate(profile?.updatedAt)],
  ];

  const canManageEmergencyContacts = profile?.role === "reporter";
  const roleInfo = [
    ["ID Number", profile?.idNumber || idNumber || "Not provided"],
    ["Gender", formatGender(profile?.gender || gender)],
    ...(canManageEmergencyContacts ? [["Emergency Contacts", `${allEmergencyContacts.length} saved`]] : []),
  ];

  if (profile?.role === "reporter") {
    roleInfo.push(
      ["Police Station", profile.policeStationName || profile.policeStationId || "Not assigned"],
      ["Preferred NGO", profile.preferredNgoName || profile.preferredNgoId || "Not assigned"],
    );
  }

  if (profile?.role === "authority" || profile?.role === "officer") {
    roleInfo.push(["Police Station", profile.policeStationName || profile.policeStationId || "Not assigned"]);
  }

  if (profile?.role === "ngo" || profile?.role === "ngo_worker") {
    roleInfo.push(["NGO", profile.ngoName || profile.ngoId || "Not assigned"]);
  }

  const canUpdatePoliceStation = profile?.role === "reporter" || profile?.role === "authority" || profile?.role === "officer";
  const canUpdatePreferredNgo = profile?.role === "reporter";
  const canUpdateAssignedNgo = profile?.role === "ngo" || profile?.role === "ngo_worker";
  const canRequestAccountDeletion = ["reporter", "authority", "officer", "ngo", "ngo_worker"].includes(profile?.role || "");

  const requestAccountDeletion = async () => {
    if (!confirmDeleteAccount) {
      setConfirmDeleteAccount(true);
      return;
    }

    setDeletingAccount(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users/profile/deletion-request", {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to schedule account deletion"));
      }

      const data = await res.json();
      setProfile(data.user);
      setConfirmDeleteAccount(false);
      toast({
        title: "Account scheduled for permanent deletion",
        description: "An admin can now review the account activity and permanently delete it.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to schedule deletion",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-muted p-6 shadow-soft flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Settings</h2>
        <p className="text-base text-gray-700">Manage your profile and emergency contacts to keep your information secure and up to date.</p>
      </div>

      <div className="bg-card rounded-lg p-4 sm:p-6 border border-border/50 shadow-sm space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">Account Information</h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingAccountInfo((current) => !current)}
              title="Edit account information"
              aria-label="Edit account information"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {accountInfo.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-muted/10 p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          {editingAccountInfo && (
            <div className="space-y-4 rounded-md border border-border bg-muted/10 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setName(normalizeFullName(name))}
                    pattern="[A-Za-z ]+"
                    title="Full name can only contain letters and spaces."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmail(normalizeEmail(email))}
                    placeholder="name@example.com"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Format: {EMAIL_FORMAT_DESCRIPTION}</p>
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(sanitizeSouthAfricanPhone(e.target.value))}
                    minLength={10}
                    maxLength={10}
                    placeholder="07XXXXXXXX"
                  />
                  <p className="text-xs text-muted-foreground">Format: {PHONE_FORMAT_DESCRIPTION}</p>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onBlur={() => setAddress(address.trim().replace(/\s+/g, " "))}
                    placeholder="Home address"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setEditingAccountInfo(false)} disabled={savingProfile}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveAccountInformation} disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Account Information"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">Role Information</h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingRoleInfo((current) => !current)}
              title="Edit role information"
              aria-label="Edit role information"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {roleInfo.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-muted/10 p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          {canManageEmergencyContacts && allEmergencyContacts.length > 0 && (
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-xs font-medium text-muted-foreground">Emergency Contact Summary</p>
              <div className="mt-2 space-y-2">
                {allEmergencyContacts.map((contact, index) => (
                  <div key={contact._id || index} className="text-sm text-foreground">
                    <span className="font-semibold">{contact.fullName || contact.name || "Unnamed contact"}</span>
                    <span className="text-muted-foreground"> - {contact.relationship || "Relationship not provided"} - {contact.phone || "No phone"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {editingRoleInfo && (
          <div className="space-y-4 rounded-md border border-border bg-muted/10 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>ID Number</Label>
                <Input
                  inputMode="numeric"
                  value={idNumber}
                  onChange={(e) => setIdNumber(sanitizeIdNumber(e.target.value))}
                  minLength={13}
                  maxLength={13}
                  placeholder="13-digit ID number"
                />
                <p className="text-xs text-muted-foreground">Format: {ID_NUMBER_FORMAT_DESCRIPTION}</p>
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>

            {canUpdatePoliceStation && (
              <div className="space-y-2">
                <Label htmlFor="profilePoliceStation">Current Police Station</Label>
                <select
                  id="profilePoliceStation"
                  value={selectedPoliceStation}
                  onChange={(e) => setSelectedPoliceStation(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select police station</option>
                  {policeStations.map((station) => (
                    <option key={station.id} value={station.id}>{station.label}</option>
                  ))}
                </select>
              </div>
            )}

            {canUpdatePreferredNgo && (
              <div className="space-y-2">
                <Label htmlFor="profilePreferredNgo">Preferred NGO</Label>
                <select
                  id="profilePreferredNgo"
                  value={selectedPreferredNgo}
                  onChange={(e) => setSelectedPreferredNgo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select preferred NGO</option>
                  {ngoOptions.map((ngo) => (
                    <option key={ngo.id} value={ngo.id}>{ngo.label}</option>
                  ))}
                </select>
              </div>
            )}

            {canUpdateAssignedNgo && (
              <div className="space-y-2">
                <Label htmlFor="profileAssignedNgo">Current NGO</Label>
                <select
                  id="profileAssignedNgo"
                  value={selectedAssignedNgo}
                  onChange={(e) => setSelectedAssignedNgo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select NGO</option>
                  {ngoOptions.map((ngo) => (
                    <option key={ngo.id} value={ngo.id}>{ngo.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditingRoleInfo(false)} disabled={savingProfile}>
                Cancel
              </Button>
              <Button type="button" onClick={saveRoleInformation} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save Role Information"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {canManageEmergencyContacts && (
      <div className="bg-card rounded-lg p-4 sm:p-6 border border-border/50 shadow-sm space-y-5">
        <h3 className="font-semibold text-foreground">Emergency Contacts</h3>
        {allEmergencyContacts.length === 0 && (
          <div className="text-muted-foreground text-sm">No emergency contacts saved yet.</div>
        )}
        {allEmergencyContacts.length > 0 && (
          <div className="space-y-4">
            {allEmergencyContacts.map((ec, idx) => (
              <div key={ec._id || idx} className="border rounded-lg p-4 bg-muted/10 flex flex-col gap-3 sm:gap-1 sm:relative">
                {editingContactIdx === idx ? (
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Contact Full Name" />
                    <Label>Relationship</Label>
                    <Input value={emergencyContactRelationship} onChange={(e) => setEmergencyContactRelationship(e.target.value)} placeholder="Relationship (e.g. Sister, Friend)" />
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={emergencyContactEmail}
                      onChange={(e) => setEmergencyContactEmail(e.target.value)}
                      onBlur={() => setEmergencyContactEmail(normalizeEmail(emergencyContactEmail))}
                      placeholder="contact@email.com"
                      required
                    />
                    <p className="text-xs text-muted-foreground">Format: {EMAIL_FORMAT_DESCRIPTION}</p>
                    <Label>Trusted Contact Phone</Label>
                    <Input
                      type="tel"
                      value={emergencyContact}
                      onChange={(e) => setEmergencyContact(sanitizeSouthAfricanPhone(e.target.value))}
                      minLength={10}
                      maxLength={10}
                      placeholder="07XXXXXXXX"
                    />
                    <p className="text-xs text-muted-foreground">Format: {PHONE_FORMAT_DESCRIPTION}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => saveEmergencyContact(ec._id)}>Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingContactIdx(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-semibold">{ec.fullName || ec.name || "(No Name)"}</div>
                    <div className="text-sm">Relationship: {ec.relationship || "-"}</div>
                    <div className="text-sm">Email: {ec.email || "-"}</div>
                    <div className="text-sm">Phone: {sanitizeSouthAfricanPhone(ec.phone || "") || "-"}</div>
                    <div className="flex flex-col gap-2 sm:absolute sm:top-2 sm:right-2 sm:flex-row">
                      <Button size="sm" onClick={() => {
                        setEditingContactIdx(idx);
                        setEmergencyContactName(ec.fullName || "");
                        setEmergencyContactRelationship(ec.relationship || "");
                        setEmergencyContactEmail(ec.email || "");
                        setEmergencyContact(sanitizeSouthAfricanPhone(ec.phone || ""));
                        setShowContactForm(false);
                      }}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={async () => {
                        if (!window.confirm("Are you sure you want to delete this emergency contact? This action cannot be undone.")) return;
                        try {
                          const token = localStorage.getItem("token");
                          const delRes = await fetch(`/api/users/emergency-contact/${ec._id}`, {
                            method: "DELETE",
                            headers: {
                              Authorization: token ? `Bearer ${token}` : "",
                            },
                          });

                          if (!delRes.ok) throw new Error("Failed to delete contact");

                          toast({ title: "Contact deleted!" });
                          await refreshProfile();
                        } catch (err: any) {
                          toast({
                            title: "Failed to delete contact",
                            description: err.message || "An error occurred.",
                            variant: "destructive",
                          });
                        }
                      }}>Delete</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          {!showContactForm && (
            <Button variant="outline" onClick={() => {
              setShowContactForm(true);
              setEditingContactIdx(null);
              clearContactForm();
            }}>Add New Contact</Button>
          )}
          {showContactForm && (
            <div className="space-y-4 mt-4 border rounded-lg p-4 bg-muted/5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Contact Full Name" />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Input value={emergencyContactRelationship} onChange={(e) => setEmergencyContactRelationship(e.target.value)} placeholder="Relationship (e.g. Sister, Friend)" />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={emergencyContactEmail}
                  onChange={(e) => setEmergencyContactEmail(e.target.value)}
                  onBlur={() => setEmergencyContactEmail(normalizeEmail(emergencyContactEmail))}
                  placeholder="contact@email.com"
                  required
                />
                <p className="text-xs text-muted-foreground">Format: {EMAIL_FORMAT_DESCRIPTION}</p>
              </div>
              <div className="space-y-2">
                <Label>Trusted Contact Phone</Label>
                <Input
                  type="tel"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(sanitizeSouthAfricanPhone(e.target.value))}
                  minLength={10}
                  maxLength={10}
                  placeholder="07XXXXXXXX"
                />
                <p className="text-xs text-muted-foreground">Format: {PHONE_FORMAT_DESCRIPTION}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => saveEmergencyContact()}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowContactForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {canRequestAccountDeletion && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-destructive">Delete Account</h3>
            <p className="text-sm text-muted-foreground">
              {profile?.accountDeletionStatus === "scheduled"
                ? `Account scheduled for permanent deletion${profile.accountDeletionRequestedAt ? ` on ${formatDisplayDate(profile.accountDeletionRequestedAt)}` : ""}.`
                : "Request permanent account deletion. An admin will review your account activity before deleting it."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {profile?.accountDeletionStatus === "scheduled" ? (
              <Button type="button" variant="destructive" disabled>
                Scheduled for deletion
              </Button>
            ) : (
              <>
              <Button
                type="button"
                variant={confirmDeleteAccount ? "destructive" : "outline"}
                onClick={requestAccountDeletion}
                disabled={deletingAccount}
              >
                {deletingAccount
                  ? "Scheduling..."
                  : confirmDeleteAccount
                    ? "Confirm Delete Account"
                    : "Delete Account"}
              </Button>
              {confirmDeleteAccount && (
                <Button type="button" variant="ghost" onClick={() => setConfirmDeleteAccount(false)} disabled={deletingAccount}>
                  Cancel
                </Button>
              )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
