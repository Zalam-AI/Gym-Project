"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronDown, Menu, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { Sidebar, type NavigationPage } from "@/components/sidebar";

const memberAppUrl =
  process.env.NEXT_PUBLIC_MEMBER_APP_URL ?? "http://localhost:3001";

type AppShellProps = {
  activePage: NavigationPage;
  children: ReactNode;
};

export function AppShell({ activePage, children }: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState("Staff");
  const [accountEmail, setAccountEmail] = useState("");
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load account details.");
        }
        return (await response.json()) as {
          user: { name: string; email: string };
        };
      })
      .then(({ user }) => {
        if (active) {
          setAccountName(user.name);
          setAccountEmail(user.email);
        }
      })
      .catch(() => {
        if (active) {
          setLogoutError("Unable to load account details. Please refresh the page.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout request failed.");
      }
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
                Welcome, {accountName.split(/\s+/)[0]}
              </p>
              <p className="text-[13px] font-semibold text-[#303b4a]">Wednesday, October 28</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <a
              href={memberAppUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Preview Member App"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dce7e1] px-2.5 text-[11px] font-semibold text-[#278968] hover:bg-[#f1f8f4] sm:px-3"
            >
              <Smartphone size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Preview Member App</span>
            </a>
            <button
              type="button"
              aria-label="Notifications (2 unread)"
              className="relative grid size-9 place-items-center rounded-full text-[#697585] hover:bg-[#f4f6f7]"
            >
              <Bell size={18} aria-hidden="true" />
              <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#e4845f]" />
            </button>
            <span className="hidden h-7 w-px bg-[#e9edf1] sm:block" />
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full text-left"
                aria-label={`Account menu for ${accountName}`}
                aria-expanded={accountMenuOpen}
                aria-controls="account-menu"
                onClick={() => setAccountMenuOpen((open) => !open)}
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
                    <p className="truncate text-[13px] font-semibold text-[#303b4a]">
                      {accountName}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[#87909d]">
                      {accountEmail}
                    </p>
                  </div>
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

        {children}
      </div>
    </div>
  );
}
