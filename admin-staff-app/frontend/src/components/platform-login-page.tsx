"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Lock, Shield } from "lucide-react";
import { LanguageSwitch } from "@/lib/i18n";
import {
  clearPlatformSessionToken,
  ensurePlatformFetchPatched,
  setPlatformSessionToken,
} from "@/lib/platform-client-auth";

export function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tenantHostBlocked, setTenantHostBlocked] = useState(false);

  useEffect(() => {
    ensurePlatformFetchPatched();
    let active = true;
    fetch("/api/tenant", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { mode?: string }) => {
        if (active && data.mode && data.mode !== "neutral") {
          setTenantHostBlocked(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    clearPlatformSessionToken();

    try {
      const response = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as {
        error?: string;
        sessionToken?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Platform authentication failed.");
        return;
      }
      if (data.sessionToken) {
        setPlatformSessionToken(data.sessionToken);
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error while contacting the Leeloo Connect Super Admin Console.");
    } finally {
      setPending(false);
    }
  }

  if (tenantHostBlocked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0f172a] p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-white">Main Platform Portal Required</h1>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            Platform administration is disabled on individual gym subdomains and custom domains.
            Access this console from the primary GymOS platform host.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0f172a] px-5 py-10 text-slate-100">
      <div className="w-full max-w-[440px]">
        <div className="mb-4 flex justify-end">
          <LanguageSwitch variant="dark" />
        </div>
        <div className="mb-7 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/25">
            <Shield size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em] text-white">
              Leeloo <span className="text-indigo-400">Connect</span>
            </p>
            <p className="text-[11px] font-medium text-slate-400">
              Super Admin Dashboard &amp; Multi-Gym Control Plane
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl">
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
              <Lock size={11} aria-hidden="true" />
              Super Admin Only
            </span>
            <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-white">
              Super Admin Sign In
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-slate-400">
              Exclusively for authorized Leeloo Connect platform owners. Individual gym admins and
              staff sign in through their dedicated <span className="font-mono text-slate-300">/gym/&lt;slug&gt;</span> workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-300">
                Platform Admin Email
              </span>
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="platform-owner@gymos.com"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-[13px] text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-300">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter platform password"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-[13px] text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-65"
            >
              <span>{pending ? "Verifying credentials…" : "Sign in to Platform Console"}</span>
              {!pending && <ArrowRight size={15} className="rtl-flip" aria-hidden="true" />}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500">
          All sign-in events and administrative mutations are recorded in the platform audit log.
          {" "}Looking for a club workspace?{" "}
          <a href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
            Gym Staff Sign In
          </a>
        </p>
      </div>
    </main>
  );
}
