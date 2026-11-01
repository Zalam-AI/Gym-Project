"use client";

import { useState } from "react";
import {
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
      if (response.status === 401) {
        clearMobileSessionToken();
        await onRefreshPortal();
        return;
      }
      const data = await readMobileJson<{ error?: string; alreadyEnrolled?: boolean }>(
        response,
        "Unable to send your subscription request.",
      );
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
      if (response.status === 401) {
        clearMobileSessionToken();
        await onRefreshPortal();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to cancel request.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to cancel request.");
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
    <main className={ui.pageCanvas}>
      <section aria-label="GymOS member onboarding" className={ui.appFrame}>
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
              <p className="text-[9px] uppercase tracking-wide text-ink-muted">
                MEMBER APP
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5">
          {/* Member identity strip */}
          <div className={`${ui.card} mb-5 flex items-center gap-3 p-3.5`}>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-[12px] font-semibold text-accent-text"
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">
                {memberName}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-ink-secondary">
                {memberPhone}
                {memberEmail ? ` · ${memberEmail}` : ""}
              </p>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[11px] text-danger-text"
            >
              {error}
            </p>
          )}

          {/* STATE 1: PENDING STAFF ACCEPTANCE */}
          {pendingRequest && !connectedGym ? (
            <div className="space-y-4">
              <section className={`${ui.cardElevated} p-5`}>
                <div className={ui.badgeAccent}>
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  Sent to gym reception
                </div>
                <h1 className="mt-3 text-[19px] font-semibold tracking-[-0.03em] text-ink">
                  Waiting for staff approval
                </h1>
                <p className="mt-1.5 text-[11px] leading-4 text-ink-secondary">
                  Complete your{" "}
                  <span className="font-semibold text-ink">
                    {pendingRequest.paymentMethod}
                  </span>{" "}
                  payment with reception at{" "}
                  <span className="font-semibold text-ink">
                    {pendingRequest.gymName}
                  </span>
                  . Once staff clicks{" "}
                  <span className="font-semibold text-accent-text">Accept</span>, your gym pass unlocks automatically.
                </p>

                <div className={`${ui.cardSubtle} mt-4 space-y-2 p-3.5 text-[11px]`}>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Gym</span>
                    <span className="font-semibold text-ink">
                      {pendingRequest.gymName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-divider pt-2">
                    <span className="text-ink-secondary">Selected plan</span>
                    <span className="font-semibold text-ink">
                      {pendingRequest.planName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-divider pt-2">
                    <span className="text-ink-secondary">Amount to pay</span>
                    <span className="font-bold text-accent-text">
                      {formatEgp(pendingRequest.price)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-divider pt-2">
                    <span className="text-ink-secondary">Payment method</span>
                    <span className={ui.badgeNeutral}>
                      {pendingRequest.paymentMethod}
                    </span>
                  </div>
                </div>
              </section>

              <div className="flex items-center gap-2.5 rounded-2xl border border-accent-border bg-accent-soft p-3.5">
                <Clock3 size={17} className="shrink-0 text-accent-text" aria-hidden="true" />
                <p className="text-[10px] leading-4 text-ink">
                  Checking live… This screen updates automatically the moment gym staff accepts your payment.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => void manualCheckStatus()}
                  className={`${ui.btnPrimary} min-h-11 flex-1 px-3 text-[11px]`}
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
                  className={`${ui.btnSecondary} min-h-11 px-3.5 text-[11px]`}
                >
                  {isCancelling ? "Cancelling…" : "Change plan"}
                </button>
              </div>
            </div>
          ) : connectedGym ? (
            /* STATE 2: CONNECTED TO GYM VIA QR -> CHOOSE PLAN & PAYMENT METHOD */
            <div className="space-y-4">
              <section className="rounded-2xl border border-accent-border bg-accent-soft p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
                      <Building2 size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                        Connected via QR
                      </p>
                      <h1 className="mt-0.5 text-[15px] font-semibold text-ink">
                        {connectedGym.name}
                      </h1>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">
                        {connectedGym.address}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenJoinScanner}
                    className={`${ui.btnSecondary} shrink-0 px-2.5 py-1.5 text-[10px]`}
                  >
                    Rescan
                  </button>
                </div>
              </section>

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                  1. Choose your membership plan
                </p>
                {connectedGym.plans.length === 0 ? (
                  <div className={`${ui.card} p-5 text-center text-[11px] text-ink-secondary`}>
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
                          className={`w-full rounded-2xl border p-4 text-start transition-colors ${
                            selected
                              ? "border-accent bg-elevated"
                              : "border-line bg-surface hover:border-line-strong"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-ink">
                                  {plan.name}
                                </span>
                                {plan.featured && (
                                  <span className={ui.badgeAccent}>
                                    <Sparkles size={9} aria-hidden="true" />
                                    Best value
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[10px] text-ink-secondary">
                                Duration: {plan.durationLabel}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-bold text-ink">
                                {formatEgp(plan.price)}
                              </span>
                              <span
                                className={`grid size-5 place-items-center rounded-full border ${
                                  selected
                                    ? "border-accent bg-accent text-on-accent"
                                    : "border-line-strong bg-subtle"
                                }`}
                              >
                                {selected && <Check size={12} aria-hidden="true" />}
                              </span>
                            </div>
                          </div>

                          {plan.benefits.length > 0 && (
                            <ul className="mt-2.5 space-y-1 border-t border-divider pt-2.5">
                              {plan.benefits.slice(0, 3).map((benefit) => (
                                <li
                                  key={benefit}
                                  className="flex items-center gap-1.5 text-[10px] text-ink-secondary"
                                >
                                  <CheckCircle2
                                    size={11}
                                    className="shrink-0 text-accent-text"
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
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                    2. Choose how you will pay
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Cash", "Card", "Instapay"] as const).map((method) => {
                      const meta = PAYMENT_METHOD_META[method];
                      const Icon = meta.icon;
                      const isDisabled = method === "Card" || method === "Instapay";
                      const active = !isDisabled && paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          disabled={isDisabled}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (!isDisabled) setPaymentMethod(method);
                          }}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors ${
                            isDisabled
                              ? "cursor-not-allowed border-line bg-subtle text-ink-muted opacity-55"
                              : active
                                ? "border-accent bg-accent-soft text-accent-text"
                                : "border-line bg-surface text-ink-secondary hover:border-line-strong"
                          }`}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span className="text-[11px] font-semibold">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-ink-secondary">
                    {PAYMENT_METHOD_META[paymentMethod].hint} · Gym staff will get an instant notification to accept your{" "}
                    <span className="font-semibold text-ink">
                      {formatEgp(chosenPlan.price)}
                    </span>{" "}
                    payment.
                  </p>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void submitSubscriptionRequest()}
                    className={`${ui.btnPrimary} mt-4 min-h-13 w-full px-4 text-[12px]`}
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
            /* STATE 0: BRAND-NEW ACCOUNT -> SCAN GYM QR CODE */
            <div className="flex flex-col items-center pt-2 text-center">
              <div className={`${ui.cardElevated} w-full px-6 py-8`}>
                <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
                  <QrCode size={32} aria-hidden="true" />
                </span>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-text">
                  Account ready
                </p>
                <h1 className="mt-1.5 text-[21px] font-semibold tracking-[-0.035em] text-ink">
                  Connect to your gym
                </h1>
                <p className="mx-auto mt-2 max-w-[270px] text-[11px] leading-5 text-ink-secondary">
                  You&apos;re not enrolled in a gym plan yet. Scan the Reception QR code at the gym to view plans, choose how to pay, and activate your pass.
                </p>

                <button
                  type="button"
                  onClick={onOpenJoinScanner}
                  className={`${ui.btnPrimary} mt-6 flex min-h-13 w-full px-4 text-[13px]`}
                >
                  <ScanLine size={19} aria-hidden="true" />
                  Scan Gym QR Code
                </button>
              </div>
            </div>
          )}

          <ThemePreferenceControl className="mt-5" />
        </div>
      </section>
    </main>
  );
}
