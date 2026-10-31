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
import { LanguageSwitch } from "@/lib/i18n";
import {
  clearMobileSessionToken,
  mobileFetch,
  readMobileJson,
} from "@/lib/mobile-fetch";
import {
  ThemeHeaderSwitch,
  ThemePreferenceControl,
  ui,
} from "@/lib/theme";

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
    <main className={ui.pageCanvas}>
      <section aria-label="GymOS trainer app" className={ui.appFrame}>
        <header className={ui.appHeader}>
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-accent text-[14px] font-bold text-on-accent"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <p
                  data-no-translate="true"
                  className="text-[13px] font-semibold tracking-[-0.03em] text-ink"
                >
                  Gym<span className="text-accent-text">OS</span>
                </p>
                <span className={ui.badgeNeutral}>Coach</span>
              </div>
              <p className="max-w-[130px] truncate text-[9px] uppercase tracking-wide text-ink-muted">
                {trainer.gymName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeHeaderSwitch />
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={isLoggingOut}
              aria-label="Sign out"
              title="Sign out"
              className={`${ui.btnGhost} size-9 hover:text-danger-text`}
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-ink-secondary">Coach workspace</p>
              <h1 className="mt-0.5 truncate text-[21px] font-semibold tracking-[-0.045em] text-ink">
                {trainer.name}
              </h1>
            </div>
            <span
              className={`shrink-0 ${
                trainer.checkedInNow ? ui.badgeAccent : ui.badgeNeutral
              }`}
            >
              {trainer.checkedInNow ? "On Floor" : "Active Coach"}
            </span>
          </div>

          {(dataError || (actionError && !isNewSessionOpen)) && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[10px] text-danger-text"
            >
              {dataError || actionError}
            </p>
          )}

          {activeTab === "Pass" && (
            <div className="space-y-4">
              <section
                aria-labelledby="coach-pass-heading"
                className={`${ui.cardElevated} overflow-hidden`}
              >
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-text">
                      Digital trainer pass
                    </p>
                    <h2
                      id="coach-pass-heading"
                      className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                    >
                      {trainer.name}
                    </h2>
                    <p className="mt-0.5 text-[10px] text-ink-secondary">
                      {trainer.specialty}
                    </p>
                  </div>
                  <span
                    className="grid size-10 place-items-center rounded-full border border-accent-border bg-accent-soft text-[11px] font-semibold text-accent-text"
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
                <div className={`${ui.cardSubtle} mx-5 grid grid-cols-2 gap-3 p-3.5`}>
                  <div>
                    <p className="text-[9px] text-ink-muted">ASSIGNED CLIENTS</p>
                    <p className="mt-1 text-[12px] font-semibold text-ink">
                      {trainees.length} {trainees.length === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-ink-muted">FLOOR STATUS</p>
                    <p className="mt-1 text-[12px] font-semibold text-accent-text">
                      {trainer.checkedInNow ? "Checked in" : "Ready to scan"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-divider px-5 py-3">
                  <span className="text-[9px] text-ink-muted">COACH ID</span>
                  <span className="font-mono text-[10px] tracking-wide text-ink-secondary">
                    {trainer.id.slice(-8).toUpperCase()}
                  </span>
                </div>
              </section>

              <button
                type="button"
                onClick={onOpenScanner}
                className={`${ui.btnPrimary} flex min-h-14 w-full rounded-2xl px-4 text-[13px]`}
              >
                <ScanLine size={19} aria-hidden="true" />
                Scan Gym QR Code
              </button>

              <section className={`${ui.card} p-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                      <UsersRound size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-ink">
                        Clients in the gym right now
                      </p>
                      <p className="text-[10px] text-ink-secondary">
                        {traineesOnFloor.length > 0
                          ? `${traineesOnFloor.length} of your trainees checked in on floor`
                          : "None of your trainees are checked in right now"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("Clients")}
                    className="text-[10px] font-semibold text-accent-text"
                  >
                    View all
                  </button>
                </div>
                {traineesOnFloor.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-divider pt-3">
                    {traineesOnFloor.map((client) => (
                      <span key={client.id} className={ui.badgeAccent}>
                        <span className="size-1.5 rounded-full bg-accent" />
                        {client.name}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setActiveTab("Schedule")}
                className={`${ui.cardInteractive} flex w-full items-center gap-3 p-4 text-left`}
              >
                <span className="grid size-9 place-items-center rounded-xl border border-line bg-subtle text-ink-secondary">
                  <CalendarDays size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-ink">
                    Next coaching session
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-ink-secondary">
                    {nextSession
                      ? `${nextSession.memberName} · ${formatShortDateTime(nextSession.startsAt)}`
                      : "No upcoming sessions — tap to schedule"}
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-accent-text">
                  Schedule
                </span>
              </button>
            </div>
          )}

          {activeTab === "Clients" && (
            <section aria-labelledby="clients-heading">
              <div className="mb-3.5 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                    Your roster
                  </p>
                  <h2
                    id="clients-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                  >
                    People training with you
                  </h2>
                </div>
                {trainees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openNewSessionFor()}
                    className={`${ui.btnPrimary} min-h-8 px-2.5 text-[10px]`}
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
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                      clientFilter === pill.id
                        ? "border-accent-border bg-accent-soft text-accent-text"
                        : "border-line bg-surface text-ink-secondary hover:text-ink"
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
                    <li key={client.id} className={`${ui.card} overflow-hidden`}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTraineeId(isExpanded ? null : client.id)
                        }
                        className="flex w-full items-start gap-3 p-3.5 text-left"
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
                            client.onFloorNow
                              ? "border-accent-border bg-accent-soft text-accent-text"
                              : "border-line bg-subtle text-ink-secondary"
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
                            <p className="truncate text-[12px] font-semibold text-ink">
                              {client.name}
                            </p>
                            {client.onFloorNow && (
                              <span className={ui.badgeAccent}>
                                <span className="size-1.5 rounded-full bg-accent" />
                                In gym now
                              </span>
                            )}
                            <span
                              className={
                                client.membershipStatus === "Active"
                                  ? ui.badgeNeutral
                                  : client.membershipStatus === "Unpaid"
                                    ? ui.badgeWarning
                                    : ui.badgeDanger
                              }
                            >
                              {client.membershipStatus}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-ink-secondary">
                            {client.workoutPlan
                              ? `${client.workoutPlan.title} (${client.workoutPlan.exercises.length} ex)`
                              : "No workout plan assigned yet"}
                          </p>
                          {client.nextSession && (
                            <p className="mt-1 text-[9px] font-medium text-accent-text">
                              Next: {formatShortDateTime(client.nextSession.startsAt)}
                            </p>
                          )}
                        </div>
                        <span className="mt-1 text-ink-muted">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-divider bg-subtle p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-secondary">
                            <span className="inline-flex items-center gap-1">
                              <Phone size={11} aria-hidden="true" />
                              {client.phone}
                            </span>
                            <span>{client.planName}</span>
                          </div>

                          <div>
                            <label
                              htmlFor={`plan-select-${client.id}`}
                              className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-ink-muted"
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
                              className={`${ui.select} min-h-9 px-2.5 text-[11px]`}
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
                            <ul className={`${ui.card} space-y-1.5 p-2.5`}>
                              {client.workoutPlan.exercises.map((ex, idx) => (
                                <li
                                  key={ex.id}
                                  className="flex items-center justify-between text-[10px]"
                                >
                                  <span className="truncate font-medium text-ink">
                                    {idx + 1}. {ex.name}
                                  </span>
                                  <span className="shrink-0 text-[9px] text-ink-muted">
                                    {ex.sets}×{ex.reps}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <button
                            type="button"
                            onClick={() => openNewSessionFor(client.id)}
                            className={`${ui.btnSecondary} min-h-9 w-full text-[10px]`}
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
                  <li className={`${ui.card} p-6 text-center text-[11px] text-ink-secondary`}>
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
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                    Coaching calendar
                  </p>
                  <h2
                    id="trainer-schedule-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                  >
                    Your schedule
                  </h2>
                </div>
                {scheduleSubTab === "sessions" && trainees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openNewSessionFor()}
                    className={`${ui.btnPrimary} min-h-8 px-2.5 text-[10px]`}
                  >
                    <CalendarPlus size={12} aria-hidden="true" />
                    New session
                  </button>
                )}
              </div>

              <div className={`mb-4 grid grid-cols-2 gap-1.5 ${ui.segmentedTrack}`}>
                <button
                  type="button"
                  onClick={() => setScheduleSubTab("sessions")}
                  className={`min-h-8 rounded-xl text-[10px] font-semibold transition-colors ${
                    scheduleSubTab === "sessions"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  Sessions ({upcomingSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSubTab("hours")}
                  className={`min-h-8 rounded-xl text-[10px] font-semibold transition-colors ${
                    scheduleSubTab === "hours"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  Weekly Shifts
                </button>
              </div>

              {scheduleSubTab === "sessions" ? (
                <ul className="space-y-2.5">
                  {sessions.map((session) => (
                    <li key={session.id} className={`${ui.card} p-3.5`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-ink">
                            {session.title}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium text-accent-text">
                            with {session.memberName}
                          </p>
                        </div>
                        <span
                          className={
                            session.status === "completed"
                              ? ui.badgeAccent
                              : session.status === "scheduled"
                                ? ui.badgeNeutral
                                : ui.badgeDanger
                          }
                        >
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-secondary">
                        <Clock3 size={12} aria-hidden="true" />
                        <span>
                          {formatShortDateTime(session.startsAt)} · {session.durationMinutes} min
                        </span>
                      </div>
                      {session.notes && (
                        <p className={`${ui.cardSubtle} mt-1.5 px-2.5 py-1.5 text-[9px] text-ink-secondary`}>
                          {session.notes}
                        </p>
                      )}

                      {session.status === "scheduled" && (
                        <div className="mt-3 flex gap-2 border-t border-divider pt-2.5">
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
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-accent-border bg-accent-soft text-[10px] font-semibold text-accent-text transition-colors hover:bg-hover"
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
                            className={`${ui.btnSecondary} min-h-8 px-3 text-[10px]`}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                  {sessions.length === 0 && (
                    <li className={`${ui.card} p-6 text-center text-[11px] text-ink-secondary`}>
                      No sessions scheduled yet.{" "}
                      {trainees.length > 0
                        ? "Tap “New session” above to book a client."
                        : "Sessions will appear here once clients are assigned."}
                    </li>
                  )}
                </ul>
              ) : (
                <div className={`${ui.card} space-y-3 p-4`}>
                  <p className="text-[10px] text-ink-secondary">
                    Set your weekly gym floor hours so front-desk staff and trainees know your
                    coaching availability.
                  </p>
                  <div className="space-y-2">
                    {ALL_WEEK_DAYS.map((day) => {
                      const slot = draftAvailability.find((s) => s.day === day);
                      return (
                        <div
                          key={day}
                          className="flex items-center justify-between gap-2 rounded-xl border border-line bg-subtle px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => toggleWorkDay(day)}
                            className={`min-h-7 w-14 rounded-lg text-[10px] font-semibold transition-colors ${
                              slot
                                ? "bg-accent text-on-accent"
                                : "border border-line-strong bg-surface text-ink-muted"
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
                                className="rounded-md border border-line-strong bg-input px-1.5 py-1 text-[10px] text-ink"
                              />
                              <span className="text-ink-muted">–</span>
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) =>
                                  updateWorkDayTime(day, "endTime", e.target.value)
                                }
                                className="rounded-md border border-line-strong bg-input px-1.5 py-1 text-[10px] text-ink"
                              />
                            </div>
                          ) : (
                            <span className="text-[10px] text-ink-muted">Day off</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveAvailability()}
                    className={`${ui.btnPrimary} min-h-10 w-full text-[11px]`}
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
            <section aria-labelledby="coach-profile-heading" className="space-y-3">
              <div className="mb-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Coach account
                </p>
                <h2
                  id="coach-profile-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                >
                  Profile &amp; check-ins
                </h2>
              </div>

              <div className={`${ui.card} flex items-center gap-3 p-4`}>
                <span className="grid size-12 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-[13px] font-semibold text-accent-text">
                  {trainer.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {trainer.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-accent-text">
                    {trainer.specialty}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-ink-secondary">
                    {trainer.phone}
                    {trainer.email ? ` · ${trainer.email}` : ""}
                  </p>
                </div>
              </div>

              <ThemePreferenceControl />

              <div className={`${ui.card} p-4`}>
                <div className="mb-2.5 flex items-center gap-2">
                  <Sparkles size={14} className="text-accent-text" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-ink">
                    Recent gym check-ins ({visits.length})
                  </p>
                </div>
                <ul className="divide-y divide-divider">
                  {visits.slice(0, 6).map((visit) => (
                    <li
                      key={visit.id}
                      className="flex items-center justify-between py-2 text-[10px]"
                    >
                      <div>
                        <p className="font-semibold text-ink">{visit.date}</p>
                        <p className="text-[9px] text-ink-muted">{visit.detail}</p>
                      </div>
                      <span className="font-medium text-ink-secondary">{visit.time}</span>
                    </li>
                  ))}
                  {visits.length === 0 && (
                    <li className="py-3 text-center text-[10px] text-ink-muted">
                      No floor check-ins yet. Scan the Reception QR code when you arrive!
                    </li>
                  )}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void onLogout()}
                disabled={isLoggingOut}
                className={`${ui.btnDangerOutline} min-h-11 w-full text-[11px]`}
              >
                <LogOut size={15} aria-hidden="true" />
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </button>
            </section>
          )}
        </div>

        <nav
          aria-label="Trainer app navigation"
          className={`grid grid-cols-4 px-2 ${ui.bottomNav}`}
        >
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-current={activeTab === label ? "page" : undefined}
              onClick={() => setActiveTab(label)}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] font-medium transition-colors ${
                activeTab === label ? "text-accent-text" : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </section>

      {isNewSessionOpen && (
        <div
          className={ui.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSaving) {
              setIsNewSessionOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-title"
            className={`${ui.modalCard} max-w-[380px] p-5`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Coach Schedule
                </p>
                <h2
                  id="new-session-title"
                  className="mt-0.5 text-[15px] font-semibold text-ink"
                >
                  Schedule training session
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsNewSessionOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitNewSession} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                  Trainee
                </span>
                <select
                  required
                  value={sessionMemberId}
                  onChange={(e) => setSessionMemberId(e.target.value)}
                  className={`${ui.select} text-[11px]`}
                >
                  {trainees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                  Session focus
                </span>
                <input
                  required
                  maxLength={80}
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className={`${ui.input} min-h-10 text-[11px]`}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                    Date &amp; time
                  </span>
                  <input
                    type="datetime-local"
                    required
                    value={sessionStartsAt}
                    onChange={(e) => setSessionStartsAt(e.target.value)}
                    className={`${ui.input} min-h-10 px-2 text-[10px]`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                    Duration
                  </span>
                  <select
                    value={sessionDuration}
                    onChange={(e) => setSessionDuration(Number(e.target.value))}
                    className={`${ui.select} px-2 text-[11px]`}
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                  Notes <span className="font-normal text-ink-muted">(optional)</span>
                </span>
                <input
                  maxLength={240}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="e.g. Heavy squat progression"
                  className={`${ui.input} min-h-10 text-[11px]`}
                />
              </label>

              {actionError && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-[10px] text-danger-text"
                >
                  {actionError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className={`${ui.btnPrimary} min-h-11 w-full text-[12px]`}
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
