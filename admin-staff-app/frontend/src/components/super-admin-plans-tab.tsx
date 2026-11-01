"use client";

import { type FormEvent, useState } from "react";
import { Check, Edit3, Infinity as InfinityIcon, LoaderCircle, Plus, Tag, X } from "lucide-react";

export type SaasPlanRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  defaultGracePeriodDays: number;
  features: string[];
  limits: {
    maxMembers: number | null;
    maxStaff: number | null;
    maxTrainers: number | null;
  };
  isActive: boolean;
  sortOrder?: number;
  assignedGymCount?: number;
};

function formatCurrency(amount: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SuperAdminPlansTab({
  plans,
  canWrite,
  onRefresh,
  onToast,
  onError,
}: {
  plans: SaasPlanRow[];
  canWrite: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SaasPlanRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("1800");
  const [annualPrice, setAnnualPrice] = useState("18000");
  const [currency, setCurrency] = useState("EGP");
  const [graceDays, setGraceDays] = useState("7");
  const [maxMembers, setMaxMembers] = useState("");
  const [maxStaff, setMaxStaff] = useState("");
  const [maxTrainers, setMaxTrainers] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openCreateModal() {
    setEditingPlan(null);
    setName("");
    setCode("");
    setDescription("");
    setMonthlyPrice("2500");
    setAnnualPrice("25000");
    setCurrency("EGP");
    setGraceDays("7");
    setMaxMembers("500");
    setMaxStaff("12");
    setMaxTrainers("15");
    setFeaturesText(
      [
        "Isolated /gym/<slug> workspace & QR check-in",
        "Member directory, memberships & revenue ledger",
        "Interactive mobile workout player & progression",
      ].join("\n"),
    );
    setIsActive(true);
    setModalOpen(true);
  }

  function openEditModal(plan: SaasPlanRow) {
    setEditingPlan(plan);
    setName(plan.name);
    setCode(plan.code);
    setDescription(plan.description || "");
    setMonthlyPrice(String(plan.monthlyPrice));
    setAnnualPrice(String(plan.annualPrice));
    setCurrency(plan.currency || "EGP");
    setGraceDays(String(plan.defaultGracePeriodDays ?? 7));
    setMaxMembers(plan.limits.maxMembers ? String(plan.limits.maxMembers) : "");
    setMaxStaff(plan.limits.maxStaff ? String(plan.limits.maxStaff) : "");
    setMaxTrainers(plan.limits.maxTrainers ? String(plan.limits.maxTrainers) : "");
    setFeaturesText((plan.features ?? []).join("\n"));
    setIsActive(plan.isActive !== false);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const features = featuresText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const res = await fetch("/api/platform/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingPlan ? "update-plan" : "create-plan",
          ...(editingPlan ? { planId: editingPlan.id } : { code: code.trim() || undefined }),
          name: name.trim(),
          description: description.trim(),
          monthlyPrice: Number(monthlyPrice),
          annualPrice: Number(annualPrice),
          currency: currency.trim() || "EGP",
          defaultGracePeriodDays: Number(graceDays),
          features,
          limits: {
            maxMembers: maxMembers.trim() ? Number(maxMembers) : null,
            maxStaff: maxStaff.trim() ? Number(maxStaff) : null,
            maxTrainers: maxTrainers.trim() ? Number(maxTrainers) : null,
          },
          isActive,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to save SaaS plan.");
      }
      setModalOpen(false);
      onToast(
        editingPlan
          ? `Updated "${name.trim()}" plan & limits.`
          : `Created new SaaS plan "${name.trim()}".`,
      );
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to save SaaS plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            SaaS Subscription Plans &amp; Enforced Limits
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Define subscription pricing, features, renewal grace periods, and hard resource limits
            (maximum members, staff accounts, and trainers) enforced across every gym workspace.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <Plus size={15} aria-hidden="true" />
            <span>Create SaaS Plan</span>
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-2xs ${
              plan.isActive ? "border-slate-200" : "border-slate-200 opacity-70"
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700">
                    <Tag size={10} />
                    {plan.code}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-slate-900">{plan.name}</h3>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    plan.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {plan.isActive ? "Active" : "Archived"}
                </span>
              </div>

              {plan.description && (
                <p className="mt-1.5 text-xs leading-5 text-slate-500">{plan.description}</p>
              )}

              <div className="mt-4 border-y border-slate-100 py-3">
                <p className="text-2xl font-bold tracking-tight text-slate-900">
                  {formatCurrency(plan.monthlyPrice, plan.currency)}
                  <span className="text-xs font-normal text-slate-500"> / month</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Annual: {formatCurrency(plan.annualPrice, plan.currency)} / yr · Grace:{" "}
                  {plan.defaultGracePeriodDays}d
                </p>
              </div>

              <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-[11px]">
                <p className="font-semibold uppercase tracking-wider text-slate-500">
                  Enforced Plan Limits
                </p>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Max Members</span>
                  <span className="font-semibold text-slate-900">
                    {plan.limits.maxMembers ?? (
                      <span className="inline-flex items-center gap-1 text-indigo-700">
                        <InfinityIcon size={12} /> Unlimited
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Max Staff Accounts</span>
                  <span className="font-semibold text-slate-900">
                    {plan.limits.maxStaff ?? (
                      <span className="inline-flex items-center gap-1 text-indigo-700">
                        <InfinityIcon size={12} /> Unlimited
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Max Trainers</span>
                  <span className="font-semibold text-slate-900">
                    {plan.limits.maxTrainers ?? (
                      <span className="inline-flex items-center gap-1 text-indigo-700">
                        <InfinityIcon size={12} /> Unlimited
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {plan.features.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  {plan.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <Check
                        size={13}
                        className="mt-0.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] font-medium text-slate-500">
                {plan.assignedGymCount ?? 0} assigned{" "}
                {(plan.assignedGymCount ?? 0) === 1 ? "gym" : "gyms"}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => openEditModal(plan)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 size={12} />
                  Edit Plan
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/55 p-4"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {editingPlan ? `Edit SaaS Plan — ${editingPlan.name}` : "Create New SaaS Plan"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Plan Name</span>
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Elite Multi-Branch"
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Plan Code {editingPlan ? "(Locked)" : "(Auto if blank)"}
                </span>
                <input
                  disabled={Boolean(editingPlan)}
                  maxLength={48}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="auto-generated-slug"
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Description</span>
              <input
                maxLength={280}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary shown when assigning plans to gyms"
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Monthly Price</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Annual Price</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={annualPrice}
                  onChange={(e) => setAnnualPrice(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">Currency</span>
                <input
                  maxLength={8}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-700">
                  Grace Days
                </span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  required
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs font-semibold text-slate-800">
                Resource Caps (Leave blank for Unlimited)
              </p>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    Max Members
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(e.target.value)}
                    placeholder="Unlimited"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    Max Staff Accounts
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={maxStaff}
                    onChange={(e) => setMaxStaff(e.target.value)}
                    placeholder="Unlimited"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    Max Trainers
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={maxTrainers}
                    onChange={(e) => setMaxTrainers(e.target.value)}
                    placeholder="Unlimited"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  />
                </label>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">
                Included Features (One per line)
              </span>
              <textarea
                rows={4}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4 rounded border-slate-300 text-indigo-600"
              />
              <span>Plan is active and selectable when provisioning or upgrading gyms</span>
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-9 rounded-xl border border-slate-300 px-4 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving && <LoaderCircle size={13} className="animate-spin" />}
                <span>{editingPlan ? "Save Plan Changes" : "Create Plan"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
