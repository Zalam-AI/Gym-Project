"use client";

import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Check, CheckCircle2, Plus, RefreshCw, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type Plan = {
  id: string;
  name: string;
  price: number;
  durationMonths: number;
  durationLabel: string;
  benefits: string[];
  featured?: boolean;
};

type Subscription = {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  startDate: string;
  expirationDate: string;
  paymentStatus: "Paid" | "Pending";
};

const localDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function addMonths(dateValue: string, months: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return localDateValue(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatEgp(amount: number) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type ModalFrameProps = {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
};

function ModalFrame({ title, description, onClose, children }: ModalFrameProps) {
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4"
      onMouseDown={handleBackdropClick}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-modal-title"
        aria-describedby="membership-modal-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "Tab") {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
              ),
            );
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
        className="my-auto w-full max-w-[500px] rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.2)] sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="membership-modal-title" className="text-[19px] font-semibold tracking-[-0.03em] text-[#263344]">
              {title}
            </h2>
            <p id="membership-modal-description" className="mt-1.5 text-[12px] text-[#84909d]">
              {description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[#788391] hover:bg-[#f4f6f7]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

type AddPlanModalProps = {
  onClose: () => void;
  onAdd: (plan: Omit<Plan, "id">) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function AddPlanModal({ onClose, onAdd, isSaving, error }: AddPlanModalProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [durationMonths, setDurationMonths] = useState("1");
  const [benefits, setBenefits] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const months = Number(durationMonths);
    void onAdd({
      name: name.trim(),
      price: Number(price),
      durationMonths: months,
      durationLabel: `${months} ${months === 1 ? "month" : "months"}`,
      benefits: benefits.split("\n").map((benefit) => benefit.trim()).filter(Boolean),
    });
  }

  return (
    <ModalFrame
      title="Add a membership plan"
      description="Create a plan for your gym's membership options."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div>
          <label htmlFor="plan-name" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Plan name</label>
          <input
            autoFocus
            id="plan-name"
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. 6 Month Flex"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="plan-price" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Price (EGP)</label>
            <input
              id="plan-price"
              type="number"
              min="1"
              step="1"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 2800"
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
            />
          </div>
          <div>
            <label htmlFor="plan-duration" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Duration</label>
            <select
              id="plan-duration"
              value={durationMonths}
              onChange={(event) => setDurationMonths(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
            >
              {[1, 2, 3, 6, 9, 12, 24].map((months) => (
                <option key={months} value={months}>{months} {months === 1 ? "month" : "months"}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="plan-benefits" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Benefits</label>
          <textarea
            id="plan-benefits"
            rows={3}
            maxLength={300}
            value={benefits}
            onChange={(event) => setBenefits(event.target.value)}
            placeholder={"Enter one benefit per line\nGym floor access\nGroup classes"}
            className="w-full resize-y rounded-lg border border-[#e3e8ec] px-3 py-2.5 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">
            {isSaving ? "Adding…" : "Add plan"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

type RenewalModalProps = {
  subscription: Subscription;
  plan: Plan;
  onClose: () => void;
  onConfirm: (startDate: string, paymentStatus: Subscription["paymentStatus"]) => Promise<void>;
  isSaving: boolean;
  error: string;
};

function RenewalModal({ subscription, plan, onClose, onConfirm, isSaving, error }: RenewalModalProps) {
  const [startDate, setStartDate] = useState(() => {
    const expiration = new Date(`${subscription.expirationDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiration < today) return localDateValue(today);
    expiration.setDate(expiration.getDate() + 1);
    return localDateValue(expiration);
  });
  const [paymentStatus, setPaymentStatus] = useState<Subscription["paymentStatus"]>(subscription.paymentStatus);
  const expirationDate = addMonths(startDate, plan.durationMonths);

  return (
    <ModalFrame
      title="Renew membership"
      description={`Confirm renewal for ${subscription.memberName}.`}
      onClose={onClose}
    >
      <div className="mb-5 rounded-xl bg-[#f7f9fa] p-4">
        <p className="text-[12px] font-semibold text-[#354153]">{subscription.memberName}</p>
        <p className="mt-1 text-[11px] text-[#788391]">{plan.name} · {formatEgp(plan.price)}</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm(startDate, paymentStatus);
        }}
        className="space-y-4"
      >
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div>
          <label htmlFor="renewal-start-date" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Renewal start date</label>
          <input
            id="renewal-start-date"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          />
        </div>
        <div className="rounded-lg border border-[#edf0f2] px-3.5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#8993a0]">New expiration date</p>
          <p className="mt-1 text-[13px] font-semibold text-[#354153]">{formatDate(expirationDate)}</p>
        </div>
        <div>
          <label htmlFor="renewal-payment" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Payment status</label>
          <select
            id="renewal-payment"
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value as Subscription["paymentStatus"])}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          >
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={14} aria-hidden="true" />
            {isSaving ? "Saving…" : "Confirm renewal"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function MembershipsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [renewingSubscriptionId, setRenewingSubscriptionId] = useState<string | null>(null);

  async function loadMemberships() {
    setIsLoading(true);
    setApiError("");
    try {
      const response = await fetch("/api/memberships", { cache: "no-store" });
      const data = await response.json() as { plans?: Plan[]; subscriptions?: Subscription[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load memberships.");
      setPlans(data.plans ?? []);
      setSubscriptions(data.subscriptions ?? []);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load memberships.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMemberships();
  }, []);

  async function addPlan(plan: Omit<Plan, "id">) {
    setIsSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", ...plan }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to add this plan.");
      setIsPlanModalOpen(false);
      await loadMemberships();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to add this plan.");
    } finally {
      setIsSaving(false);
    }
  }

  const renewingSubscription = subscriptions.find((subscription) => subscription.id === renewingSubscriptionId);
  const renewingPlan = renewingSubscription && plans.find((plan) => plan.id === renewingSubscription.planId);

  async function confirmRenewal(startDate: string, paymentStatus: Subscription["paymentStatus"]) {
    if (!renewingSubscription || !renewingPlan) return;
    setIsSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "renew",
          membershipId: renewingSubscription.id,
          startDate,
          paymentStatus,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to renew this membership.");
      setRenewingSubscriptionId(null);
      await loadMemberships();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to renew this membership.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell activePage="Memberships">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Workspace</p>
          <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">Memberships</h1>
          <p className="mt-1.5 text-[13px] text-[#788391]">Manage your plans, subscriptions, and upcoming renewals.</p>
        </div>
        {apiError && !isPlanModalOpen && renewingSubscriptionId === null && (
          <p role="alert" className="mb-5 rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-4 py-3 text-[12px] text-[#a9433b]">{apiError}</p>
        )}

        <section aria-labelledby="plans-heading" className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="plans-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Plans overview</h2>
              <p className="mt-1 text-[11px] text-[#87909d]">Membership options available at your gym</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPlanModalOpen(true)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-3.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4]"
            >
              <Plus size={15} aria-hidden="true" />
              Add New Plan
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {!isLoading && plans.length === 0 && (
              <p className="text-[12px] text-[#8993a0]">No membership plans yet.</p>
            )}
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col p-5 sm:p-6 ${plan.featured ? "border-[#cde9dc] shadow-[0_4px_18px_rgba(45,157,120,0.08)]" : ""}`}
              >
                {plan.featured && (
                  <span className="absolute right-5 top-5 rounded-full bg-[#eaf6f0] px-2.5 py-1 text-[9px] font-semibold text-[#278968]">
                    BEST VALUE
                  </span>
                )}
                <p className="pr-20 text-[13px] font-semibold text-[#354153]">{plan.name}</p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[27px] font-semibold leading-none tracking-[-0.045em] text-[#253243]">{formatEgp(plan.price)}</span>
                  <span className="text-[11px] text-[#8993a0]">/ {plan.durationLabel}</span>
                </div>
                <div className="my-5 h-px bg-[#edf0f2]" />
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#8993a0]">Plan benefits</p>
                <ul className="space-y-2.5">
                  {plan.benefits.length > 0 ? plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-[11px] text-[#687585]">
                      <Check size={14} className="mt-px shrink-0 text-[#36a47b]" aria-hidden="true" />
                      {benefit}
                    </li>
                  )) : (
                    <li className="text-[11px] text-[#8993a0]">No benefits listed</li>
                  )}
                </ul>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="subscriptions-heading">
          <div className="mb-4">
            <h2 id="subscriptions-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Active subscriptions &amp; renewals</h2>
            <p className="mt-1 text-[11px] text-[#87909d]">Review membership periods and manage renewals</p>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-left">
                <caption className="sr-only">Member subscriptions, plan dates, payment status, and renewal actions</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Member", "Plan", "Start date", "Expiration date", "Payment status", "Action"].map((heading) => (
                      <th key={heading} scope="col" className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {!isLoading && subscriptions.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-[12px] text-[#8993a0]">No active subscriptions found.</td></tr>
                  )}
                  {subscriptions.map((subscription) => {
                    const plan = plans.find((item) => item.id === subscription.planId);
                    return (
                      <tr key={subscription.id} className="transition-colors hover:bg-[#fbfcfc]">
                        <th scope="row" className="px-5 py-4 text-[12px] font-semibold text-[#354153]">{subscription.memberName}</th>
                        <td className="px-5 py-4 text-[12px] text-[#596575]">{plan?.name ?? "Plan unavailable"}</td>
                        <td className="px-5 py-4 text-[12px] text-[#6f7b89]">{formatDate(subscription.startDate)}</td>
                        <td className="px-5 py-4 text-[12px] text-[#6f7b89]">{formatDate(subscription.expirationDate)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            subscription.paymentStatus === "Paid"
                              ? "bg-[#eaf6f0] text-[#288865]"
                              : "bg-[#fff4e8] text-[#bd7838]"
                          }`}>
                            {subscription.paymentStatus === "Paid" ? (
                              <CheckCircle2 size={12} aria-hidden="true" />
                            ) : (
                              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                            )}
                            {subscription.paymentStatus}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setRenewingSubscriptionId(subscription.id)}
                            disabled={!plan}
                            aria-label={`Renew membership for ${subscription.memberName}`}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#dce7e1] bg-white px-2.5 text-[10px] font-semibold text-[#278968] hover:bg-[#f1f8f4] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RefreshCw size={12} aria-hidden="true" />
                            Renew Membership
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              {isLoading ? "Loading memberships…" : `${subscriptions.length} active subscriptions · Live gym data`}
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">GymOS · Memberships</footer>
      </main>
      {isPlanModalOpen && (
        <AddPlanModal onClose={() => setIsPlanModalOpen(false)} onAdd={addPlan} isSaving={isSaving} error={apiError} />
      )}
      {renewingSubscription && renewingPlan && (
        <RenewalModal
          key={renewingSubscription.id}
          subscription={renewingSubscription}
          plan={renewingPlan}
          onClose={() => setRenewingSubscriptionId(null)}
          onConfirm={confirmRenewal}
          isSaving={isSaving}
          error={apiError}
        />
      )}
    </AppShell>
  );
}
