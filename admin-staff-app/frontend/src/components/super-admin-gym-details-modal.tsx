"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Calendar,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

type GymDetailPayload = {
  id: string;
  name: string;
  slug: string;
  workspacePath: string;
  subdomain: string;
  subdomainUrl: string;
  customDomain: string | null;
  address: string;
  phone: string;
  status: "pending" | "active" | "suspended";
  statusNote: string;
  createdAt: string | null;
  approvedAt: string | null;
  capacity: number;
  timezone: string;
  currency: string;
  owner: {
    id: string;
    name: string;
    email: string;
    status: "active" | "inactive";
  } | null;
  counts: {
    memberCount: number;
    activeMembersCount: number;
    staffCount: number;
    activeStaffCount: number;
    trainerCount: number;
    activeMembershipsCount: number;
    checkInsLast7d: number;
    totalPaidSaas: number;
  };
  platformSubscription: {
    planId: string | null;
    planCode: string;
    planName: string;
    planTier: string;
    billingStatus: string;
    paymentStatus: string;
    billingCycle: string;
    priceAmount: number;
    monthlyRecurringAmount: number;
    currency: string;
    startDate: string | null;
    expirationDate: string | null;
    gracePeriodDays: number;
    graceEndsAt: string | null;
    lifecycleState: string;
    inGracePeriod: boolean;
    isExpired: boolean;
    accessAllowed: boolean;
    limits: {
      maxMembers: number | null;
      maxStaff: number | null;
      maxTrainers: number | null;
    };
    notes: string;
  };
  staffAccounts: Array<{
    id: string;
    name: string;
    email: string;
    role: "owner" | "staff";
    status: "active" | "inactive";
    lastLoginAt: string | null;
    createdAt: string | null;
  }>;
  paymentHistory: Array<{
    id: string;
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
  }>;
};

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

function formatMoney(amount: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function LimitUsageBar({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number | null;
}) {
  const pct = limit ? Math.min(100, Math.round((current / limit) * 100)) : 22;
  const nearCap = limit !== null && current >= limit;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className={`font-semibold ${nearCap ? "text-rose-700" : "text-slate-900"}`}>
          {current} / {limit ?? "Unlimited"}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${nearCap ? "bg-rose-500" : "bg-indigo-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SuperAdminGymDetailsModal({
  gymId,
  canWrite,
  onClose,
  onOpenRecordPayment,
  onOpenManageSubscription,
  onToggleStatus,
}: {
  gymId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onOpenRecordPayment: (gymId: string) => void;
  onOpenManageSubscription: (gymId: string) => void;
  onToggleStatus: (gymId: string, nextStatus: "active" | "suspended") => Promise<void>;
}) {
  const [detail, setDetail] = useState<GymDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!gymId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/platform/gyms?gymId=${encodeURIComponent(gymId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as { gym?: GymDetailPayload; error?: string };
        if (!res.ok || !json.gym) {
          throw new Error(json.error ?? "Unable to load gym details.");
        }
        if (active) setDetail(json.gym);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load gym details.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gymId, reloadTick]);

  if (!gymId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {detail?.name ?? "Gym Details"}
              </h2>
              {detail && (
                <p className="font-mono text-xs text-indigo-700">{detail.workspacePath}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <a
                href={detail.workspacePath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <span>Open {detail.workspacePath}</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              aria-label="Close gym details"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <LoaderCircle size={16} className="animate-spin text-indigo-600" />
              <span>Loading gym workspace details…</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              {error}
            </div>
          ) : detail ? (
            <>
              {/* Quick Actions Bar */}
              {canWrite && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenRecordPayment(detail.id)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <CreditCard size={14} />
                    <span>Record Manual Payment / Renew</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenManageSubscription(detail.id)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <Calendar size={14} />
                    <span>Manage Plan &amp; Dates</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onToggleStatus(
                        detail.id,
                        detail.status === "active" ? "suspended" : "active",
                      );
                      setReloadTick((t) => t + 1);
                    }}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold ${
                      detail.status === "active"
                        ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                    }`}
                  >
                    {detail.status === "active" ? (
                      <>
                        <PauseCircle size={14} />
                        <span>Suspend Gym</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle size={14} />
                        <span>Activate Gym</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Gym Information & Registration Grid */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Gym Information
                </h3>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-slate-400">Gym ID</p>
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-slate-800">
                      {detail.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Registration Date</p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {formatDate(detail.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Workspace URL Path</p>
                    <p className="mt-0.5 font-mono text-[11px] font-semibold text-indigo-700">
                      {detail.workspacePath}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Future Subdomain Ready</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-700">
                      {detail.subdomain}.leelooconnect.com
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Address &amp; Phone</p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {detail.address} · {detail.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Gym Admin (Owner)</p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {detail.owner
                        ? `${detail.owner.name} (${detail.owner.email})`
                        : "Unclaimed — issue owner invite code"}
                    </p>
                  </div>
                </div>
              </section>

              {/* SaaS Subscription & Plan Limits */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <ShieldCheck size={14} className="text-indigo-600" />
                    Subscription &amp; Plan Limits
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                      {detail.platformSubscription.planName}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                        detail.platformSubscription.isExpired
                          ? "bg-rose-100 text-rose-800"
                          : detail.platformSubscription.inGracePeriod
                            ? "bg-amber-100 text-amber-800"
                            : detail.platformSubscription.accessAllowed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {detail.platformSubscription.lifecycleState.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Start Date</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatDate(detail.platformSubscription.startDate)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Expiration Date</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatDate(detail.platformSubscription.expirationDate)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Grace Period</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {detail.platformSubscription.gracePeriodDays} days
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Plan Rate / MRR</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatMoney(
                        detail.platformSubscription.priceAmount,
                        detail.platformSubscription.currency,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <LimitUsageBar
                    label="Members"
                    current={detail.counts.memberCount}
                    limit={detail.platformSubscription.limits.maxMembers}
                  />
                  <LimitUsageBar
                    label="Active Staff"
                    current={detail.counts.activeStaffCount}
                    limit={detail.platformSubscription.limits.maxStaff}
                  />
                  <LimitUsageBar
                    label="Trainers"
                    current={detail.counts.trainerCount}
                    limit={detail.platformSubscription.limits.maxTrainers}
                  />
                </div>
              </section>

              {/* Staff & Trainer Summary */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Users size={14} className="text-indigo-600" />
                  Gym Admin &amp; Staff Accounts ({detail.staffAccounts.length})
                </h3>
                {detail.staffAccounts.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No staff accounts created yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 text-xs">
                    {detail.staffAccounts.map((st) => (
                      <li key={st.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="font-semibold text-slate-800">{st.name}</p>
                          <p className="text-[11px] text-slate-500">{st.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                            {st.role === "owner" ? "Gym Admin" : "Gym Staff"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              st.status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {st.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* SaaS Manual Payment History */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Manual SaaS Payment History ({detail.paymentHistory.length})
                  </h3>
                  <span className="text-xs font-semibold text-emerald-700">
                    Total Paid: {formatMoney(detail.counts.totalPaidSaas, detail.currency)}
                  </span>
                </div>
                {detail.paymentHistory.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-slate-50 py-5 text-center text-xs text-slate-500">
                    No manual SaaS payments recorded for this gym yet.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 text-[10px] uppercase text-slate-400">
                        <tr>
                          <th className="py-2 pr-2">Receipt</th>
                          <th className="py-2 pr-2">Plan</th>
                          <th className="py-2 pr-2">Amount</th>
                          <th className="py-2 pr-2">Method</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.paymentHistory.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 pr-2 font-mono text-[11px] font-medium text-slate-800">
                              {p.receiptNumber}
                            </td>
                            <td className="py-2 pr-2 text-slate-700">{p.planName}</td>
                            <td className="py-2 pr-2 font-semibold text-slate-900">
                              {formatMoney(p.amount, p.currency)}
                            </td>
                            <td className="py-2 pr-2 text-slate-600">{p.paymentMethod}</td>
                            <td className="py-2 pr-2">
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
                            <td className="py-2 text-slate-500">{formatDate(p.paidAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
