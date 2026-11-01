"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  Calendar,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Receipt,
  Search,
  X,
} from "lucide-react";
import type { SaasPlanRow } from "@/components/super-admin-plans-tab";

export type SaasPaymentRow = {
  id: string;
  gymId: string;
  gymName: string;
  gymSlug: string;
  planCode: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  receiptNumber: string;
  referenceNote: string;
  recordedByName: string;
};

export type SubscriptionGymItem = {
  id: string;
  name: string;
  slug: string;
  workspacePath: string;
  status: "pending" | "active" | "suspended";
  currency: string;
  platformSubscription: {
    planId?: string | null;
    planCode?: string;
    planName?: string;
    planTier: string;
    billingStatus: string;
    paymentStatus?: string;
    billingCycle: "monthly" | "annual" | "custom";
    priceAmount?: number;
    monthlyRecurringAmount?: number;
    startDate?: string | null;
    expirationDate?: string | null;
    renewalDate: string | null;
    gracePeriodDays?: number;
    lifecycleState?: string;
    inGracePeriod?: boolean;
    isExpired?: boolean;
    accessAllowed?: boolean;
    notes: string;
  };
};

const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "Instapay Manual",
  "Corporate Invoice",
  "Check",
  "Other",
] as const;

function formatMoney(amount: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RecordSaasPaymentModal({
  open,
  gyms,
  plans,
  initialGymId,
  onClose,
  onSuccess,
  onError,
}: {
  open: boolean;
  gyms: SubscriptionGymItem[];
  plans: SaasPlanRow[];
  initialGymId: string;
  onClose: () => void;
  onSuccess: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const targetGym = gyms.find((g) => g.id === initialGymId) ?? gyms[0] ?? null;
  const defaultCode =
    targetGym?.platformSubscription.planCode ||
    targetGym?.platformSubscription.planTier ||
    "starter";
  const matchedPlan = plans.find((p) => p.code === defaultCode) ?? plans[0] ?? null;

  const [gymId, setGymId] = useState(initialGymId || (targetGym?.id ?? ""));
  const [planCode, setPlanCode] = useState(matchedPlan?.code ?? defaultCode);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual" | "custom">(
    targetGym?.platformSubscription.billingCycle ?? "monthly",
  );
  const [amount, setAmount] = useState(
    String(
      matchedPlan
        ? (targetGym?.platformSubscription.billingCycle === "annual"
            ? matchedPlan.annualPrice
            : matchedPlan.monthlyPrice)
        : (targetGym?.platformSubscription.priceAmount ?? 1800),
    ),
  );
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [extendSubscription, setExtendSubscription] = useState(true);
  const [extensionMonths, setExtensionMonths] = useState(
    targetGym?.platformSubscription.billingCycle === "annual" ? "12" : "1",
  );
  const [newExpirationDate, setNewExpirationDate] = useState("");
  const [reactivateIfSuspended, setReactivateIfSuspended] = useState(true);
  const [referenceNote, setReferenceNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function handlePlanOrCycleChange(nextPlanCode: string, nextCycle: "monthly" | "annual" | "custom") {
    setPlanCode(nextPlanCode);
    setBillingCycle(nextCycle);
    const found = plans.find((p) => p.code === nextPlanCode);
    if (found) {
      setAmount(String(nextCycle === "annual" ? found.annualPrice : found.monthlyPrice));
    }
    if (nextCycle === "annual") setExtensionMonths("12");
    else if (nextCycle === "monthly") setExtensionMonths("1");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const res = await fetch("/api/platform/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-payment",
          gymId,
          planCode,
          billingCycle,
          amount: Number(amount),
          paymentMethod,
          paymentStatus,
          extendSubscription,
          extensionMonths: Number(extensionMonths),
          newExpirationDate: newExpirationDate.trim() || undefined,
          reactivateIfSuspended,
          referenceNote: referenceNote.trim(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        payment?: { receiptNumber: string; gymName: string };
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Unable to record manual payment.");
      }
      onClose();
      await onSuccess(
        `Recorded manual payment (${json.payment?.receiptNumber ?? "Receipt"}) for ${
          json.payment?.gymName ?? "gym"
        }.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to record manual payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Record Manual SaaS Payment &amp; Renewal
            </h3>
            <p className="text-[11px] text-slate-500">
              Manual offline billing entry — no external payment gateway is invoked.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Gym Workspace</span>
          <select
            required
            value={gymId}
            onChange={(e) => setGymId(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
          >
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.workspacePath})
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">SaaS Plan</span>
            <select
              value={planCode}
              onChange={(e) => handlePlanOrCycleChange(e.target.value, billingCycle)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
            >
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({formatMoney(p.monthlyPrice, p.currency)}/mo)
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Billing Cycle</span>
            <select
              value={billingCycle}
              onChange={(e) =>
                handlePlanOrCycleChange(
                  planCode,
                  e.target.value as "monthly" | "annual" | "custom",
                )
              }
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom Term</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Amount (EGP)</span>
            <input
              type="number"
              min={0}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Payment Method</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Payment Status</span>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as "paid" | "pending")}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
            >
              <option value="paid">Paid (Confirmed)</option>
              <option value="pending">Pending Verification</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={extendSubscription}
              onChange={(e) => setExtendSubscription(e.target.checked)}
              className="size-4 rounded border-slate-300 text-indigo-600"
            />
            <span>Automatically renew &amp; extend subscription expiration date</span>
          </label>

          {extendSubscription && paymentStatus === "paid" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Extend By (Months)
                </span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={extensionMonths}
                  onChange={(e) => setExtensionMonths(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Or Exact Expiration Date (Optional)
                </span>
                <input
                  type="date"
                  value={newExpirationDate}
                  onChange={(e) => setNewExpirationDate(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                />
              </label>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={reactivateIfSuspended}
              onChange={(e) => setReactivateIfSuspended(e.target.checked)}
              className="size-4 rounded border-slate-300 text-indigo-600"
            />
            <span>Reactivate gym workspace automatically if currently suspended</span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Reference / Transfer Note
          </span>
          <input
            maxLength={500}
            value={referenceNote}
            onChange={(e) => setReferenceNote(e.target.value)}
            placeholder="e.g. CIB wire ref #99412 · collected in person"
            className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-xl border border-slate-300 px-4 text-xs font-medium text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !gymId}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving && <LoaderCircle size={13} className="animate-spin" />}
            <span>Record Payment</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function SuperAdminSubscriptionsTab({
  gyms,
  payments,
  totalCollected,
  collectedThisMonth,
  mrr,
  canWrite,
  onOpenRecordPayment,
  onOpenManageSubscription,
  onOpenGymDetails,
  onToggleGymStatus,
}: {
  gyms: SubscriptionGymItem[];
  payments: SaasPaymentRow[];
  totalCollected: number;
  collectedThisMonth: number;
  mrr: number;
  canWrite: boolean;
  onOpenRecordPayment: (gymId?: string) => void;
  onOpenManageSubscription: (gymId: string) => void;
  onOpenGymDetails: (gymId: string) => void;
  onToggleGymStatus: (gymId: string, nextStatus: "active" | "suspended") => Promise<void>;
}) {
  const [filter, setFilter] = useState<
    "all" | "active" | "trialing" | "grace_period" | "expired" | "suspended"
  >("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gyms.filter((g) => {
      const sub = g.platformSubscription;
      if (filter === "suspended" && g.status !== "suspended") return false;
      if (filter === "expired" && !sub.isExpired) return false;
      if (filter === "grace_period" && !sub.inGracePeriod) return false;
      if (filter === "trialing" && sub.lifecycleState !== "trialing") return false;
      if (filter === "active" && (sub.lifecycleState !== "active" || g.status !== "active")) {
        return false;
      }
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q) ||
        (sub.planName ?? "").toLowerCase().includes(q)
      );
    });
  }, [gyms, filter, search]);

  return (
    <div className="space-y-6">
      {/* Billing KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Monthly Recurring Revenue (MRR)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(mrr)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Normalized monthly rate across active paid club subscriptions
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Collected This Month (Manual)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {formatMoney(collectedThisMonth)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Confirmed manual payments recorded in current UTC month
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Total SaaS Revenue Collected</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totalCollected)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {payments.length} manual payment {payments.length === 1 ? "entry" : "entries"} on file
          </p>
        </div>
      </div>

      {/* Gym Subscriptions Filter & Table */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Gym Subscriptions, Renewals &amp; Grace Periods
            </h2>
            <p className="text-xs text-slate-500">
              Assign plans, set start &amp; expiration dates, configure grace periods, record manual
              payments, and suspend expired clubs.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => onOpenRecordPayment(gyms[0]?.id)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <CreditCard size={15} />
              <span>Record Manual Payment</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by gym name, slug, or plan…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pe-3 ps-8 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "trialing", label: "Trialing" },
                { id: "grace_period", label: "Grace Period" },
                { id: "expired", label: "Expired" },
                { id: "suspended", label: "Suspended" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  filter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3.5 py-3">Gym</th>
                <th className="px-3.5 py-3">Plan &amp; Rate</th>
                <th className="px-3.5 py-3">Payment / Lifecycle</th>
                <th className="px-3.5 py-3">Start → Expiration</th>
                <th className="px-3.5 py-3">Grace Period</th>
                <th className="px-3.5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No gym subscriptions match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const sub = g.platformSubscription;
                  const state = sub.lifecycleState || sub.billingStatus;
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenGymDetails(g.id)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600"
                        >
                          {g.name}
                        </button>
                        <div className="mt-0.5 flex items-center gap-2">
                          <a
                            href={g.workspacePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-600 hover:underline"
                          >
                            {g.workspacePath}
                            <ExternalLink size={10} />
                          </a>
                          {g.status === "suspended" && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              Suspended
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        <p className="font-semibold text-slate-900">
                          {sub.planName || sub.planTier.toUpperCase()}
                        </p>
                        <p className="text-[11px] text-slate-500 capitalize">
                          {formatMoney(sub.priceAmount ?? 0, g.currency)} · {sub.billingCycle}
                        </p>
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                            sub.isExpired
                              ? "bg-rose-100 text-rose-800"
                              : sub.inGracePeriod
                                ? "bg-amber-100 text-amber-800"
                                : state === "active"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : state === "trialing"
                                    ? "bg-sky-50 text-sky-700"
                                    : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {state.replace("_", " ")}
                        </span>
                        <p className="mt-0.5 text-[10px] text-slate-500 capitalize">
                          Payment: {(sub.paymentStatus ?? sub.billingStatus).replace("_", " ")}
                        </p>
                      </td>
                      <td className="px-3.5 py-3 text-[11px] text-slate-700">
                        <p>Start: {formatDate(sub.startDate)}</p>
                        <p className="font-medium">
                          Expires: {formatDate(sub.expirationDate ?? sub.renewalDate)}
                        </p>
                      </td>
                      <td className="px-3.5 py-3 text-[11px] text-slate-600">
                        {sub.gracePeriodDays ?? 7} days
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        {canWrite ? (
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenRecordPayment(g.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                            >
                              <CreditCard size={12} />
                              Record Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenManageSubscription(g.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Calendar size={12} />
                              Plan &amp; Dates
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void onToggleGymStatus(
                                  g.id,
                                  g.status === "active" ? "suspended" : "active",
                                )
                              }
                              className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium ${
                                g.status === "active"
                                  ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : "bg-indigo-600 text-white hover:bg-indigo-500"
                              }`}
                            >
                              {g.status === "active" ? (
                                <>
                                  <PauseCircle size={12} />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <PlayCircle size={12} />
                                  Activate
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform-wide Manual SaaS Payment Ledger */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Manual SaaS Payment History ({payments.length})
            </h3>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="rounded-xl bg-slate-50 py-6 text-center text-xs text-slate-500">
            No manual SaaS payments recorded yet. Use &ldquo;Record Manual Payment&rdquo; above to
            log club renewals.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">Gym</th>
                  <th className="px-3 py-2.5">Plan &amp; Cycle</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Renewed Until</th>
                  <th className="px-3 py-2.5">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-800">
                      {p.receiptNumber}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{p.gymName}</td>
                    <td className="px-3 py-2.5 text-slate-700 capitalize">
                      {p.planName} · {p.billingCycle}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{p.paymentMethod}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                          p.paymentStatus === "paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.paymentStatus === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(p.periodEnd)}</td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-500">
                      {p.recordedByName} · {formatDate(p.paidAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
