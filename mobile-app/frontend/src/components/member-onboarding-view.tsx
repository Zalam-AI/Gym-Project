"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  LogOut,
  QrCode,
  RefreshCw,
  ScanLine,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { mobileFetch } from "@/lib/mobile-fetch";

export type GymPlanOption = {
  id: string;
  name: string;
  price: number;
  durationMonths: number;
  durationLabel: string;
  benefits: string[];
  featured: boolean;
};

export type ConnectedGymInfo = {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  plans: GymPlanOption[];
  paymentMethods: Array<"Cash" | "Card" | "Instapay">;
};

export type PendingSubscriptionInfo = {
  id: string;
  gymId: string;
  gymName: string;
  planName: string;
  price: number;
  durationMonths: number;
  paymentMethod: "Cash" | "Card" | "Instapay";
  createdAt: string;
};

type PaymentMethodChoice = "Cash" | "Card" | "Instapay";

function formatEgp(amount: number) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

const PAYMENT_METHOD_META: Record<
  PaymentMethodChoice,
  { label: string; hint: string; icon: typeof Banknote }
> = {
  Cash: {
    label: "Cash",
    hint: "Pay cash at the reception desk",
    icon: Banknote,
  },
  Card: {
    label: "Card",
    hint: "Pay by card terminal at reception",
    icon: CreditCard,
  },
  Instapay: {
    label: "Instapay",
    hint: "Instant transfer & show front desk",
    icon: Smartphone,
  },
};

export function MemberOnboardingView({
  adminAppUrl,
  memberName,
  memberPhone,
  memberEmail,
  connectedGym,
  pendingRequest,
  isLoggingOut,
  onOpenJoinScanner,
  onClearConnectedGym,
  onRefreshPortal,
  onLogout,
}: {
  adminAppUrl: string;
  memberName: string;
  memberPhone: string;
  memberEmail?: string;
  connectedGym: ConnectedGymInfo | null;
  pendingRequest: PendingSubscriptionInfo | null;
  isLoggingOut: boolean;
  onOpenJoinScanner: () => void;
  onClearConnectedGym: () => void;
  onRefreshPortal: () => Promise<boolean>;
  onLogout: () => Promise<void>;
}) {
  const defaultPlanId =
    connectedGym?.plans.find((p) => p.featured)?.id ??
    connectedGym?.plans[0]?.id ??
    "";

  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlanId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const activePlanId =
    connectedGym?.plans.some((p) => p.id === selectedPlanId)
      ? selectedPlanId
      : defaultPlanId;
  const chosenPlan = connectedGym?.plans.find((p) => p.id === activePlanId) ?? null;

  async function submitSubscriptionRequest() {
    if (!connectedGym || !chosenPlan) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await mobileFetch("/api/member-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "subscribe",
          gymId: connectedGym.id,
          planId: chosenPlan.id,
          paymentMethod,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to send your subscription request.");
      }
      onClearConnectedGym();
      await onRefreshPortal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send your subscription request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelPendingAndChange() {
    setIsCancelling(true);
    setError("");
    try {
      const response = await mobileFetch("/api/member-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!response.ok) {
        throw new Error("Unable to cancel request.");
      }
      await onRefreshPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel request.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function manualCheckStatus() {
    setIsRefreshing(true);
    try {
      await onRefreshPortal();
    } finally {
      setIsRefreshing(false);
    }
  }

  const initials =
    memberName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "MB";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#edf1f2] px-0 py-0 sm:px-6 sm:py-8">
      <section
        aria-label="GymOS member onboarding"
        className="flex h-[100dvh] w-full max-w-[410px] flex-col overflow-hidden bg-[#f7f8fa] shadow-[0_24px_80px_rgba(24,33,47,0.16)] sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-[34px] sm:border-[7px] sm:border-[#172433]"
      >
        {/* Header — notice NO gym branch/name is shown before staff accepts! */}
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
              <p className="text-[9px] uppercase tracking-wide text-[#8993a0]">
                MEMBER APP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={adminAppUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-[#74808e] hover:bg-[#f3f5f6]"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Staff Web
            </a>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5">
          {/* Member identity strip — clean, no gym branch, no renewal warning */}
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e9edf1] bg-white p-3.5">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e8f4ee] text-[12px] font-semibold text-[#2e8868]"
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#243242]">
                {memberName}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[#87909d]">
                {memberPhone}
                {memberEmail ? ` · ${memberEmail}` : ""}
              </p>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-[#f1d2cd] bg-[#fff6f4] px-3.5 py-2.5 text-[11px] text-[#a9433b]"
            >
              {error}
            </p>
          )}

          {/* STATE 1: PENDING STAFF ACCEPTANCE */}
          {pendingRequest && !connectedGym ? (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-[22px] bg-[#172433] p-5 text-white shadow-[0_12px_30px_rgba(23,36,51,0.17)]">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#8bdbb7]">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#63d4a3]" />
                  Sent to gym reception
                </div>
                <h1 className="mt-3 text-[19px] font-semibold tracking-[-0.03em]">
                  Waiting for staff approval
                </h1>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-300">
                  Complete your <span className="font-semibold text-white">{pendingRequest.paymentMethod}</span> payment with reception at{" "}
                  <span className="font-semibold text-white">{pendingRequest.gymName}</span>. Once staff clicks{" "}
                  <span className="font-semibold text-[#8bdbb7]">Accept</span>, your gym pass unlocks automatically.
                </p>

                <div className="mt-4 space-y-2 rounded-xl bg-white/[0.07] p-3.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Gym</span>
                    <span className="font-semibold text-white">{pendingRequest.gymName}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-2">
                    <span className="text-slate-400">Selected plan</span>
                    <span className="font-semibold text-white">{pendingRequest.planName}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-2">
                    <span className="text-slate-400">Amount to pay</span>
                    <span className="font-bold text-[#8bdbb7]">
                      {formatEgp(pendingRequest.price)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-2">
                    <span className="text-slate-400">Payment method</span>
                    <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {pendingRequest.paymentMethod}
                    </span>
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-2.5 rounded-2xl border border-[#dceee4] bg-[#f2faf5] p-3.5">
                <Clock3 size={17} className="shrink-0 text-[#278968]" aria-hidden="true" />
                <p className="text-[10px] leading-4 text-[#355649]">
                  Checking live… This screen updates automatically the moment gym staff accepts your payment.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => void manualCheckStatus()}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#278968] px-3 text-[11px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    className={isRefreshing ? "animate-spin" : ""}
                    aria-hidden="true"
                  />
                  {isRefreshing ? "Checking…" : "Refresh status"}
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => void cancelPendingAndChange()}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e3e8ec] bg-white px-3.5 text-[11px] font-medium text-[#687585] hover:bg-slate-50 disabled:opacity-60"
                >
                  {isCancelling ? "Cancelling…" : "Change plan"}
                </button>
              </div>
            </div>
          ) : connectedGym ? (
            /* STATE 2: CONNECTED TO GYM VIA QR -> CHOOSE PLAN & PAYMENT METHOD */
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#cfe9dc] bg-[#f1faf5] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#278968] text-white">
                      <Building2 size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#278968]">
                        Connected via QR
                      </p>
                      <h1 className="mt-0.5 text-[15px] font-semibold text-[#1f2b39]">
                        {connectedGym.name}
                      </h1>
                      <p className="mt-0.5 text-[10px] text-[#687585]">
                        {connectedGym.address}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenJoinScanner}
                    className="shrink-0 rounded-lg border border-[#cfe9dc] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#278968] hover:bg-[#eaf6f0]"
                  >
                    Rescan
                  </button>
                </div>
              </section>

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#687585]">
                  1. Choose your membership plan
                </p>
                {connectedGym.plans.length === 0 ? (
                  <div className="rounded-2xl border border-[#e9edf1] bg-white p-5 text-center text-[11px] text-[#87909d]">
                    This gym has not published any active membership plans yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {connectedGym.plans.map((plan) => {
                      const selected = plan.id === activePlanId;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition-all ${
                            selected
                              ? "border-[#278968] bg-white ring-2 ring-[#278968]/15"
                              : "border-[#e6eaee] bg-white hover:border-[#cad4dc]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-[#243242]">
                                  {plan.name}
                                </span>
                                {plan.featured && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf6f0] px-2 py-0.5 text-[8px] font-bold uppercase text-[#278968]">
                                    <Sparkles size={9} aria-hidden="true" />
                                    Best value
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[10px] text-[#87909d]">
                                Duration: {plan.durationLabel}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-bold text-[#1f2b39]">
                                {formatEgp(plan.price)}
                              </span>
                              <span
                                className={`grid size-5 place-items-center rounded-full border ${
                                  selected
                                    ? "border-[#278968] bg-[#278968] text-white"
                                    : "border-[#cfd7df] bg-white"
                                }`}
                              >
                                {selected && <Check size={12} aria-hidden="true" />}
                              </span>
                            </div>
                          </div>

                          {plan.benefits.length > 0 && (
                            <ul className="mt-2.5 space-y-1 border-t border-[#f0f2f5] pt-2.5">
                              {plan.benefits.slice(0, 3).map((benefit) => (
                                <li
                                  key={benefit}
                                  className="flex items-center gap-1.5 text-[10px] text-[#687585]"
                                >
                                  <CheckCircle2
                                    size={11}
                                    className="shrink-0 text-[#36a47b]"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {chosenPlan && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#687585]">
                    2. Choose how you will pay
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Cash", "Card", "Instapay"] as const).map((method) => {
                      const meta = PAYMENT_METHOD_META[method];
                      const Icon = meta.icon;
                      const active = paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all ${
                            active
                              ? "border-[#278968] bg-[#eaf6f0] text-[#237e5f] ring-2 ring-[#278968]/15"
                              : "border-[#e6eaee] bg-white text-[#526071] hover:border-[#cad4dc]"
                          }`}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span className="text-[11px] font-semibold">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-[#788391]">
                    {PAYMENT_METHOD_META[paymentMethod].hint} · Gym staff will get an instant notification to accept your{" "}
                    <span className="font-semibold text-[#243242]">
                      {formatEgp(chosenPlan.price)}
                    </span>{" "}
                    payment.
                  </p>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void submitSubscriptionRequest()}
                    className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#278968] px-4 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(39,137,104,0.22)] hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSubmitting && (
                      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                    )}
                    {isSubmitting
                      ? "Sending to gym staff…"
                      : `Confirm ${chosenPlan.name} · ${formatEgp(chosenPlan.price)} (${paymentMethod})`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* STATE 0: BRAND-NEW ACCOUNT -> ONLY OPTION IS SCAN GYM QR CODE! */
            <div className="flex flex-col items-center pt-4 text-center">
              <div className="w-full overflow-hidden rounded-[24px] bg-[#172433] px-6 py-8 text-white shadow-[0_14px_34px_rgba(23,36,51,0.18)]">
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#278968]/25 text-[#8bdbb7] ring-1 ring-[#8bdbb7]/30">
                  <QrCode size={32} aria-hidden="true" />
                </span>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#82cdb0]">
                  Account ready
                </p>
                <h1 className="mt-1.5 text-[21px] font-semibold tracking-[-0.035em]">
                  Connect to your gym
                </h1>
                <p className="mx-auto mt-2 max-w-[270px] text-[11px] leading-5 text-slate-300">
                  You&apos;re not enrolled in a gym plan yet. Scan the Reception QR code at the gym to view plans, choose how to pay, and activate your pass.
                </p>

                <button
                  type="button"
                  onClick={onOpenJoinScanner}
                  className="mt-6 flex min-h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#278968] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(39,137,104,0.3)] transition-colors hover:bg-[#207858]"
                >
                  <ScanLine size={19} aria-hidden="true" />
                  Scan Gym QR Code
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
