"use client";

import {
  Activity,
  BadgeDollarSign,
  LayoutDashboard,
  NotebookTabs,
  Dumbbell,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";

export type NavigationPage = "Dashboard" | "Members" | "Memberships" | "Attendance" | "Payments" | "Trainers";

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Members", href: "/members", icon: UsersRound },
  { label: "Memberships", href: "/memberships", icon: NotebookTabs },
  { label: "Attendance", href: "/attendance", icon: Activity },
  { label: "Payments", href: "/payments", icon: BadgeDollarSign },
  { label: "Trainers & Workouts", href: "/trainers", icon: Dumbbell },
];

type SidebarProps = {
  activePage: NavigationPage;
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ activePage, open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        aria-label="Main sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#172433] px-4 py-6 text-white transition-transform duration-200 md:translate-x-0 ${
          open ? "visible translate-x-0" : "invisible -translate-x-full md:visible md:translate-x-0"
        } md:w-[220px] md:px-3 lg:w-[248px] lg:px-4`}
      >
        <div className="mb-9 flex items-center justify-between px-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg"
            aria-label="GymOS home"
            onClick={onClose}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#45b58b] text-[15px] font-bold text-white">
              G
            </span>
            <span className="text-[20px] font-semibold tracking-[-0.04em]">
              Gym<span className="text-[#63c69d]">OS</span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </p>
        <nav id="primary-navigation" aria-label="Primary navigation" className="space-y-1">
          {navigation.map(({ label, href, icon: Icon }) =>
            href ? (
              <Link
                key={label}
                href={href}
                aria-current={activePage === label ? "page" : undefined}
                onClick={onClose}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium ${
                  activePage === label
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {activePage === label && (
                  <span className="ml-auto h-5 w-1 rounded-full bg-[#63c69d]" />
                )}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                disabled
                aria-disabled="true"
                title={`${label} — coming soon`}
                className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium text-slate-400/75"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </button>
            ),
          )}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="mb-3 grid size-8 place-items-center rounded-lg bg-[#28394a] text-[#77d0aa]">
            <Activity size={16} aria-hidden="true" />
          </div>
          <p className="text-[12px] font-semibold text-white">Your gym, at a glance</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            The essentials to keep your club moving.
          </p>
        </div>
      </aside>
    </>
  );
}
