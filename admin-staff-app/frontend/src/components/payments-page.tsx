"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BadgeDollarSign,
  Banknote,
  Download,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

type PaymentMethod = "Cash" | "Card" | "Instapay";
type PaymentStatus = "Paid" | "Partial" | "Pending" | "Overdue";
type StatusFilter = "All" | "Paid" | "Pending" | "Overdue";
type MemberOption = { id: string; name: string };

type Transaction = {
  id: string;
  memberId: string;
  memberName: string;
  dateTime: string;
  description: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
};

function formatEgp(amount: number) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusFilterValue(status: PaymentStatus): Exclude<StatusFilter, "All"> {
  return status === "Partial" ? "Pending" : status;
}

type ModalFrameProps = {
  title: string;
  description: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

function ModalFrame({ title, description, onClose, className = "", children }: ModalFrameProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        aria-describedby="payment-modal-description"
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
        className={`my-auto w-full rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.2)] sm:p-7 ${className}`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="payment-modal-title" className="text-[19px] font-semibold tracking-[-0.03em] text-[#263344]">
              {title}
            </h2>
            <p id="payment-modal-description" className="mt-1.5 text-[12px] text-[#84909d]">
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

type RecordPaymentModalProps = {
  onClose: () => void;
  onSubmit: (data: { memberId: string; description: string; amount: number; method: PaymentMethod; status: PaymentStatus }) => Promise<void>;
  members: MemberOption[];
  isSaving: boolean;
  error: string;
};

function RecordPaymentModal({ onClose, onSubmit, members, isSaving, error }: RecordPaymentModalProps) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [status, setStatus] = useState<PaymentStatus>("Paid");

  useEffect(() => {
    if (!memberId && members.length > 0) setMemberId(members[0].id);
  }, [memberId, members]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const paidAmount = Number(amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;
    void onSubmit({
      memberId,
      description: description.trim(),
      amount: paidAmount,
      method,
      status,
    });
  }

  return (
    <ModalFrame
      title="Record a payment"
      description="Record a payment against a gym member."
      onClose={onClose}
      className="max-w-[520px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="payment-member" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Member</label>
          <select
            id="payment-member"
            value={memberId}
            required
            onChange={(event) => setMemberId(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          >
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="payment-description" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Plan / description</label>
          <input
            autoFocus={false}
            id="payment-description"
            required
            maxLength={100}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. 3 Month Saver"
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-amount" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Amount paid (EGP)</label>
            <input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 1500"
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] px-3 text-[13px] text-[#344052] outline-none placeholder:text-[#a3acb7] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
            />
          </div>
          <div>
            <label htmlFor="payment-method" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Payment method</label>
            <select
              id="payment-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
            >
              <option>Cash</option>
              <option>Card</option>
              <option>Instapay</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="payment-status" className="mb-1.5 block text-[11px] font-medium text-[#526071]">Payment status</label>
          <select
            id="payment-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as PaymentStatus)}
            className="min-h-11 w-full rounded-lg border border-[#e3e8ec] bg-white px-3 text-[13px] text-[#344052] outline-none focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
          >
            <option>Paid</option>
            <option>Partial</option>
            <option>Pending</option>
          </select>
        </div>
        {error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[12px] text-[#a9433b]">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f2] pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={isSaving || members.length === 0} className="min-h-10 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858] disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Save payment"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ReceiptModal({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  function downloadReceipt() {
    const receipt = [
      "GYMOS — PAYMENT RECEIPT",
      "--------------------------------",
      `Invoice: ${transaction.id}`,
      `Member: ${transaction.memberName}`,
      `Date: ${formatDateTime(transaction.dateTime)}`,
      `Item: ${transaction.description}`,
      `Amount: ${formatEgp(transaction.amount)}`,
      `Method: ${transaction.method}`,
      `Status: ${statusFilterValue(transaction.status)}`,
      "--------------------------------",
      "Thank you for being a GymOS member.",
    ].join("\n");
    const blob = new Blob([receipt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${transaction.id}-receipt.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModalFrame
      title="Payment receipt"
      description="GymOS · Transaction summary"
      onClose={onClose}
      className="receipt-print max-w-[500px]"
    >
      <div className="rounded-xl border border-dashed border-[#dfe5e8] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-[#edf0f2] pb-5">
          <div>
            <p className="text-[17px] font-bold tracking-[-0.04em] text-[#203142]">Gym<span className="text-[#2d9d78]">OS</span></p>
            <p className="mt-1 text-[10px] text-[#8993a0]">Fitness &amp; wellness</p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6f0] text-[#278968]">
            <FileText size={18} aria-hidden="true" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#8993a0]">Invoice</p>
            <p className="mt-1 text-[12px] font-semibold text-[#354153]">{transaction.id}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            statusFilterValue(transaction.status) === "Paid"
              ? "bg-[#eaf6f0] text-[#288865]"
              : statusFilterValue(transaction.status) === "Overdue"
                ? "bg-[#fff0ee] text-[#c4544c]"
                : "bg-[#fff4e8] text-[#bd7838]"
          }`}>
            {statusFilterValue(transaction.status)}
          </span>
        </div>
        <dl className="space-y-3 border-t border-[#edf0f2] py-4 text-[11px]">
          <div className="flex justify-between gap-4"><dt className="text-[#8993a0]">Member</dt><dd className="text-right font-medium text-[#354153]">{transaction.memberName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#8993a0]">Date &amp; time</dt><dd className="text-right font-medium text-[#354153]">{formatDateTime(transaction.dateTime)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#8993a0]">Plan / item</dt><dd className="text-right font-medium text-[#354153]">{transaction.description}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#8993a0]">Payment method</dt><dd className="text-right font-medium text-[#354153]">{transaction.method}</dd></div>
        </dl>
        <div className="flex items-center justify-between border-t border-[#edf0f2] pt-4">
          <span className="text-[12px] font-semibold text-[#526071]">Total</span>
          <span className="text-[20px] font-semibold tracking-[-0.03em] text-[#253243]">{formatEgp(transaction.amount)}</span>
        </div>
        <p className="mt-5 text-center text-[10px] text-[#8993a0]">Thank you for being a GymOS member.</p>
      </div>
      <div className="receipt-print-actions mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#e3e8ec] px-4 text-[12px] font-medium text-[#596575] hover:bg-slate-50">Close</button>
        <button type="button" onClick={downloadReceipt} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce7e1] px-4 text-[12px] font-semibold text-[#278968] hover:bg-[#f1f8f4]">
          <Download size={14} aria-hidden="true" />
          Download receipt
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white hover:bg-[#207858]">
          <FileText size={14} aria-hidden="true" />
          Print receipt
        </button>
      </div>
    </ModalFrame>
  );
}

function TransactionStatus({ status }: { status: PaymentStatus }) {
  const normalized = statusFilterValue(status);
  const styles = normalized === "Paid"
    ? "bg-[#eaf6f0] text-[#288865]"
    : normalized === "Overdue"
      ? "bg-[#fff0ee] text-[#c4544c]"
      : "bg-[#fff4e8] text-[#bd7838]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${styles}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {normalized}
    </span>
  );
}

const statusFilters: StatusFilter[] = ["All", "Paid", "Pending", "Overdue"];
const methodFilters: Array<"All methods" | PaymentMethod> = [
  "All methods",
  "Cash",
  "Card",
  "Instapay",
];

export function PaymentsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [summary, setSummary] = useState({ today: 0, month: 0, outstanding: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [methodFilter, setMethodFilter] = useState<(typeof methodFilters)[number]>("All methods");
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    setApiError("");
    try {
      const response = await fetch("/api/payments", { cache: "no-store" });
      const data = await response.json() as { transactions?: Transaction[]; members?: MemberOption[]; summary?: typeof summary; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load payment records.");
      setTransactions(data.transactions ?? []);
      setMembers(data.members ?? []);
      setSummary(data.summary ?? { today: 0, month: 0, outstanding: 0 });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load payment records.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
    const onUpdated = () => void loadPayments();
    window.addEventListener("gymos:membership-updated", onUpdated);
    return () => window.removeEventListener("gymos:membership-updated", onUpdated);
  }, [loadPayments]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const matchesSearch = !query || transaction.memberName.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "All" || statusFilterValue(transaction.status) === statusFilter;
      const matchesMethod = methodFilter === "All methods" || transaction.method === methodFilter;
      return matchesSearch && matchesStatus && matchesMethod;
    });
  }, [methodFilter, search, statusFilter, transactions]);

  const receiptTransaction = transactions.find((transaction) => transaction.id === receiptTransactionId) ?? null;

  async function recordPayment(data: { memberId: string; description: string; amount: number; method: PaymentMethod; status: PaymentStatus }) {
    setIsSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: data.memberId,
          description: data.description,
          amount: data.amount,
          paymentMethod: data.method,
          status: data.status,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to record this payment.");
      setIsRecordModalOpen(false);
      await loadPayments();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to record this payment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell activePage="Payments">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">Workspace</p>
            <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">Payments &amp; Financial Records</h1>
            <p className="mt-1.5 text-[13px] text-[#788391]">Track collections, balances, and gym transactions.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsRecordModalOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#278968] px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-[#207858]"
          >
            <Plus size={16} aria-hidden="true" />
            Record Payment
          </button>
        </div>

        {apiError && !isRecordModalOpen && (
          <p role="alert" className="mb-5 rounded-lg border border-[#f1d2cd] bg-[#fff6f4] px-4 py-3 text-[12px] text-[#a9433b]">{apiError}</p>
        )}

        <section aria-label="Financial summary" className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Total collected today", value: summary.today, icon: Banknote, color: "bg-[#e9f6f0] text-[#23845f]", detail: "Paid transactions today" },
            { label: "Total collected this month", value: summary.month, icon: BadgeDollarSign, color: "bg-[#eef2ff] text-[#6675d9]", detail: "Paid transactions this month" },
            { label: "Outstanding / unpaid", value: summary.outstanding, icon: Wallet, color: "bg-[#fff3e7] text-[#d18a3d]", detail: "Pending and overdue balances" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-medium text-[#778291]">{item.label}</p>
                    <p className="mt-3 text-[27px] font-semibold leading-none tracking-[-0.045em] text-[#253243]">{formatEgp(item.value)}</p>
                  </div>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.color}`}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-4 text-[10px] text-[#939ca8]">{item.detail}</p>
              </Card>
            );
          })}
        </section>

        <section aria-labelledby="transactions-heading">
          <div className="mb-4">
            <h2 id="transactions-heading" className="text-[16px] font-semibold tracking-[-0.02em] text-[#273445]">Transactions history</h2>
            <p className="mt-1 text-[11px] text-[#87909d]">Browse and filter payment records</p>
          </div>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[#edf0f2] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Filter by payment status" className="flex gap-1 overflow-x-auto">
                {statusFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={statusFilter === filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`min-h-9 shrink-0 rounded-lg px-3 text-[11px] font-medium ${
                      statusFilter === filter ? "bg-[#eaf6f0] text-[#278968]" : "text-[#74808e] hover:bg-[#f5f7f8]"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block w-full sm:w-[230px]">
                  <span className="sr-only">Search transactions by member name</span>
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#9aa3ae]" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search member..."
                    className="min-h-9 w-full rounded-lg border border-[#e7ebee] bg-white ps-9 pe-3 text-[11px] text-[#344052] outline-none placeholder:text-[#a0a9b4] focus:border-[#55b994] focus:ring-2 focus:ring-[#55b994]/15"
                  />
                </label>
                <label>
                  <span className="sr-only">Filter by payment method</span>
                  <select
                    value={methodFilter}
                    onChange={(event) => setMethodFilter(event.target.value as (typeof methodFilters)[number])}
                    className="min-h-9 w-full rounded-lg border border-[#e7ebee] bg-white px-3 text-[11px] text-[#536071] outline-none focus:border-[#55b994] sm:w-[190px]"
                  >
                    {methodFilters.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <caption className="sr-only">Gym payment transaction history</caption>
                <thead>
                  <tr className="bg-[#fafbfc]">
                    {["Invoice ID", "Member name", "Date & time", "Plan / item", "Amount (EGP)", "Payment method", "Status", "Action"].map((heading) => (
                      <th key={heading} scope="col" className="px-4 py-3.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-[#8993a0]">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff1f4]">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="transition-colors hover:bg-[#fbfcfc]">
                      <th scope="row" className="px-4 py-4 text-[11px] font-semibold text-[#596575]">{transaction.id}</th>
                      <td className="px-4 py-4 text-[11px] font-medium text-[#354153]">{transaction.memberName}</td>
                      <td className="px-4 py-4 text-[10px] text-[#6f7b89]">{formatDateTime(transaction.dateTime)}</td>
                      <td className="px-4 py-4 text-[11px] text-[#596575]">{transaction.description}</td>
                      <td className="px-4 py-4 text-[11px] font-semibold text-[#354153]">{formatEgp(transaction.amount)}</td>
                      <td className="px-4 py-4 text-[10px] text-[#6f7b89]">{transaction.method}</td>
                      <td className="px-4 py-4"><TransactionStatus status={transaction.status} /></td>
                      <td className="relative px-4 py-4">
                        <button
                          type="button"
                          aria-label={`Actions for ${transaction.id}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionId === transaction.id}
                          onClick={() => setOpenActionId((current) => current === transaction.id ? null : transaction.id)}
                          className="grid size-8 place-items-center rounded-lg text-[#778291] hover:bg-[#f0f3f4]"
                        >
                          <MoreHorizontal size={17} aria-hidden="true" />
                        </button>
                        {openActionId === transaction.id && (
                          <div role="menu" className="absolute end-4 top-[calc(100%-8px)] z-20 min-w-36 rounded-lg border border-[#e9edf1] bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setReceiptTransactionId(transaction.id);
                                setOpenActionId(null);
                              }}
                              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-start text-[11px] text-[#536071] hover:bg-[#f5f7f8]"
                            >
                              <FileText size={14} aria-hidden="true" />
                              View receipt
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center">
                        <p className="text-[13px] font-medium text-[#526071]">No transactions found</p>
                        <p className="mt-1 text-[11px] text-[#8993a0]">Try changing the search or filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0f2] px-5 py-3.5 text-[10px] text-[#8993a0]">
              <span>Showing <span className="font-semibold text-[#596575]">{filteredTransactions.length}</span> of <span className="font-semibold text-[#596575]">{transactions.length}</span> transactions</span>
              <span>{isLoading ? "Loading transactions…" : "Transactions and totals from MongoDB"}</span>
            </div>
          </Card>
        </section>
        <footer className="px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">GymOS · Financial records</footer>
      </main>
      {isRecordModalOpen && (
        <RecordPaymentModal onClose={() => setIsRecordModalOpen(false)} onSubmit={recordPayment} members={members} isSaving={isSaving} error={apiError} />
      )}
      {receiptTransaction && (
        <ReceiptModal
          transaction={receiptTransaction}
          onClose={() => setReceiptTransactionId(null)}
        />
      )}
    </AppShell>
  );
}
