"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, KeyRound, ShieldCheck } from "lucide-react";
import { clearStaffSessionToken, setStaffSessionToken } from "@/lib/staff-client-auth";

type AuthPageProps = {
  mode: "login" | "register";
};

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [registrationType, setRegistrationType] = useState<"create-gym" | "join-gym">(
    "create-gym",
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    clearStaffSessionToken();

    try {
      const payload = isRegister
        ? registrationType === "create-gym"
          ? {
              registrationType: "create-gym",
              fullName,
              email,
              password,
              gymName,
              gymAddress,
              gymPhone,
            }
          : {
              registrationType: "join-gym",
              fullName,
              email,
              password,
              inviteCode,
            }
        : {
            email,
            password,
            rememberMe,
          };

      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        sessionToken?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "We couldn't complete your request. Please try again.");
        return;
      }
      if (result.sessionToken) {
        setStaffSessionToken(result.sessionToken, isRegister || rememberMe);
      }

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const safePath =
        !isRegister &&
        requestedPath?.startsWith("/") &&
        !requestedPath.startsWith("//") &&
        !requestedPath.startsWith("/api/")
          ? requestedPath
          : "/";
      router.replace(safePath);
      router.refresh();
    } catch {
      setError("Unable to reach GymOS. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#172433] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-36 -top-32 size-[520px] rounded-full border border-white/[0.06]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-12 size-[360px] rounded-full border border-white/[0.08]"
        />
        <Link href="/login" className="relative z-10 inline-flex w-fit items-center gap-3">
          <span className="auth-brand-mark grid size-11 place-items-center rounded-[15px] bg-[#45b58b] text-lg font-bold text-white">
            G
          </span>
          <span className="text-[23px] font-semibold tracking-[-0.05em]">
            Gym<span className="text-[#63c69d]">OS</span>
          </span>
        </Link>

        <div className="relative z-10 max-w-xl pb-16">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#77d0aa]">
            Multi-Gym SaaS Platform
          </p>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.055em] xl:text-6xl">
            A better view of your whole gym.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-slate-300">
            Launch a dedicated workspace for your club in seconds—complete with QR onboarding,
            live member passes, coach invites, and financial tracking.
          </p>
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-slate-300">
            <ShieldCheck size={15} className="text-[#77d0aa]" aria-hidden="true" />
            Isolated workspace per gym &amp; branch
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">GymOS Cloud Workspace</p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-7 sm:px-10 lg:justify-center lg:px-14 xl:px-20">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center lg:flex-none">
          <Link href="/login" className="mb-10 inline-flex w-fit items-center gap-2.5 lg:hidden">
            <span className="auth-brand-mark grid size-10 place-items-center rounded-[14px] bg-[#45b58b] text-base font-bold text-white">
              G
            </span>
            <span className="text-[21px] font-semibold tracking-[-0.05em] text-[#172433]">
              Gym<span className="text-[#2d9d78]">OS</span>
            </span>
          </Link>

          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2d9d78]">
              Staff &amp; Owner Workspace
            </p>
            <h2 className="mt-2.5 text-[30px] font-semibold tracking-[-0.045em] text-[#172433]">
              {isRegister ? "Get started with GymOS" : "Welcome back"}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#737e8e]">
              {isRegister
                ? registrationType === "create-gym"
                  ? "Register your gym workspace as the owner."
                  : "Join an existing gym team with a staff invite code."
                : "Sign in to continue to your gym dashboard."}
            </p>
          </div>

          {isRegister && (
            <div
              role="tablist"
              aria-label="Registration mode"
              className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-[#e9edf1] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={registrationType === "create-gym"}
                onClick={() => {
                  setRegistrationType("create-gym");
                  setError("");
                }}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition ${
                  registrationType === "create-gym"
                    ? "bg-white text-[#172433] shadow-xs"
                    : "text-[#637082] hover:text-[#172433]"
                }`}
              >
                <Building2 size={14} aria-hidden="true" />
                Create a new gym
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={registrationType === "join-gym"}
                onClick={() => {
                  setRegistrationType("join-gym");
                  setError("");
                }}
                className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition ${
                  registrationType === "join-gym"
                    ? "bg-white text-[#172433] shadow-xs"
                    : "text-[#637082] hover:text-[#172433]"
                }`}
              >
                <KeyRound size={14} aria-hidden="true" />
                Join existing gym
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && registrationType === "create-gym" && (
              <div className="space-y-3.5 rounded-2xl border border-[#e3e9ee] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d9d78]">
                  Gym / Branch Details
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                    Gym or branch name
                  </span>
                  <input
                    required
                    maxLength={100}
                    value={gymName}
                    onChange={(event) => setGymName(event.target.value)}
                    className="auth-input"
                    placeholder="e.g. Iron Peak Fitness - Maadi"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                      City / Address
                    </span>
                    <input
                      required
                      maxLength={200}
                      value={gymAddress}
                      onChange={(event) => setGymAddress(event.target.value)}
                      className="auth-input"
                      placeholder="Maadi, Cairo"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-[#354153]">
                      Gym phone
                    </span>
                    <input
                      type="tel"
                      required
                      maxLength={30}
                      value={gymPhone}
                      onChange={(event) => setGymPhone(event.target.value)}
                      className="auth-input"
                      placeholder="+201001234567"
                    />
                  </label>
                </div>
              </div>
            )}

            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[#354153]">
                  Your full name
                </span>
                <input
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="auth-input"
                  placeholder="Your name"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[#354153]">
                Work email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="auth-input"
                placeholder="you@yourgym.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[#354153]">
                Password
              </span>
              <input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 10 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="auth-input"
                placeholder={isRegister ? "At least 10 characters" : "Enter your password"}
              />
            </label>

            {isRegister && registrationType === "join-gym" && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[#354153]">
                  Staff invitation code
                </span>
                <input
                  autoComplete="off"
                  required
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  className="auth-input font-mono tracking-wider"
                  placeholder="STF-XXXX-XXXX"
                />
              </label>
            )}

            {!isRegister && (
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[#596576]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="size-4 rounded border-[#cbd3da] accent-[#2d9d78]"
                />
                Remember me
              </label>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#258765] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(37,135,101,0.16)] transition hover:bg-[#1d7758] disabled:cursor-wait disabled:opacity-70"
            >
              {pending
                ? isRegister
                  ? registrationType === "create-gym"
                    ? "Launching gym workspace..."
                    : "Joining gym..."
                  : "Signing in..."
                : isRegister
                  ? registrationType === "create-gym"
                    ? "Create gym workspace"
                    : "Join gym as staff"
                  : "Sign in"}
              {!pending && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#737e8e]">
            {isRegister ? "Already have an account?" : "Launching a new gym or joining a team?"}{" "}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="font-semibold text-[#258765] hover:text-[#1d7758]"
            >
              {isRegister ? "Sign in" : "Create workspace / Join"}
            </Link>
          </p>
        </div>
        <p className="mx-auto mt-6 w-full max-w-[440px] text-center text-[11px] text-[#9aa3ae]">
          Staff &amp; owner access only. Members and coaches use the GymOS Mobile App.
        </p>
      </section>
    </main>
  );
}
