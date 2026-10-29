"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Plus, Search, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type MemberStatus = "Active" | "Expiring" | "Inactive";
type StatusFilter = "All" | MemberStatus;
type PaymentMethod = "Cash" | "Card" | "Instapay";
type PaymentStatus = "Paid" | "Pending";

type Member = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  plan: string;
  status: MemberStatus;
  expiryDate: string;
};

type PlanOption = {
  id: string;
  name: string;
  price: number;
  durationMonths: number;
};

type NewMemberInput = {
  name: string;
  phone: string;
  email: string;
  plan: string;
  price: number;
  startDate: string;
  duration: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
};

const defaultPlans: PlanOption[] = [
  { id: "default-1", name: "1 Month Regular", price: 1800, durationMonths: 1 },
  { id: "default-3", name: "3 Month Saver", price: 4500, durationMonths: 3 },
  { id: "default-12", name: "VIP Annual", price: 18000, durationMonths: 12 },
];

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateInputValue(date);
};

const filters: StatusFilter[] = ["All", "Active", "Expiring", "Inactive"];

type ApiMember = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  plan: string;
  status: MemberStatus;
  expiryDate: string;
};

function isApiMember(value: unknown): value is ApiMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Record<string, unknown>;
  return (
    typeof member.id === "string" &&
    typeof member.name === "string" &&
    typeof member.phone === "string" &&
    typeof member.plan === "string" &&
    (member.status === "Active" ||
      member.status === "Expiring" ||
      member.status === "Inactive") &&
    typeof member.expiryDate === "string" &&
    !Number.isNaN(Date.parse(member.expiryDate))
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    // Fall back to an HTTP status message for non-JSON responses.
  }
  return `Request failed (${response.status}).`;
}

async function fetchMembers(): Promise<Member[]> {
  const response = await fetch("/api/members", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await getApiError(response));
  }

  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("members" in body) || !Array.isArray(body.members)) {
    throw new Error("The members response from the server was invalid.");
  }

  if (!body.members.every(isApiMember)) {
    throw new Error("The members response from the server was invalid.");
  }
  return body.members;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const styles: Record<MemberStatus, string> = {
    Active: "bg-[#eaf6f0] text-[#288865]",
    Expiring: "bg-[#fff4e8] text-[#bd7838]",
    Inactive: "bg-[#f1f3f5] text-[#727d89]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${styles[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

type AddMemberModalProps = {
  plans: PlanOption[];
  onClose: () => void;
  onAdd: (member: NewMemberInput) => Promise<void>;
  isSubmitting: boolean;
  submitError: string | null;
};

function AddMemberModal({
  plans,
  onClose,
  onAdd,
  isSubmitting,
  submitError,
}: AddMemberModalProps) {
  const availablePlans = plans.length > 0 ? plans : defaultPlans;
  const initialPlan = availablePlans[0];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState(initialPlan.name);
  const [price, setPrice] = useState(String(initialPlan.price));
  const [startDate, setStartDate] = useState(dateOffset(0));
  const [duration, setDuration] = useState(String(initialPlan.durationMonths));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Paid");

  function handlePlanChange(selectedName: string) {
    setPlan(selectedName);
    const matching = availablePlans.find((item) => item.name === selectedName);
    if (matching) {
      setPrice(String(matching.price));
      setDuration(String(matching.durationMonths));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onAdd({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      plan,
      price: Number(price),
      startDate,
      duration: Number(duration),
      paymentMethod,
      paymentStatus,
    });
  }

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
        aria-labelledby="add-member-title"
        aria-describedby="add-member-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "Tab") {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), select:not([disabled])",
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
        className="my-auto w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.2)] sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="add-member-title"
              className="text-[19px] font-semibold tracking-[-0.03em] text-[#263344]"
            >
              Add a member
            </h2>
            <p id="add-member-description" className="mt-1.5 text-[12px] text-[#84909d]">
              Register their membership and record initial payment. They can activate their
              Member App login anytime with the same phone or email.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <p
              role="alert"
              className="rounded-lg bg-[#fff0ef] px-3 py-2 text-[12px] text-[#b34e48]"
            >
              {submitError}
            </p>
          )}
          <div>
            <label
              htmlFor="member-name"
              className="mb-1.5 block text-[11px] font-medium text-[#526071]"
            >
              Full name
            </label>
            <input
              autoFocus
              id="member-name"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Nour Hassan"
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="member-phone"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Phone
              </label>
              <input
                id="member-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                maxLength={30}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. +20 100 123 4567"
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              />
            </div>
            <div>
              <label
                htmlFor="member-email"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Email <span className="font-normal text-[#9aa3ae]">(optional)</span>
              </label>
              <input
                id="member-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g. nour@example.com"
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="member-plan"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Membership plan
              </label>
              <select
                id="member-plan"
                name="plan"
                value={plan}
                onChange={(event) => handlePlanChange(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              >
                {availablePlans.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="member-duration"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Duration
              </label>
              <select
                id="member-duration"
                name="duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              >
                {[1, 2, 3, 6, 9, 12, 24].map((months) => (
                  <option key={months} value={months}>
                    {months} {months === 1 ? "month" : "months"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="member-price"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Price (EGP)
              </label>
              <input
                id="member-price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              />
            </div>
            <div>
              <label
                htmlFor="member-start-date"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Start date
              </label>
              <input
                id="member-start-date"
                name="startDate"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="member-payment-status"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Payment status
              </label>
              <select
                id="member-payment-status"
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              >
                <option value="Paid">Paid (ready for check-in)</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="member-payment-method"
                className="mb-1.5 block text-[11px] font-medium text-[#526071]"
              >
                Payment method
              </label>
              <select
                id="member-payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Instapay">Instapay</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858]"
            >
              {isSubmitting ? "Saving member..." : "Add member"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [loadedMembers, membershipsRes] = await Promise.all([
        fetchMembers(),
        fetch("/api/memberships", { cache: "no-store" }).catch(() => null),
      ]);
      setMembers(loadedMembers);
      if (membershipsRes && membershipsRes.ok) {
        const body = (await membershipsRes.json()) as { plans?: PlanOption[] };
        if (Array.isArray(body.plans)) {
          setPlans(body.plans);
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load members.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
    const onUpdated = () => void loadMembers();
    window.addEventListener("gymos:membership-updated", onUpdated);
    return () => window.removeEventListener("gymos:membership-updated", onUpdated);
  }, [loadMembers]);

  const counts = useMemo(
    () => ({
      All: members.length,
      Active: members.filter((member) => member.status === "Active").length,
      Expiring: members.filter((member) => member.status === "Expiring").length,
      Inactive: members.filter((member) => member.status === "Inactive").length,
    }),
    [members],
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const phoneQuery = query.replace(/\D/g, "");
    return members.filter((member) => {
      const matchesSearch =
        !query ||
        member.name.toLowerCase().includes(query) ||
        (member.email?.toLowerCase().includes(query) ?? false) ||
        (phoneQuery.length > 0 && member.phone.replace(/\D/g, "").includes(phoneQuery));
      const matchesStatus = statusFilter === "All" || member.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [members, search, statusFilter]);

  async function addMember(member: NewMemberInput) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: member.name,
          phone: member.phone,
          email: member.email || undefined,
          plan: member.plan,
          price: member.price,
          startDate: member.startDate,
          duration: member.duration,
          paymentMethod: member.paymentMethod,
          paymentStatus: member.paymentStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response));
      }

      await loadMembers();
      setIsModalOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to add member.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell activePage="Members">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
              Workspace
            </p>
            <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">
              Members
            </h1>
            <p className="mt-1.5 text-[13px] text-[#788391]">
              Keep track of your gym community and memberships.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-[#207858]"
          >
            <Plus size={16} aria-hidden="true" />
            Add Member
          </button>
        </div>

        <section aria-label="Member list">
          {loadError && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1d2cf] bg-[#fff8f7] px-4 py-3 text-[12px] text-[#a54c46]"
            >
              <span>Could not load members: {loadError}</span>
              <button
                type="button"
                onClick={() => void loadMembers()}
                className="font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[#edf0f2] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div
                role="group"
                aria-label="Filter members by status"
                className="flex max-w-full gap-1 overflow-x-auto"
              >
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={statusFilter === filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[11px] font-medium transition-colors ${
                      statusFilter === filter
                        ? "bg-[#eaf6f0] text-[#278968]"
                        : "text-[#74808e] hover:bg-[#f5f7f8] hover:text-[#455263]"
                    }`}
                  >
                    {filter}
                    <span
                      className={`text-[10px] ${
                        statusFilter === filter ? "text-[#278968]/70" : "text-[#a1aab4]"
                      }`}
                    >
                      {counts[filter]}
                    </span>
                  </button>
                ))}
              </div>
              <label className="relative block w-full lg:max-w-[300px]">
                <span className="sr-only">Search members by name, email, or phone</span>
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3ae]"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, phone, or email..."
                  className="min-h-10 w-full rounded-lg border border-[#e7ebee] bg-white pl-9 pr-3 text-[12px] text-[#344052] outline-none placeholder:text-[#a0a9b4] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">Gym members and membership details</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Name", "Phone", "Membership type", "Status", "Expiry date"].map(
                      (heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8993a0]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="transition-colors hover:bg-[#fbfcfc]">
                      <th scope="row" className="px-5 py-4">
                        <span className="block text-[12px] font-semibold text-[#354153]">
                          {member.name}
                        </span>
                        {member.email && (
                          <span className="mt-0.5 block text-[10px] font-normal text-[#8993a0]">
                            {member.email}
                          </span>
                        )}
                      </th>
                      <td className="px-5 py-4 text-[12px] text-[#6f7b89]">{member.phone}</td>
                      <td className="px-5 py-4 text-[12px] text-[#596575]">{member.plan}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-5 py-4 text-[12px] text-[#6f7b89]">
                        {formatDate(member.expiryDate)}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !loadError && filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <p className="text-[13px] font-medium text-[#526071]">
                          {members.length === 0 ? "No members yet" : "No members found"}
                        </p>
                        <p className="mt-1 text-[11px] text-[#8993a0]">
                          {members.length === 0
                            ? "Add your first member to get started."
                            : "Try another search or status filter."}
                        </p>
                      </td>
                    </tr>
                  )}
                  {isLoading && (
                    <tr>
                      <td
                        colSpan={5}
                        role="status"
                        className="px-5 py-12 text-center text-[13px] text-[#788391]"
                      >
                        Loading members...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>
                Showing <span className="font-semibold text-[#596575]">{filteredMembers.length}</span>{" "}
                of <span className="font-semibold text-[#596575]">{members.length}</span> members
              </span>
              <span>Member records are loaded from your gym database.</span>
            </div>
          </Card>
        </section>
      </main>
      {isModalOpen && (
        <AddMemberModal
          plans={plans}
          onClose={() => {
            if (!isSubmitting) {
              setIsModalOpen(false);
              setSubmitError(null);
            }
          }}
          onAdd={addMember}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}
    </AppShell>
  );
}
