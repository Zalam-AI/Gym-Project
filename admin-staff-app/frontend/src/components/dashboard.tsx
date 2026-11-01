"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import {
  buildGymPath,
  extractGymSlugFromPathname,
  isNeutralBrowserHostname,
} from "@/lib/gym-routing";

type DashboardData = {
  gym: {
    id: string;
    name: string;
    slug: string;
  };
  metrics: {
    activeMembers: number;
    totalMembers: number;
    newMembersThisMonth: number;
    newMembersLastMonth: number;
    checkInsToday: number;
    checkInsYesterday: number;
    currentlyInside: number;
    paymentsDueCount: number;
    outstandingAmountEgp: number;
    collectedMonthEgp: number;
  };
  attendanceSeries: Array<{
    date: string;
    label: string;
    count: number;
  }>;
  attentionItems: Array<{
    id: string;
    name: string;
    initials: string;
    note: string;
    tag: "Membership" | "Payment";
    href: string;
  }>;
};

const avatarColors = [
  "bg-[#e9f2ff] text-[#4d73b8]",
  "bg-[#f3eefe] text-[#8c62b4]",
  "bg-[#fff0e8] text-[#c77c4a]",
  "bg-[#eaf6f0] text-[#278968]",
];

function formatEgp(amount: number) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function AttendanceChart({
  series,
  isLoading,
  effectiveSlug,
}: {
  series: DashboardData["attendanceSeries"];
  isLoading: boolean;
  effectiveSlug: string | null;
}) {
  const safeSeries =
    series.length === 7
      ? series
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, idx) => ({
          date: String(idx),
          label,
          count: 0,
        }));

  const maxCount = Math.max(4, ...safeSeries.map((day) => day.count));
  const yTicks = [
    maxCount,
    Math.round(maxCount * 0.66),
    Math.round(maxCount * 0.33),
    0,
  ];

  const width = 312;
  const topY = 12;
  const bottomY = 132;
  const usableHeight = bottomY - topY;

  const coords = safeSeries.map((item, index) => {
    const x = Math.round((index / (safeSeries.length - 1)) * width);
    const ratio = maxCount > 0 ? item.count / maxCount : 0;
    const y = Math.round(bottomY - ratio * usableHeight);
    return { x, y, ...item };
  });

  const chartPoints = coords.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const chartArea = `0,138 ${chartPoints} ${width},138`;
  const totalWeekVisits = safeSeries.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Attendance</h2>
          <p className="mt-1 text-[12px] text-[#87909d]">
            {isLoading
              ? "Loading member check-ins…"
              : `${totalWeekVisits} check-in${totalWeekVisits === 1 ? "" : "s"} recorded over the last 7 days`}
          </p>
        </div>
        <Link
          href={buildGymPath("/attendance", effectiveSlug)}
          aria-label="Date range: last 7 days — view attendance"
          className="flex min-h-9 items-center gap-2 rounded-lg border border-[#e9edf1] px-3 text-[11px] font-medium text-[#526071] hover:bg-[#f7f9fa]"
        >
          <CalendarDays size={14} aria-hidden="true" />
          Last 7 days
        </Link>
      </div>

      <div className="grid grid-cols-[32px_1fr] gap-3">
        <div
          aria-hidden="true"
          className="flex h-[154px] flex-col justify-between pb-5 pt-1 text-[10px] text-[#9aa3ae]"
        >
          {yTicks.map((tick, index) => (
            <span key={index}>{tick}</span>
          ))}
        </div>
        <div>
          <svg
            role="img"
            aria-label={`Attendance chart for the last 7 days totaling ${totalWeekVisits} visits.`}
            viewBox="0 0 312 138"
            preserveAspectRatio="none"
            className="h-[138px] w-full overflow-visible"
          >
            <defs>
              <linearGradient id="attendance-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#52b990" stopOpacity=".22" />
                <stop offset="100%" stopColor="#52b990" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[12, 52, 92, 132].map((y) => (
              <line
                key={y}
                x1="0"
                x2="312"
                y1={y}
                y2={y}
                stroke="#edf0f3"
                strokeDasharray="3 4"
              />
            ))}
            <polygon points={chartArea} fill="url(#attendance-fill)" />
            <polyline
              points={chartPoints}
              fill="none"
              stroke="#37a87c"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {coords.map((point) => (
              <circle
                key={point.date}
                cx={point.x}
                cy={point.y}
                r="3.5"
                fill="white"
                stroke="#37a87c"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${point.label} (${point.date}): ${point.count} check-ins`}</title>
              </circle>
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-[#9aa3ae]">
            {coords.map((point) => (
              <span key={point.date} className="text-center">
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AttentionList({
  items,
  isLoading,
  effectiveSlug,
}: {
  items: DashboardData["attentionItems"];
  isLoading: boolean;
  effectiveSlug: string | null;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Needs attention</h2>
          <p className="mt-1 text-[12px] text-[#87909d]">Renewals and balances to follow up on</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            items.length > 0
              ? "bg-[#fff4e8] text-[#bd7838]"
              : "bg-[#eaf6f0] text-[#278968]"
          }`}
        >
          {isLoading ? "…" : `${items.length} ${items.length === 1 ? "item" : "items"}`}
        </span>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-[12px] text-[#87909d]">
          Checking memberships and payments…
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-[#eaf6f0] text-[#278968]">
            <CheckCircle2 size={20} aria-hidden="true" />
          </span>
          <p className="mt-3 text-[13px] font-semibold text-[#344052]">Everything looks healthy</p>
          <p className="mt-1 max-w-[230px] text-[11px] text-[#8993a0]">
            No memberships expiring this week or unpaid member balances.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#eff1f4]">
          {items.map((item, index) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={buildGymPath(item.href, effectiveSlug)}
                className="flex items-center gap-3 rounded-xl p-1.5 -m-1.5 transition-colors hover:bg-[#f7f9fa]"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    avatarColors[index % avatarColors.length]
                  }`}
                >
                  {item.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[#344052]">{item.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[#8993a0]">{item.note}</p>
                </div>
                <span
                  className={`hidden shrink-0 rounded-full px-2 py-1 text-[9px] font-medium sm:inline-flex ${
                    item.tag === "Payment"
                      ? "bg-[#fff2ed] text-[#bf7252]"
                      : "bg-[#f2f4f6] text-[#6e7885]"
                  }`}
                >
                  {item.tag}
                </span>
                <ChevronRight size={14} className="shrink-0 text-[#9aa3ae]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Dashboard() {
  const pathname = usePathname();
  const pathSlug = extractGymSlugFromPathname(pathname);
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const effectiveSlug =
    pathSlug ||
    (typeof window !== "undefined" &&
    isNeutralBrowserHostname(window.location.hostname) &&
    data?.gym.slug
      ? data.gym.slug
      : null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load dashboard.");
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const onFocus = () => void loadDashboard();
    window.addEventListener("focus", onFocus);
    window.addEventListener("gymos:membership-updated", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gymos:membership-updated", onFocus);
    };
  }, [loadDashboard]);

  const metrics = data?.metrics;

  const stats = [
    {
      label: "Active members",
      value: isLoading ? "—" : String(metrics?.activeMembers ?? 0),
      change: isLoading
        ? "Loading"
        : `+${metrics?.newMembersThisMonth ?? 0} joined`,
      detail: `this month · ${metrics?.totalMembers ?? 0} total`,
      icon: UsersRound,
      positive: true,
      iconClass: "bg-[#e9f6f0] text-[#23845f]",
      href: "/members",
    },
    {
      label: "Check-ins today",
      value: isLoading ? "—" : String(metrics?.checkInsToday ?? 0),
      change: isLoading
        ? "Loading"
        : `${metrics?.currentlyInside ?? 0} inside now`,
      detail: `vs. ${metrics?.checkInsYesterday ?? 0} yesterday`,
      icon: UserRound,
      positive: (metrics?.checkInsToday ?? 0) >= (metrics?.checkInsYesterday ?? 0),
      iconClass: "bg-[#eef2ff] text-[#6675d9]",
      href: "/attendance",
    },
    {
      label: "Revenue this month",
      value: isLoading ? "—" : formatEgp(metrics?.collectedMonthEgp ?? 0),
      change: isLoading
        ? "Loading"
        : metrics?.paymentsDueCount
          ? `${formatEgp(metrics.outstandingAmountEgp)} due`
          : "0 unpaid",
      detail: metrics?.paymentsDueCount
        ? `${metrics.paymentsDueCount} pending / overdue`
        : "all balances settled",
      icon: metrics?.paymentsDueCount ? Wallet : BadgeDollarSign,
      positive: (metrics?.paymentsDueCount ?? 0) === 0,
      iconClass: metrics?.paymentsDueCount
        ? "bg-[#fff3e7] text-[#d18a3d]"
        : "bg-[#e9f6f0] text-[#23845f]",
      href: "/payments",
    },
  ];

  return (
    <AppShell activePage="Dashboard">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
              {data?.gym.name ?? "Overview"}
            </p>
            <h1 className="text-[24px] font-semibold tracking-[-0.045em] text-[#1f2b39] sm:text-[28px]">
              Dashboard
            </h1>
            <p className="mt-1.5 text-[13px] text-[#788391]">
              Here&apos;s what&apos;s happening at your gym today.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#8993a0]">
            <span className="size-2 rounded-full bg-[#3db287]" />
            {data?.gym.slug ? `Gym code: ${data.gym.slug}` : "All systems operational"}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1d2cf] bg-[#fff8f7] px-4 py-3 text-[12px] text-[#a54c46]"
          >
            <span>Could not load live metrics: {error}</span>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        <section
          aria-label="Gym key metrics"
          className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link key={stat.label} href={buildGymPath(stat.href, effectiveSlug)} className="block group">
                <Card className="p-5 transition-shadow group-hover:shadow-[0_6px_22px_rgba(23,36,51,0.06)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-[#778291]">{stat.label}</p>
                      <p className="mt-3 text-[27px] font-semibold leading-none tracking-[-0.045em] text-[#253243]">
                        {stat.value}
                      </p>
                    </div>
                    <span
                      className={`grid size-10 place-items-center rounded-xl ${stat.iconClass}`}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-[11px]">
                    {stat.positive ? (
                      <ArrowUpRight size={14} className="text-[#2d9d78]" aria-hidden="true" />
                    ) : (
                      <ArrowDownRight size={14} className="text-[#d18a3d]" aria-hidden="true" />
                    )}
                    <span
                      className={`font-semibold ${
                        stat.positive ? "text-[#278968]" : "text-[#c27d35]"
                      }`}
                    >
                      {stat.change}
                    </span>
                    <span className="text-[#939ca8]">{stat.detail}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </section>

        <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
          <AttendanceChart
            series={data?.attendanceSeries ?? []}
            isLoading={isLoading}
            effectiveSlug={effectiveSlug}
          />
          <AttentionList
            items={data?.attentionItems ?? []}
            isLoading={isLoading}
            effectiveSlug={effectiveSlug}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">
          <span>
            GymOS · {data?.gym.name ? `Live data for ${data.gym.name}` : "Live gym database"}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingUp size={12} aria-hidden="true" />
            Synced with MongoDB
          </span>
        </footer>
      </main>
    </AppShell>
  );
}
