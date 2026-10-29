"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  CreditCard,
  Dumbbell,
  History,
  LoaderCircle,
  LogOut,
  QrCode,
  ScanLine,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3000";

type AppTab = "Pass" | "Workout" | "Visits" | "Profile";

type MemberProfile = {
  id: string;
  gymId: string;
  name: string;
  phone: string;
  email?: string;
  status: "Active" | "Expired" | "Unpaid";
  planName: string;
  startDate: string | null;
  expiryDate: string | null;
  paymentStatus: string;
  gymQrPayload: string;
};
type WorkoutExercise = { id: number; name: string; sets: string; reps: string; rest: string; muscle: string };
type WorkoutPlan = { id: string; title: string; targetGoal: string; exercises: WorkoutExercise[] };
type Visit = { id: string; date: string; time: string; detail: string };

function formatMemberDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function formatVisit(value: string, id: string, source: string): Visit {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isSameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  const dateLabel = isSameDay(date, today)
    ? "Today"
    : isSameDay(date, yesterday)
      ? "Yesterday"
      : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
  return {
    id,
    date: dateLabel,
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date),
    detail: source === "Member self-scan" ? "Gym floor · QR self-scan" : "Gym floor",
  };
}

function AppBottomNav({ activeTab, onSelect }: { activeTab: AppTab; onSelect: (tab: AppTab) => void }) {
  const tabs: Array<{ label: AppTab; icon: typeof QrCode }> = [
    { label: "Pass", icon: QrCode },
    { label: "Workout", icon: Dumbbell },
    { label: "Visits", icon: History },
    { label: "Profile", icon: UserRound },
  ];

  return (
    <nav aria-label="Member app navigation" className="grid grid-cols-4 border-t border-[#edf0f2] bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
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

function MemberAuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gymCode, setGymCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const registering = mode === "register";
      const response = await fetch(`${adminAppUrl}/api/auth/member/${registering ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registering
          ? { fullName, phone, email, password, gymCode }
          : { identifier, password, gymCode }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to authenticate.");
      onAuthenticated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to authenticate.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClass = "min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[12px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf1f2] px-0 py-0 sm:px-6 sm:py-8">
      <section aria-label="GymOS member authentication" className="flex min-h-[100dvh] w-full max-w-[410px] flex-col bg-[#f7f8fa] shadow-[0_24px_80px_rgba(24,33,47,0.16)] sm:min-h-[760px] sm:max-h-[calc(100dvh-64px)] sm:rounded-[34px] sm:border-[7px] sm:border-[#172433]">
        <header className="flex min-h-[72px] items-center gap-3 border-b border-[#edf0f2] bg-white px-5 pt-[max(env(safe-area-inset-top),8px)]">
          <span className="grid size-9 place-items-center rounded-xl bg-[#45b58b] text-[14px] font-bold text-white" aria-hidden="true">G</span>
          <div>
            <p className="text-[13px] font-semibold tracking-[-0.03em] text-[#243242]">Gym<span className="text-[#2d9d78]">OS</span></p>
            <p className="text-[9px] text-[#8993a0]">MEMBER APP</p>
          </div>
        </header>
        <div className="flex flex-1 items-center px-5 py-8">
          <div className="w-full">
            <div className="mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">GymOS Member</p>
              <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-[#243242]">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
              <p className="mt-1.5 text-[11px] text-[#87909d]">{mode === "login" ? "Sign in to view your membership and workouts." : "Register with your gym to get started."}</p>
            </div>
            <form onSubmit={submit} className="space-y-3.5">
              {mode === "register" && <>
                <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Full name</span><input className={fieldClass} autoComplete="name" required maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" /></label>
                <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Phone</span><input className={fieldClass} type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+20 100 123 4567" /></label>
                <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Email</span><input className={fieldClass} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
              </>}
              {mode === "login" && <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Phone or email</span><input className={fieldClass} autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Phone number or email" /></label>}
              <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Gym code</span><input className={fieldClass} autoComplete="organization" required value={gymCode} onChange={(event) => setGymCode(event.target.value)} placeholder="Gym code or gym slug" /></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#526071]">Password</span><input className={fieldClass} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /></label>
              {error && <p role="alert" className="rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-3 py-2.5 text-[10px] text-[#a9433b]">{error}</p>}
              <button type="submit" disabled={isSubmitting} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">
                {isSubmitting && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
            <p className="mt-5 text-center text-[10px] text-[#778391]">
              {mode === "login" ? "New to your gym?" : "Already registered?"}{" "}
              <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="font-semibold text-[#278968] hover:text-[#207858]">
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
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [authError, setAuthError] = useState("");
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [trainer, setTrainer] = useState<{ id: string; name: string; specialty: string } | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [completedSets, setCompletedSets] = useState<string[]>([]);
  const [progressMemberId, setProgressMemberId] = useState("");
  const [dataError, setDataError] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [lastCheckInTime, setLastCheckInTime] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scanLockedRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadMembers() {
      try {
        const response = await fetch(`${adminAppUrl}/api/member-portal`, { cache: "no-store" });
        const data = await response.json() as { members?: MemberOption[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load gym members.");
        if (!active) return;
        const options = data.members ?? [];
        setMemberOptions(options);
        setSelectedMemberId((current) => current || options.find((item) => item.name === "Sam Rivera")?.id || options[0]?.id || "");
      } catch (error) {
        if (active) setDataError(error instanceof Error ? error.message : "Unable to load gym members.");
      } finally {
        if (active) setIsLoadingMembers(false);
      }
    }
    void loadMembers();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedMemberId) return;
    let active = true;
    setIsLoadingProfile(true);
    setDataError("");
    async function loadMemberProfile() {
      try {
        const response = await fetch(`${adminAppUrl}/api/member-portal?memberId=${encodeURIComponent(selectedMemberId)}`, { cache: "no-store" });
        const data = await response.json() as {
          member?: MemberProfile;
          trainer?: { id: string; name: string; specialty: string } | null;
          workoutPlan?: WorkoutPlan | null;
          visits?: Array<{ id: string; checkInTime: string; source: string }>;
          error?: string;
        };
        if (!response.ok || !data.member) throw new Error(data.error ?? "Unable to load this member profile.");
        if (!active) return;
        setMember(data.member);
        setTrainer(data.trainer ?? null);
        setWorkoutPlan(data.workoutPlan ?? null);
        setRecentVisits((data.visits ?? []).map((visit) => formatVisit(visit.checkInTime, visit.id, visit.source)));
      } catch (error) {
        if (active) {
          setMember(null);
          setTrainer(null);
          setWorkoutPlan(null);
          setDataError(error instanceof Error ? error.message : "Unable to load this member profile.");
        }
      } finally {
        if (active) setIsLoadingProfile(false);
      }
    }
    void loadMemberProfile();
    return () => { active = false; };
  }, [selectedMemberId]);

  useEffect(() => {
    if (!selectedMemberId) return;
    setProgressMemberId("");
    try {
      const savedProgress = window.localStorage.getItem(`gymos-workout-progress:${selectedMemberId}`);
      setCompletedSets(savedProgress ? JSON.parse(savedProgress) as string[] : []);
    } catch {
      window.localStorage.removeItem(`gymos-workout-progress:${selectedMemberId}`);
      setCompletedSets([]);
    }
    setProgressMemberId(selectedMemberId);
  }, [selectedMemberId]);

  useEffect(() => {
    if (!selectedMemberId || progressMemberId !== selectedMemberId) return;
    window.localStorage.setItem(`gymos-workout-progress:${selectedMemberId}`, JSON.stringify(completedSets));
  }, [completedSets, progressMemberId, selectedMemberId]);

  async function simulateSuccessfulScan() {
    if (!member) return;
    setIsCheckingIn(true);
    setCheckInError("");
    try {
      const response = await fetch(`${adminAppUrl}/api/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin", memberId: member.id, source: "Member self-scan" }),
      });
      const data = await response.json() as { error?: string; checkIn?: { id: string; time: string; checkInTime: string; source: string } };
      if (!response.ok || !data.checkIn) throw new Error(data.error ?? "Check-in could not be completed.");
      const time = data.checkIn.time;
      const visit = formatVisit(data.checkIn.checkInTime, data.checkIn.id, data.checkIn.source);
      setLastCheckInTime(time);
      setRecentVisits((current) => [visit, ...current].slice(0, 20));
      setCheckInSuccess(true);
    } catch (error) {
      setCheckInError(error instanceof Error ? error.message : "Check-in could not be completed.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  function toggleSet(key: string) {
    setCompletedSets((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  const exercises = workoutPlan?.exercises ?? [];
  const totalSets = exercises.reduce((total, exercise) => total + Math.max(1, Number.parseInt(exercise.sets, 10) || 1), 0);
  const completedSetCount = exercises.reduce((total, exercise) => {
    const setCount = Math.max(1, Number.parseInt(exercise.sets, 10) || 1);
    return total + Array.from({ length: setCount }, (_, index) => `${workoutPlan?.id}:${exercise.id}:${index + 1}`)
      .filter((key) => completedSets.includes(key)).length;
  }, 0);
  const completionPercent = totalSets ? Math.round((completedSetCount / totalSets) * 100) : 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf1f2] px-0 py-0 sm:px-6 sm:py-8">
      <section
        aria-label="GymOS member app preview"
        className="flex h-[100dvh] w-full max-w-[410px] flex-col overflow-hidden bg-[#f7f8fa] shadow-[0_24px_80px_rgba(24,33,47,0.16)] sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-[34px] sm:border-[7px] sm:border-[#172433]"
      >
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#edf0f2] bg-white px-5 pt-[max(env(safe-area-inset-top),8px)]">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#45b58b] text-[14px] font-bold text-white" aria-hidden="true">G</span>
            <div>
              <p className="text-[13px] font-semibold tracking-[-0.03em] text-[#243242]">Gym<span className="text-[#2d9d78]">OS</span></p>
              <p className="text-[9px] text-[#8993a0]">MEMBER APP PREVIEW</p>
            </div>
          </div>
          <a
            href={adminAppUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-[#74808e] hover:bg-[#f3f5f6]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            GymOS Admin
          </a>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[#8993a0]">Member profile</p>
              <h1 className="mt-0.5 text-[21px] font-semibold tracking-[-0.045em] text-[#243242]">{member?.name ?? (isLoadingMembers || isLoadingProfile ? "Loading member…" : "Select a member")}</h1>
            </div>
            <button type="button" aria-label="Notifications" className="relative grid size-9 place-items-center rounded-full bg-white text-[#74808e] shadow-sm">
              <Bell size={17} aria-hidden="true" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#e4845f]" />
            </button>
          </div>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wide text-[#8993a0]">Test member</span>
            <select aria-label="Select test member" value={selectedMemberId} disabled={isLoadingMembers || memberOptions.length === 0} onChange={(event) => {
              setSelectedMemberId(event.target.value);
              setCheckInSuccess(false);
              setCheckInError("");
            }} className="min-h-10 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[11px] text-[#354153] outline-none focus:border-[#55b994] disabled:opacity-60">
              {memberOptions.length === 0 && <option value="">{isLoadingMembers ? "Loading members…" : "No members available"}</option>}
              {memberOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          {dataError && <p role="alert" className="mb-4 rounded-lg bg-[#fff1ef] px-3 py-2 text-[10px] text-[#a9433b]">{dataError}</p>}

          {activeTab === "Pass" && (
            <div className="space-y-4">
              <section aria-labelledby="digital-pass-heading" className="overflow-hidden rounded-[22px] bg-[#172433] text-white shadow-[0_12px_30px_rgba(23,36,51,0.17)]">
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#82cdb0]">Digital member pass</p>
                    <h2 id="digital-pass-heading" className="mt-1 text-[19px] font-semibold tracking-[-0.035em]">{member?.name ?? "Member pass"}</h2>
                  </div>
                  <span className="grid size-10 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white" aria-hidden="true">{member?.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "GY"}</span>
                </div>
                <div className="mx-5 grid grid-cols-2 gap-3 rounded-xl bg-white/[0.07] p-3.5">
                  <div>
                    <p className="text-[9px] text-slate-400">MEMBERSHIP PLAN</p>
                    <p className="mt-1 text-[11px] font-medium">{member?.planName ?? "Loading plan…"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400">VALID THROUGH</p>
                    <p className="mt-1 text-[11px] font-medium">{formatMemberDate(member?.expiryDate ?? null)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                  <span className="text-[9px] text-slate-400">MEMBER ID</span>
                  <span className="font-mono text-[10px] tracking-wide text-slate-200">{member?.id ?? "—"}</span>
                </div>
              </section>

              <button
                type="button"
                onClick={() => {
                  setIsScannerOpen(true);
                  setCheckInError("");
                  setCheckInSuccess(false);
                }}
                className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#278968] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(39,137,104,0.2)] transition-colors hover:bg-[#207858]"
              >
                <ScanLine size={19} aria-hidden="true" />
                Scan Gym QR Code
              </button>

              <section aria-label="Membership and payment status" className="rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
                    <CheckCircle2 size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#354153]">Membership {member?.status?.toLowerCase() ?? "loading"}</p>
                    <p className="mt-1 text-[10px] text-[#87909d]">Valid {formatMemberDate(member?.startDate ?? null)} to {formatMemberDate(member?.expiryDate ?? null)}.</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-medium ${member?.status === "Active" ? "bg-[#eaf6f0] text-[#278968]" : "bg-[#fff4e8] text-[#bd7838]"}`}>{member?.status ?? "Loading"}</span>
                </div>
                {member?.status === "Unpaid" && <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#f2e3ca] bg-[#fff9ef] p-3">
                  <Wallet size={15} className="mt-0.5 shrink-0 text-[#bd7838]" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-semibold text-[#94602e]">Payment needs attention</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-[#9b764f]">Latest payment status: {member.paymentStatus}. Please check with the front desk.</p>
                  </div>
                </div>}
              </section>

              <button type="button" onClick={() => setActiveTab("Workout")} className="flex w-full items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4 text-left">
                <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#6675d9]">
                  <Dumbbell size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-[#354153]">Today&apos;s workout</span>
                  <span className="mt-1 block truncate text-[10px] text-[#87909d]">{workoutPlan ? `${workoutPlan.title} · ${workoutPlan.exercises.length} exercises` : "No assigned workout plan"}</span>
                </span>
                <span className="text-[10px] font-semibold text-[#278968]">View</span>
              </button>
            </div>
          )}

          {activeTab === "Workout" && (
            <section aria-labelledby="today-workout-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Today&apos;s assigned routine</p>
                <h2 id="today-workout-heading" className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]">{workoutPlan?.title ?? (isLoadingProfile ? "Loading workout…" : "No workout assigned")}</h2>
                <p className="mt-1 text-[10px] text-[#87909d]">{trainer ? `${trainer.name} · ${trainer.specialty}` : workoutPlan?.targetGoal ?? "Ask your gym to assign a workout plan."}</p>
              </div>
              {workoutPlan && <div className="mb-4 rounded-xl bg-[#eaf6f0] p-3">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium text-[#526071]">Workout progress</span>
                  <span className="font-semibold text-[#278968]">{completedSetCount} of {totalSets} sets complete</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[#43ad82] transition-[width]" style={{ width: `${completionPercent}%` }} />
                </div>
              </div>}
              <ul className="space-y-2.5">
                {exercises.map((exercise, index) => {
                  const setCount = Math.max(1, Number.parseInt(exercise.sets, 10) || 1);
                  const exerciseSetKeys = Array.from({ length: setCount }, (_, setIndex) => `${workoutPlan?.id}:${exercise.id}:${setIndex + 1}`);
                  const complete = exerciseSetKeys.every((key) => completedSets.includes(key));
                  return (
                    <li key={`${workoutPlan?.id}-${exercise.id}`} className={`rounded-2xl border p-3.5 transition-colors ${complete ? "border-[#cfe9dc] bg-[#f0f9f4]" : "border-[#e9edf1] bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] font-semibold ${complete ? "text-[#278968]" : "text-[#354153]"}`}>{index + 1}. {exercise.name}</p>
                          <p className="mt-1.5 text-[9px] text-[#7b8794]">{exercise.reps} reps · {exercise.rest} rest</p>
                        </div>
                        <span className="rounded-full bg-[#f2f4f6] px-2 py-0.5 text-[8px] font-medium text-[#6f7b89]">{exercise.muscle}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`${exercise.name} sets`}>
                        {exerciseSetKeys.map((key, setIndex) => {
                          const setComplete = completedSets.includes(key);
                          return (
                            <button key={key} type="button" aria-pressed={setComplete} onClick={() => toggleSet(key)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-medium ${setComplete ? "border-[#b8dfca] bg-[#e3f3e9] text-[#237e5f]" : "border-[#e3e8ec] bg-white text-[#687585]"}`}>
                              {setComplete ? <Check size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                              Set {setIndex + 1}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {workoutPlan && <p className="mt-4 text-center text-[9px] text-[#9aa3ae]">Set progress is saved on this device for {member?.name ?? "this member"}.</p>}
            </section>
          )}

          {activeTab === "Visits" && (
            <section aria-labelledby="visits-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Your activity</p>
                <h2 id="visits-heading" className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]">Attendance history</h2>
                <p className="mt-1 text-[10px] text-[#87909d]">Your recent visits to the club</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[#e9edf1] bg-white">
                <ul className="divide-y divide-[#eff1f4]">
                  {recentVisits.map((visit, index) => (
                    <li key={visit.id} className="flex items-center gap-3 p-3.5">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${index === 0 ? "bg-[#eaf6f0] text-[#278968]" : "bg-[#f2f4f6] text-[#7d8895]"}`}>
                        <Clock3 size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-[#354153]">{visit.date}</p>
                        <p className="mt-0.5 text-[9px] text-[#8993a0]">{visit.detail}</p>
                      </div>
                      <span className="text-[10px] font-medium text-[#687585]">{visit.time}</span>
                    </li>
                  ))}
                  {recentVisits.length === 0 && <li className="p-6 text-center text-[10px] text-[#8993a0]">No visits recorded yet.</li>}
                </ul>
              </div>
              <p className="mt-3 text-center text-[9px] text-[#9aa3ae]">{recentVisits.length} recent visits</p>
            </section>
          )}

          {activeTab === "Profile" && (
            <section aria-labelledby="profile-heading">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Your account</p>
                <h2 id="profile-heading" className="mt-1 text-[19px] font-semibold tracking-[-0.035em] text-[#243242]">Profile &amp; membership</h2>
              </div>
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <span className="grid size-12 place-items-center rounded-full bg-[#e8f4ee] text-[13px] font-semibold text-[#2e8868]" aria-hidden="true">{member?.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "GY"}</span>
                <div>
                  <p className="text-[13px] font-semibold text-[#354153]">{member?.name ?? "Member"}</p>
                  <p className="mt-1 text-[10px] text-[#87909d]">{member?.phone ?? ""}</p>
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#eaf6f0] text-[#278968]"><CheckCircle2 size={15} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#8993a0]">SUBSCRIPTION</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#354153]">{member?.planName ?? "No active plan"} · {member?.status ?? "Unknown"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-[#edf0f2] pt-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f2f4f6] text-[#6f7b89]"><CreditCard size={15} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#8993a0]">VALID THROUGH</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#354153]">{formatMemberDate(member?.startDate ?? null)} – {formatMemberDate(member?.expiryDate ?? null)}</p>
                  </div>
                </div>
                {member?.status === "Unpaid" && <div role="alert" className="flex items-start gap-2.5 border-t border-[#edf0f2] pt-3">
                  <Wallet size={15} className="mt-0.5 shrink-0 text-[#bd7838]" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-semibold text-[#94602e]">Payment status · {member.paymentStatus}</p>
                    <p className="mt-0.5 text-[9px] leading-4 text-[#9b764f]">Contact the front desk to settle your balance before check-in.</p>
                  </div>
                </div>}
              </div>
              <div className="mt-3 rounded-2xl border border-[#e9edf1] bg-white p-4">
                <div className="flex items-center gap-2">
                  <Dumbbell size={15} className="text-[#6675d9]" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-[#354153]">Assigned trainer</p>
                </div>
                <p className="mt-2 text-[11px] text-[#687585]">{trainer ? `${trainer.name} · ${trainer.specialty}` : "No trainer assigned"}</p>
                <p className="mt-1 text-[10px] text-[#8993a0]">Current plan: {workoutPlan?.title ?? "None"}</p>
              </div>
            </section>
          )}
        </div>

        <AppBottomNav activeTab={activeTab} onSelect={setActiveTab} />
      </section>
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101b26]/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="scanner-title" className="w-full max-w-[390px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(10,18,27,0.35)]">
            <header className="flex items-center justify-between border-b border-[#edf0f2] px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#83908d]">GymOS Check-in</p>
                <h2 id="scanner-title" className="mt-0.5 text-[14px] font-semibold text-[#273445]">{checkInSuccess ? "Check-in confirmed" : "Scan gym QR code"}</h2>
              </div>
              <button type="button" aria-label="Close scanner" onClick={() => setIsScannerOpen(false)} className="grid size-9 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]">
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="p-5">
              {checkInSuccess ? (
                <div className="py-5 text-center">
                  <span className="check-in-success-mark mx-auto grid size-20 place-items-center rounded-full bg-[#eaf6f0] text-[#278968]">
                    <CheckCircle2 size={42} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-[19px] font-semibold text-[#243242]">You&apos;re checked in, {member?.name ?? "member"}!</p>
                  <p className="mt-2 text-[12px] text-[#74808e]">{lastCheckInTime} · Gym floor</p>
                  <div className="mt-5 rounded-xl border border-[#dceee4] bg-[#f2faf5] px-4 py-3 text-left">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-[#6b8f7f]">Membership status · {member?.status ?? "Unknown"}</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#278968]">Valid through {formatMemberDate(member?.expiryDate ?? null)}</p>
                  </div>
                  <button type="button" onClick={() => setIsScannerOpen(false)} className="mt-5 min-h-11 w-full rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858]">Done</button>
                </div>
              ) : (
                <>
                  <div className="relative mx-auto grid aspect-square w-full max-w-[280px] place-items-center overflow-hidden rounded-2xl bg-[#172433]">
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(111,194,158,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(111,194,158,.18) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    <div className="relative grid size-[68%] place-items-center rounded-[28px] border-2 border-[#8bdbb7]">
                      <span className="absolute -left-1 -top-1 size-5 rounded-tl-md border-l-[3px] border-t-[3px] border-white" />
                      <span className="absolute -right-1 -top-1 size-5 rounded-tr-md border-r-[3px] border-t-[3px] border-white" />
                      <span className="absolute -bottom-1 -left-1 size-5 rounded-bl-md border-b-[3px] border-l-[3px] border-white" />
                      <span className="absolute -bottom-1 -right-1 size-5 rounded-br-md border-b-[3px] border-r-[3px] border-white" />
                      <ScanLine size={38} className="text-[#8bdbb7]" aria-hidden="true" />
                      <span className="scanner-sweep absolute left-2 right-2 h-0.5 bg-[#a5f2ce] shadow-[0_0_14px_3px_rgba(117,229,177,.55)]" />
                    </div>
                    <span className="absolute bottom-4 rounded-full bg-white/10 px-3 py-1 text-[9px] font-medium text-white/80">Reception · GymOS Elite</span>
                  </div>
                  <p className="mt-4 text-center text-[11px] leading-5 text-[#74808e]">Point your camera at the Reception Check-in QR Code.</p>
                  {checkInError && <p role="alert" className="mt-3 rounded-lg bg-[#fff1ef] px-3 py-2 text-[11px] text-[#a9433b]">{checkInError}</p>}
                  <button type="button" disabled={isCheckingIn} onClick={() => void simulateSuccessfulScan()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#278968] text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-70">
                    {isCheckingIn ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}
                    {isCheckingIn ? "Checking in…" : "Simulate successful scan"}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
