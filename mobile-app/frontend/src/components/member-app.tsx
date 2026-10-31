"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  History,
  House,
  KeyRound,
  LoaderCircle,
  LogOut,
  Moon,
  Play,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  TrainerPortalView,
  type AvailabilitySlot,
  type FormattedVisit,
  type TraineeSummary,
  type TrainerProfileData,
  type TrainerSessionItem,
  type WorkoutPlanSummary,
} from "@/components/trainer-portal-view";
import {
  MemberOnboardingView,
  type ConnectedGymInfo,
  type GymPlanOption,
  type PendingSubscriptionInfo,
} from "@/components/member-onboarding-view";
import {
  MemberWorkoutHub,
  type ActiveRoutineSelection,
  type ActiveSessionSummary,
  type ActiveWorkoutSession,
  type ExerciseDefaultStat,
  type GymAssignedWorkoutPlan,
  type PersonalRoutine,
  type RoutineWeekday,
} from "@/components/member-workout-hub";
import {
  MemberProgressView,
  type LoggedWorkoutItem,
  type MemberProgressSummary,
} from "@/components/member-progress-view";
import type { ExerciseMediaCatalogEntry } from "@/lib/exercise-media";
import type { MemberAchievementsSummary } from "@/lib/workout-achievements";
import { LanguageSwitch } from "@/lib/i18n";
import {
  clearMobileSessionToken,
  getMobileSessionToken,
  mobileFetch,
  readMobileJson,
  setMobileSessionToken,
} from "@/lib/mobile-fetch";
import {
  RestTimerSettingsControl,
  useRestTimerSettings,
  type RestTimerSettings,
} from "@/lib/rest-timer";
import {
  DEFAULT_PROGRESSION_RULE_SETTINGS,
  type ExerciseHistorySummary,
  type ProgressionRuleSettings,
} from "@/lib/workout-progression";
import {
  ThemeHeaderSwitch,
  ThemePreferenceControl,
  ui,
} from "@/lib/theme";

type AppTab = "Pass" | "Workout" | "Progress" | "Visits" | "Profile";

const EMPTY_PROGRESS_SUMMARY: MemberProgressSummary = {
  totalWorkouts: 0,
  workoutsThisWeek: 0,
  workoutsThisMonth: 0,
  workoutsLast30Days: 0,
  currentStreakDays: 0,
  totalPersonalRecords: 0,
  totalVolumeKg: 0,
  volumeLast30DaysKg: 0,
  totalMinutesTrained: 0,
  weeklyActivity: [],
  muscleBreakdown: [],
  personalRecords: [],
};

type MemberProfile = {
  id: string;
  gymId: string;
  gymName?: string;
  gymSlug?: string;
  name: string;
  phone: string;
  email?: string;
  status: "Active" | "Expired" | "Unpaid" | "NoPlan";
  planName: string;
  startDate: string | null;
  expiryDate: string | null;
  paymentStatus: string;
  enrolledInGym?: boolean;
};

type WorkoutExercise = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  muscle: string;
};

type WorkoutPlan = {
  id: string;
  title: string;
  targetGoal: string;
  exercises: WorkoutExercise[];
};

type PendingWorkoutOffer = {
  id: string;
  title: string;
  targetGoal: string;
  assignedBy: string;
  assignedAt: string | null;
  exercises: WorkoutExercise[];
};

type UpcomingMemberSession = {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  notes: string;
  trainerName: string;
};

type PortalResponse = {
  role?: "member" | "trainer";
  enrolledInGym?: boolean;
  sessionToken?: string;
  pendingRequest?: PendingSubscriptionInfo | null;
  member?: MemberProfile;
  trainer?: {
    id: string;
    name: string;
    specialty: string;
    phone?: string;
    availability?: AvailabilitySlot[];
  } | null;
  workoutPlan?: WorkoutPlan | null;
  pendingWorkoutPlan?: PendingWorkoutOffer | null;
  upcomingSessions?: UpcomingMemberSession[];
  visits?: Array<{ id: string; checkInTime: string; source: string }>;
  error?: string;
};

type TrainerPortalResponse = {
  role?: "trainer";
  trainer?: TrainerProfileData;
  trainees?: TraineeSummary[];
  sessions?: TrainerSessionItem[];
  workoutPlans?: WorkoutPlanSummary[];
  visits?: Array<{ id: string; checkInTime: string; source: string }>;
  error?: string;
};

function formatMemberDate(value: string | null) {
  if (!value || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatSessionDateTime(iso: string) {
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

function formatVisit(value: string, id: string, source: string): FormattedVisit {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const dateLabel = isSameDay(date, today)
    ? "Today"
    : isSameDay(date, yesterday)
      ? "Yesterday"
      : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
  return {
    id,
    date: dateLabel,
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date),
    detail:
      source === "Member self-scan" || source === "Trainer self-scan"
        ? "Gym floor · QR self-scan"
        : "Gym floor · Front desk",
  };
}

const HOME_WEEKDAYS: RoutineWeekday[] = [
  "Sat",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
];

const HOME_WEEKDAY_FULL: Record<RoutineWeekday, string> = {
  Sat: "Saturday",
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

const JS_DAY_TO_HOME_WEEKDAY: RoutineWeekday[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function estimateWorkoutMinutes(
  exercises: Array<{ sets: number | string; restSeconds?: number; rest?: string }>,
): number {
  if (exercises.length === 0) return 0;
  let totalSeconds = 0;
  for (const ex of exercises) {
    const setsNum =
      typeof ex.sets === "number"
        ? Math.max(1, ex.sets)
        : Math.max(1, Number.parseInt(String(ex.sets), 10) || 3);
    const restSec =
      typeof ex.restSeconds === "number" && ex.restSeconds > 0
        ? ex.restSeconds
        : ex.rest
          ? Math.max(30, Number.parseInt(ex.rest, 10) || 60)
          : 60;
    totalSeconds += setsNum * (42 + restSec) + 45;
  }
  return Math.max(15, Math.round(totalSeconds / 60));
}

function formatRecentWorkoutDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(dt, now)) return "Today";
  if (sameDay(dt, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(dt);
}

function normalizeHomeRoutineDays(routine: PersonalRoutine) {
  if (routine.daySchedule && routine.daySchedule.length > 0) {
    const byDay = new Map(routine.daySchedule.map((d) => [d.day, d]));
    return HOME_WEEKDAYS.map((day) => {
      const found = byDay.get(day);
      if (!found || found.isRestDay || found.exercises.length === 0) {
        return {
          day,
          isRestDay: true,
          focusLabel: "Rest",
          exercises: [] as PersonalRoutine["exercises"],
        };
      }
      return {
        day,
        isRestDay: false,
        focusLabel: found.focusLabel || routine.targetGoal || "Training",
        exercises: found.exercises,
      };
    });
  }
  const scheduled = new Set<RoutineWeekday>(routine.scheduledDays ?? []);
  return HOME_WEEKDAYS.map((day) => {
    const isTraining =
      (scheduled.size === 0 ? true : scheduled.has(day)) &&
      routine.exercises.length > 0;
    return {
      day,
      isRestDay: !isTraining,
      focusLabel: isTraining ? routine.targetGoal || "Training" : "Rest",
      exercises: isTraining ? routine.exercises : [],
    };
  });
}

function AppBottomNav({
  activeTab,
  onSelect,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
}) {
  const tabs: Array<{ id: AppTab; title: string; icon: typeof QrCode }> = [
    { id: "Pass", title: "Home", icon: House },
    { id: "Workout", title: "Workout", icon: Dumbbell },
    { id: "Progress", title: "Progress", icon: TrendingUp },
    { id: "Visits", title: "Visits", icon: History },
    { id: "Profile", title: "Profile", icon: UserRound },
  ];

  return (
    <nav
      aria-label="Member app navigation"
      className={`grid grid-cols-5 px-1.5 ${ui.bottomNav}`}
    >
      {tabs.map(({ id, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={activeTab === id ? "page" : undefined}
          onClick={() => onSelect(id)}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] font-medium transition-colors ${
            activeTab === id ? "text-accent-text" : "text-ink-muted hover:text-ink-secondary"
          }`}
        >
          <Icon size={18} aria-hidden="true" />
          {title}
        </button>
      ))}
    </nav>
  );
}

function MobileAuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerRole, setRegisterRole] = useState<"member" | "trainer">("member");

  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [trainerCode, setTrainerCode] = useState("");
  const [gymCode, setGymCode] = useState("");
  const [showOptionalMemberFields, setShowOptionalMemberFields] = useState(false);
  const [showLoginGymCode, setShowLoginGymCode] = useState(false);
  const [password, setPassword] = useState("");

  const [verifiedInviteGym, setVerifiedInviteGym] = useState("");
  const [inviteCodeError, setInviteCodeError] = useState("");
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live verification & auto-fill when a Trainer enters an Admin invite code
  useEffect(() => {
    if (mode !== "register" || registerRole !== "trainer") {
      setVerifiedInviteGym("");
      setInviteCodeError("");
      return;
    }
    const trimmed = trainerCode.trim().toUpperCase();
    if (trimmed.length < 6) {
      setVerifiedInviteGym("");
      setInviteCodeError("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsCheckingCode(true);
      try {
        const res = await mobileFetch(
          `/api/auth/trainer-code?code=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" },
        );
        const body = await readMobileJson<{
          valid?: boolean;
          error?: string;
          gymName?: string;
          presetName?: string;
          presetSpecialty?: string;
          presetPhone?: string;
        }>(res, "Unable to verify invite code right now.");
        if (cancelled) return;
        if (res.ok && body.valid) {
          setVerifiedInviteGym(body.gymName ?? "Verified Gym");
          setInviteCodeError("");
          if (body.presetName) {
            setFullName((curr) => curr || body.presetName!);
          }
          if (body.presetSpecialty) {
            setSpecialty((curr) => curr || body.presetSpecialty!);
          }
          if (body.presetPhone) {
            setPhone((curr) => curr || body.presetPhone!);
          }
        } else {
          setVerifiedInviteGym("");
          setInviteCodeError(
            body.error ?? "Invalid or already-used trainer invite code.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setVerifiedInviteGym("");
          setInviteCodeError(
            err instanceof Error ? err.message : "Unable to verify invite code.",
          );
        }
      } finally {
        if (!cancelled) setIsCheckingCode(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, registerRole, trainerCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    clearMobileSessionToken();
    try {
      const registering = mode === "register";
      const response = await mobileFetch(
        `/api/auth/member/${registering ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            registering
              ? registerRole === "trainer"
                ? {
                    accountType: "trainer",
                    trainerCode: trainerCode.trim(),
                    fullName,
                    phone,
                    specialty: specialty.trim() || "Personal Training & Fitness",
                    email: email.trim() || undefined,
                    password,
                  }
                : {
                    accountType: "member",
                    fullName,
                    phone,
                    email: email.trim() || undefined,
                    password,
                    gymCode: gymCode.trim() || undefined,
                  }
              : {
                  identifier,
                  password,
                  gymCode: gymCode.trim() || undefined,
                },
          ),
        },
      );
      const data = await readMobileJson<{
        error?: string;
        sessionToken?: string;
      }>(response, "Unable to authenticate.");
      if (!response.ok) throw new Error(data.error ?? "Unable to authenticate.");
      if (data.sessionToken) {
        setMobileSessionToken(data.sessionToken);
      }
      const loaded = await onAuthenticated();
      if (!loaded) {
        throw new Error(
          "Signed in, but your profile session could not be loaded. Please try again.",
        );
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to authenticate.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClass = ui.input;

  return (
    <main className={ui.pageCanvas}>
      <section
        aria-label="GymOS mobile authentication"
        className={ui.authFrame}
      >
        <header className={ui.appHeader}>
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-accent text-[14px] font-bold text-on-accent"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <p
                data-no-translate="true"
                className="text-[13px] font-semibold tracking-[-0.03em] text-ink"
              >
                Gym<span className="text-accent-text">OS</span>
              </p>
              <p className="text-[9px] text-ink-muted">MEMBERS &amp; TRAINERS</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeHeaderSwitch />
            <LanguageSwitch />
          </div>
        </header>

        <div className="flex flex-1 items-center overflow-y-auto px-5 py-6">
          <div className="w-full">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                GymOS Mobile
              </p>
              <h1 className="mt-1 text-[23px] font-semibold tracking-[-0.04em] text-ink">
                {mode === "login"
                  ? "Welcome back"
                  : registerRole === "trainer"
                    ? "Register as a trainer"
                    : "Quick member signup"}
              </h1>
              <p className="mt-1.5 text-[11px] leading-4 text-ink-secondary">
                {mode === "login"
                  ? "Sign in as a gym member or coach to scan in and view your schedule."
                  : registerRole === "trainer"
                    ? "Enter the one-time invite code provided by your gym administrator."
                    : "Create your account in seconds — or enter the phone registered at reception to link your plan."}
              </p>
            </div>

            {mode === "register" && (
              <div
                role="tablist"
                aria-label="Account role"
                className={`mb-4 grid grid-cols-2 gap-1.5 ${ui.segmentedTrack}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={registerRole === "member"}
                  onClick={() => {
                    setRegisterRole("member");
                    setError("");
                  }}
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                    registerRole === "member"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  <UserRound size={13} aria-hidden="true" />
                  Member
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={registerRole === "trainer"}
                  onClick={() => {
                    setRegisterRole("trainer");
                    setError("");
                  }}
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
                    registerRole === "trainer"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  <ShieldCheck size={13} aria-hidden="true" />
                  Trainer
                </button>
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === "register" && registerRole === "trainer" && (
                <div>
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-[10px] font-medium text-ink-secondary">
                      <span>Admin trainer invite code</span>
                      {isCheckingCode && (
                        <span className="text-[9px] text-ink-muted">Checking…</span>
                      )}
                    </span>
                    <div className="relative">
                      <KeyRound
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
                      />
                      <input
                        className={`${fieldClass} ps-9 font-mono uppercase tracking-wider`}
                        required
                        value={trainerCode}
                        onChange={(event) =>
                          setTrainerCode(event.target.value.toUpperCase())
                        }
                        placeholder="TRN-XXXX-XXXX"
                      />
                    </div>
                  </label>
                  {verifiedInviteGym && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent-text">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      Verified code · {verifiedInviteGym}
                    </p>
                  )}
                  {!verifiedInviteGym && !isCheckingCode && inviteCodeError && (
                    <p
                      role="alert"
                      className="mt-1.5 rounded-md border border-danger-border bg-danger-soft px-2 py-1 text-[10px] font-medium text-danger-text"
                    >
                      {inviteCodeError}
                    </p>
                  )}
                </div>
              )}

              {mode === "register" && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                      Full name
                    </span>
                    <input
                      className={fieldClass}
                      autoComplete="name"
                      required
                      maxLength={80}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Your full name"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                      Phone number
                    </span>
                    <input
                      className={fieldClass}
                      type="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+20 100 123 4567"
                    />
                  </label>

                  {registerRole === "trainer" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                          Coaching specialty
                        </span>
                        <input
                          className={fieldClass}
                          required
                          maxLength={100}
                          value={specialty}
                          onChange={(event) => setSpecialty(event.target.value)}
                          placeholder="e.g. Strength & Conditioning"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                          Email <span className="font-normal text-ink-muted">(optional)</span>
                        </span>
                        <input
                          className={fieldClass}
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="coach@example.com"
                        />
                      </label>
                    </>
                  )}
                </>
              )}

              {mode === "login" && (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                    Phone or email
                  </span>
                  <input
                    className={fieldClass}
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="Phone number or email"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                  Password
                </span>
                <input
                  className={fieldClass}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 6 : 1}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                />
              </label>

              {mode === "register" && registerRole === "member" && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowOptionalMemberFields((v) => !v)}
                    className="text-[10px] font-medium text-ink-secondary underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    {showOptionalMemberFields
                      ? "Hide optional email"
                      : "+ Add email address (optional)"}
                  </button>
                  {showOptionalMemberFields && (
                    <div className={`${ui.cardSubtle} mt-2.5 p-3`}>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-medium text-ink-secondary">
                          Email <span className="font-normal text-ink-muted">(optional)</span>
                        </span>
                        <input
                          className={fieldClass}
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {mode === "login" && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowLoginGymCode((v) => !v)}
                    className="text-[10px] font-medium text-ink-secondary underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    {showLoginGymCode ? "Hide gym code" : "Enter a specific gym code (optional)"}
                  </button>
                  {showLoginGymCode && (
                    <label className="mt-2 block">
                      <input
                        className={fieldClass}
                        value={gymCode}
                        onChange={(event) => setGymCode(event.target.value)}
                        placeholder="e.g. gymos-elite-new-cairo"
                      />
                    </label>
                  )}
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-[10px] text-danger-text"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`${ui.btnPrimary} min-h-12 w-full text-[12px]`}
              >
                {isSubmitting && (
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                )}
                {isSubmitting
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in"
                    : registerRole === "trainer"
                      ? "Verify Code & Register as Trainer"
                      : "Create Member Account"}
              </button>
            </form>

            <p className="mt-5 text-center text-[10px] text-ink-secondary">
              {mode === "login" ? "New to the app?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="font-semibold text-accent-text hover:underline"
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export function MemberApp() {
  const [activeTab, setActiveTab] = useState<AppTab>("Pass");
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "unauthenticated">(
    "checking",
  );
  const [accountRole, setAccountRole] = useState<"member" | "trainer">("member");
  const { hydrateFromServer: hydrateRestSettings } = useRestTimerSettings();
  const [serverRestSettings, setServerRestSettings] = useState<RestTimerSettings | null>(
    null,
  );

  // Member portal state
  const [member, setMember] = useState<MemberProfile | null>(null);

  useEffect(() => {
    hydrateRestSettings(member?.id ?? null, serverRestSettings);
  }, [hydrateRestSettings, member?.id, serverRestSettings]);
  const [trainer, setTrainer] = useState<{
    id: string;
    name: string;
    specialty: string;
    phone?: string;
    availability?: AvailabilitySlot[];
  } | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [pendingWorkoutPlan, setPendingWorkoutPlan] = useState<PendingWorkoutOffer | null>(null);
  const [isRespondingWorkout, setIsRespondingWorkout] = useState(false);
  const [workoutDecisionNotice, setWorkoutDecisionNotice] = useState("");
  const [upcomingMemberSessions, setUpcomingMemberSessions] = useState<
    UpcomingMemberSession[]
  >([]);
  const [recentVisits, setRecentVisits] = useState<FormattedVisit[]>([]);
  const [personalRoutines, setPersonalRoutines] = useState<PersonalRoutine[]>([]);
  const [archivedRoutines, setArchivedRoutines] = useState<PersonalRoutine[]>([]);
  const [gymCatalogPlans, setGymCatalogPlans] = useState<GymAssignedWorkoutPlan[]>([]);
  const [activeRoutineSelection, setActiveRoutineSelection] =
    useState<ActiveRoutineSelection>({
      mode: "none",
      personalRoutineId: null,
      gymPlanId: null,
    });
  const [serverActiveSession, setServerActiveSession] =
    useState<ActiveWorkoutSession | null>(null);
  const [activeSessionSummary, setActiveSessionSummary] =
    useState<ActiveSessionSummary | null>(null);
  const [workoutEntryNonce, setWorkoutEntryNonce] = useState(0);
  const [libraryEntryNonce, setLibraryEntryNonce] = useState(0);
  const [freeWorkoutNonce, setFreeWorkoutNonce] = useState(0);
  const [progressInitialSection, setProgressInitialSection] = useState<
    "progress" | "history" | "achievements"
  >("progress");
  const [progressSectionNonce, setProgressSectionNonce] = useState(0);
  const [greetingText, setGreetingText] = useState("Welcome back");

  useEffect(() => {
    const hr = new Date().getHours();
    if (hr >= 5 && hr < 12) {
      setGreetingText("Good morning");
    } else if (hr >= 12 && hr < 18) {
      setGreetingText("Good afternoon");
    } else {
      setGreetingText("Good evening");
    }
  }, []);
  const [recentWorkoutLogs, setRecentWorkoutLogs] = useState<LoggedWorkoutItem[]>([]);
  const [exerciseDefaults, setExerciseDefaults] = useState<
    Record<string, ExerciseDefaultStat>
  >({});
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistorySummary[]>([]);
  const [exerciseMediaCatalog, setExerciseMediaCatalog] = useState<
    Record<string, ExerciseMediaCatalogEntry>
  >({});
  const [memberAchievements, setMemberAchievements] =
    useState<MemberAchievementsSummary | null>(null);
  const [progressionSettings, setProgressionSettings] =
    useState<ProgressionRuleSettings>(DEFAULT_PROGRESSION_RULE_SETTINGS);
  const [workoutProgress, setWorkoutProgress] = useState<MemberProgressSummary>(
    EMPTY_PROGRESS_SUMMARY,
  );

  const homeDashboard = useMemo(() => {
    const todayWeekday: RoutineWeekday =
      JS_DAY_TO_HOME_WEEKDAY[new Date().getDay()] ?? "Sat";

    const activePersonal =
      (activeRoutineSelection.personalRoutineId
        ? personalRoutines.find(
            (r) => r.id === activeRoutineSelection.personalRoutineId,
          )
        : null) ??
      personalRoutines.find((r) => Boolean(r.isActive)) ??
      personalRoutines[0] ??
      null;

    const allGymPlans: GymAssignedWorkoutPlan[] = gymCatalogPlans.length
      ? gymCatalogPlans
      : workoutPlan
        ? [{ ...workoutPlan, isAssignedByGym: true }]
        : [];

    const selectedGym =
      activeRoutineSelection.mode === "gym"
        ? allGymPlans.find((p) => p.id === activeRoutineSelection.gymPlanId) ??
          (workoutPlan ? { ...workoutPlan, isAssignedByGym: true } : null)
        : null;

    const personalWeekDays = activePersonal
      ? normalizeHomeRoutineDays(activePersonal)
      : [];
    const todayPersonalEntry =
      personalWeekDays.find((d) => d.day === todayWeekday) ?? null;

    let nextTrainingLabel = "";
    if (personalWeekDays.length > 0) {
      const todayIdx = HOME_WEEKDAYS.indexOf(todayWeekday);
      for (let offset = 1; offset <= 7; offset += 1) {
        const candDay = HOME_WEEKDAYS[(todayIdx + offset) % 7];
        const candObj = personalWeekDays.find((d) => d.day === candDay);
        if (candObj && !candObj.isRestDay && candObj.exercises.length > 0) {
          nextTrainingLabel = `${HOME_WEEKDAY_FULL[candDay]} · ${candObj.focusLabel}`;
          break;
        }
      }
    }

    type TodayCardState =
      | {
          kind: "scheduled";
          workoutTitle: string;
          routineName: string;
          exerciseCount: number;
          estimatedMinutes: number;
        }
      | {
          kind: "rest_day";
          routineName: string;
          nextTrainingLabel: string;
        }
      | {
          kind: "unscheduled";
        };

    let todayWorkout: TodayCardState = { kind: "unscheduled" };

    if (selectedGym && activeRoutineSelection.mode === "gym") {
      todayWorkout = {
        kind: "scheduled",
        workoutTitle: selectedGym.title,
        routineName: "Gym Routine",
        exerciseCount: selectedGym.exercises.length,
        estimatedMinutes: estimateWorkoutMinutes(selectedGym.exercises),
      };
    } else if (activePersonal) {
      if (
        todayPersonalEntry &&
        !todayPersonalEntry.isRestDay &&
        todayPersonalEntry.exercises.length > 0
      ) {
        todayWorkout = {
          kind: "scheduled",
          workoutTitle:
            todayPersonalEntry.focusLabel &&
            todayPersonalEntry.focusLabel !== activePersonal.title
              ? `${activePersonal.title} · ${todayPersonalEntry.focusLabel}`
              : activePersonal.title,
          routineName: activePersonal.title,
          exerciseCount: todayPersonalEntry.exercises.length,
          estimatedMinutes: estimateWorkoutMinutes(todayPersonalEntry.exercises),
        };
      } else {
        todayWorkout = {
          kind: "rest_day",
          routineName: activePersonal.title,
          nextTrainingLabel,
        };
      }
    }

    const now = new Date();
    const fallbackThisMonth = recentWorkoutLogs.filter((log) => {
      const dt = new Date(log.completedAt);
      return (
        !Number.isNaN(dt.getTime()) &&
        dt.getFullYear() === now.getFullYear() &&
        dt.getMonth() === now.getMonth() &&
        log.totalSetsCompleted > 0
      );
    }).length;

    const workoutsThisMonth =
      typeof workoutProgress.workoutsThisMonth === "number"
        ? workoutProgress.workoutsThisMonth
        : fallbackThisMonth;

    const totalPrs =
      typeof workoutProgress.totalPersonalRecords === "number"
        ? workoutProgress.totalPersonalRecords
        : workoutProgress.personalRecords.length;

    const latestWorkout =
      recentWorkoutLogs.find((l) => l.totalSetsCompleted > 0) ?? null;

    return {
      todayWeekday,
      activePersonal,
      selectedGym,
      personalWeekDays,
      todayWorkout,
      workoutsThisMonth,
      totalPrs,
      latestWorkout,
    };
  }, [
    activeRoutineSelection.gymPlanId,
    activeRoutineSelection.mode,
    activeRoutineSelection.personalRoutineId,
    gymCatalogPlans,
    personalRoutines,
    recentWorkoutLogs,
    workoutPlan,
    workoutProgress.personalRecords.length,
    workoutProgress.totalPersonalRecords,
    workoutProgress.workoutsThisMonth,
  ]);
  const [pendingRequest, setPendingRequest] = useState<PendingSubscriptionInfo | null>(null);
  const [connectedGym, setConnectedGym] = useState<ConnectedGymInfo | null>(null);

  // Trainer portal state
  const [trainerProfile, setTrainerProfile] = useState<TrainerProfileData | null>(null);
  const [trainees, setTrainees] = useState<TraineeSummary[]>([]);
  const [trainerSessions, setTrainerSessions] = useState<TrainerSessionItem[]>([]);
  const [gymWorkoutPlans, setGymWorkoutPlans] = useState<WorkoutPlanSummary[]>([]);
  const [trainerVisits, setTrainerVisits] = useState<FormattedVisit[]>([]);

  const [dataError, setDataError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Shared QR scanner state (used for joining a gym OR floor check-in)
  const [scannerPurpose, setScannerPurpose] = useState<"checkin" | "join-gym">("checkin");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraNotice, setCameraNotice] = useState("");
  const [manualQrInput, setManualQrInput] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [lastCheckInTime, setLastCheckInTime] = useState("");

  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
    isScanning?: boolean;
  } | null>(null);
  const scanLockedRef = useRef(false);

  const loadTrainerPortal = useCallback(async (): Promise<boolean> => {
    const response = await mobileFetch("/api/trainer-portal", {
      cache: "no-store",
    });
    if (response.status === 401) {
      clearMobileSessionToken();
      setTrainerProfile(null);
      setAuthStatus("unauthenticated");
      return false;
    }
    const data = await readMobileJson<TrainerPortalResponse>(
      response,
      "Unable to load your trainer profile.",
    );
    if (!response.ok || !data.trainer) {
      throw new Error(data.error ?? "Unable to load your trainer profile.");
    }
    setAccountRole("trainer");
    setTrainerProfile(data.trainer);
    setTrainees(data.trainees ?? []);
    setTrainerSessions(data.sessions ?? []);
    setGymWorkoutPlans(data.workoutPlans ?? []);
    setTrainerVisits(
      (data.visits ?? []).map((v) => formatVisit(v.checkInTime, v.id, v.source)),
    );
    setAuthStatus("authenticated");
    return true;
  }, []);

  const loadMemberWorkouts = useCallback(async () => {
    try {
      const response = await mobileFetch("/api/member-workouts", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await readMobileJson<{
        personalRoutines?: PersonalRoutine[];
        archivedRoutines?: PersonalRoutine[];
        gymCatalogPlans?: GymAssignedWorkoutPlan[];
        activeSelection?: ActiveRoutineSelection;
        restSettings?: RestTimerSettings;
        progressionSettings?: ProgressionRuleSettings;
        activeWorkoutSession?: ActiveWorkoutSession | null;
        recentLogs?: LoggedWorkoutItem[];
        exerciseDefaults?: Record<string, ExerciseDefaultStat>;
        exerciseHistory?: ExerciseHistorySummary[];
        exerciseMediaCatalog?: Record<string, ExerciseMediaCatalogEntry>;
        achievements?: MemberAchievementsSummary;
        progress?: MemberProgressSummary;
      }>(response, "Unable to load workout routines.");
      setPersonalRoutines(payload.personalRoutines ?? []);
      setArchivedRoutines(payload.archivedRoutines ?? []);
      setGymCatalogPlans(payload.gymCatalogPlans ?? []);
      setActiveRoutineSelection(
        payload.activeSelection ?? {
          mode: "none",
          personalRoutineId: null,
          gymPlanId: null,
        },
      );
      if (payload.restSettings) {
        setServerRestSettings(payload.restSettings);
      }
      if (payload.progressionSettings) {
        setProgressionSettings(payload.progressionSettings);
      }
      setServerActiveSession(payload.activeWorkoutSession ?? null);
      setRecentWorkoutLogs(payload.recentLogs ?? []);
      setExerciseDefaults(payload.exerciseDefaults ?? {});
      setExerciseHistory(payload.exerciseHistory ?? []);
      setExerciseMediaCatalog(payload.exerciseMediaCatalog ?? {});
      setMemberAchievements(payload.achievements ?? null);
      setWorkoutProgress(payload.progress ?? EMPTY_PROGRESS_SUMMARY);
    } catch {
      // Non-blocking: digital pass & check-in remain functional if workout analytics fail temporarily.
    }
  }, []);

  const loadMobilePortal = useCallback(async (): Promise<boolean> => {
    setDataError("");
    try {
      const response = await mobileFetch("/api/member-portal", {
        cache: "no-store",
      });
      if (response.status === 401) {
        clearMobileSessionToken();
        setMember(null);
        setTrainerProfile(null);
        setTrainer(null);
        setWorkoutPlan(null);
        setPendingWorkoutPlan(null);
        setRecentVisits([]);
        setPersonalRoutines([]);
        setRecentWorkoutLogs([]);
        setExerciseDefaults({});
        setExerciseHistory([]);
        setProgressionSettings(DEFAULT_PROGRESSION_RULE_SETTINGS);
        setWorkoutProgress(EMPTY_PROGRESS_SUMMARY);
        setAuthStatus("unauthenticated");
        return false;
      }

      const data = await readMobileJson<PortalResponse>(
        response,
        "Unable to load your member profile.",
      );
      if (data.role === "trainer") {
        return await loadTrainerPortal();
      }

      if (!response.ok || !data.member) {
        throw new Error(data.error ?? "Unable to load your member profile.");
      }

      if (data.sessionToken) {
        setMobileSessionToken(data.sessionToken);
      }

      setAccountRole("member");
      const isEnrolled = Boolean(data.enrolledInGym ?? data.member.enrolledInGym);
      setMember({ ...data.member, enrolledInGym: isEnrolled });
      setPendingRequest(data.pendingRequest ?? null);
      if (isEnrolled) {
        setConnectedGym(null);
      }
      setTrainer(data.trainer ?? null);
      setWorkoutPlan(data.workoutPlan ?? null);
      setPendingWorkoutPlan(data.pendingWorkoutPlan ?? null);
      setUpcomingMemberSessions(data.upcomingSessions ?? []);
      setRecentVisits(
        (data.visits ?? []).map((visit) =>
          formatVisit(visit.checkInTime, visit.id, visit.source),
        ),
      );
      if (isEnrolled) {
        void loadMemberWorkouts();
      }
      setAuthStatus("authenticated");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load your profile.";
      setDataError(message);
      setAuthStatus((prev) => {
        if (prev !== "checking") return prev;
        return getMobileSessionToken() ? "checking" : "unauthenticated";
      });
      return false;
    }
  }, [loadMemberWorkouts, loadTrainerPortal]);

  useEffect(() => {
    void loadMobilePortal();
  }, [loadMobilePortal]);

  // Live poll while a new member is waiting for gym staff to click Accept on their subscription
  const isAwaitingStaffAccept =
    authStatus === "authenticated" &&
    accountRole === "member" &&
    !member?.enrolledInGym &&
    Boolean(pendingRequest);

  useEffect(() => {
    if (!isAwaitingStaffAccept) return;
    const timer = window.setInterval(() => {
      void loadMobilePortal();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isAwaitingStaffAccept, loadMobilePortal]);

  // Background refresh for enrolled members so staff-assigned workout routine prompts appear live
  const isEnrolledMemberView =
    authStatus === "authenticated" &&
    accountRole === "member" &&
    Boolean(member?.enrolledInGym);

  useEffect(() => {
    if (!isEnrolledMemberView) return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadMobilePortal();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isEnrolledMemberView, loadMobilePortal]);

  async function respondToPendingWorkout(decision: "accept" | "decline") {
    if (!pendingWorkoutPlan || isRespondingWorkout) return;
    setIsRespondingWorkout(true);
    setDataError("");
    setWorkoutDecisionNotice("");
    try {
      const response = await mobileFetch("/api/member-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond-workout", decision }),
      });
      if (response.status === 401) {
        clearMobileSessionToken();
        setAuthStatus("unauthenticated");
        return;
      }
      const data = await readMobileJson<{ error?: string; status?: string }>(
        response,
        "Unable to update workout routine.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update workout routine.");
      }
      const acceptedTitle = pendingWorkoutPlan.title;
      setPendingWorkoutPlan(null);
      await loadMobilePortal();
      if (decision === "accept") {
        setWorkoutDecisionNotice(`Workout routine updated to ${acceptedTitle}.`);
        setActiveTab("Workout");
      } else {
        setWorkoutDecisionNotice("Workout routine change declined.");
      }
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "Unable to update workout routine.",
      );
    } finally {
      setIsRespondingWorkout(false);
    }
  }

  const stopScanner = useCallback(async () => {
    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    setCameraActive(false);
    if (!activeScanner) return;
    try {
      if (activeScanner.isScanning !== false) {
        await activeScanner.stop();
      }
    } catch {
      // Camera stream may already be stopped.
    }
    try {
      activeScanner.clear();
    } catch {
      // Element may already be unmounted.
    }
  }, []);

  const submitQrCheckIn = useCallback(
    async (qrPayload: string) => {
      const cleanedPayload = qrPayload.trim();
      if (!cleanedPayload) {
        setCheckInError("Scan a valid GymOS reception QR code first.");
        return;
      }

      if (scannerPurpose === "join-gym") {
        setIsCheckingIn(true);
        setCheckInError("");
        try {
          await stopScanner();
          const response = await mobileFetch(
            `/api/member-subscriptions?qr=${encodeURIComponent(cleanedPayload)}`,
            { cache: "no-store" },
          );
          if (response.status === 401) {
            clearMobileSessionToken();
            setIsScannerOpen(false);
            setAuthStatus("unauthenticated");
            return;
          }
          const data = await readMobileJson<{
            error?: string;
            gym?: {
              id: string;
              name: string;
              slug: string;
              address: string;
              phone: string;
            };
            plans?: GymPlanOption[];
            paymentMethods?: Array<"Cash" | "Card" | "Instapay">;
          }>(
            response,
            "Invalid QR code. Scan the QR code displayed at your gym's reception desk.",
          );
          if (!response.ok || !data.gym) {
            throw new Error(
              data.error ?? "Invalid QR code. Scan the QR code displayed at your gym's reception desk.",
            );
          }
          setConnectedGym({
            ...data.gym,
            plans: data.plans ?? [],
            paymentMethods: data.paymentMethods ?? ["Cash", "Card", "Instapay"],
          });
          setIsScannerOpen(false);
        } catch (error) {
          scanLockedRef.current = false;
          setCheckInError(
            error instanceof Error ? error.message : "Could not connect to gym QR code.",
          );
        } finally {
          setIsCheckingIn(false);
        }
        return;
      }

      const isTrainerMode = accountRole === "trainer";
      if (!isTrainerMode && !member) return;
      if (isTrainerMode && !trainerProfile) return;

      setIsCheckingIn(true);
      setCheckInError("");
      try {
        await stopScanner();
        const response = await mobileFetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isTrainerMode
              ? {
                  action: "checkin",
                  personType: "trainer",
                  trainerId: trainerProfile!.id,
                  source: "Trainer self-scan",
                  gymQrPayload: cleanedPayload,
                }
              : {
                  action: "checkin",
                  personType: "member",
                  memberId: member!.id,
                  source: "Member self-scan",
                  gymQrPayload: cleanedPayload,
                },
          ),
        });
        if (response.status === 401) {
          clearMobileSessionToken();
          setIsScannerOpen(false);
          setAuthStatus("unauthenticated");
          return;
        }
        const data = await readMobileJson<{
          error?: string;
          checkIn?: { id: string; time: string; checkInTime: string; source: string };
        }>(response, "Check-in could not be completed.");
        if (!response.ok || !data.checkIn) {
          throw new Error(data.error ?? "Check-in could not be completed.");
        }
        const visit = formatVisit(
          data.checkIn.checkInTime,
          data.checkIn.id,
          data.checkIn.source,
        );
        setLastCheckInTime(data.checkIn.time);
        if (isTrainerMode) {
          setTrainerVisits((curr) =>
            [visit, ...curr.filter((item) => item.id !== visit.id)].slice(0, 20),
          );
          setTrainerProfile((curr) => (curr ? { ...curr, checkedInNow: true } : curr));
        } else {
          setRecentVisits((curr) =>
            [visit, ...curr.filter((item) => item.id !== visit.id)].slice(0, 20),
          );
        }
        setCheckInSuccess(true);
      } catch (error) {
        scanLockedRef.current = false;
        setCheckInError(
          error instanceof Error ? error.message : "Check-in could not be completed.",
        );
      } finally {
        setIsCheckingIn(false);
      }
    },
    [accountRole, member, scannerPurpose, stopScanner, trainerProfile],
  );

  useEffect(() => {
    if (!isScannerOpen || checkInSuccess) {
      void stopScanner();
      return;
    }

    let cancelled = false;
    scanLockedRef.current = false;
    setCameraNotice("");
    setIsCameraStarting(true);

    async function initCamera() {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not available in this browser view.");
        }
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const readerElement = document.getElementById("gymos-qr-reader");
        if (!readerElement) return;

        const scanner = new Html5Qrcode("gymos-qr-reader");
        scannerRef.current = scanner;

        const onDecode = (decodedText: string) => {
          if (scanLockedRef.current || cancelled) return;
          scanLockedRef.current = true;
          void submitQrCheckIn(decodedText);
        };

        try {
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 200, height: 200 } },
            onDecode,
            () => {},
          );
        } catch {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            throw new Error("No camera was detected on this device.");
          }
          await scanner.start(
            cameras[0].id,
            { fps: 10, qrbox: { width: 200, height: 200 } },
            onDecode,
            () => {},
          );
        }

        if (!cancelled) {
          setCameraActive(true);
        } else {
          await stopScanner();
        }
      } catch {
        if (!cancelled) {
          setCameraActive(false);
          setCameraNotice(
            "Camera access is unavailable. Allow camera permissions or enter the gym code from reception below.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsCameraStarting(false);
        }
      }
    }

    void initCamera();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [checkInSuccess, isScannerOpen, scannerPurpose, stopScanner, submitQrCheckIn]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await mobileFetch("/api/auth/member/logout", {
        method: "POST",
      });
    } finally {
      clearMobileSessionToken();
      setIsLoggingOut(false);
      setMember(null);
      setTrainerProfile(null);
      setTrainer(null);
      setWorkoutPlan(null);
      setUpcomingMemberSessions([]);
      setRecentVisits([]);
      setPersonalRoutines([]);
      setArchivedRoutines([]);
      setGymCatalogPlans([]);
      setActiveRoutineSelection({ mode: "none", personalRoutineId: null, gymPlanId: null });
      setServerActiveSession(null);
      setActiveSessionSummary(null);
      setWorkoutEntryNonce(0);
      setLibraryEntryNonce(0);
      setRecentWorkoutLogs([]);
      setExerciseDefaults({});
      setExerciseHistory([]);
      setExerciseMediaCatalog({});
      setMemberAchievements(null);
      setWorkoutProgress(EMPTY_PROGRESS_SUMMARY);
      setTrainees([]);
      setTrainerSessions([]);
      setTrainerVisits([]);
      setPendingRequest(null);
      setConnectedGym(null);
      setActiveTab("Pass");
      setAuthStatus("unauthenticated");
    }
  }

  function openQrScanner() {
    setScannerPurpose("checkin");
    setIsScannerOpen(true);
    setCheckInError("");
    setCheckInSuccess(false);
    setManualQrInput("");
  }

  function openJoinGymScanner() {
    setScannerPurpose("join-gym");
    setIsScannerOpen(true);
    setCheckInError("");
    setCheckInSuccess(false);
    setManualQrInput("");
  }

  if (authStatus === "checking") {
    return (
      <main className={ui.pageCanvas}>
        <section
          aria-label="Loading GymOS mobile app"
          className={`${ui.appFrame} items-center justify-center gap-3 px-6 text-center`}
        >
          {dataError ? (
            <div className={`${ui.card} w-full max-w-[310px] space-y-3 p-5`}>
              <p className="text-[13px] font-semibold text-ink">
                Connection interrupted
              </p>
              <p role="alert" className="text-[11px] leading-4 text-ink-secondary">
                {dataError}
              </p>
              <button
                type="button"
                onClick={() => void loadMobilePortal()}
                className={`${ui.btnPrimary} min-h-10 w-full px-4 text-[11px]`}
              >
                <RotateCcw size={13} aria-hidden="true" />
                Retry connection
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className={`${ui.btnSecondary} min-h-9 w-full px-4 text-[11px]`}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <LoaderCircle size={28} className="animate-spin text-accent-text" aria-hidden="true" />
              <p className="text-[12px] font-medium text-ink-secondary">
                Loading your GymOS pass…
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <MobileAuthScreen
        onAuthenticated={loadMobilePortal}
      />
    );
  }

  const activeGymName =
    accountRole === "trainer"
      ? trainerProfile?.gymName ?? "Gym floor"
      : member?.gymName ?? "Gym floor";
  const activeFirstName =
    accountRole === "trainer"
      ? trainerProfile?.name.split(" ")[0] ?? "Coach"
      : member?.name.split(" ")[0] ?? "member";

  const qrScannerModal = isScannerOpen && (
    <div className={ui.modalBackdrop}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        className={`${ui.modalCard} max-w-[390px] overflow-hidden`}
      >
        <header className="flex items-center justify-between border-b border-divider px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {scannerPurpose === "join-gym" ? "Connect to Gym" : "GymOS Check-in"}
            </p>
            <h2 id="scanner-title" className="mt-0.5 text-[14px] font-semibold text-ink">
              {checkInSuccess
                ? "Check-in confirmed"
                : scannerPurpose === "join-gym"
                  ? "Scan gym QR code to view plans"
                  : "Scan gym QR code"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close scanner"
            onClick={() => setIsScannerOpen(false)}
            className={`${ui.btnGhost} size-9`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="p-5">
          {checkInSuccess ? (
            <div className="py-3 text-center">
              <span className="check-in-success-mark mx-auto grid size-18 place-items-center rounded-full border border-accent-border bg-accent-soft text-accent-text">
                <CheckCircle2 size={38} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="mt-4 text-[18px] font-semibold text-ink">
                You&apos;re checked in, {activeFirstName}!
              </p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                {lastCheckInTime} · {activeGymName}
              </p>

              {accountRole === "member" ? (
                <div className="mt-4 rounded-2xl border border-accent-border bg-accent-soft p-4 text-start">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
                      <Dumbbell size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">
                        Ready to train?
                      </p>
                      <p className="truncate text-[10px] text-ink-secondary">
                        {activeSessionSummary
                          ? `In progress: ${activeSessionSummary.title}`
                          : "Jump straight into today's scheduled workout"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsScannerOpen(false);
                      setActiveTab("Workout");
                      setWorkoutEntryNonce((n) => n + 1);
                    }}
                    className={`${ui.btnPrimary} mt-3.5 min-h-11 w-full text-[12px]`}
                  >
                    <Play size={14} aria-hidden="true" />
                    {activeSessionSummary ? "Resume Workout" : "Start Workout"}
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-accent-border bg-accent-soft px-4 py-3 text-left">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">
                    Coach floor check-in · Verified
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-accent-text">
                    {trainerProfile?.specialty ?? "Active Trainer"}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className={`${
                  accountRole === "member" ? ui.btnSecondary : ui.btnPrimary
                } mt-3 min-h-10 w-full text-[11px]`}
              >
                {accountRole === "member" ? "Not now" : "Done"}
              </button>
            </div>
          ) : (
            <>
              <div className="relative mx-auto aspect-square w-full max-w-[270px] overflow-hidden rounded-2xl border border-line-strong bg-camera-well">
                <div
                  id="gymos-qr-reader"
                  className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
                />
                {!cameraActive && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div
                      className="absolute inset-0 opacity-25"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(92,211,170,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(92,211,170,.18) 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                      }}
                    />
                    <div className="relative grid size-[68%] place-items-center rounded-[28px] border-2 border-camera-reticle">
                      <span className="absolute -left-1 -top-1 size-5 rounded-tl-md border-l-[3px] border-t-[3px] border-white" />
                      <span className="absolute -right-1 -top-1 size-5 rounded-tr-md border-r-[3px] border-t-[3px] border-white" />
                      <span className="absolute -bottom-1 -left-1 size-5 rounded-bl-md border-b-[3px] border-l-[3px] border-white" />
                      <span className="absolute -bottom-1 -right-1 size-5 rounded-br-md border-b-[3px] border-r-[3px] border-white" />
                      {isCameraStarting ? (
                        <LoaderCircle
                          size={34}
                          className="animate-spin text-camera-reticle"
                          aria-hidden="true"
                        />
                      ) : (
                        <Camera size={34} className="text-camera-reticle" aria-hidden="true" />
                      )}
                      <span className="scanner-sweep absolute left-2 right-2 h-0.5 bg-camera-reticle" />
                    </div>
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-[9px] font-medium text-white/90">
                  {isCameraStarting
                    ? "Starting camera…"
                    : cameraActive
                      ? "Camera live · Point at Reception QR"
                      : scannerPurpose === "join-gym"
                        ? "Scan Reception QR"
                        : activeGymName}
                </span>
              </div>

              {cameraNotice && (
                <p className="mt-3 text-center text-[10px] leading-4 text-ink-secondary">
                  {cameraNotice}
                </p>
              )}

              {checkInError && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-[11px] text-danger-text"
                >
                  {checkInError}
                </p>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitQrCheckIn(manualQrInput);
                }}
                className="mt-3.5 flex gap-2"
              >
                <input
                  value={manualQrInput}
                  onChange={(event) => setManualQrInput(event.target.value)}
                  placeholder="Enter reception gym code…"
                  aria-label="Gym code"
                  className={`${ui.inputCompact} min-h-10 min-w-0 flex-1 rounded-xl px-3`}
                />
                <button
                  type="submit"
                  disabled={isCheckingIn || !manualQrInput.trim()}
                  className={`${ui.btnPrimary} min-h-10 shrink-0 px-3.5 text-[11px]`}
                >
                  {isCheckingIn
                    ? "Verifying…"
                    : scannerPurpose === "join-gym"
                      ? "Connect"
                      : "Check in"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );

  // ---------------------------------------------------------
  // TRAINER MOBILE VIEW
  // ---------------------------------------------------------
  if (accountRole === "trainer" && trainerProfile) {
    return (
      <>
        <TrainerPortalView
          trainer={trainerProfile}
          trainees={trainees}
          sessions={trainerSessions}
          workoutPlans={gymWorkoutPlans}
          visits={trainerVisits}
          dataError={dataError}
          isLoggingOut={isLoggingOut}
          onOpenScanner={openQrScanner}
          onRefresh={loadTrainerPortal}
          onLogout={handleLogout}
        />
        {qrScannerModal}
      </>
    );
  }

  // ---------------------------------------------------------
  // NEW / UNAFFILIATED MEMBER ONBOARDING (No gym / no plan yet!)
  // ---------------------------------------------------------
  if (accountRole === "member" && member && !member.enrolledInGym) {
    return (
      <>
        <MemberOnboardingView
          memberName={member.name}
          memberPhone={member.phone}
          memberEmail={member.email}
          connectedGym={connectedGym}
          pendingRequest={pendingRequest}
          isLoggingOut={isLoggingOut}
          onOpenJoinScanner={openJoinGymScanner}
          onClearConnectedGym={() => setConnectedGym(null)}
          onRefreshPortal={loadMobilePortal}
          onLogout={handleLogout}
        />
        {qrScannerModal}
      </>
    );
  }

  // ---------------------------------------------------------
  // MEMBER MOBILE VIEW (Enrolled in a gym plan)
  // ---------------------------------------------------------
  return (
    <main className={ui.pageCanvas}>
      <section aria-label="GymOS member app" className={ui.appFrame}>
        <header className={ui.appHeader}>
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-accent text-[14px] font-bold text-on-accent"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <p
                data-no-translate="true"
                className="text-[13px] font-semibold tracking-[-0.03em] text-ink"
              >
                Gym<span className="text-accent-text">OS</span>
              </p>
              <p className="max-w-[140px] truncate text-[9px] uppercase tracking-wide text-ink-muted">
                {member?.gymName ?? "Member App"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeHeaderSwitch />
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => void handleLogout()}
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
              <p className="text-[11px] text-ink-secondary">{greetingText}</p>
              <h1 className="mt-0.5 truncate text-[21px] font-semibold tracking-[-0.045em] text-ink">
                {member?.name ?? "Member"}
              </h1>
            </div>
            <span
              className={`shrink-0 ${
                member?.status === "Active"
                  ? ui.badgeAccent
                  : member?.status === "Unpaid"
                    ? ui.badgeWarning
                    : ui.badgeDanger
              }`}
            >
              {member?.status ?? "Unknown"}
            </span>
          </div>

          {dataError && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[10px] text-danger-text"
            >
              {dataError}
            </p>
          )}

          {workoutDecisionNotice && !pendingWorkoutPlan && (
            <div
              role="status"
              className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-[11px] font-medium text-accent-text"
            >
              <span>{workoutDecisionNotice}</span>
              <button
                type="button"
                onClick={() => setWorkoutDecisionNotice("")}
                className="text-[10px] font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {pendingWorkoutPlan && (
            <section
              role="region"
              aria-label="Workout routine verification"
              className="mb-4 rounded-2xl border border-accent-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                  <Dumbbell size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-text">
                    Workout routine verification
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-ink">
                    Do you want to accept this workout routine change?
                  </p>
                  <p className="mt-1 text-[11px] text-ink-secondary">
                    <span className="font-semibold text-ink">
                      {pendingWorkoutPlan.title}
                    </span>{" "}
                    · {pendingWorkoutPlan.targetGoal} ({pendingWorkoutPlan.exercises.length}{" "}
                    {pendingWorkoutPlan.exercises.length === 1 ? "exercise" : "exercises"})
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">
                    Sent by {pendingWorkoutPlan.assignedBy}
                  </p>
                </div>
              </div>

              {pendingWorkoutPlan.exercises.length > 0 && (
                <div className={`${ui.cardSubtle} mt-3 p-2.5`}>
                  <ul className="space-y-1">
                    {pendingWorkoutPlan.exercises.slice(0, 4).map((exercise) => (
                      <li
                        key={exercise.id}
                        className="flex items-center justify-between gap-2 text-[10px] text-ink-secondary"
                      >
                        <span className="truncate font-medium text-ink">{exercise.name}</span>
                        <span className="shrink-0 text-ink-muted">
                          {exercise.sets} × {exercise.reps}
                        </span>
                      </li>
                    ))}
                    {pendingWorkoutPlan.exercises.length > 4 && (
                      <li className="text-[10px] text-ink-muted">
                        +{pendingWorkoutPlan.exercises.length - 4} more exercises
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isRespondingWorkout}
                  onClick={() => void respondToPendingWorkout("decline")}
                  className={`${ui.btnSecondary} min-h-10 px-3 text-[11px]`}
                >
                  <X size={14} aria-hidden="true" />
                  Decline
                </button>
                <button
                  type="button"
                  disabled={isRespondingWorkout}
                  onClick={() => void respondToPendingWorkout("accept")}
                  className={`${ui.btnPrimary} min-h-10 px-3 text-[11px]`}
                >
                  <Check size={14} aria-hidden="true" />
                  {isRespondingWorkout ? "Saving…" : "Accept Routine"}
                </button>
              </div>
            </section>
          )}

          {activeTab === "Pass" && (
            <div className="space-y-4">
              {/* 1. TODAY'S WORKOUT / REST DAY HERO (Prioritized Start Workout) */}
              <section
                aria-label="Today's workout"
                className={`${ui.cardElevated} p-4`}
              >
                {activeSessionSummary ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={ui.badgeAccent}>
                        <Play size={11} aria-hidden="true" />
                        Workout in progress
                      </span>
                      <span className="text-[10px] font-semibold text-ink-secondary">
                        {`${activeSessionSummary.completedSets}/${activeSessionSummary.totalSets} sets done`}
                      </span>
                    </div>
                    <h2 className="mt-2 truncate text-[18px] font-semibold tracking-[-0.03em] text-ink">
                      {activeSessionSummary.title}
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-secondary">
                      Your active workout session is saved and ready to continue.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("Workout")}
                      className={`${ui.btnPrimary} mt-3.5 flex min-h-12 w-full rounded-xl px-4 text-[13px]`}
                    >
                      <Play size={16} aria-hidden="true" />
                      Resume Workout
                    </button>
                  </div>
                ) : homeDashboard.todayWorkout.kind === "scheduled" ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={ui.badgeAccent}>
                        <Dumbbell size={11} aria-hidden="true" />
                        Today&apos;s Workout
                      </span>
                      <span className="text-[10px] font-semibold text-ink-muted">
                        {HOME_WEEKDAY_FULL[homeDashboard.todayWeekday]}
                      </span>
                    </div>
                    <h2 className="mt-2 truncate text-[18px] font-semibold tracking-[-0.03em] text-ink">
                      {homeDashboard.todayWorkout.workoutTitle}
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-secondary">
                      {`${homeDashboard.todayWorkout.exerciseCount} exercises · ~${homeDashboard.todayWorkout.estimatedMinutes} min`}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setWorkoutEntryNonce((n) => n + 1);
                        setActiveTab("Workout");
                      }}
                      className={`${ui.btnPrimary} mt-3.5 flex min-h-12 w-full rounded-xl px-4 text-[13px]`}
                    >
                      <Play size={16} aria-hidden="true" />
                      Start Workout
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFreeWorkoutNonce((n) => n + 1);
                        setActiveTab("Workout");
                      }}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 py-1 text-[10px] font-semibold text-ink-secondary hover:text-ink"
                    >
                      <Zap size={12} className="text-accent-text" aria-hidden="true" />
                      Start Free Workout
                    </button>
                  </div>
                ) : homeDashboard.todayWorkout.kind === "rest_day" ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={ui.badgeNeutral}>
                        <Moon size={11} aria-hidden="true" />
                        Rest Day
                      </span>
                      <span className="text-[10px] font-semibold text-ink-muted">
                        {HOME_WEEKDAY_FULL[homeDashboard.todayWeekday]}
                      </span>
                    </div>
                    <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-ink">
                      Scheduled rest &amp; recovery day
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-secondary">
                      {homeDashboard.todayWorkout.nextTrainingLabel
                        ? `Next workout: ${homeDashboard.todayWorkout.nextTrainingLabel}`
                        : `Active routine: ${homeDashboard.todayWorkout.routineName}`}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFreeWorkoutNonce((n) => n + 1);
                          setActiveTab("Workout");
                        }}
                        className={`${ui.btnSecondary} flex min-h-10 rounded-xl px-3 text-[11px]`}
                      >
                        <Zap size={13} className="text-accent-text" aria-hidden="true" />
                        Start Free Workout
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("Workout")}
                        className={`${ui.btnSecondary} flex min-h-10 rounded-xl px-3 text-[11px]`}
                      >
                        Open Workouts
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={ui.badgeNeutral}>
                        <Dumbbell size={11} aria-hidden="true" />
                        Today&apos;s Workout
                      </span>
                      <span className="text-[10px] font-semibold text-ink-muted">
                        {HOME_WEEKDAY_FULL[homeDashboard.todayWeekday]}
                      </span>
                    </div>
                    <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-ink">
                      No workout scheduled today
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-secondary">
                      Create a personal routine or start a free workout anytime.
                    </p>
                    <div className="mt-3.5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFreeWorkoutNonce((n) => n + 1);
                          setActiveTab("Workout");
                        }}
                        className={`${ui.btnPrimary} flex min-h-11 rounded-xl px-3 text-[11px]`}
                      >
                        <Play size={14} aria-hidden="true" />
                        Start Free Workout
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("Workout")}
                        className={`${ui.btnSecondary} flex min-h-11 rounded-xl px-3 text-[11px]`}
                      >
                        My Routines
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 2. QUICK ACCESS (My Routines, Workout History, Exercise Library, Progress) */}
              <section aria-label="Quick access" className="space-y-2">
                <p className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Quick Access
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("Workout")}
                    className={`${ui.cardInteractive} flex items-center gap-2.5 p-3 text-start`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                      <Dumbbell size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        My Routines
                      </span>
                      <span className="block truncate text-[9px] text-ink-secondary">
                        {`${personalRoutines.length} saved`}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProgressInitialSection("history");
                      setProgressSectionNonce((n) => n + 1);
                      setActiveTab("Progress");
                    }}
                    className={`${ui.cardInteractive} flex items-center gap-2.5 p-3 text-start`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-subtle text-ink-secondary">
                      <History size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        Workout History
                      </span>
                      <span className="block truncate text-[9px] text-ink-secondary">
                        {`${workoutProgress.totalWorkouts} sessions`}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLibraryEntryNonce((n) => n + 1);
                      setActiveTab("Workout");
                    }}
                    className={`${ui.cardInteractive} flex items-center gap-2.5 p-3 text-start`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-subtle text-ink-secondary">
                      <BookOpen size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        Exercise Library
                      </span>
                      <span className="block truncate text-[9px] text-ink-secondary">
                        Demos &amp; form cues
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProgressInitialSection("progress");
                      setProgressSectionNonce((n) => n + 1);
                      setActiveTab("Progress");
                    }}
                    className={`${ui.cardInteractive} flex items-center gap-2.5 p-3 text-start`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                      <TrendingUp size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        Progress
                      </span>
                      <span className="block truncate text-[9px] text-ink-secondary">
                        Charts &amp; PRs
                      </span>
                    </span>
                  </button>
                </div>
              </section>

              {/* 3. PROGRESS SNAPSHOT (Real member stats: Month, Streak, Total, PRs) */}
              <section
                aria-label="Progress summary"
                className={`${ui.card} p-4`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-ink">Progress</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProgressInitialSection("achievements");
                        setProgressSectionNonce((n) => n + 1);
                        setActiveTab("Progress");
                      }}
                      className="text-[10px] font-semibold text-ink-secondary hover:text-ink"
                    >
                      Achievements
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProgressInitialSection("progress");
                        setProgressSectionNonce((n) => n + 1);
                        setActiveTab("Progress");
                      }}
                      className="text-[10px] font-semibold text-accent-text hover:underline"
                    >
                      View all
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                    <p
                      data-no-translate="true"
                      className="text-[16px] font-bold tracking-[-0.03em] text-ink"
                    >
                      {homeDashboard.workoutsThisMonth}
                    </p>
                    <p className="mt-0.5 text-[9px] text-ink-secondary">This month</p>
                  </div>
                  <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                    <p
                      data-no-translate="true"
                      className="text-[16px] font-bold tracking-[-0.03em] text-accent-text"
                    >
                      {`${workoutProgress.currentStreakDays}d`}
                    </p>
                    <p className="mt-0.5 text-[9px] text-ink-secondary">Streak</p>
                  </div>
                  <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                    <p
                      data-no-translate="true"
                      className="text-[16px] font-bold tracking-[-0.03em] text-ink"
                    >
                      {workoutProgress.totalWorkouts}
                    </p>
                    <p className="mt-0.5 text-[9px] text-ink-secondary">Workouts</p>
                  </div>
                  <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                    <p
                      data-no-translate="true"
                      className="text-[16px] font-bold tracking-[-0.03em] text-accent-text"
                    >
                      {homeDashboard.totalPrs}
                    </p>
                    <p className="mt-0.5 text-[9px] text-ink-secondary">PRs</p>
                  </div>
                </div>
              </section>

              {/* 4. RECENT ACTIVITY (Most recent completed workout) */}
              <section
                aria-label="Recent activity"
                className={`${ui.card} p-4`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-ink">
                    Recent Activity
                  </p>
                  {homeDashboard.latestWorkout && (
                    <button
                      type="button"
                      onClick={() => {
                        setProgressInitialSection("history");
                        setProgressSectionNonce((n) => n + 1);
                        setActiveTab("Progress");
                      }}
                      className="text-[10px] font-semibold text-accent-text hover:underline"
                    >
                      History
                    </button>
                  )}
                </div>

                {homeDashboard.latestWorkout ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProgressInitialSection("history");
                      setProgressSectionNonce((n) => n + 1);
                      setActiveTab("Progress");
                    }}
                    className={`${ui.cardSubtle} mt-2.5 flex w-full items-center justify-between gap-3 p-3 text-start transition-colors hover:bg-hover`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {homeDashboard.latestWorkout.routineTitle}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">
                        {`${formatRecentWorkoutDate(homeDashboard.latestWorkout.completedAt)} · ${Math.max(1, Math.round(homeDashboard.latestWorkout.durationSeconds / 60))} min · ${homeDashboard.latestWorkout.totalSetsCompleted} sets`}
                      </p>
                    </div>
                    <span
                      data-no-translate="true"
                      className="shrink-0 text-[11px] font-semibold text-accent-text"
                    >
                      {homeDashboard.latestWorkout.totalVolumeKg > 0
                        ? `${homeDashboard.latestWorkout.totalVolumeKg.toLocaleString()} kg`
                        : `${homeDashboard.latestWorkout.totalSetsCompleted} sets`}
                    </span>
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-ink-secondary">
                    No completed workouts yet — finish your first session to see it here.
                  </p>
                )}
              </section>

              {/* 5. ACTIVE ROUTINE & WEEKLY SCHEDULE */}
              <section
                aria-label="Active routine schedule"
                className={`${ui.card} p-4`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      Active Routine
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-ink">
                      {homeDashboard.selectedGym &&
                      activeRoutineSelection.mode === "gym"
                        ? homeDashboard.selectedGym.title
                        : homeDashboard.activePersonal
                          ? homeDashboard.activePersonal.title
                          : "No routine selected"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("Workout")}
                    className="shrink-0 text-[10px] font-semibold text-accent-text hover:underline"
                  >
                    Manage
                  </button>
                </div>

                {homeDashboard.activePersonal &&
                activeRoutineSelection.mode !== "gym" ? (
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {homeDashboard.personalWeekDays.map((d) => {
                      const isToday = d.day === homeDashboard.todayWeekday;
                      return (
                        <div
                          key={d.day}
                          className={`flex flex-col items-center rounded-xl border py-1.5 text-center ${
                            d.isRestDay
                              ? "border-line bg-subtle opacity-65"
                              : isToday
                                ? "border-accent bg-accent-soft text-accent-text"
                                : "border-line-strong bg-surface text-ink"
                          }`}
                        >
                          <span className="text-[9px] font-semibold">{d.day}</span>
                          <span className="mt-0.5 text-[8px] text-ink-muted">
                            {d.isRestDay ? "Rest" : `${d.exercises.length}ex`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : homeDashboard.selectedGym &&
                  activeRoutineSelection.mode === "gym" ? (
                  <p className="mt-2 text-[10px] text-ink-secondary">
                    {`Gym plan · ${homeDashboard.selectedGym.exercises.length} exercises`}
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] text-ink-secondary">
                    Build a custom weekly split or follow a gym workout plan.
                  </p>
                )}
              </section>

              {/* 6. GYM CHECK-IN & DIGITAL PASS */}
              <section
                aria-labelledby="digital-pass-heading"
                className={`${ui.card} p-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                      Digital member pass
                    </p>
                    <h2
                      id="digital-pass-heading"
                      className="mt-0.5 truncate text-[14px] font-semibold text-ink"
                    >
                      {member?.planName ?? "No active plan"}
                    </h2>
                    <p className="mt-0.5 text-[10px] text-ink-secondary">
                      {member?.expiryDate
                        ? `Valid through ${formatMemberDate(member.expiryDate)}`
                        : "Visit the front desk to activate a membership plan."}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                    {member?.id.slice(-8).toUpperCase() ?? "—"}
                  </span>
                </div>

                {member?.status === "Unpaid" && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-soft p-3"
                  >
                    <Wallet
                      size={15}
                      className="mt-0.5 shrink-0 text-warning-text"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-warning-text">
                        Payment needs attention
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-ink-secondary">
                        Latest payment status: {member.paymentStatus}. Please check with the front
                        desk.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={openQrScanner}
                  className={`${ui.btnSecondary} mt-3.5 flex min-h-11 w-full rounded-xl px-4 text-[12px]`}
                >
                  <ScanLine size={17} className="text-accent-text" aria-hidden="true" />
                  Scan Gym QR Code
                </button>
              </section>

              {upcomingMemberSessions.length > 0 && (
                <section
                  aria-label="Upcoming coaching session"
                  className={`${ui.card} p-3.5`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                      <CalendarDays size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                        Upcoming session with {upcomingMemberSessions[0].trainerName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-ink">
                        {upcomingMemberSessions[0].title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">
                        {formatSessionDateTime(upcomingMemberSessions[0].startsAt)} ·{" "}
                        {upcomingMemberSessions[0].durationMinutes} min
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          <div className={activeTab === "Workout" ? "block" : "hidden"}>
            <MemberWorkoutHub
              memberId={member?.id ?? ""}
              trainer={
                trainer ? { name: trainer.name, specialty: trainer.specialty } : null
              }
              gymWorkoutPlan={workoutPlan}
              gymCatalogPlans={gymCatalogPlans}
              archivedRoutines={archivedRoutines}
              activeSelection={activeRoutineSelection}
              serverActiveSession={serverActiveSession}
              workoutEntryNonce={workoutEntryNonce}
              libraryEntryNonce={libraryEntryNonce}
              freeWorkoutNonce={freeWorkoutNonce}
              upcomingSessions={upcomingMemberSessions}
              personalRoutines={personalRoutines}
              exerciseDefaults={exerciseDefaults}
              exerciseHistory={exerciseHistory}
              exerciseMediaCatalog={exerciseMediaCatalog}
              progressionSettings={progressionSettings}
              onWorkoutDataChanged={loadMemberWorkouts}
              onNavigateToProgress={() => {
                setProgressInitialSection("progress");
                setProgressSectionNonce((n) => n + 1);
                setActiveTab("Progress");
              }}
              onNavigateToAchievements={() => {
                setProgressInitialSection("achievements");
                setProgressSectionNonce((n) => n + 1);
                setActiveTab("Progress");
              }}
              onActiveSessionPresenceChange={setActiveSessionSummary}
              onSessionUnauthorized={() => {
                clearMobileSessionToken();
                setAuthStatus("unauthenticated");
              }}
            />
          </div>

          {activeTab === "Progress" && (
            <MemberProgressView
              progress={workoutProgress}
              recentLogs={recentWorkoutLogs}
              exerciseHistory={exerciseHistory}
              achievements={memberAchievements}
              progressionSettings={progressionSettings}
              initialSection={progressInitialSection}
              sectionNonce={progressSectionNonce}
              onWorkoutDataChanged={loadMemberWorkouts}
              onNavigateToWorkouts={() => setActiveTab("Workout")}
              onSessionUnauthorized={() => {
                clearMobileSessionToken();
                setAuthStatus("unauthenticated");
              }}
            />
          )}

          {activeTab === "Visits" && (
            <section aria-labelledby="visits-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Your activity
                </p>
                <h2
                  id="visits-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                >
                  Attendance history
                </h2>
                <p className="mt-1 text-[10px] text-ink-secondary">
                  Your recent visits to the club
                </p>
              </div>
              <div className={`${ui.card} overflow-hidden`}>
                <ul className="divide-y divide-divider">
                  {recentVisits.map((visit, index) => (
                    <li key={visit.id} className="flex items-center gap-3 p-3.5">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
                          index === 0
                            ? "border-accent-border bg-accent-soft text-accent-text"
                            : "border-line bg-subtle text-ink-secondary"
                        }`}
                      >
                        <Clock3 size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-ink">{visit.date}</p>
                        <p className="mt-0.5 text-[9px] text-ink-muted">{visit.detail}</p>
                      </div>
                      <span className="text-[10px] font-medium text-ink-secondary">
                        {visit.time}
                      </span>
                    </li>
                  ))}
                  {recentVisits.length === 0 && (
                    <li className="p-6 text-center text-[10px] text-ink-secondary">
                      No visits recorded yet. Scan the reception QR code when you arrive!
                    </li>
                  )}
                </ul>
              </div>
              <p className="mt-3 text-center text-[9px] text-ink-muted">
                {recentVisits.length} recent {recentVisits.length === 1 ? "visit" : "visits"}
              </p>
            </section>
          )}

          {activeTab === "Profile" && (
            <section aria-labelledby="profile-heading" className="space-y-3">
              <div className="mb-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Your account
                </p>
                <h2
                  id="profile-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-ink"
                >
                  Profile &amp; membership
                </h2>
              </div>

              <div className={`${ui.card} flex items-center gap-3 p-4`}>
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-[13px] font-semibold text-accent-text"
                  aria-hidden="true"
                >
                  {member?.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() ?? "GY"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {member?.name ?? "Member"}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-ink-secondary">
                    {member?.phone ?? ""}
                    {member?.email ? ` · ${member.email}` : ""}
                  </p>
                  {member?.gymName && (
                    <p className="mt-0.5 truncate text-[9px] text-ink-muted">
                      {member.gymName}
                    </p>
                  )}
                </div>
              </div>

              <div className={`${ui.card} space-y-3 p-4`}>
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-ink-muted">SUBSCRIPTION</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-ink">
                      {member?.planName ?? "No active plan"} · {member?.status ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-divider pt-3">
                  <span className="grid size-8 place-items-center rounded-lg border border-line bg-subtle text-ink-secondary">
                    <CreditCard size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-ink-muted">VALID THROUGH</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-ink">
                      {formatMemberDate(member?.startDate ?? null)} –{" "}
                      {formatMemberDate(member?.expiryDate ?? null)}
                    </p>
                  </div>
                </div>
                {member?.status === "Unpaid" && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 border-t border-divider pt-3"
                  >
                    <Wallet
                      size={15}
                      className="mt-0.5 shrink-0 text-warning-text"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-warning-text">
                        Payment status · {member.paymentStatus}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-4 text-ink-secondary">
                        Contact the front desk to settle your balance before check-in.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className={`${ui.card} p-4`}>
                <div className="flex items-center gap-2">
                  <Dumbbell size={15} className="text-accent-text" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-ink">Assigned trainer</p>
                </div>
                <p className="mt-2 text-[11px] text-ink-secondary">
                  {trainer ? `${trainer.name} · ${trainer.specialty}` : "No trainer assigned"}
                </p>
                {trainer?.phone && (
                  <p className="mt-0.5 text-[10px] text-ink-muted">Phone: {trainer.phone}</p>
                )}
                <p className="mt-1 text-[10px] text-ink-muted">
                  Current plan: {workoutPlan?.title ?? "None"}
                </p>
              </div>

              {/* Application Settings: Workout Rest Timer & Appearance */}
              <RestTimerSettingsControl />
              <ThemePreferenceControl />

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className={`${ui.btnDangerOutline} min-h-11 w-full text-[11px]`}
              >
                <LogOut size={15} aria-hidden="true" />
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </button>
            </section>
          )}
        </div>

        <AppBottomNav activeTab={activeTab} onSelect={setActiveTab} />
      </section>

      {qrScannerModal}
    </main>
  );
}
