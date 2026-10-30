"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Plus,
  QrCode,
  ShieldCheck,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type GymSettingsInfo = {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  capacity: number;
  timezone: string;
  currency: string;
  qrPayload: string;
};

type StaffMemberRow = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "staff";
  status: "active" | "inactive";
  createdAt: string | null;
};

type StaffInviteRow = {
  id: string;
  code: string;
  role: "owner" | "staff";
  presetName: string;
  presetEmail: string;
  status: "unused" | "claimed" | "revoked";
  claimedByName: string;
  claimedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

const COMMON_TIMEZONES = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "UTC",
] as const;

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "staff">("staff");
  const [gym, setGym] = useState<GymSettingsInfo | null>(null);
  const [team, setTeam] = useState<StaffMemberRow[]>([]);
  const [invites, setInvites] = useState<StaffInviteRow[]>([]);

  // Gym profile form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [capacity, setCapacity] = useState("100");
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [savingGym, setSavingGym] = useState(false);
  const [gymFeedback, setGymFeedback] = useState("");

  // Staff invite form state
  const [inviteRole, setInviteRole] = useState<"staff" | "owner">("staff");
  const [presetName, setPresetName] = useState("");
  const [presetEmail, setPresetEmail] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [busyActionId, setBusyActionId] = useState("");

  const loadSettings = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const data = (await response.json()) as {
        error?: string;
        currentUser?: { id: string; role: "owner" | "staff" };
        gym?: GymSettingsInfo;
        team?: StaffMemberRow[];
        invites?: StaffInviteRow[];
      };
      if (!response.ok || !data.gym) {
        throw new Error(data.error ?? "Unable to load gym settings.");
      }
      setCurrentUserId(data.currentUser?.id ?? "");
      setCurrentUserRole(data.currentUser?.role ?? "staff");
      setGym(data.gym);
      setName(data.gym.name);
      setAddress(data.gym.address);
      setPhone(data.gym.phone);
      setCapacity(String(data.gym.capacity));
      setTimezone(data.gym.timezone || "Africa/Cairo");
      setTeam(data.team ?? []);
      setInvites(data.invites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load gym settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const isOwner = currentUserRole === "owner";

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 2200);
    } catch {
      // Clipboard blocked in restricted context.
    }
  }

  async function handleSaveGym(event: React.FormEvent) {
    event.preventDefault();
    if (!isOwner) return;
    setSavingGym(true);
    setGymFeedback("");
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-gym",
          name,
          address,
          phone,
          capacity: Number(capacity),
          timezone,
        }),
      });
      const data = (await response.json()) as { error?: string; gym?: GymSettingsInfo };
      if (!response.ok || !data.gym) {
        throw new Error(data.error ?? "Failed to update gym settings.");
      }
      setGym(data.gym);
      setGymFeedback("Gym workspace settings saved.");
      window.dispatchEvent(new CustomEvent("gymos:gym-updated"));
      window.setTimeout(() => setGymFeedback(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update gym settings.");
    } finally {
      setSavingGym(false);
    }
  }

  async function handleGenerateInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!isOwner) return;
    setCreatingInvite(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-staff-invite",
          role: inviteRole,
          presetName,
          presetEmail,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate staff invite code.");
      }
      setPresetName("");
      setPresetEmail("");
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate staff invite code.");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setBusyActionId(inviteId);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-staff-invite", inviteId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to revoke invite code.");
      }
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke invite code.");
    } finally {
      setBusyActionId("");
    }
  }

  async function handleToggleStaffStatus(staffUserId: string, nextStatus: "active" | "inactive") {
    setBusyActionId(staffUserId);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-staff-status",
          staffUserId,
          status: nextStatus,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update staff status.");
      }
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update staff status.");
    } finally {
      setBusyActionId("");
    }
  }

  return (
    <AppShell activePage="Settings">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#223041]">
              Gym Workspace &amp; Team
            </h1>
            <p className="mt-1 text-[13px] text-[#7c8795]">
              Manage club profile, floor capacity, timezone, and staff access for your gym tenant.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#d6e8df] bg-[#eff8f3] px-3 py-1 text-[11px] font-semibold text-[#258765]">
            <ShieldCheck size={14} aria-hidden="true" />
            {isOwner ? "Gym Owner Access" : "Staff View (Read-only)"}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {error}
          </div>
        )}

        {gymFeedback && (
          <div className="rounded-xl border border-[#cce7d9] bg-[#eef9f3] px-4 py-3 text-[13px] font-medium text-[#216e53]">
            {gymFeedback}
          </div>
        )}

        {loading ? (
          <Card className="flex items-center justify-center p-12 text-sm text-[#7c8795]">
            <LoaderCircle size={18} className="mr-2 animate-spin" aria-hidden="true" />
            Loading gym workspace settings…
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            {/* Left Column: Gym Profile & Tenant Identifiers */}
            <div className="space-y-6">
              <Card className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
                    <Building2 size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#243242]">
                      Club Profile &amp; Operations
                    </h2>
                    <p className="text-[12px] text-[#7c8795]">
                      Shown on mobile member passes, QR onboarding, and attendance capacity checks.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveGym} className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                      Gym / Branch Name
                    </span>
                    <input
                      required
                      disabled={!isOwner}
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dce3e8] bg-white px-3.5 text-[13px] text-[#243242] disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                        Address / Location
                      </span>
                      <input
                        required
                        disabled={!isOwner}
                        maxLength={200}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[#dce3e8] bg-white px-3.5 text-[13px] text-[#243242] disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                        Contact Phone
                      </span>
                      <input
                        required
                        disabled={!isOwner}
                        maxLength={30}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[#dce3e8] bg-white px-3.5 text-[13px] text-[#243242] disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                        Max Floor Capacity
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        required
                        disabled={!isOwner}
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[#dce3e8] bg-white px-3.5 text-[13px] text-[#243242] disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                        Club Timezone
                      </span>
                      <select
                        disabled={!isOwner}
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[#dce3e8] bg-white px-3.5 text-[13px] text-[#243242] disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {isOwner && (
                    <button
                      type="submit"
                      disabled={savingGym}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#278968] px-5 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                    >
                      {savingGym && (
                        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      )}
                      Save Workspace Settings
                    </button>
                  )}
                </form>

                {gym && (
                  <div className="mt-6 space-y-2.5 rounded-2xl border border-[#e7edf1] bg-[#f8fafb] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-[#516071]">Gym Slug / Code</p>
                        <p className="font-mono text-[12px] text-[#243242]">{gym.slug}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyText("slug", gym.slug)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#dce3e8] bg-white px-2.5 text-[11px] font-medium text-[#354153] hover:bg-slate-50"
                      >
                        {copiedKey === "slug" ? <Check size={13} /> : <Copy size={13} />}
                        {copiedKey === "slug" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-[#e7edf1] pt-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#516071]">
                          <QrCode size={13} aria-hidden="true" />
                          Reception QR Payload
                        </p>
                        <p className="truncate font-mono text-[12px] text-[#243242]">
                          {gym.qrPayload}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyText("qr", gym.qrPayload)}
                        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#dce3e8] bg-white px-2.5 text-[11px] font-medium text-[#354153] hover:bg-slate-50"
                      >
                        {copiedKey === "qr" ? <Check size={13} /> : <Copy size={13} />}
                        {copiedKey === "qr" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Right Column: Staff Team & Per-Gym Staff Invite Codes */}
            <div className="space-y-6">
              <Card className="p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
                    <KeyRound size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#243242]">
                      Staff Invitation Codes
                    </h2>
                    <p className="text-[12px] text-[#7c8795]">
                      Generate one-time codes (`STF-XXXX-XXXX`) so receptionists &amp; managers join
                      only your gym.
                    </p>
                  </div>
                </div>

                {isOwner && (
                  <form
                    onSubmit={handleGenerateInvite}
                    className="mb-5 space-y-3 rounded-2xl border border-[#e5ece9] bg-[#f7fbf9] p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-[#526071]">
                          Role
                        </span>
                        <select
                          value={inviteRole}
                          onChange={(e) =>
                            setInviteRole(e.target.value === "owner" ? "owner" : "staff")
                          }
                          className="h-10 w-full rounded-xl border border-[#dce3e8] bg-white px-3 text-[12px] text-[#243242]"
                        >
                          <option value="staff">Staff / Reception</option>
                          <option value="owner">Co-Owner</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-[#526071]">
                          Label (optional)
                        </span>
                        <input
                          maxLength={100}
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="e.g. Morning Desk"
                          className="h-10 w-full rounded-xl border border-[#dce3e8] bg-white px-3 text-[12px] text-[#243242]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-[#526071]">
                          Lock to Email (opt.)
                        </span>
                        <input
                          type="email"
                          maxLength={254}
                          value={presetEmail}
                          onChange={(e) => setPresetEmail(e.target.value)}
                          placeholder="staff@club.com"
                          className="h-10 w-full rounded-xl border border-[#dce3e8] bg-white px-3 text-[12px] text-[#243242]"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingInvite}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                    >
                      {creatingInvite ? (
                        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus size={14} aria-hidden="true" />
                      )}
                      Generate Staff Invite Code
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {invites.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-[#87909d]">
                      No staff invite codes generated yet.
                    </p>
                  ) : (
                    invites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ebeff2] px-3.5 py-2.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] font-bold text-[#223041]">
                              {inv.code}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                inv.status === "unused"
                                  ? "bg-[#eaf6f0] text-[#278968]"
                                  : inv.status === "claimed"
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-red-50 text-red-600"
                              }`}
                            >
                              {inv.status}
                            </span>
                            <span className="rounded-full bg-[#f3f6f8] px-2 py-0.5 text-[10px] font-medium text-[#526071]">
                              {inv.role}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#7c8795]">
                            {inv.status === "claimed" && inv.claimedByName
                              ? `Claimed by ${inv.claimedByName}`
                              : inv.presetName || inv.presetEmail || "Open one-time staff invite"}
                          </p>
                        </div>

                        {inv.status === "unused" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void copyText(inv.id, inv.code)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#dce3e8] px-2.5 text-[11px] font-medium text-[#354153] hover:bg-slate-50"
                            >
                              {copiedKey === inv.id ? <Check size={12} /> : <Copy size={12} />}
                              {copiedKey === inv.id ? "Copied" : "Copy"}
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                disabled={busyActionId === inv.id}
                                onClick={() => void handleRevokeInvite(inv.id)}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <XCircle size={12} aria-hidden="true" />
                                Revoke
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-[15px] font-semibold text-[#243242]">
                  Staff Accounts ({team.length})
                </h2>
                <p className="mt-0.5 mb-4 text-[12px] text-[#7c8795]">
                  Deactivating a staff account immediately revokes their dashboard &amp; API access.
                </p>
                <div className="divide-y divide-[#eef1f4]">
                  {team.map((member) => {
                    const isSelf = member.id === currentUserId;
                    const busy = busyActionId === member.id;
                    return (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-[#243242]">
                              {member.fullName}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                member.role === "owner"
                                  ? "bg-[#e8f4ee] text-[#258765]"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {member.role === "owner" ? "Owner" : "Staff"}
                            </span>
                            {member.status === "inactive" && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-[#7c8795]">{member.email}</p>
                        </div>

                        {isOwner && !isSelf && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleToggleStaffStatus(
                                member.id,
                                member.status === "active" ? "inactive" : "active",
                              )
                            }
                            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium disabled:opacity-50 ${
                              member.status === "active"
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-[#cce7d9] text-[#258765] hover:bg-[#eef9f3]"
                            }`}
                          >
                            {member.status === "active" ? (
                              <>
                                <UserX size={13} aria-hidden="true" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck size={13} aria-hidden="true" />
                                Reactivate
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
