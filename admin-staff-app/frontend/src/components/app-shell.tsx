"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, Check, CheckCircle2, ChevronDown, LoaderCircle, Menu, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar, type NavigationPage } from "@/components/sidebar";
import {
  clearStaffSessionToken,
  ensureStaffFetchPatched,
} from "@/lib/staff-client-auth";

ensureStaffFetchPatched();

type AttentionAlert = {
  id: string;
  name: string;
  note: string;
  tag: "Membership" | "Payment";
  href: string;
};

export type PendingMembershipRequest = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberEmail: string;
  planName: string;
  price: number;
  durationMonths: number;
  paymentMethod: "Cash" | "Card" | "Instapay";
  createdAt: string;
};

type AppShellProps = {
  activePage: NavigationPage;
  children: ReactNode;
};

function formatEgp(amount: number) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AppShell({ activePage, children }: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AttentionAlert[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingMembershipRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [acceptBanner, setAcceptBanner] = useState<string>("");
  const [requestError, setRequestError] = useState<string>("");
  const [accountName, setAccountName] = useState("Staff");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountRole, setAccountRole] = useState<"owner" | "staff">("staff");
  const [gymName, setGymName] = useState("");
  const [gymSlug, setGymSlug] = useState("");
  const [gymSubdomain, setGymSubdomain] = useState("");
  const [gymLogoText, setGymLogoText] = useState("");
  const [gymAccentColor, setGymAccentColor] = useState("#45b58b");
  const [logoutError, setLogoutError] = useState("");
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const [reqRes, dashRes] = await Promise.all([
        fetch("/api/membership-requests", { cache: "no-store" }),
        fetch("/api/dashboard", { cache: "no-store" }),
      ]);
      if (reqRes.ok) {
        const reqData = (await reqRes.json()) as {
          requests?: PendingMembershipRequest[];
        };
        setPendingRequests(reqData.requests ?? []);
      }
      if (dashRes.ok) {
        const dashData = (await dashRes.json()) as {
          attentionItems?: AttentionAlert[];
        };
        setAlerts(
          (dashData.attentionItems ?? []).filter((item) => !item.id.startsWith("subreq-")),
        );
      }
    } catch {
      // Non-blocking background notification poll.
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadSession = () => {
      fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response) => {
          if (response.status === 401 || response.status === 403) {
            clearStaffSessionToken();
            if (response.status === 403) {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
            }
            router.replace("/login");
            return null;
          }
          if (!response.ok) {
            throw new Error("Unable to load account details.");
          }
          return (await response.json()) as {
            user: { name: string; email: string; role?: "owner" | "staff" };
            gym?: {
              name: string;
              slug: string;
              subdomain?: string;
              branding?: { accentColor?: string; logoText?: string; tagline?: string };
            };
          };
        })
        .then((result) => {
          if (active && result?.user) {
            setAccountName(result.user.name);
            setAccountEmail(result.user.email);
            setAccountRole(result.user.role === "owner" ? "owner" : "staff");
            if (result.gym) {
              setGymName(result.gym.name);
              setGymSlug(result.gym.slug);
              setGymSubdomain(result.gym.subdomain ?? "");
              setGymLogoText(result.gym.branding?.logoText ?? "");
              setGymAccentColor(result.gym.branding?.accentColor ?? "#45b58b");
            }
          }
        })
        .catch(() => {
          if (active) {
            setLogoutError("Unable to load account details. Please refresh the page.");
          }
        });
    };

    loadSession();
    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 4000);

    const onUpdated = () => void loadNotifications();
    const onGymUpdated = () => loadSession();
    window.addEventListener("gymos:membership-updated", onUpdated);
    window.addEventListener("gymos:gym-updated", onGymUpdated);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("gymos:membership-updated", onUpdated);
      window.removeEventListener("gymos:gym-updated", onGymUpdated);
    };
  }, [loadNotifications, router]);

  async function handleMembershipRequest(requestId: string, action: "accept" | "decline") {
    setProcessingId(requestId);
    setRequestError("");
    try {
      const response = await fetch("/api/membership-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId }),
      });
      const data = (await response.json()) as {
        error?: string;
        accepted?: {
          memberName: string;
          planName: string;
          price: number;
          paymentMethod: string;
          gymName: string;
        };
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update membership request.");
      }

      setPendingRequests((curr) => curr.filter((item) => item.id !== requestId));

      if (action === "accept" && data.accepted) {
        setAcceptBanner(
          `Accepted! ${data.accepted.memberName} is now enrolled in ${data.accepted.gymName} (${data.accepted.planName} · ${formatEgp(data.accepted.price)} via ${data.accepted.paymentMethod}).`,
        );
        window.setTimeout(() => setAcceptBanner(""), 6500);
      }

      window.dispatchEvent(new CustomEvent("gymos:membership-updated"));
      await loadNotifications();
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Unable to update membership request.",
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleLogout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout request failed.");
      }
      clearStaffSessionToken();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
    }
  }

  const initials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const totalNotificationCount = pendingRequests.length + alerts.length;
  const latestPending = pendingRequests[0];

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <Sidebar
        activePage={activePage}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        gymName={gymName}
        gymSlug={gymSlug}
        gymSubdomain={gymSubdomain}
        gymLogoText={gymLogoText}
        gymAccentColor={gymAccentColor}
      />

      <div className="min-h-screen md:pl-[220px] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e9edf1] bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMenuOpen(true)}
              className="grid size-9 place-items-center rounded-lg border border-[#e9edf1] text-[#536071] hover:bg-slate-50 md:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div>
              <p className="text-[11px] text-[#9099a5]">
                {gymName ? `${gymName} · ` : ""}Welcome, {accountName.split(/\s+/)[0]}
              </p>
              <p className="text-[13px] font-semibold text-[#303b4a]">
                {todayLabel || "Today"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative">
              <button
                type="button"
                aria-label={
                  totalNotificationCount > 0
                    ? `Notifications (${totalNotificationCount} items)`
                    : "Notifications"
                }
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setAccountMenuOpen(false);
                }}
                className={`relative grid size-9 place-items-center rounded-full transition-colors ${
                  pendingRequests.length > 0
                    ? "bg-[#eaf6f0] text-[#278968] hover:bg-[#ddf0e6]"
                    : "text-[#697585] hover:bg-[#f4f6f7]"
                }`}
              >
                <Bell size={18} aria-hidden="true" />
                {totalNotificationCount > 0 && (
                  <span
                    className={`absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1 text-[9px] font-bold text-white ${
                      pendingRequests.length > 0 ? "bg-[#278968]" : "bg-[#e4845f]"
                    }`}
                  >
                    {totalNotificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[350px] max-w-[calc(100vw-24px)] rounded-2xl border border-[#e9edf1] bg-white p-3 shadow-[0_16px_40px_rgba(23,36,51,0.16)] sm:w-[390px]">
                  <div className="flex items-center justify-between border-b border-[#edf0f3] px-2 pb-2.5">
                    <p className="text-[12px] font-semibold text-[#303b4a]">
                      Notifications &amp; Requests
                    </p>
                    <span className="rounded-full bg-[#f4f6f7] px-2 py-0.5 text-[10px] font-semibold text-[#697585]">
                      {totalNotificationCount}
                    </span>
                  </div>

                  {requestError && (
                    <p className="mt-2 rounded-lg bg-[#fff1ef] px-2.5 py-2 text-[10px] text-[#a9433b]">
                      {requestError}
                    </p>
                  )}

                  {pendingRequests.length > 0 && (
                    <div className="mt-2 border-b border-[#edf0f3] pb-2.5">
                      <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#278968]">
                        Mobile Subscription Requests ({pendingRequests.length})
                      </p>
                      <ul className="max-h-64 space-y-2 overflow-y-auto px-1">
                        {pendingRequests.map((req) => {
                          const busy = processingId === req.id;
                          return (
                            <li
                              key={req.id}
                              className="rounded-xl border border-[#cfe9dc] bg-[#f4fbf7] p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-semibold text-[#243242]">
                                    {req.memberName}
                                  </p>
                                  <p className="text-[10px] text-[#687585]">
                                    {req.memberPhone}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#278968] shadow-xs">
                                  {req.paymentMethod}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
                                <span className="font-medium text-[#354153]">
                                  {req.planName}
                                </span>
                                <span className="font-bold text-[#1f2b39]">
                                  {formatEgp(req.price)}
                                </span>
                              </div>
                              <div className="mt-2.5 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleMembershipRequest(req.id, "accept")}
                                  className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#278968] px-3 text-[11px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                                >
                                  {busy ? (
                                    <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Check size={13} aria-hidden="true" />
                                  )}
                                  Accept &amp; Activate
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleMembershipRequest(req.id, "decline")}
                                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-[#e3e8ec] bg-white px-2.5 text-[10px] font-medium text-[#687585] hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Decline
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {totalNotificationCount === 0 ? (
                    <p className="px-2 py-5 text-center text-[11px] text-[#87909d]">
                      All caught up — no pending mobile requests or overdue balances.
                    </p>
                  ) : alerts.length > 0 ? (
                    <ul className="mt-1 max-h-56 divide-y divide-[#f2f4f6] overflow-y-auto">
                      {alerts.map((alert) => (
                        <li key={alert.id}>
                          <Link
                            href={alert.href}
                            onClick={() => setNotificationsOpen(false)}
                            className="block rounded-xl px-2.5 py-2.5 hover:bg-[#f7f9fa]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] font-semibold text-[#354153]">
                                {alert.name}
                              </span>
                              <span className="rounded-full bg-[#fff4e8] px-2 py-0.5 text-[9px] font-medium text-[#bd7838]">
                                {alert.tag}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-[#87909d]">
                              {alert.note}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>

            <span className="hidden h-7 w-px bg-[#e9edf1] sm:block" />
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full text-left"
                aria-label={`Account menu for ${accountName}`}
                aria-expanded={accountMenuOpen}
                aria-controls="account-menu"
                onClick={() => {
                  setAccountMenuOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                <span className="grid size-8 place-items-center rounded-full bg-[#e8f4ee] text-[11px] font-semibold text-[#2e8868]">
                  {initials || "GS"}
                </span>
                <span className="hidden max-w-36 truncate text-[12px] font-medium text-[#354153] sm:block">
                  {accountName}
                </span>
                <ChevronDown
                  size={14}
                  className="hidden text-[#8993a0] sm:block"
                  aria-hidden="true"
                />
              </button>
              {accountMenuOpen && (
                <div
                  id="account-menu"
                  className="absolute right-0 top-[calc(100%+12px)] z-30 w-64 rounded-2xl border border-[#e9edf1] bg-white p-2 shadow-[0_16px_40px_rgba(23,36,51,0.14)]"
                >
                  <div className="border-b border-[#edf0f3] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-[#303b4a]">
                        {accountName}
                      </p>
                      <span className="rounded-full bg-[#e8f4ee] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#258765]">
                        {accountRole}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[#87909d]">
                      {accountEmail}
                    </p>
                    {gymName && (
                      <p className="mt-1 truncate text-[10px] font-medium text-[#278968]">
                        {gymName}
                      </p>
                    )}
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setAccountMenuOpen(false)}
                    className="mt-1 flex min-h-9 w-full items-center rounded-xl px-3 text-left text-[12px] font-medium text-[#354153] hover:bg-slate-50"
                  >
                    Gym &amp; Team Settings
                  </Link>
                  {logoutError && (
                    <p role="alert" className="px-3 py-2 text-[11px] text-red-700">
                      {logoutError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 min-h-10 w-full rounded-xl px-3 text-left text-[12px] font-medium text-[#a64141] hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Live incoming mobile subscription request bar so staff immediately sees new requests on any page */}
        {latestPending && (
          <div
            role="region"
            aria-label="Incoming mobile subscription request"
            className="border-b border-[#cfe9dc] bg-[#edf9f3] px-4 py-3 sm:px-7 lg:px-9"
          >
            <div className="mx-auto flex max-w-[1440px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5 sm:items-center">
                <span className="mt-0.5 size-2.5 shrink-0 animate-pulse rounded-full bg-[#278968] sm:mt-0" />
                <p className="text-[12px] text-[#243242]">
                  <span className="font-semibold">{latestPending.memberName}</span>{" "}
                  <span className="text-[#687585]">({latestPending.memberPhone})</span> requested{" "}
                  <span className="font-semibold text-[#278968]">{latestPending.planName}</span> ·{" "}
                  <span className="font-bold">{formatEgp(latestPending.price)}</span> via{" "}
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-[#278968]">
                    {latestPending.paymentMethod}
                  </span>
                  {pendingRequests.length > 1 && (
                    <span className="ml-2 text-[11px] font-medium text-[#687585]">
                      (+{pendingRequests.length - 1} more)
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={processingId === latestPending.id}
                  onClick={() => void handleMembershipRequest(latestPending.id, "accept")}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#278968] px-3.5 text-[11px] font-semibold text-white hover:bg-[#207858] disabled:opacity-60"
                >
                  {processingId === latestPending.id ? (
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Check size={14} aria-hidden="true" />
                  )}
                  Accept Payment &amp; Activate
                </button>
                <button
                  type="button"
                  disabled={processingId === latestPending.id}
                  onClick={() => void handleMembershipRequest(latestPending.id, "decline")}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#d6e5dc] bg-white px-3 text-[11px] font-medium text-[#526071] hover:bg-slate-50 disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {acceptBanner && (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-[#cfe9dc] bg-[#f4fbf7] px-4 py-2.5 sm:px-7 lg:px-9"
          >
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[12px] font-medium text-[#237e5f]">
                <CheckCircle2 size={15} aria-hidden="true" />
                {acceptBanner}
              </p>
              <button
                type="button"
                aria-label="Dismiss confirmation"
                onClick={() => setAcceptBanner("")}
                className="rounded-md p-1 text-[#687585] hover:bg-white"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
