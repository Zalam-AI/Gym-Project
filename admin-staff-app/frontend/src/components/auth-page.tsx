"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, Globe, KeyRound } from "lucide-react";
import { LanguageSwitch } from "@/lib/i18n";
import { clearStaffSessionToken, setStaffSessionToken } from "@/lib/staff-client-auth";

type AuthMode = "login" | "register";
type RegistrationType = "create-gym" | "join-gym";

type TenantBrandingPayload =
  | {
      mode: "neutral";
      hostname: string;
      baseDomain: string | null;
      gym: null;
    }
  | {
      mode: "tenant";
      hostname: string;
      resolvedBy: "subdomain" | "custom-domain";
      gym: {
        id: string;
        name: string;
        slug: string;
        subdomain: string;
        customDomain: string | null;
        address: string;
        timezone: string;
        currency: string;
        branding: {
          accentColor: string;
          tagline: string;
          logoText: string;
        };
      };
    }
  | {
      mode: "not-found";
      hostname: string;
      gym: null;
      error: string;
    }
  | {
      mode: "suspended";
      hostname: string;
      gym: {
        name: string;
        slug: string;
        subdomain: string;
      };
      error: string;
    };

const features = [
  "Members & QR passes",
  "Plans & live renewals",
  "Trainers & commissions",
  "Payments & revenue",
  "Floor attendance",
];

function safeNextPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }
  if (candidate === "/login" || candidate === "/register") {
    return "/";
  }
  return candidate;
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [tenantState, setTenantState] = useState<TenantBrandingPayload | null>(null);
  const [registrationType, setRegistrationType] = useState<RegistrationType>("create-gym");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadTenantBranding() {
      try {
        const res = await fetch("/api/tenant", { cache: "no-store" });
        const data = (await res.json()) as TenantBrandingPayload;
        if (!active) return;
        setTenantState(data);
        if (data.mode === "tenant") {
          setRegistrationType("join-gym");
          if (typeof document !== "undefined") {
            document.title = `${data.gym.name} — Staff Sign In | GymOS`;
          }
        }
      } catch {
        // Fall back gracefully to neutral branding if /api/tenant cannot be reached.
      }
    }
    void loadTenantBranding();
    return () => {
      active = false;
    };
  }, []);

  const tenantGym = tenantState?.mode === "tenant" ? tenantState.gym : null;
  const accentColor =
    tenantGym?.branding.accentColor && /^#[0-9a-fA-F]{6}$/.test(tenantGym.branding.accentColor)
      ? tenantGym.branding.accentColor
      : "#45b58b";
  const effectiveRegistrationType: RegistrationType = tenantGym ? "join-gym" : registrationType;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfoNotice("");
    setPending(true);
    clearStaffSessionToken();

    try {
      const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? effectiveRegistrationType === "create-gym"
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
            : { email, password, rememberMe },
        ),
      });

      const payload = (await response.json()) as {
        error?: string;
        sessionToken?: string;
        pendingApproval?: boolean;
        message?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Authentication failed.");
        return;
      }
      if (payload.pendingApproval) {
        setInfoNotice(
          payload.message ??
            "Your gym workspace has been submitted and is awaiting platform administrator approval.",
        );
        return;
      }

      if (payload.sessionToken) {
        setStaffSessionToken(payload.sessionToken, isRegister || rememberMe);
      }

      const params = new URLSearchParams(window.location.search);
      const destination = safeNextPath(params.get("next"));
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Network error while contacting GymOS. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (tenantState?.mode === "not-found" || tenantState?.mode === "suspended") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f6f8] p-6 text-[#182433]">
        <div className="w-full max-w-[440px] rounded-2xl border border-[#e2e8ed] bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-end">
            <LanguageSwitch />
          </div>
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#172433]">
            {tenantState.mode === "suspended"
              ? `${tenantState.gym.name} Is Suspended`
              : "Gym Workspace Not Found"}
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-[#687586]">{tenantState.error}</p>
          <p className="mt-4 rounded-xl bg-[#f8fafb] px-3 py-2 font-mono text-[11px] text-[#556375]">
            {tenantState.hostname}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#182433] lg:grid lg:grid-cols-[1.04fr_0.96fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#18222e] p-12 text-white lg:flex xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -right-24 size-96 rounded-full blur-3xl"
          style={{ backgroundColor: `${accentColor}28` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-[#3b82f6]/10 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span
            className="grid size-9 place-items-center rounded-[10px] text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            {tenantGym ? tenantGym.branding.logoText : "G"}
          </span>
          <div>
            <span className="block text-xl font-semibold tracking-[-0.025em]">
              {tenantGym ? tenantGym.name : "GymOS"}
            </span>
            {tenantGym && (
              <span className="block text-[11px] text-slate-400">Powered by GymOS</span>
            )}
          </div>
        </div>

        <div className="relative max-w-xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: accentColor }}
          >
            {tenantGym ? "Dedicated Gym Workspace" : "Multi-Gym SaaS Operations"}
          </p>
          <h1 className="mt-4 text-4xl leading-[1.12] font-semibold tracking-[-0.035em] text-white xl:text-[44px]">
            {tenantGym
              ? `${tenantGym.name} staff & club operations.`
              : "Run every branch, membership, and coach from one workspace."}
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-300">
            {tenantGym
              ? tenantGym.branding.tagline ||
                `Authorized staff portal for ${tenantGym.name} (${tenantGym.address}). Only staff assigned to this gym can sign in here.`
              : "Launch a dedicated workspace for your gym in seconds, onboard reception staff via invite codes, and approve mobile member plans live."}
          </p>

          <div className="mt-9 flex flex-wrap gap-2.5">
            {features.map((item) => (
              <span
                key={item}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-400">
          {tenantGym
            ? `Tenant isolation enforced for ${tenantState?.hostname}.`
            : "Protected with HTTP-only signed sessions and strict per-gym tenant isolation."}
        </p>
      </section>

      <section className="flex min-h-screen flex-col justify-between px-5 py-8 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span
              className="grid size-8 place-items-center rounded-[9px] text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {tenantGym ? tenantGym.branding.logoText : "G"}
            </span>
            <span className="text-lg font-semibold tracking-[-0.02em] text-[#18222e]">
              {tenantGym ? tenantGym.name : "GymOS"}
            </span>
          </div>
          <div className="ms-auto flex items-center gap-3">
            <LanguageSwitch />
            <Link
              href={isRegister ? "/login" : "/register"}
              className="text-xs font-semibold hover:opacity-85"
              style={{ color: accentColor }}
            >
              {isRegister
                ? "Sign in instead"
                : tenantGym
                  ? "Join staff with invite code"
                  : "Launch gym / Join staff"}
            </Link>
          </div>
        </div>

        <div className="mx-auto my-10 w-full max-w-[440px]">
          <div className="mb-6">
            {tenantGym && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#dce6e1] bg-white px-3 py-1 text-[11px] font-semibold text-[#354153] shadow-2xs">
                <Globe size={12} style={{ color: accentColor }} aria-hidden="true" />
                <span>{tenantState?.hostname}</span>
              </div>
            )}
            <h2 className="text-[26px] font-semibold tracking-[-0.03em] text-[#172433]">
              {isRegister
                ? effectiveRegistrationType === "create-gym"
                  ? "Launch your gym on GymOS"
                  : tenantGym
                    ? `Join ${tenantGym.name} staff`
                    : "Join your gym staff team"
                : tenantGym
                  ? `Sign in to ${tenantGym.name}`
                  : "Sign in to GymOS"}
            </h2>
            <p className="mt-1.5 text-[13px] leading-6 text-[#737e8e]">
              {isRegister
                ? effectiveRegistrationType === "create-gym"
                  ? "Create an isolated workspace for your gym with starter plans and owner access."
                  : tenantGym
                    ? `Enter the staff invitation code issued by ${tenantGym.name}'s owner.`
                    : "Enter the staff invitation code generated by your gym owner in Settings."
                : tenantGym
                  ? `Enter your ${tenantGym.name} staff or owner credentials to continue.`
                  : "Enter your staff or owner credentials to access your gym dashboard."}
            </p>
          </div>

          {isRegister && !tenantGym && (
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
            {isRegister && effectiveRegistrationType === "create-gym" && (
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

            {isRegister && effectiveRegistrationType === "join-gym" && (
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

            {infoNotice && (
              <p
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] leading-5 text-emerald-800"
              >
                {infoNotice}
              </p>
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
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(37,135,101,0.16)] transition hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
              style={{ backgroundColor: tenantGym ? accentColor : "#258765" }}
            >
              {pending
                ? isRegister
                  ? effectiveRegistrationType === "create-gym"
                    ? "Launching gym workspace..."
                    : "Joining gym..."
                  : "Signing in..."
                : isRegister
                  ? effectiveRegistrationType === "create-gym"
                    ? "Create gym workspace"
                    : "Join gym as staff"
                  : "Sign in"}
              {!pending && <ArrowRight size={16} className="rtl-flip" aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#737e8e]">
            {isRegister
              ? "Already have an account?"
              : tenantGym
                ? "Have a staff invitation code?"
                : "Launching a new gym or joining a team?"}{" "}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="font-semibold hover:opacity-85"
              style={{ color: tenantGym ? accentColor : "#258765" }}
            >
              {isRegister ? "Sign in" : tenantGym ? "Join with invite code" : "Create workspace / Join"}
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
