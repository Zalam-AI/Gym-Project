"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  LogOut,
  Printer,
  Search,
  UsersRound,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type MembershipStatus = "Active" | "Expired" | "Unpaid";

type AttendeeOption = {
  id: string;
  personType?: "member" | "trainer";
  name: string;
  phone: string;
  specialty?: string;
  membershipStatus: MembershipStatus;
  expiryDate?: string;
  expirationDate?: string;
};

type CheckIn = {
  id: string;
  personType?: "member" | "trainer";
  memberId: string;
  trainerId?: string;
  memberName?: string;
  specialty?: string;
  time: string;
  checkOutTime?: string | null;
  checkOutFormatted?: string | null;
  membershipStatus: MembershipStatus;
  checkedOut: boolean;
  source: "Front desk" | "Member self-scan" | "Trainer self-scan";
};

type PeakHourBucket = {
  label: string;
  value: number;
  count?: number;
};

function formatDate(value: string | undefined) {
  if (!value || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

const defaultPeakHours: PeakHourBucket[] = [
  { label: "6–10 AM", value: 0, count: 0 },
  { label: "11 AM–3 PM", value: 0, count: 0 },
  { label: "5–9 PM", value: 0, count: 0 },
  { label: "9 PM–12 AM", value: 0, count: 0 },
];

function StatusBadge({ status }: { status: MembershipStatus }) {
  const style =
    status === "Active"
      ? "bg-[#eaf6f0] text-[#288865]"
      : status === "Unpaid"
        ? "bg-[#fff4e8] text-[#bd7838]"
        : "bg-[#fff0ee] text-[#c4544c]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${style}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

export function AttendancePage() {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [members, setMembers] = useState<AttendeeOption[]>([]);
  const [trainers, setTrainers] = useState<AttendeeOption[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHourBucket[]>(defaultPeakHours);
  const [occupancy, setOccupancy] = useState(0);
  const [capacity, setCapacity] = useState(100);
  const [gymQrPayload, setGymQrPayload] = useState("");
  const [gymName, setGymName] = useState("");
  const [gymSlug, setGymSlug] = useState("");
  const [copiedQr, setCopiedQr] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function refreshAttendance() {
      try {
        const response = await fetch("/api/attendance", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          gymName?: string;
          gymSlug?: string;
          gymQrPayload?: string;
          checkIns: CheckIn[];
          occupancy: number;
          capacity: number;
          peakHours?: PeakHourBucket[];
          members: AttendeeOption[];
          trainers?: AttendeeOption[];
        };
        if (!active) return;
        setCheckIns(data.checkIns);
        setOccupancy(data.occupancy);
        setCapacity(data.capacity);
        setMembers(data.members);
        setTrainers(data.trainers ?? []);
        if (data.peakHours) setPeakHours(data.peakHours);
        if (data.gymQrPayload) setGymQrPayload(data.gymQrPayload);
        if (data.gymName) setGymName(data.gymName);
        if (data.gymSlug) setGymSlug(data.gymSlug);
      } catch {
        if (active) setMessage("Live attendance is temporarily unavailable.");
      }
    }
    void refreshAttendance();
    const intervalId = window.setInterval(refreshAttendance, 2500);
    window.addEventListener("focus", refreshAttendance);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAttendance);
    };
  }, []);

  const allPeople = useMemo(() => {
    return [
      ...members.map((m) => ({ ...m, personType: "member" as const })),
      ...trainers.map((t) => ({ ...t, personType: "trainer" as const })),
    ];
  }, [members, trainers]);

  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedQuery) return [];
    const digits = normalizedQuery.replace(/\D/g, "");
    return allPeople
      .filter(
        (person) =>
          person.id.toLowerCase().includes(normalizedQuery) ||
          person.name.toLowerCase().includes(normalizedQuery) ||
          (digits.length > 0 && person.phone.replace(/\D/g, "").includes(digits)),
      )
      .slice(0, 6);
  }, [allPeople, normalizedQuery]);

  const selectedPerson =
    allPeople.find(
      (person) => `${person.personType}:${person.id}` === selectedKey,
    ) ?? null;
  const occupancyPercent = Math.min(100, Math.round((occupancy / capacity) * 100));

  function choosePerson(person: AttendeeOption) {
    setSelectedKey(`${person.personType ?? "member"}:${person.id}`);
    setQuery(person.name);
    setMessage("");
  }

  function verifySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = normalizedQuery.replace(/\D/g, "");
    const exactPerson = allPeople.find(
      (person) =>
        person.id.toLowerCase() === normalizedQuery ||
        person.name.toLowerCase() === normalizedQuery ||
        person.phone.toLowerCase() === normalizedQuery ||
        (digits.length > 0 && person.phone.replace(/\D/g, "") === digits),
    );
    if (exactPerson) {
      choosePerson(exactPerson);
      return;
    }
    if (suggestions.length === 1) {
      choosePerson(suggestions[0]);
      return;
    }
    setSelectedKey(null);
    setMessage(
      suggestions.length > 1
        ? "Select a member or trainer from the matching results."
        : "No member or trainer found. Check the ID, name, or phone number and try again.",
    );
  }

  async function checkInPerson(person: AttendeeOption) {
    if (person.membershipStatus !== "Active") {
      setMessage(
        `${person.name} cannot check in: status is ${person.membershipStatus.toLowerCase()}.`,
      );
      return;
    }
    if (occupancy >= capacity) {
      setMessage("The gym is at capacity. Check-in is temporarily unavailable.");
      return;
    }
    try {
      const isTrainer = person.personType === "trainer";
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isTrainer
            ? {
                action: "checkin",
                personType: "trainer",
                trainerId: person.id,
                source: "Front desk",
              }
            : {
                action: "checkin",
                personType: "member",
                memberId: person.id,
                source: "Front desk",
              },
        ),
      });
      const data = (await response.json()) as {
        error?: string;
        checkIn?: CheckIn;
        occupancy?: number;
      };
      if (!response.ok) throw new Error(data.error ?? "Check-in could not be completed.");
      if (data.checkIn) {
        setCheckIns((prev) => [
          data.checkIn!,
          ...prev.filter((item) => item.id !== data.checkIn!.id),
        ]);
      }
      if (typeof data.occupancy === "number") {
        setOccupancy(data.occupancy);
      }
      setMessage(`${person.name} checked in successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check-in could not be completed.");
    }
  }

  async function checkOut(checkInId: string) {
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", checkInId }),
      });
      const data = (await response.json()) as {
        error?: string;
        occupancy?: number;
        checkOutTime?: string;
        checkOutFormatted?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Check-out could not be completed.");
      setCheckIns((prev) =>
        prev.map((item) =>
          item.id === checkInId
            ? {
                ...item,
                checkedOut: true,
                checkOutTime: data.checkOutTime ?? item.checkOutTime ?? null,
                checkOutFormatted: data.checkOutFormatted ?? item.checkOutFormatted ?? null,
              }
            : item,
        ),
      );
      if (typeof data.occupancy === "number") {
        setOccupancy(data.occupancy);
      }
      setMessage("Checked out successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check-out could not be completed.");
    }
  }

  async function copyQrPayload() {
    if (!gymQrPayload) return;
    try {
      await navigator.clipboard.writeText(gymQrPayload);
      setCopiedQr(true);
      window.setTimeout(() => setCopiedQr(false), 2000);
      return;
    } catch {
      // Fallback for embedded preview iframes where Clipboard API permissions may be restricted.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = gymQrPayload;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedQr(true);
      window.setTimeout(() => setCopiedQr(false), 2000);
    } catch {
      // Ignore fallback copy failure.
    }
  }

  return (
    <AppShell activePage="Attendance">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
            Workspace
          </p>
          <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">
            Attendance &amp; Check-ins
          </h1>
          <p className="mt-1.5 text-[13px] text-[#788391]">
            Verify memberships and trainer arrivals to keep today&apos;s gym floor moving.
          </p>
        </div>

        <section aria-labelledby="reception-qr-heading" className="mb-5">
          <Card className="reception-qr-print flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid size-40 shrink-0 place-items-center rounded-xl border border-[#e9edf1] bg-white p-2">
                {gymQrPayload ? (
                  <QRCodeSVG
                    value={gymQrPayload}
                    size={136}
                    level="M"
                    fgColor="#172433"
                    bgColor="#ffffff"
                    title="GymOS Reception Check-in QR Code"
                  />
                ) : (
                  <span className="text-[11px] text-[#8993a0]">Loading QR…</span>
                )}
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">
                  Reception · {gymName || "GymOS"}
                </p>
                <h2 id="reception-qr-heading" className="text-[15px] font-semibold text-[#273445]">
                  Reception Check-in QR Code
                </h2>
                <p className="mt-1.5 max-w-md text-[11px] leading-5 text-[#87909d]">
                  Display this scannable QR code at the front desk. New members scan it in the
                  Mobile App to browse plans &amp; subscribe, and active members &amp; trainers scan
                  it to check in.
                </p>
                {gymSlug && (
                  <p className="mt-2 font-mono text-[10px] text-[#526071]">
                    Gym code: <span className="font-semibold text-[#278968]">{gymSlug}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="reception-qr-print-actions flex flex-wrap gap-2">
              {gymQrPayload && (
                <button
                  type="button"
                  onClick={() => void copyQrPayload()}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#e3e8ec] bg-white px-3.5 text-[11px] font-medium text-[#526071] hover:bg-slate-50"
                >
                  {copiedQr ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copiedQr ? "Copied QR payload" : "Copy QR code"}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
              >
                <Printer size={15} aria-hidden="true" />
                Print QR code
              </button>
            </div>
          </Card>
        </section>

        <section aria-labelledby="quick-checkin-heading" className="mb-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4">
              <h2
                id="quick-checkin-heading"
                className="text-[15px] font-semibold tracking-[-0.02em] text-[#273445]"
              >
                Quick check-in
              </h2>
              <p className="mt-1 text-[11px] text-[#87909d]">
                Search a member or trainer by ID, name, or phone number.
              </p>
            </div>
            <form onSubmit={verifySearch} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[#9aa3ae]"
                />
                <label htmlFor="member-search" className="sr-only">
                  Member or trainer ID, name, or phone
                </label>
                <input
                  id="member-search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedKey(null);
                    setMessage("");
                  }}
                  placeholder="Enter member or trainer name, ID, or phone..."
                  autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[#e3e8ec] bg-white ps-10 pe-4 text-[13px] text-[#344052] outline-none placeholder:text-[#a0a9b4] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
                />
                {suggestions.length > 0 && !selectedKey && (
                  <ul
                    aria-label="Matching attendees"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-[#e9edf1] bg-white py-1 shadow-lg"
                  >
                    {suggestions.map((person) => (
                      <li key={`${person.personType}:${person.id}`}>
                        <button
                          type="button"
                          onClick={() => choosePerson(person)}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-start hover:bg-[#f7f9fa]"
                        >
                          <span
                            className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                              person.personType === "trainer"
                                ? "bg-[#eef2ff] text-[#4d62b8]"
                                : "bg-[#e8f4ee] text-[#2e8868]"
                            }`}
                            aria-hidden="true"
                          >
                            {person.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[12px] font-semibold text-[#354153]">
                                {person.name}
                              </span>
                              {person.personType === "trainer" && (
                                <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[9px] font-semibold text-[#4d62b8]">
                                  Trainer
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#8993a0]">
                              {person.id.slice(-6).toUpperCase()} · {person.phone}
                            </span>
                          </span>
                          <StatusBadge status={person.membershipStatus} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-[#278968] px-5 text-[12px] font-semibold text-white hover:bg-[#207858] sm:min-w-[130px]"
              >
                Find person
              </button>
            </form>

            {message && (
              <p
                aria-live="polite"
                className={`mt-4 flex items-center gap-2 text-[12px] font-medium ${
                  message.includes("successfully") ? "text-[#278968]" : "text-[#b64c44]"
                }`}
              >
                {message.includes("successfully") ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : (
                  <XCircle size={15} aria-hidden="true" />
                )}
                {message}
              </p>
            )}

            {selectedPerson && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-5 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                  selectedPerson.membershipStatus === "Active"
                    ? "border-[#cfe9dc] bg-[#f0f9f4]"
                    : "border-[#f2d5d1] bg-[#fff5f3]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-12 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
                    selectedPerson.membershipStatus === "Active"
                      ? "bg-[#dcefe4] text-[#278968]"
                      : "bg-[#f8e1de] text-[#b64c44]"
                  }`}
                >
                  {selectedPerson.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#354153]">
                      {selectedPerson.name}
                    </p>
                    {selectedPerson.personType === "trainer" && (
                      <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[9px] font-semibold text-[#4d62b8]">
                        Trainer
                      </span>
                    )}
                    <StatusBadge status={selectedPerson.membershipStatus} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#74808e]">
                    {selectedPerson.phone}
                    {selectedPerson.personType === "trainer"
                      ? ` · ${selectedPerson.specialty ?? "Gym Coach"}`
                      : ` · Expires ${formatDate(selectedPerson.expirationDate ?? selectedPerson.expiryDate)}`}
                  </p>
                  <p
                    className={`mt-1.5 text-[11px] font-medium ${
                      selectedPerson.membershipStatus === "Active"
                        ? "text-[#278968]"
                        : "text-[#b64c44]"
                    }`}
                  >
                    {selectedPerson.personType === "trainer"
                      ? "Active gym trainer — ready to check in."
                      : selectedPerson.membershipStatus === "Active"
                        ? "Membership verified — ready to check in."
                        : selectedPerson.membershipStatus === "Unpaid"
                          ? "Payment is outstanding. Resolve payment before check-in."
                          : "Membership has expired. Renew the plan before check-in."}
                  </p>
                </div>
                {selectedPerson.membershipStatus === "Active" ? (
                  <button
                    type="button"
                    onClick={() => void checkInPerson(selectedPerson)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[11px] font-semibold text-white hover:bg-[#207858]"
                  >
                    <Check size={14} aria-hidden="true" />
                    Check in
                  </button>
                ) : (
                  <span className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-[#f8e5e2] px-3 text-[10px] font-semibold text-[#b64c44]">
                    Check-in blocked
                  </span>
                )}
              </div>
            )}
          </Card>
        </section>

        <section
          aria-label="Gym occupancy and peak hours"
          className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        >
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[#354153]">Live gym occupancy</h2>
                <p className="mt-1 text-[11px] text-[#87909d]">
                  Members and trainers currently inside
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-[#e9f6f0] text-[#278968]">
                <UsersRound size={17} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span
                aria-live="polite"
                className="text-[32px] font-semibold leading-none tracking-[-0.05em] text-[#253243]"
              >
                {occupancy}
              </span>
              <span className="text-[13px] text-[#8a94a0]">/ {capacity} capacity</span>
              <span className="ml-auto text-[11px] font-medium text-[#278968]">
                {occupancyPercent}% full
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Gym occupancy"
              aria-valuemin={0}
              aria-valuemax={capacity}
              aria-valuenow={occupancy}
              className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf1f2]"
            >
              <div
                className="h-full rounded-full bg-[#43ad82] transition-[width]"
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[10px] text-[#8993a0]">
              {Math.max(0, capacity - occupancy)} spaces available
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[#354153]">Peak hours</h2>
                <p className="mt-1 text-[11px] text-[#87909d]">
                  Check-in distribution (last 30 days)
                </p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#6675d9]">
                <Activity size={17} aria-hidden="true" />
              </span>
            </div>
            <ul className="space-y-3">
              {peakHours.map((period) => (
                <li
                  key={period.label}
                  className="grid grid-cols-[82px_1fr_42px] items-center gap-3"
                >
                  <span className="text-[10px] text-[#74808e]">{period.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[#edf1f2]">
                    <span
                      className="block h-full rounded-full bg-[#72bea0] transition-[width]"
                      style={{ width: `${period.value}%` }}
                    />
                  </span>
                  <span className="text-end text-[10px] font-medium text-[#74808e]">
                    {period.value}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="today-checkins-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="today-checkins-heading"
                className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]"
              >
                Today&apos;s check-ins
              </h2>
              <p className="mt-1 text-[11px] text-[#87909d]">
                Live visit log for members and trainers, including Mobile App QR self-scans
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf6f0] px-2.5 py-1 text-[10px] font-medium text-[#288865]">
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {occupancy} currently inside
            </span>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-start">
                <caption className="sr-only">Today&apos;s gym check-in log</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {[
                      "Attendee",
                      "Check-in time",
                      "Check-in method",
                      "Status",
                      "Check-out",
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {checkIns.map((checkIn) => {
                    const isTrainer =
                      checkIn.personType === "trainer" ||
                      checkIn.source === "Trainer self-scan";
                    const matched = isTrainer
                      ? trainers.find((item) => item.id === (checkIn.trainerId ?? checkIn.memberId))
                      : members.find((item) => item.id === checkIn.memberId);
                    const displayName = matched?.name ?? checkIn.memberName;
                    if (!displayName) return null;
                    return (
                      <tr key={checkIn.id} className="transition-colors hover:bg-[#fbfcfc]">
                        <th scope="row" className="px-5 py-4 text-[12px] font-semibold text-[#354153]">
                          <span className="inline-flex items-center gap-2">
                            <span>{displayName}</span>
                            {isTrainer && (
                              <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[9px] font-semibold text-[#4d62b8]">
                                Trainer
                              </span>
                            )}
                          </span>
                        </th>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6f7b89]">
                            <Clock3 size={13} aria-hidden="true" />
                            {checkIn.time}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[11px] text-[#6f7b89]">{checkIn.source}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={checkIn.membershipStatus} />
                        </td>
                        <td className="px-5 py-4">
                          {checkIn.checkedOut ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8993a0]">
                              <CheckCircle2 size={13} aria-hidden="true" />
                              <span>
                                Checked out
                                {checkIn.checkOutFormatted ? ` · ${checkIn.checkOutFormatted}` : ""}
                              </span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void checkOut(checkIn.id)}
                              aria-label={`Check out ${displayName}`}
                              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[10px] font-medium text-[#687585] hover:border-[#d3dbe0] hover:bg-[#f7f9fa]"
                            >
                              <LogOut size={12} aria-hidden="true" />
                              Check out
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {checkIns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-[12px] text-[#8993a0]">
                        No check-ins yet today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>{checkIns.length} visits logged today</span>
              <span>Live feed syncs automatically with Member &amp; Trainer QR self-scans</span>
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">
          GymOS · Live attendance {gymName ? `· ${gymName}` : ""}
        </footer>
      </main>
    </AppShell>
  );
}
