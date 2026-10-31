"use client";

import {
  Activity,
  BadgeDollarSign,
  Building2,
  Dumbbell,
  LayoutDashboard,
  NotebookTabs,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

export type NavigationPage =
  | "Dashboard"
  | "Members"
  | "Memberships"
  | "Attendance"
  | "Payments"
  | "Trainers"
  | "Settings";

const navigation: Array<{
  id: NavigationPage;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "Dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { id: "Members", label: "Members", href: "/members", icon: UsersRound },
  { id: "Memberships", label: "Memberships", href: "/memberships", icon: NotebookTabs },
  { id: "Attendance", label: "Attendance", href: "/attendance", icon: Activity },
  { id: "Payments", label: "Payments", href: "/payments", icon: BadgeDollarSign },
  { id: "Trainers", label: "Trainers & Workouts", href: "/trainers", icon: Dumbbell },
  { id: "Settings", label: "Gym & Team", href: "/settings", icon: Settings },
];

type SidebarProps = {
  activePage: NavigationPage;
  open: boolean;
  onClose: () => void;
  gymName?: string;
  gymSlug?: string;
  gymSubdomain?: string;
  gymLogoText?: string;
  gymAccentColor?: string;
};

export function Sidebar({
  activePage,
  open,
  onClose,
  gymName,
  gymSlug,
  gymSubdomain,
  gymLogoText,
  gymAccentColor,
}: SidebarProps) {
  const { isRtl, t } = useLanguage();
  const accentColor =
    gymAccentColor && /^#[0-9a-fA-F]{6}$/.test(gymAccentColor)
      ? gymAccentColor
      : "#45b58b";
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label={t("Close navigation menu")}
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        aria-label={t("Main sidebar")}
        className={`fixed inset-y-0 start-0 z-40 flex w-[248px] flex-col bg-[#172433] px-4 py-6 text-white transition-transform duration-200 md:translate-x-0 ${
          open
            ? "visible translate-x-0"
            : `invisible ${isRtl ? "translate-x-full" : "-translate-x-full"} md:visible md:translate-x-0`
        } md:w-[220px] md:px-3 lg:w-[248px] lg:px-4`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg"
            aria-label={t("GymOS home")}
            onClick={onClose}
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {gymLogoText || "G"}
            </span>
            <div className="min-w-0">
              <span
                data-no-translate={!gymName ? "true" : undefined}
                className="block truncate text-[17px] font-semibold tracking-[-0.03em]"
              >
                {gymName || (
                  <>
                    Gym<span className="text-[#63c69d]">OS</span>
                  </>
                )}
              </span>
              {gymName && (
                <span className="block truncate text-[10px] font-medium text-slate-400">
                  {t("Powered by GymOS")}
                </span>
              )}
            </div>
          </Link>
          <button
            type="button"
            aria-label={t("Close navigation menu")}
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t("Workspace")}
        </p>
        <nav id="primary-navigation" aria-label={t("Primary navigation")} className="space-y-1">
          {navigation.map(({ id, label, href, icon: Icon }) => {
            const isActive = activePage === id;
            return (
              <Link
                key={id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span>{t(label)}</span>
                {isActive && (
                  <span
                    className="ms-auto h-5 w-1 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-[#28394a] text-[#77d0aa]">
              <Building2 size={14} aria-hidden="true" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#77d0aa]">
              {t("Active Club")}
            </span>
          </div>
          <p className="truncate text-[12px] font-semibold text-white">
            {gymName || t("GymOS Workspace")}
          </p>
          {gymSubdomain || gymSlug ? (
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
              {gymSubdomain || gymSlug}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              {t("Multi-tenant club workspace")}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
