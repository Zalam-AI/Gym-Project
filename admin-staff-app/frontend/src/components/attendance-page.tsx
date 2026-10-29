"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  LogOut,
  Printer,
  Search,
  XCircle,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type MembershipStatus = "Active" | "Expired" | "Unpaid";

type Member = {
  id: string;
  name: string;
  phone: string;
  membershipStatus: MembershipStatus;
  expirationDate: string;
};

type CheckIn = {
  id: string;
  memberId: string;
  time: string;
  membershipStatus: MembershipStatus;
  checkedOut: boolean;
  source: "Front desk" | "Member self-scan";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

const peakHours = [
  { label: "6–9 AM", value: 38 },
  { label: "11 AM–2 PM", value: 56 },
  { label: "5–8 PM", value: 82 },
];

function ReceptionQrMock() {
  const size = 25;
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    const finder = (startRow: number, startCol: number) => {
      const y = row - startRow;
      const x = col - startCol;
      if (x < 0 || x > 6 || y < 0 || y > 6) return null;
      return x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
    };
    const finderValue = finder(0, 0) ?? finder(0, size - 7) ?? finder(size - 7, 0);
    return finderValue ?? ((row * 23 + col * 31 + row * col * 5 + (row ^ col)) % 13) < 6;
  });

  return (
    <div role="img" aria-label="Mock GymOS reception check-in QR code" className="grid size-36 grid-cols-[repeat(25,minmax(0,1fr))] grid-rows-[repeat(25,minmax(0,1fr))] gap-px bg-white p-2">
      {cells.map((filled, index) => <span key={index} className={filled ? "bg-[#172433]" : "bg-white"} />)}
    </div>
  );
}

function StatusBadge({ status }: { status: MembershipStatus }) {
  const style = status === "Active"
    ? "bg-[#eaf6f0] text-[#288865]"
    : status === "Unpaid"
      ? "bg-[#fff4e8] text-[#bd7838]"
      : "bg-[#fff0ee] text-[#c4544c]";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${style}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

export function AttendancePage() {
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [occupancy, setOccupancy] = useState(0);
  const [capacity, setCapacity] = useState(100);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function refreshAttendance() {
      try {
        const response = await fetch("/api/attendance", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { checkIns: CheckIn[]; occupancy: number; capacity: number; members: Member[] };
        if (!active) return;
        setCheckIns(data.checkIns);
        setOccupancy(data.occupancy);
        setCapacity(data.capacity);
        setMembers(data.members);
      } catch {
        if (active) setMessage("Live attendance is temporarily unavailable.");
      }
    }
    void refreshAttendance();
    const intervalId = window.setInterval(refreshAttendance, 1500);
    window.addEventListener("focus", refreshAttendance);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAttendance);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedQuery) return [];
    const digits = normalizedQuery.replace(/\D/g, "");
    return members.filter((member) =>
      member.id.toLowerCase().includes(normalizedQuery) ||
      member.name.toLowerCase().includes(normalizedQuery) ||
      (digits.length > 0 && member.phone.replace(/\D/g, "").includes(digits)),
    ).slice(0, 5);
  }, [members, normalizedQuery]);

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const occupancyPercent = Math.min(100, Math.round((occupancy / capacity) * 100));

  function chooseMember(member: Member) {
    setSelectedMemberId(member.id);
    setQuery(member.name);
    setMessage("");
  }

  function verifySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = normalizedQuery.replace(/\D/g, "");
    const exactMember = members.find((member) =>
      member.id.toLowerCase() === normalizedQuery ||
      member.name.toLowerCase() === normalizedQuery ||
      member.phone.toLowerCase() === normalizedQuery ||
      (digits.length > 0 && member.phone.replace(/\D/g, "") === digits),
    );
    if (exactMember) {
      chooseMember(exactMember);
      return;
    }
    if (suggestions.length === 1) {
      chooseMember(suggestions[0]);
      return;
    }
    setSelectedMemberId(null);
    setMessage(suggestions.length > 1
      ? "Select a member from the matching results."
      : "No member found. Check the ID, name, or phone number and try again.");
  }

  async function checkInMember(member: Member, source: "Front desk" | "Member self-scan" = "Front desk") {
    if (member.membershipStatus !== "Active") {
      setMessage(`${member.name} cannot check in: membership is ${member.membershipStatus.toLowerCase()}.`);
      return;
    }
    if (occupancy >= capacity) {
      setMessage("The gym is at capacity. Check-in is temporarily unavailable.");
      return;
    }
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin", memberId: member.id, source }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Check-in could not be completed.");
      setMessage(`${member.name} checked in successfully.`);
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
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Check-out could not be completed.");
      setMessage("Member checked out successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check-out could not be completed.");
    }
  }

  return (
    <AppShell activePage="Attendance">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Workspace</p>
          <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">Attendance &amp; Check-ins</h1>
          <p className="mt-1.5 text-[13px] text-[#788391]">Verify a membership and keep today&apos;s gym floor moving.</p>
        </div>

        <section aria-labelledby="reception-qr-heading" className="mb-5">
          <Card className="reception-qr-print flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              <div className="grid size-40 shrink-0 place-items-center rounded-xl border border-[#e9edf1] bg-white">
                <ReceptionQrMock />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">Reception</p>
                <h2 id="reception-qr-heading" className="text-[15px] font-semibold text-[#273445]">Reception Check-in QR Code</h2>
                <p className="mt-1.5 max-w-md text-[11px] leading-5 text-[#87909d]">Display this gym QR at the front desk. Members scan it in the GymOS app to check in.</p>
              </div>
            </div>
            <button type="button" onClick={() => window.print()} className="reception-qr-print-actions inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]">
              <Printer size={15} aria-hidden="true" />
              Print QR code
            </button>
          </Card>
        </section>

        <section aria-labelledby="quick-checkin-heading" className="mb-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4">
              <h2 id="quick-checkin-heading" className="text-[15px] font-semibold tracking-[-0.02em] text-[#273445]">Quick check-in</h2>
              <p className="mt-1 text-[11px] text-[#87909d]">Search by member ID, name, or phone number.</p>
            </div>
            <form onSubmit={verifySearch} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa3ae]" />
                <label htmlFor="member-search" className="sr-only">Member ID, name, or phone</label>
                <input
                  id="member-search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedMemberId(null);
                    setMessage("");
                  }}
                  placeholder="Enter member ID, name, or phone..."
                  autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[#e3e8ec] bg-white pl-10 pr-4 text-[13px] text-[#344052] outline-none placeholder:text-[#a0a9b4] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
                />
                {suggestions.length > 0 && !selectedMemberId && (
                  <ul
                    aria-label="Matching members"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-[#e9edf1] bg-white py-1 shadow-lg"
                  >
                    {suggestions.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => chooseMember(member)}
                          className="flex min-h-12 w-full items-center gap-3 px-3 text-left hover:bg-[#f7f9fa]"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8f4ee] text-[10px] font-semibold text-[#2e8868]" aria-hidden="true">
                            {member.name.split(" ").map((part) => part[0]).join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold text-[#354153]">{member.name}</span>
                            <span className="mt-0.5 block text-[10px] text-[#8993a0]">{member.id} · {member.phone}</span>
                          </span>
                          <StatusBadge status={member.membershipStatus} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="submit" className="min-h-12 rounded-xl bg-[#278968] px-5 text-[12px] font-semibold text-white hover:bg-[#207858] sm:min-w-[130px]">
                Find member
              </button>
            </form>

            {message && (
              <p aria-live="polite" className={`mt-4 flex items-center gap-2 text-[12px] font-medium ${
                message.includes("successfully") ? "text-[#278968]" : "text-[#b64c44]"
              }`}>
                {message.includes("successfully")
                  ? <CheckCircle2 size={15} aria-hidden="true" />
                  : <XCircle size={15} aria-hidden="true" />}
                {message}
              </p>
            )}

            {selectedMember && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-5 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                  selectedMember.membershipStatus === "Active"
                    ? "border-[#cfe9dc] bg-[#f0f9f4]"
                    : "border-[#f2d5d1] bg-[#fff5f3]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-12 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
                    selectedMember.membershipStatus === "Active"
                      ? "bg-[#dcefe4] text-[#278968]"
                      : "bg-[#f8e1de] text-[#b64c44]"
                  }`}
                >
                  {selectedMember.name.split(" ").map((part) => part[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#354153]">{selectedMember.name}</p>
                    <StatusBadge status={selectedMember.membershipStatus} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#74808e]">
                    Member ID {selectedMember.id} · {selectedMember.phone} · Expires {formatDate(selectedMember.expirationDate)}
                  </p>
                  <p className={`mt-1.5 text-[11px] font-medium ${
                    selectedMember.membershipStatus === "Active" ? "text-[#278968]" : "text-[#b64c44]"
                  }`}>
                    {selectedMember.membershipStatus === "Active"
                      ? "Membership verified — ready to check in."
                      : selectedMember.membershipStatus === "Unpaid"
                        ? "Payment is outstanding. Resolve payment before check-in."
                        : "Membership has expired. Renew the plan before check-in."}
                  </p>
                </div>
                {selectedMember.membershipStatus === "Active" ? (
                  <button
                    type="button"
                    onClick={() => checkInMember(selectedMember)}
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

        <section aria-label="Gym occupancy and peak hours" className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[#354153]">Live gym occupancy</h2>
                <p className="mt-1 text-[11px] text-[#87909d]">Members currently inside</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-[#e9f6f0] text-[#278968]">
                <UsersRound size={17} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span aria-live="polite" className="text-[32px] font-semibold leading-none tracking-[-0.05em] text-[#253243]">{occupancy}</span>
              <span className="text-[13px] text-[#8a94a0]">/ {capacity} capacity</span>
              <span className="ml-auto text-[11px] font-medium text-[#278968]">{occupancyPercent}% full</span>
            </div>
            <div
              role="progressbar"
              aria-label="Gym occupancy"
              aria-valuemin={0}
              aria-valuemax={capacity}
              aria-valuenow={occupancy}
              className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf1f2]"
            >
              <div className="h-full rounded-full bg-[#43ad82] transition-[width]" style={{ width: `${occupancyPercent}%` }} />
            </div>
            <p className="mt-3 text-[10px] text-[#8993a0]">{capacity - occupancy} spaces available</p>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold text-[#354153]">Peak hours</h2>
                <p className="mt-1 text-[11px] text-[#87909d]">Typical occupancy by time of day</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#6675d9]">
                <Activity size={17} aria-hidden="true" />
              </span>
            </div>
            <ul className="space-y-3">
              {peakHours.map((period) => (
                <li key={period.label} className="grid grid-cols-[76px_1fr_34px] items-center gap-3">
                  <span className="text-[10px] text-[#74808e]">{period.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[#edf1f2]">
                    <span className="block h-full rounded-full bg-[#72bea0]" style={{ width: `${period.value}%` }} />
                  </span>
                  <span className="text-right text-[10px] font-medium text-[#74808e]">{period.value}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="today-checkins-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="today-checkins-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Today&apos;s check-ins</h2>
              <p className="mt-1 text-[11px] text-[#87909d]">Live visit log, including member self-scans</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf6f0] px-2.5 py-1 text-[10px] font-medium text-[#288865]">
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {occupancy} currently inside
            </span>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <caption className="sr-only">Today&apos;s gym check-in log</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Member name", "Check-in time", "Check-in method", "Membership status", "Check-out"].map((heading) => (
                      <th key={heading} scope="col" className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {checkIns.map((checkIn) => {
                    const member = members.find((item) => item.id === checkIn.memberId);
                    if (!member) return null;
                    return (
                      <tr key={checkIn.id} className="transition-colors hover:bg-[#fbfcfc]">
                        <th scope="row" className="px-5 py-4 text-[12px] font-semibold text-[#354153]">{member.name}</th>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6f7b89]">
                            <Clock3 size={13} aria-hidden="true" />
                            {checkIn.time}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[11px] text-[#6f7b89]">{checkIn.source}</td>
                        <td className="px-5 py-4"><StatusBadge status={checkIn.membershipStatus} /></td>
                        <td className="px-5 py-4">
                          {checkIn.checkedOut ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8993a0]">
                              <CheckCircle2 size={13} aria-hidden="true" />
                              Checked out
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => checkOut(checkIn.id)}
                              aria-label={`Check out ${member.name}`}
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
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-[12px] text-[#8993a0]">No check-ins yet today.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>{checkIns.length} visits logged</span>
              <span>Live mock feed updates across both apps</span>
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">GymOS · Attendance data is for preview only</footer>
      </main>
    </AppShell>
  );
}
