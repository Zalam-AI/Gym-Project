"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  CreditCard,
  Dumbbell,
  History,
  KeyRound,
  LoaderCircle,
  LogOut,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
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
  clearMobileSessionToken,
  mobileFetch,
  safeLocalGet,
  safeLocalRemove,
  safeLocalSet,
  setMobileSessionToken,
} from "@/lib/mobile-fetch";

type AppTab = "Pass" | "Workout" | "Visits" | "Profile";

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

function AppBottomNav({
  activeTab,
  onSelect,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
}) {
  const tabs: Array<{ label: AppTab; icon: typeof QrCode }> = [
    { label: "Pass", icon: QrCode },
    { label: "Workout", icon: Dumbbell },
    { label: "Visits", icon: History },
    { label: "Profile", icon: UserRound },
  ];

  return (
    <nav
      aria-label="Member app navigation"
      className="grid grid-cols-4 border-t border-[#edf0f2] bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2"
    >
      {tabs.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          aria-current={activeTab === label ? "page" : undefined}
          onClick={() => onSelect(label)}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] font-medium ${
            activeTab === label ? "text-[#278968]" : "text-[#98a2ad]"
          }`}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
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
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live verification & auto-fill when a Trainer enters an Admin invite code
  useEffect(() => {
    if (mode !== "register" || registerRole !== "trainer") {
      setVerifiedInviteGym("");
      return;
    }
    const trimmed = trainerCode.trim().toUpperCase();
    if (trimmed.length < 8) {
      setVerifiedInviteGym("");
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
        const body = (await res.json()) as {
          valid?: boolean;
          gymName?: string;
          presetName?: string;
          presetSpecialty?: string;
          presetPhone?: string;
        };
        if (cancelled) return;
        if (res.ok && body.valid) {
          setVerifiedInviteGym(body.gymName ?? "Verified Gym");
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
        }
      } catch {
        if (!cancelled) setVerifiedInviteGym("");
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
      const data = (await response.json()) as {
        error?: string;
        sessionToken?: string;
      };
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

  const fieldClass =
    "min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[12px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2f5] px-0 py-0 sm:px-6 sm:py-8">
      <section
        aria-label="GymOS mobile authentication"
        className="flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-[#f7f8fa] shadow-[0_20px_50px_rgba(24,33,47,0.12)] sm:min-h-[760px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-[#dfe5ea]"
      >
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#edf0f2] bg-white px-5 pt-[max(env(safe-area-inset-top),8px)]">
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-[#45b58b] text-[14px] font-bold text-white"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <p className="text-[13px] font-semibold tracking-[-0.03em] text-[#243242]">
                Gym<span className="text-[#2d9d78]">OS</span>
              </p>
              <p className="text-[9px] text-[#8993a0]">MEMBERS &amp; TRAINERS</p>
            </div>
          </div>
        </header>

        <div className="flex flex-1 items-center overflow-y-auto px-5 py-6">
          <div className="w-full">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">
                GymOS Mobile
              </p>
              <h1 className="mt-1 text-[23px] font-semibold tracking-[-0.04em] text-[#243242]">
                {mode === "login"
                  ? "Welcome back"
                  : registerRole === "trainer"
                    ? "Register as a trainer"
                    : "Quick member signup"}
              </h1>
              <p className="mt-1.5 text-[11px] leading-4 text-[#87909d]">
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
                className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#e8edf0] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={registerRole === "member"}
                  onClick={() => {
                    setRegisterRole("member");
                    setError("");
                  }}
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    registerRole === "member"
                      ? "bg-white text-[#243242] shadow-sm"
                      : "text-[#6f7b89]"
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
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    registerRole === "trainer"
                      ? "bg-white text-[#243242] shadow-sm"
                      : "text-[#6f7b89]"
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
                    <span className="mb-1 flex items-center justify-between text-[10px] font-medium text-[#526071]">
                      <span>Admin trainer invite code</span>
                      {isCheckingCode && (
                        <span className="text-[9px] text-[#8993a0]">Checking…</span>
                      )}
                    </span>
                    <div className="relative">
                      <KeyRound
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74808e]"
                      />
                      <input
                        className={`${fieldClass} pl-9 font-mono uppercase tracking-wider`}
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
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[#eaf6f0] px-2 py-1 text-[10px] font-semibold text-[#278968]">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      Verified code · {verifiedInviteGym}
                    </p>
                  )}
                </div>
              )}

              {mode === "register" && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-[#526071]">
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
                    <span className="mb-1 block text-[10px] font-medium text-[#526071]">
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
                        <span className="mb-1 block text-[10px] font-medium text-[#526071]">
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
                        <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                          Email <span className="font-normal text-[#9aa3ae]">(optional)</span>
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
                  <span className="mb-1 block text-[10px] font-medium text-[#526071]">
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
                <span className="mb-1 block text-[10px] font-medium text-[#526071]">
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
                    className="text-[10px] font-medium text-[#6f7b89] underline decoration-dotted underline-offset-2 hover:text-[#243242]"
                  >
                    {showOptionalMemberFields
                      ? "Hide optional email"
                      : "+ Add email address (optional)"}
                  </button>
                  {showOptionalMemberFields && (
                    <div className="mt-2.5 rounded-xl border border-[#e6ebee] bg-white/70 p-3">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-medium text-[#526071]">
                          Email <span className="font-normal text-[#9aa3ae]">(optional)</span>
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
                    className="text-[10px] font-medium text-[#6f7b89] underline decoration-dotted underline-offset-2 hover:text-[#243242]"
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
                  className="rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-3 py-2.5 text-[10px] text-[#a9433b]"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
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

            <p className="mt-5 text-center text-[10px] text-[#778391]">
              {mode === "login" ? "New to the app?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="font-semibold text-[#278968] hover:text-[#207858]"
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

  // Member portal state
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [trainer, setTrainer] = useState<{
    id: string;
    name: string;
    specialty: string;
    phone?: string;
    availability?: AvailabilitySlot[];
  } | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [upcomingMemberSessions, setUpcomingMemberSessions] = useState<
    UpcomingMemberSession[]
  >([]);
  const [recentVisits, setRecentVisits] = useState<FormattedVisit[]>([]);
  const [completedSets, setCompletedSets] = useState<string[]>([]);
  const [progressMemberId, setProgressMemberId] = useState("");
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
    const data = (await response.json()) as TrainerPortalResponse;
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
        setRecentVisits([]);
        setAuthStatus("unauthenticated");
        return false;
      }

      const data = (await response.json()) as PortalResponse;
      if (data.role === "trainer") {
        return await loadTrainerPortal();
      }

      if (!response.ok || !data.member) {
        throw new Error(data.error ?? "Unable to load your member profile.");
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
      setUpcomingMemberSessions(data.upcomingSessions ?? []);
      setRecentVisits(
        (data.visits ?? []).map((visit) =>
          formatVisit(visit.checkInTime, visit.id, visit.source),
        ),
      );
      setAuthStatus("authenticated");
      return true;
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "Unable to load your profile.",
      );
      setAuthStatus((prev) => (prev === "checking" ? "unauthenticated" : prev));
      return false;
    }
  }, [loadTrainerPortal]);

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

  const currentMemberId = member?.id ?? "";

  useEffect(() => {
    if (!currentMemberId) {
      setCompletedSets([]);
      setProgressMemberId("");
      return;
    }
    try {
      const savedProgress = safeLocalGet(
        `gymos-workout-progress:${currentMemberId}`,
      );
      setCompletedSets(savedProgress ? (JSON.parse(savedProgress) as string[]) : []);
    } catch {
      safeLocalRemove(`gymos-workout-progress:${currentMemberId}`);
      setCompletedSets([]);
    }
    setProgressMemberId(currentMemberId);
  }, [currentMemberId]);

  useEffect(() => {
    if (!currentMemberId || progressMemberId !== currentMemberId) return;
    safeLocalSet(
      `gymos-workout-progress:${currentMemberId}`,
      JSON.stringify(completedSets),
    );
  }, [completedSets, currentMemberId, progressMemberId]);

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
          const data = (await response.json()) as {
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
          };
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
        const data = (await response.json()) as {
          error?: string;
          checkIn?: { id: string; time: string; checkInTime: string; source: string };
        };
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

  function toggleSet(key: string) {
    setCompletedSets((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef2f5] px-0 py-0 sm:px-6 sm:py-8">
        <section
          aria-label="Loading GymOS mobile app"
          className="flex h-[100dvh] w-full max-w-[430px] flex-col items-center justify-center gap-3 bg-[#f7f8fa] shadow-[0_20px_50px_rgba(24,33,47,0.12)] sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-[#dfe5ea]"
        >
          <LoaderCircle size={28} className="animate-spin text-[#278968]" aria-hidden="true" />
          <p className="text-[12px] font-medium text-[#687585]">Loading your GymOS pass…</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101b26]/75 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        className="w-full max-w-[390px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(10,18,27,0.35)]"
      >
        <header className="flex items-center justify-between border-b border-[#edf0f2] px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">
              {scannerPurpose === "join-gym" ? "Connect to Gym" : "GymOS Check-in"}
            </p>
            <h2 id="scanner-title" className="mt-0.5 text-[14px] font-semibold text-[#273445]">
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
            className="grid size-9 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="p-5">
          {checkInSuccess ? (
            <div className="py-4 text-center">
              <span className="check-in-success-mark mx-auto grid size-20 place-items-center rounded-full bg-[#eaf6f0] text-[#278968]">
                <CheckCircle2 size={42} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="mt-5 text-[19px] font-semibold text-[#243242]">
                You&apos;re checked in, {activeFirstName}!
              </p>
              <p className="mt-1.5 text-[12px] text-[#74808e]">
                {lastCheckInTime} · {activeGymName}
              </p>
              <div className="mt-5 rounded-xl border border-[#dceee4] bg-[#f2faf5] px-4 py-3 text-left">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#6b8f7f]">
                  {accountRole === "trainer"
                    ? "Coach floor check-in · Verified"
                    : `Membership status · ${member?.status ?? "Active"}`}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-[#278968]">
                  {accountRole === "trainer"
                    ? `${trainerProfile?.specialty ?? "Active Trainer"}`
                    : `Valid through ${formatMemberDate(member?.expiryDate ?? null)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="mt-5 min-h-11 w-full rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858]"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="relative mx-auto aspect-square w-full max-w-[270px] overflow-hidden rounded-2xl bg-[#172433]">
                <div
                  id="gymos-qr-reader"
                  className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
                />
                {!cameraActive && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(111,194,158,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(111,194,158,.18) 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                      }}
                    />
                    <div className="relative grid size-[68%] place-items-center rounded-[28px] border-2 border-[#8bdbb7]">
                      <span className="absolute -left-1 -top-1 size-5 rounded-tl-md border-l-[3px] border-t-[3px] border-white" />
                      <span className="absolute -right-1 -top-1 size-5 rounded-tr-md border-r-[3px] border-t-[3px] border-white" />
                      <span className="absolute -bottom-1 -left-1 size-5 rounded-bl-md border-b-[3px] border-l-[3px] border-white" />
                      <span className="absolute -bottom-1 -right-1 size-5 rounded-br-md border-b-[3px] border-r-[3px] border-white" />
                      {isCameraStarting ? (
                        <LoaderCircle
                          size={34}
                          className="animate-spin text-[#8bdbb7]"
                          aria-hidden="true"
                        />
                      ) : (
                        <Camera size={34} className="text-[#8bdbb7]" aria-hidden="true" />
                      )}
                      <span className="scanner-sweep absolute left-2 right-2 h-0.5 bg-[#a5f2ce] shadow-[0_0_14px_3px_rgba(117,229,177,.55)]" />
                    </div>
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/60 px-3 py-1 text-[9px] font-medium text-white/90">
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
                <p className="mt-3 text-center text-[10px] leading-4 text-[#74808e]">
                  {cameraNotice}
                </p>
              )}

              {checkInError && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-[#fff1ef] px-3 py-2 text-[11px] text-[#a9433b]"
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
                  className="min-h-10 min-w-0 flex-1 rounded-xl border border-[#e3e8ec] px-3 text-[11px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994]"
                />
                <button
                  type="submit"
                  disabled={isCheckingIn || !manualQrInput.trim()}
                  className="min-h-10 shrink-0 rounded-xl bg-[#278968] px-3.5 text-[11px] font-semibold text-white hover:bg-[#207858] disabled:opacity-50"
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
  const exercises = workoutPlan?.exercises ?? [];
  const totalSets = exercises.reduce(
    (total, exercise) => total + Math.max(1, Number.parseInt(exercise.sets, 10) || 1),
    0,
  );
  const completedSetCount = exercises.reduce((total, exercise) => {
    const setCount = Math.max(1, Number.parseInt(exercise.sets, 10) || 1);
    return (
      total +
      Array.from(
        { length: setCount },
        (_, index) => `${workoutPlan?.id}:${exercise.id}:${index + 1}`,
      ).filter((key) => completedSets.includes(key)).length
    );
  }, 0);
  const completionPercent = totalSets ? Math.round((completedSetCount / totalSets) * 100) : 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2f5] px-0 py-0 sm:px-6 sm:py-8">
      <section
        aria-label="GymOS member app"
        className="flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#f7f8fa] shadow-[0_20px_50px_rgba(24,33,47,0.12)] sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-[#dfe5ea]"
      >
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#edf0f2] bg-white px-5 pt-[max(env(safe-area-inset-top),8px)]">
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-xl bg-[#45b58b] text-[14px] font-bold text-white"
              aria-hidden="true"
            >
              G
            </span>
            <div>
              <p className="text-[13px] font-semibold tracking-[-0.03em] text-[#243242]">
                Gym<span className="text-[#2d9d78]">OS</span>
              </p>
              <p className="max-w-[160px] truncate text-[9px] uppercase tracking-wide text-[#8993a0]">
                {member?.gymName ?? "Member App"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleLogout()}
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
              <p className="text-[11px] text-[#8993a0]">Welcome back</p>
              <h1 className="mt-0.5 truncate text-[21px] font-semibold tracking-[-0.045em] text-[#243242]">
                {member?.name ?? "Member"}
              </h1>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                member?.status === "Active"
                  ? "bg-[#eaf6f0] text-[#278968]"
                  : member?.status === "Unpaid"
                    ? "bg-[#fff4e8] text-[#bd7838]"
                    : "bg-[#fff0ee] text-[#c4544c]"
              }`}
            >
              {member?.status ?? "Unknown"}
            </span>
          </div>

          {dataError && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-[#fff1ef] px-3 py-2 text-[10px] text-[#a9433b]"
            >
              {dataError}
            </p>
          )}

          {activeTab === "Pass" && (
            <div className="space-y-4">
              <section
                aria-labelledby="digital-pass-heading"
                className="overflow-hidden rounded-[22px] bg-[#172433] text-white shadow-[0_12px_30px_rgba(23,36,51,0.17)]"
              >
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#82cdb0]">
                      Digital member pass
                    </p>
                    <h2
                      id="digital-pass-heading"
                      className="mt-1 text-[19px] font-semibold tracking-[-0.035em]"
                    >
                      {member?.name ?? "Member pass"}
                    </h2>
                  </div>
                  <span
                    className="grid size-10 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {member?.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() ?? "GY"}
                  </span>
                </div>
                <div className="mx-5 grid grid-cols-2 gap-3 rounded-xl bg-white/[0.07] p-3.5">
                  <div>
                    <p className="text-[9px] text-slate-400">MEMBERSHIP PLAN</p>
                    <p className="mt-1 text-[11px] font-medium">
                      {member?.planName ?? "No active plan"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400">VALID THROUGH</p>
                    <p className="mt-1 text-[11px] font-medium">
                      {formatMemberDate(member?.expiryDate ?? null)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 px-5 py-3">
                  <span className="text-[9px] text-slate-400">MEMBER ID</span>
                  <span className="font-mono text-[10px] tracking-wide text-slate-200">
                    {member?.id.slice(-8).toUpperCase() ?? "—"}
                  </span>
                </div>
              </section>

              <button
                type="button"
                onClick={openQrScanner}
                className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#278968] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(39,137,104,0.2)] transition-colors hover:bg-[#207858]"
              >
                <ScanLine size={19} aria-hidden="true" />
                Scan Gym QR Code
              </button>

              {upcomingMemberSessions.length > 0 && (
                <section
                  aria-label="Upcoming coaching session"
                  className="rounded-2xl border border-[#d6e5fa] bg-[#f4f8ff] p-3.5"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#dce9fc] text-[#355ca0]">
                      <CalendarDays size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#355ca0]">
                        Upcoming session with {upcomingMemberSessions[0].trainerName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-[#243242]">
                        {upcomingMemberSessions[0].title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#5c6d82]">
                        {formatSessionDateTime(upcomingMemberSessions[0].startsAt)} ·{" "}
                        {upcomingMemberSessions[0].durationMinutes} min
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <section
                aria-label="Membership and payment status"
                className="rounded-2xl border border-[#e9edf1] bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      member?.status === "Active"
                        ? "bg-[#eaf6f0] text-[#278968]"
                        : "bg-[#fff4e8] text-[#bd7838]"
                    }`}
                  >
                    <CheckCircle2 size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#354153]">
                      Membership {member?.status?.toLowerCase() ?? "inactive"}
                    </p>
                    <p className="mt-1 text-[10px] text-[#87909d]">
                      {member?.startDate
                        ? `Valid ${formatMemberDate(member.startDate)} to ${formatMemberDate(member.expiryDate)}.`
                        : "Visit the front desk to activate a membership plan."}
                    </p>
                  </div>
                </div>
                {member?.status === "Unpaid" && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#f2e3ca] bg-[#fff9ef] p-3"
                  >
                    <Wallet size={15} className="mt-0.5 shrink-0 text-[#bd7838]" aria-hidden="true" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#94602e]">
                        Payment needs attention
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#9b764f]">
                        Latest payment status: {member.paymentStatus}. Please check with the front
                        desk.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setActiveTab("Workout")}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4 text-left hover:bg-[#fbfcfc]"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#6675d9]">
                  <Dumbbell size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-[#354153]">
                    Today&apos;s workout
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-[#87909d]">
                    {workoutPlan
                      ? `${workoutPlan.title} · ${workoutPlan.exercises.length} exercises`
                      : "No assigned workout plan yet"}
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-[#278968]">View</span>
              </button>
            </div>
          )}

          {activeTab === "Workout" && (
            <section aria-labelledby="today-workout-heading">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                    Today&apos;s assigned routine
                  </p>
                  <h2
                    id="today-workout-heading"
                    className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                  >
                    {workoutPlan?.title ?? "No workout assigned"}
                  </h2>
                  <p className="mt-1 text-[10px] text-[#87909d]">
                    {trainer
                      ? `Coach ${trainer.name} · ${trainer.specialty}`
                      : workoutPlan?.targetGoal ??
                        "Ask your gym trainer to assign a workout plan."}
                  </p>
                </div>
                {completedSetCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompletedSets([])}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[9px] font-medium text-[#687585] hover:bg-slate-50"
                  >
                    <RotateCcw size={11} aria-hidden="true" />
                    Reset
                  </button>
                )}
              </div>

              {upcomingMemberSessions.length > 0 && (
                <div className="mb-4 rounded-xl border border-[#e3e8ec] bg-white p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#83908d]">
                    Scheduled 1-on-1 Sessions
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {upcomingMemberSessions.slice(0, 3).map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-[10px]">
                        <span className="truncate font-semibold text-[#354153]">
                          {s.title}
                        </span>
                        <span className="shrink-0 text-[#278968]">
                          {formatSessionDateTime(s.startsAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {workoutPlan && (
                <div className="mb-4 rounded-xl bg-[#eaf6f0] p-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-[#526071]">Workout progress</span>
                    <span className="font-semibold text-[#278968]">
                      {completedSetCount} of {totalSets} sets complete
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[#43ad82] transition-[width]"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <ul className="space-y-2.5">
                {exercises.map((exercise, index) => {
                  const setCount = Math.max(1, Number.parseInt(exercise.sets, 10) || 1);
                  const exerciseSetKeys = Array.from(
                    { length: setCount },
                    (_, setIndex) => `${workoutPlan?.id}:${exercise.id}:${setIndex + 1}`,
                  );
                  const complete = exerciseSetKeys.every((key) => completedSets.includes(key));
                  return (
                    <li
                      key={`${workoutPlan?.id}-${exercise.id}`}
                      className={`rounded-2xl border p-3.5 transition-colors ${
                        complete ? "border-[#cfe9dc] bg-[#f0f9f4]" : "border-[#e9edf1] bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-[11px] font-semibold ${
                              complete ? "text-[#278968]" : "text-[#354153]"
                            }`}
                          >
                            {index + 1}. {exercise.name}
                          </p>
                          <p className="mt-1.5 text-[9px] text-[#7b8794]">
                            {exercise.reps} reps · {exercise.rest} rest
                          </p>
                        </div>
                        <span className="rounded-full bg-[#f2f4f6] px-2 py-0.5 text-[8px] font-medium text-[#6f7b89]">
                          {exercise.muscle}
                        </span>
                      </div>
                      <div
                        className="mt-3 flex flex-wrap gap-2"
                        role="group"
                        aria-label={`${exercise.name} sets`}
                      >
                        {exerciseSetKeys.map((key, setIndex) => {
                          const setComplete = completedSets.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={setComplete}
                              onClick={() => toggleSet(key)}
                              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-medium ${
                                setComplete
                                  ? "border-[#b8dfca] bg-[#e3f3e9] text-[#237e5f]"
                                  : "border-[#e3e8ec] bg-white text-[#687585]"
                              }`}
                            >
                              {setComplete ? (
                                <Check size={12} aria-hidden="true" />
                              ) : (
                                <Circle size={12} aria-hidden="true" />
                              )}
                              Set {setIndex + 1}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {workoutPlan && (
                <p className="mt-4 text-center text-[9px] text-[#9aa3ae]">
                  Set progress is saved on this device for {member?.name ?? "your account"}.
                </p>
              )}
            </section>
          )}

          {activeTab === "Visits" && (
            <section aria-labelledby="visits-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                  Your activity
                </p>
                <h2
                  id="visits-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                >
                  Attendance history
                </h2>
                <p className="mt-1 text-[10px] text-[#87909d]">Your recent visits to the club</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[#e9edf1] bg-white">
                <ul className="divide-y divide-[#eff1f4]">
                  {recentVisits.map((visit, index) => (
                    <li key={visit.id} className="flex items-center gap-3 p-3.5">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                          index === 0
                            ? "bg-[#eaf6f0] text-[#278968]"
                            : "bg-[#f2f4f6] text-[#7d8895]"
                        }`}
                      >
                        <Clock3 size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-[#354153]">{visit.date}</p>
                        <p className="mt-0.5 text-[9px] text-[#8993a0]">{visit.detail}</p>
                      </div>
                      <span className="text-[10px] font-medium text-[#687585]">{visit.time}</span>
                    </li>
                  ))}
                  {recentVisits.length === 0 && (
                    <li className="p-6 text-center text-[10px] text-[#8993a0]">
                      No visits recorded yet. Scan the reception QR code when you arrive!
                    </li>
                  )}
                </ul>
              </div>
              <p className="mt-3 text-center text-[9px] text-[#9aa3ae]">
                {recentVisits.length} recent {recentVisits.length === 1 ? "visit" : "visits"}
              </p>
            </section>
          )}

          {activeTab === "Profile" && (
            <section aria-labelledby="profile-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                  Your account
                </p>
                <h2
                  id="profile-heading"
                  className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]"
                >
                  Profile &amp; membership
                </h2>
              </div>
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-[#e8f4ee] text-[13px] font-semibold text-[#2e8868]"
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
                  <p className="truncate text-[13px] font-semibold text-[#354153]">
                    {member?.name ?? "Member"}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#87909d]">
                    {member?.phone ?? ""}
                    {member?.email ? ` · ${member.email}` : ""}
                  </p>
                  {member?.gymName && (
                    <p className="mt-0.5 truncate text-[9px] text-[#9aa3ae]">{member.gymName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#eaf6f0] text-[#278968]">
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#8993a0]">SUBSCRIPTION</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#354153]">
                      {member?.planName ?? "No active plan"} · {member?.status ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-[#edf0f2] pt-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f2f4f6] text-[#6f7b89]">
                    <CreditCard size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#8993a0]">VALID THROUGH</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#354153]">
                      {formatMemberDate(member?.startDate ?? null)} –{" "}
                      {formatMemberDate(member?.expiryDate ?? null)}
                    </p>
                  </div>
                </div>
                {member?.status === "Unpaid" && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 border-t border-[#edf0f2] pt-3"
                  >
                    <Wallet size={15} className="mt-0.5 shrink-0 text-[#bd7838]" aria-hidden="true" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#94602e]">
                        Payment status · {member.paymentStatus}
                      </p>
                      <p className="mt-0.5 text-[9px] leading-4 text-[#9b764f]">
                        Contact the front desk to settle your balance before check-in.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-center gap-2">
                  <Dumbbell size={15} className="text-[#6675d9]" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-[#354153]">Assigned trainer</p>
                </div>
                <p className="mt-2 text-[11px] text-[#687585]">
                  {trainer ? `${trainer.name} · ${trainer.specialty}` : "No trainer assigned"}
                </p>
                {trainer?.phone && (
                  <p className="mt-0.5 text-[10px] text-[#8993a0]">Phone: {trainer.phone}</p>
                )}
                <p className="mt-1 text-[10px] text-[#8993a0]">
                  Current plan: {workoutPlan?.title ?? "None"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#f0d5d3] bg-white text-[11px] font-semibold text-[#a64141] hover:bg-[#fff6f5] disabled:opacity-60"
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
