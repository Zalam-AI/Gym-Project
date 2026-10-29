import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  TrendingUp,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

const stats = [
  {
    label: "Active members",
    value: "1,284",
    change: "+8.2%",
    detail: "vs. last month",
    icon: UsersRound,
    positive: true,
    iconClass: "bg-[#e9f6f0] text-[#23845f]",
  },
  {
    label: "Check-ins today",
    value: "186",
    change: "+12.5%",
    detail: "vs. yesterday",
    icon: UserRound,
    positive: true,
    iconClass: "bg-[#eef2ff] text-[#6675d9]",
  },
  {
    label: "Payments due",
    value: "24",
    change: "$2,840",
    detail: "outstanding",
    icon: Wallet,
    positive: false,
    iconClass: "bg-[#fff3e7] text-[#d18a3d]",
  },
];

const attentionItems = [
  {
    name: "Jordan Lee",
    note: "Membership expires in 3 days",
    initials: "JL",
    color: "bg-[#e9f2ff] text-[#4d73b8]",
    tag: "Membership",
  },
  {
    name: "Sam Rivera",
    note: "Payment failed · $89.00",
    initials: "SR",
    color: "bg-[#f3eefe] text-[#8c62b4]",
    tag: "Payment",
  },
  {
    name: "Taylor Morgan",
    note: "Membership expires tomorrow",
    initials: "TM",
    color: "bg-[#fff0e8] text-[#c77c4a]",
    tag: "Membership",
  },
];

const chartPoints = "0,104 52,88 104,94 156,61 208,72 260,48 312,58";
const chartArea = `0,138 ${chartPoints} 312,138`;

function AttendanceChart() {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Attendance</h2>
          <p className="mt-1 text-[12px] text-[#87909d]">Member check-ins over time</p>
        </div>
        <span
          aria-label="Date range: last 7 days"
          className="flex min-h-9 items-center gap-2 rounded-lg border border-[#e9edf1] px-3 text-[11px] font-medium text-[#526071]"
        >
          <CalendarDays size={14} aria-hidden="true" />
          Last 7 days
        </span>
      </div>

      <div className="grid grid-cols-[32px_1fr] gap-3">
        <div
          aria-hidden="true"
          className="flex h-[154px] flex-col justify-between pb-5 pt-1 text-[10px] text-[#9aa3ae]"
        >
          <span>200</span>
          <span>150</span>
          <span>100</span>
          <span>50</span>
        </div>
        <div>
          <svg
            role="img"
            aria-label="Placeholder attendance chart. Check-ins generally increased throughout the last seven days."
            viewBox="0 0 312 138"
            preserveAspectRatio="none"
            className="h-[138px] w-full overflow-visible"
          >
            <defs>
              <linearGradient id="attendance-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#52b990" stopOpacity=".2" />
                <stop offset="100%" stopColor="#52b990" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[8, 43, 78, 113, 138].map((y) => (
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
            {chartPoints.split(" ").map((point) => {
              const [cx, cy] = point.split(",");
              return (
                <circle
                  key={point}
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill="white"
                  stroke="#37a87c"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <div
            aria-hidden="true"
            className="mt-2 flex justify-between text-[10px] text-[#9aa3ae]"
          >
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>
      </div>
      <p className="sr-only">Chart values are illustrative mock data.</p>
    </Card>
  );
}

function AttentionList() {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Needs attention</h2>
          <p className="mt-1 text-[12px] text-[#87909d]">A few things to follow up on</p>
        </div>
        <span className="rounded-full bg-[#fff4e8] px-2.5 py-1 text-[10px] font-semibold text-[#bd7838]">
          3 items
        </span>
      </div>
      <ul className="divide-y divide-[#eff1f4]">
        {attentionItems.map((item) => (
          <li key={item.name} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
            <span
              aria-hidden="true"
              className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${item.color}`}
            >
              {item.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[#344052]">{item.name}</p>
              <p className="mt-1 truncate text-[11px] text-[#8993a0]">{item.note}</p>
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
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Dashboard() {
  return (
    <AppShell activePage="Dashboard">
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#83908d]">
                Overview
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
              All systems operational
            </div>
          </div>

          <section aria-label="Gym key metrics" className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="p-5 sm:p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-[#778291]">{stat.label}</p>
                      <p className="mt-3 text-[29px] font-semibold leading-none tracking-[-0.045em] text-[#253243]">
                        {stat.value}
                      </p>
                    </div>
                    <span className={`grid size-10 place-items-center rounded-xl ${stat.iconClass}`}>
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
                      className={`font-semibold ${stat.positive ? "text-[#278968]" : "text-[#c27d35]"}`}
                    >
                      {stat.change}
                    </span>
                    <span className="text-[#939ca8]">{stat.detail}</span>
                  </div>
                </Card>
              );
            })}
          </section>

          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
            <AttendanceChart />
            <AttentionList />
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-5 pt-7 text-[10px] text-[#9aa3ae]">
            <span>GymOS · Mock data for preview</span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp size={12} aria-hidden="true" />
              Updated just now
            </span>
          </footer>
      </main>
    </AppShell>
  );
}
