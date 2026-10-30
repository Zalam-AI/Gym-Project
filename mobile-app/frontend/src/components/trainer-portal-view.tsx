"use client";

import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  LoaderCircle,
  LogOut,
  Phone,
  QrCode,
  ScanLine,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  clearMobileSessionToken,
  mobileFetch,
  readMobileJson,
} from "@/lib/mobile-fetch";

export type TrainerTab = "Pass" | "Clients" | "Schedule" | "Profile";

export type AvailabilitySlot = {
  day: string;
  startTime: string;
  endTime: string;
};

export type WorkoutExercise = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  muscle: string;
};

export type WorkoutPlanSummary = {
  id: string;
  title: string;
  targetGoal: string;
  exercises: WorkoutExercise[];
};

export type TraineeSummary = {
  id: string;
  name: string;
  phone: string;
  email: string;
  membershipStatus: "Active" | "Expired" | "Unpaid";
  planName: string;
  expiryDate: string | null;
  onFloorNow: boolean;
  lastVisitAt: string | null;
  workoutPlan: WorkoutPlanSummary | null;
  nextSession: {
    id: string;
    title: string;
    startsAt: string;
    durationMinutes: number;
  } | null;
};

export type TrainerSessionItem = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled";
  notes: string;
};

export type TrainerProfileData = {
  id: string;
  gymId: string;
  gymName: string;
  gymSlug: string;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  status: string;
  checkedInNow: boolean;
  availability: AvailabilitySlot[];
};

export type FormattedVisit = {
  id: string;
  date: string;
  time: string;
  detail: string;
};

const ALL_WEEK_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function formatShortDateTime(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

function defaultTomorrowLocalInput() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  dt.setHours(17, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function TrainerPortalView({
  trainer,
  trainees,
  sessions,
  workoutPlans,
  visits,
  dataError,
  isLoggingOut,
  onOpenScanner,
  onRefresh,
  onLogout,
}: {
  trainer: TrainerProfileData;
  trainees: TraineeSummary[];
  sessions: TrainerSessionItem[];
  workoutPlans: WorkoutPlanSummary[];
  visits: FormattedVisit[];
  dataError: string;
  isLoggingOut: boolean;
  onOpenScanner: () => void;
  onRefresh: () => Promise<unknown>;
  onLogout: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TrainerTab>("Pass");
  const [clientFilter, setClientFilter] = useState<"all" | "floor" | "noplan">("all");
  const [expandedTraineeId, setExpandedTraineeId] = useState<string | null>(null);
  const [scheduleSubTab, setScheduleSubTab] = useState<"sessions" | "hours">("sessions");

  // Session booking modal state
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [sessionMemberId, setSessionMemberId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("1-on-1 Personal Training");
  const [sessionStartsAt, setSessionStartsAt] = useState(defaultTomorrowLocalInput);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [sessionNotes, setSessionNotes] = useState("");

  // Availability editor state
  const [draftAvailability, setDraftAvailability] = useState<AvailabilitySlot[]>(
    trainer.availability,
  );
  const [availabilitySaved, setAvailabilitySaved] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const traineesOnFloor = trainees.filter((t) => t.onFloorNow);
  const upcomingSessions = sessions.filter((s) => s.status === "scheduled");
  const nextSession = upcomingSessions[0] ?? null;

  const filteredTrainees = trainees.filter((t) => {
    if (clientFilter === "floor") return t.onFloorNow;
    if (clientFilter === "noplan") return !t.workoutPlan;
    return true;
  });

  async function postTrainerAction(body: Record<string, unknown>) {
    setIsSaving(true);
    setActionError("");
    try {
      const response = await mobileFetch("/api/trainer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        clearMobileSessionToken();
        await onRefresh();
        return false;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to save changes.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save changes.");
      }
      await onRefresh();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save changes.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function openNewSessionFor(memberId?: string) {
    setActionError("");
    setSessionMemberId(memberId || trainees[0]?.id || "");
    setSessionTitle("1-on-1 Personal Training");
    setSessionStartsAt(defaultTomorrowLocalInput());
    setSessionDuration(60);
    setSessionNotes("");
    setIsNewSessionOpen(true);
  }

  async function submitNewSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionMemberId || !sessionTitle.trim() || !sessionStartsAt) return;
    const ok = await postTrainerAction({
      action: "create-session",
      memberId: sessionMemberId,
      title: sessionTitle.trim(),
      startsAt: new Date(sessionStartsAt).toISOString(),
      durationMinutes: sessionDuration,
      notes: sessionNotes.trim(),
    });
    if (ok) {
      setIsNewSessionOpen(false);
      setActiveTab("Schedule");
      setScheduleSubTab("sessions");
    }
  }

  function toggleWorkDay(day: string) {
    setAvailabilitySaved(false);
    setDraftAvailability((prev) => {
      const exists = prev.some((slot) => slot.day === day);
      if (exists) {
        return prev.filter((slot) => slot.day !== day);
      }
      const next = [...prev, { day, startTime: "10:00", endTime: "18:00" }];
      return ALL_WEEK_DAYS.flatMap((d) => next.filter((item) => item.day === d));
    });
  }

  function updateWorkDayTime(
    day: string,
    field: "startTime" | "endTime",
    value: string,
  ) {
    setAvailabilitySaved(false);
    setDraftAvailability((prev) =>
      prev.map((slot) => (slot.day === day ? { ...slot, [field]: value } : slot)),
    );
  }

  async function saveAvailability() {
    const ok = await postTrainerAction({
      action: "update-availability",
      availability: draftAvailability,
    });
    if (ok) {
      setAvailabilitySaved(true);
      window.setTimeout(() => setAvailabilitySaved(false), 2500);
    }
  }

  const tabs: Array<{ label: TrainerTab; icon: typeof QrCode }> = [
    { label: "Pass", icon: QrCode },
    { label: "Clients", icon: UsersRound },
    { label: "Schedule", icon: CalendarDays },
    { label: "Profile", icon: UserRound },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2f5] px-0 py-0 sm:px-6 sm:py-8">
      <section
        aria-label="GymOS trainer app"
        className="flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#f7f8fa] shadow-[0_20px_50px_rgba(24,33,47,0.12)] sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-[#dfe5ea]"
      >
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#edf0f2] bg-white px-5 pt-[max(env(safe-area-inset-top),8px)]">
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-[#345995] text-[14px] font-bold text-white"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-semibold tracking-[-0.03em] text-[#243242]">
                  Gym<span className="text-[#2d9d78]">OS</span>
                </p>
                <span className="rounded-full bg-[#eef2ff] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#3f64a8]">
                  Coach
                </span>
              </div>
              <p className="max-w-[160px] truncate text-[9px] uppercase tracking-wide text-[#8993a0]">
                {trainer.gymName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={isLoggingOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-9 place-items-center rounded-lg text-[#74808e] hover:bg-[#f3f5f6] hover:text-[#a64141]"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[#8993a0]">Coach workspace</p>
              <h1 className="mt-0.5 truncate text-[21px] font-semibold tracking-[-0.045em] text-[#243242]">
                {trainer.name}
              </h1>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                trainer.checkedInNow
                  ? "bg-[#eaf6f0] text-[#278968]"
                  : "bg-[#eef2ff] text-[#3f64a8]"
              }`}
            >
              {trainer.checkedInNow ? "On Floor" : "Active Coach"}
            </span>
          </div>

          {(dataError || (actionError && !isNewSessionOpen)) && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-[#fff1ef] px-3 py-2 text-[10px] text-[#a9433b]"
            >
              {dataError || actionError}
            </p>
          )}

          {activeTab === "Pass" && (
            <div className="space-y-4">
              <section
                aria-labelledby="coach-pass-heading"
                className="overflow-hidden rounded-[22px] bg-gradient-to-br from-[#172433] via-[#1d3147] to-[#1a3c34] text-white shadow-[0_12px_30px_rgba(23,36,51,0.2)]"
              >
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#82cdb0]">
                      Digital trainer pass
                    </p>
                    <h2
                      id="coach-pass-heading"
                      className="mt-1 text-[19px] font-semibold tracking-[-0.035em]"
                    >
                      {trainer.name}
                    </h2>
                    <p className="mt-0.5 text-[10px] text-slate-300">{trainer.specialty}</p>
                  </div>
                  <span
                    className="grid size-10 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {trainer.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div className="mx-5 grid grid-cols-2 gap-3 rounded-xl bg-white/[0.08] p-3.5">
                  <div>
                    <p className="text-[9px] text-slate-400">ASSIGNED CLIENTS</p>
                    <p className="mt-1 text-[12px] font-semibold">
                      {trainees.length} {trainees.length === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400">FLOOR STATUS</p>
                    <p className="mt-1 text-[12px] font-semibold text-[#82cdb0]">
                      {trainer.checkedInNow ? "Checked in" : "Ready to scan"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 px-5 py-3">
                  <span className="text-[9px] text-slate-400">COACH ID</span>
                  <span className="font-mono text-[10px] tracking-wide text-slate-200">
                    {trainer.id.slice(-8).toUpperCase()}
                  </span>
                </div>
              </section>

              <button
                type="button"
                onClick={onOpenScanner}
                className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#278968] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(39,137,104,0.2)] transition-colors hover:bg-[#207858]"
              >
                <ScanLine size={19} aria-hidden="true" />
                Scan Gym QR Code
              </button>

              <section className="rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
                      <UsersRound size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-[#354153]">
                        Clients in the gym right now
                      </p>
                      <p className="text-[10px] text-[#87909d]">
                        {traineesOnFloor.length > 0
                          ? `${traineesOnFloor.length} of your trainees checked in on floor`
                          : "None of your trainees are checked in right now"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("Clients")}
                    className="text-[10px] font-semibold text-[#278968]"
                  >
                    View all
                  </button>
                </div>
                {traineesOnFloor.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#edf0f2] pt-3">
                    {traineesOnFloor.map((client) => (
                      <span
                        key={client.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf6f0] px-2.5 py-1 text-[10px] font-semibold text-[#278968]"
                      >
                        <span className="size-1.5 rounded-full bg-[#278968]" />
                        {client.name}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setActiveTab("Schedule")}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4 text-left hover:bg-[#fbfcfc]"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#4d62b8]">
                  <CalendarDays size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-[#354153]">
                    Next coaching session
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-[#87909d]">
                    {nextSession
                      ? `${nextSession.memberName} · ${formatShortDateTime(nextSession.startsAt)}`
                      : "No upcoming sessions — tap to schedule"}
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-[#278968]">Schedule</span>
              </button>
            </div>
          )}

          {activeTab === "Clients" && (
            <section aria-labelledby="clients-heading">
              <div className="mb-3.5 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                    Your roster
                  </p>
                  <h2
                    id="clients-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                  >
                    People training with you
                  </h2>
                </div>
                {trainees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openNewSessionFor()}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#278968] px-2.5 text-[10px] font-semibold text-white hover:bg-[#207858]"
                  >
                    <CalendarPlus size={12} aria-hidden="true" />
                    Book
                  </button>
                )}
              </div>

              <div className="mb-3.5 flex gap-1.5">
                {[
                  { id: "all" as const, label: `All (${trainees.length})` },
                  { id: "floor" as const, label: `In Gym (${traineesOnFloor.length})` },
                  {
                    id: "noplan" as const,
                    label: `Needs Plan (${trainees.filter((t) => !t.workoutPlan).length})`,
                  },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setClientFilter(pill.id)}
                    className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                      clientFilter === pill.id
                        ? "bg-[#243242] text-white"
                        : "border border-[#e3e8ec] bg-white text-[#687585]"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <ul className="space-y-2.5">
                {filteredTrainees.map((client) => {
                  const isExpanded = expandedTraineeId === client.id;
                  return (
                    <li
                      key={client.id}
                      className="overflow-hidden rounded-2xl border border-[#e9edf1] bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTraineeId(isExpanded ? null : client.id)
                        }
                        className="flex w-full items-start gap-3 p-3.5 text-left"
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                            client.onFloorNow
                              ? "bg-[#dcefe4] text-[#278968]"
                              : "bg-[#eef2ff] text-[#4d62b8]"
                          }`}
                        >
                          {client.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[12px] font-semibold text-[#354153]">
                              {client.name}
                            </p>
                            {client.onFloorNow && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf6f0] px-2 py-0.5 text-[8px] font-bold text-[#278968]">
                                <span className="size-1.5 rounded-full bg-[#278968]" />
                                In gym now
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${
                                client.membershipStatus === "Active"
                                  ? "bg-[#f2f4f6] text-[#526071]"
                                  : client.membershipStatus === "Unpaid"
                                    ? "bg-[#fff4e8] text-[#bd7838]"
                                    : "bg-[#fff0ee] text-[#c4544c]"
                              }`}
                            >
                              {client.membershipStatus}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-[#7b8794]">
                            {client.workoutPlan
                              ? `${client.workoutPlan.title} (${client.workoutPlan.exercises.length} ex)`
                              : "No workout plan assigned yet"}
                          </p>
                          {client.nextSession && (
                            <p className="mt-1 text-[9px] font-medium text-[#3f64a8]">
                              Next: {formatShortDateTime(client.nextSession.startsAt)}
                            </p>
                          )}
                        </div>
                        <span className="mt-1 text-[#9aa3ae]">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-[#edf0f2] bg-[#fbfcfc] p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#687585]">
                            <span className="inline-flex items-center gap-1">
                              <Phone size={11} aria-hidden="true" />
                              {client.phone}
                            </span>
                            <span>{client.planName}</span>
                          </div>

                          <div>
                            <label
                              htmlFor={`plan-select-${client.id}`}
                              className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-[#83908d]"
                            >
                              Assigned workout routine
                            </label>
                            <select
                              id={`plan-select-${client.id}`}
                              disabled={isSaving}
                              value={client.workoutPlan?.id ?? ""}
                              onChange={(event) => {
                                if (!event.target.value) return;
                                void postTrainerAction({
                                  action: "assign-workout",
                                  memberId: client.id,
                                  workoutPlanId: event.target.value,
                                });
                              }}
                              className="min-h-9 w-full rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[11px] text-[#344052] outline-none focus:border-[#55b994]"
                            >
                              <option value="" disabled>
                                Select a workout template…
                              </option>
                              {workoutPlans.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                  {plan.title} · {plan.targetGoal}
                                </option>
                              ))}
                            </select>
                          </div>

                          {client.workoutPlan && (
                            <ul className="space-y-1.5 rounded-xl border border-[#edf0f2] bg-white p-2.5">
                              {client.workoutPlan.exercises.map((ex, idx) => (
                                <li
                                  key={ex.id}
                                  className="flex items-center justify-between text-[10px]"
                                >
                                  <span className="truncate font-medium text-[#354153]">
                                    {idx + 1}. {ex.name}
                                  </span>
                                  <span className="shrink-0 text-[9px] text-[#8993a0]">
                                    {ex.sets}×{ex.reps}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <button
                            type="button"
                            onClick={() => openNewSessionFor(client.id)}
                            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#cfe5d9] bg-white text-[10px] font-semibold text-[#278968] hover:bg-[#f0f9f4]"
                          >
                            <CalendarPlus size={13} aria-hidden="true" />
                            Schedule session with {client.name.split(" ")[0]}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}

                {filteredTrainees.length === 0 && (
                  <li className="rounded-2xl border border-[#e9edf1] bg-white p-6 text-center text-[11px] text-[#8993a0]">
                    {trainees.length === 0
                      ? "No trainees assigned to you yet. Gym staff can assign members on the Trainers page."
                      : "No trainees match this filter."}
                  </li>
                )}
              </ul>
            </section>
          )}

          {activeTab === "Schedule" && (
            <section aria-labelledby="trainer-schedule-heading">
              <div className="mb-3.5 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                    Coaching calendar
                  </p>
                  <h2
                    id="trainer-schedule-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                  >
                    Your schedule
                  </h2>
                </div>
                {scheduleSubTab === "sessions" && trainees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openNewSessionFor()}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#278968] px-2.5 text-[10px] font-semibold text-white hover:bg-[#207858]"
                  >
                    <CalendarPlus size={12} aria-hidden="true" />
                    New session
                  </button>
                )}
              </div>

              <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#ebeff2] p-1">
                <button
                  type="button"
                  onClick={() => setScheduleSubTab("sessions")}
                  className={`min-h-8 rounded-lg text-[10px] font-semibold transition-colors ${
                    scheduleSubTab === "sessions"
                      ? "bg-white text-[#243242] shadow-sm"
                      : "text-[#6f7b89]"
                  }`}
                >
                  Sessions ({upcomingSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSubTab("hours")}
                  className={`min-h-8 rounded-lg text-[10px] font-semibold transition-colors ${
                    scheduleSubTab === "hours"
                      ? "bg-white text-[#243242] shadow-sm"
                      : "text-[#6f7b89]"
                  }`}
                >
                  Weekly Shifts
                </button>
              </div>

              {scheduleSubTab === "sessions" ? (
                <ul className="space-y-2.5">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      className="rounded-2xl border border-[#e9edf1] bg-white p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[#354153]">
                            {session.title}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium text-[#278968]">
                            with {session.memberName}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold ${
                            session.status === "scheduled"
                              ? "bg-[#e9f2ff] text-[#3f68b2]"
                              : session.status === "completed"
                                ? "bg-[#eaf6f0] text-[#278968]"
                                : "bg-[#fff0ee] text-[#c4544c]"
                          }`}
                        >
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#7b8794]">
                        <Clock3 size={12} aria-hidden="true" />
                        <span>
                          {formatShortDateTime(session.startsAt)} · {session.durationMinutes} min
                        </span>
                      </div>
                      {session.notes && (
                        <p className="mt-1.5 rounded-lg bg-[#f7f9fa] px-2.5 py-1.5 text-[9px] text-[#687585]">
                          {session.notes}
                        </p>
                      )}

                      {session.status === "scheduled" && (
                        <div className="mt-3 flex gap-2 border-t border-[#edf0f2] pt-2.5">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              void postTrainerAction({
                                action: "update-session-status",
                                sessionId: session.id,
                                status: "completed",
                              })
                            }
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#eaf6f0] text-[10px] font-semibold text-[#278968] hover:bg-[#dcefe4]"
                          >
                            <Check size={12} aria-hidden="true" />
                            Mark completed
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              void postTrainerAction({
                                action: "update-session-status",
                                sessionId: session.id,
                                status: "cancelled",
                              })
                            }
                            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-[#e3e8ec] px-3 text-[10px] font-medium text-[#788391] hover:bg-[#f7f9fa]"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                  {sessions.length === 0 && (
                    <li className="rounded-2xl border border-[#e9edf1] bg-white p-6 text-center text-[11px] text-[#8993a0]">
                      No sessions scheduled yet.{" "}
                      {trainees.length > 0
                        ? "Tap “New session” above to book a client."
                        : "Sessions will appear here once clients are assigned."}
                    </li>
                  )}
                </ul>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                  <p className="text-[10px] text-[#7b8794]">
                    Set your weekly gym floor hours so front-desk staff and trainees know your
                    coaching availability.
                  </p>
                  <div className="space-y-2">
                    {ALL_WEEK_DAYS.map((day) => {
                      const slot = draftAvailability.find((s) => s.day === day);
                      return (
                        <div
                          key={day}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#edf0f2] px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => toggleWorkDay(day)}
                            className={`min-h-7 w-14 rounded-lg text-[10px] font-semibold ${
                              slot
                                ? "bg-[#278968] text-white"
                                : "bg-[#f2f4f6] text-[#8993a0]"
                            }`}
                          >
                            {day}
                          </button>
                          {slot ? (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) =>
                                  updateWorkDayTime(day, "startTime", e.target.value)
                                }
                                className="rounded-md border border-[#e3e8ec] px-1.5 py-1 text-[10px] text-[#354153]"
                              />
                              <span className="text-[#9aa3ae]">–</span>
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) =>
                                  updateWorkDayTime(day, "endTime", e.target.value)
                                }
                                className="rounded-md border border-[#e3e8ec] px-1.5 py-1 text-[10px] text-[#354153]"
                              />
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#9aa3ae]">Day off</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveAvailability()}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#278968] text-[11px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                  >
                    {availabilitySaved ? (
                      <>
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Shifts saved!
                      </>
                    ) : isSaving ? (
                      "Saving shifts…"
                    ) : (
                      "Save weekly shifts"
                    )}
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === "Profile" && (
            <section aria-labelledby="coach-profile-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                  Coach account
                </p>
                <h2
                  id="coach-profile-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                >
                  Profile &amp; check-ins
                </h2>
              </div>

              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#eef2ff] text-[13px] font-semibold text-[#3f64a8]">
                  {trainer.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#354153]">
                    {trainer.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-[#278968]">
                    {trainer.specialty}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#87909d]">
                    {trainer.phone}
                    {trainer.email ? ` · ${trainer.email}` : ""}
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <Sparkles size={14} className="text-[#278968]" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-[#354153]">
                    Recent gym check-ins ({visits.length})
                  </p>
                </div>
                <ul className="divide-y divide-[#eff1f4]">
                  {visits.slice(0, 6).map((visit) => (
                    <li
                      key={visit.id}
                      className="flex items-center justify-between py-2 text-[10px]"
                    >
                      <div>
                        <p className="font-semibold text-[#354153]">{visit.date}</p>
                        <p className="text-[9px] text-[#8993a0]">{visit.detail}</p>
                      </div>
                      <span className="font-medium text-[#687585]">{visit.time}</span>
                    </li>
                  ))}
                  {visits.length === 0 && (
                    <li className="py-3 text-center text-[10px] text-[#8993a0]">
                      No floor check-ins yet. Scan the Reception QR code when you arrive!
                    </li>
                  )}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void onLogout()}
                disabled={isLoggingOut}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#f0d5d3] bg-white text-[11px] font-semibold text-[#a64141] hover:bg-[#fff6f5] disabled:opacity-60"
              >
                <LogOut size={15} aria-hidden="true" />
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </button>
            </section>
          )}
        </div>

        <nav
          aria-label="Trainer app navigation"
          className="grid grid-cols-4 border-t border-[#edf0f2] bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2"
        >
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-current={activeTab === label ? "page" : undefined}
              onClick={() => setActiveTab(label)}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] font-medium ${
                activeTab === label ? "text-[#278968]" : "text-[#98a2ad]"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </section>

      {isNewSessionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101b26]/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-title"
            className="w-full max-w-[380px] rounded-[24px] bg-white p-5 shadow-[0_24px_80px_rgba(10,18,27,0.35)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">
                  Coach Schedule
                </p>
                <h2
                  id="new-session-title"
                  className="mt-0.5 text-[15px] font-semibold text-[#243242]"
                >
                  Schedule training session
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsNewSessionOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitNewSession} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                  Trainee
                </span>
                <select
                  required
                  value={sessionMemberId}
                  onChange={(e) => setSessionMemberId(e.target.value)}
                  className="min-h-10 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[11px] text-[#344052]"
                >
                  {trainees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                  Session focus
                </span>
                <input
                  required
                  maxLength={80}
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="min-h-10 w-full rounded-lg border border-[#e3e8ec] px-3 text-[11px] text-[#344052]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                    Date &amp; time
                  </span>
                  <input
                    type="datetime-local"
                    required
                    value={sessionStartsAt}
                    onChange={(e) => setSessionStartsAt(e.target.value)}
                    className="min-h-10 w-full rounded-lg border border-[#e3e8ec] px-2 text-[10px] text-[#344052]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                    Duration
                  </span>
                  <select
                    value={sessionDuration}
                    onChange={(e) => setSessionDuration(Number(e.target.value))}
                    className="min-h-10 w-full rounded-lg border border-[#e3e8ec] bg-white px-2 text-[11px] text-[#344052]"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                  Notes <span className="font-normal text-[#9aa3ae]">(optional)</span>
                </span>
                <input
                  maxLength={240}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="e.g. Heavy squat progression"
                  className="min-h-10 w-full rounded-lg border border-[#e3e8ec] px-3 text-[11px] text-[#344052]"
                />
              </label>

              {actionError && (
                <p
                  role="alert"
                  className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[10px] text-[#a9433b]"
                >
                  {actionError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
              >
                {isSaving && (
                  <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                )}
                {isSaving ? "Saving…" : "Confirm session"}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
