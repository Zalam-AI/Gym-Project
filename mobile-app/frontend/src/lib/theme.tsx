"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { safeLocalGet, safeLocalSet } from "@/lib/mobile-fetch";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "gymos_mobile_theme_preference";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

export type SemanticThemeTokens = {
  metaThemeColor: string;
  bgCanvas: string;
  bgApp: string;
  bgSurface: string;
  bgElevated: string;
  bgSubtle: string;
  bgInput: string;
  bgHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
  borderSubtle: string;
  borderStrong: string;
  divider: string;
};

export const THEME_TOKENS: Record<ResolvedTheme, SemanticThemeTokens> = {
  dark: {
    metaThemeColor: "#121417",
    bgCanvas: "#0b0d10",
    bgApp: "#121417",
    bgSurface: "#1a1d22",
    bgElevated: "#22262d",
    bgSubtle: "#15181c",
    bgInput: "#15181c",
    bgHover: "#252a32",
    textPrimary: "#f3f5f7",
    textSecondary: "#9ba3af",
    textMuted: "#6c7480",
    textOnAccent: "#ffffff",
    accent: "#2fb386",
    accentHover: "#269a72",
    accentSoft: "rgba(47, 179, 134, 0.14)",
    accentBorder: "rgba(47, 179, 134, 0.30)",
    accentText: "#5cd3aa",
    borderSubtle: "#262b33",
    borderStrong: "#353c47",
    divider: "#22262e",
  },
  light: {
    metaThemeColor: "#f5f7f9",
    bgCanvas: "#eceff3",
    bgApp: "#f5f7f9",
    bgSurface: "#ffffff",
    bgElevated: "#ffffff",
    bgSubtle: "#eef1f5",
    bgInput: "#ffffff",
    bgHover: "#f2f5f8",
    textPrimary: "#161d26",
    textSecondary: "#5c6674",
    textMuted: "#85909e",
    textOnAccent: "#ffffff",
    accent: "#238564",
    accentHover: "#1c6e52",
    accentSoft: "rgba(35, 133, 100, 0.10)",
    accentBorder: "rgba(35, 133, 100, 0.26)",
    accentText: "#1d7557",
    borderSubtle: "#e3e8ee",
    borderStrong: "#cfd7e0",
    divider: "#ebeff4",
  },
};

/**
 * Reusable component class primitives backed by CSS theme tokens so every
 * current and future screen automatically inherits Light / Dark appearance.
 */
export const ui = {
  pageCanvas:
    "flex min-h-screen items-center justify-center bg-canvas px-0 py-0 sm:px-6 sm:py-8",
  appFrame:
    "flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-app text-ink sm:h-[850px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-line",
  authFrame:
    "flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-app text-ink sm:min-h-[760px] sm:max-h-[calc(100dvh-64px)] sm:rounded-3xl sm:border sm:border-line",
  appHeader:
    "flex min-h-[72px] items-center justify-between border-b border-line bg-surface px-5 pt-[max(env(safe-area-inset-top),8px)]",
  bottomNav:
    "border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),8px)] pt-2",
  card: "rounded-2xl border border-line bg-surface",
  cardInteractive:
    "rounded-2xl border border-line bg-surface transition-colors hover:bg-hover",
  cardSubtle: "rounded-xl border border-line bg-subtle",
  cardElevated: "rounded-[22px] border border-line-strong bg-elevated",
  input:
    "min-h-11 w-full rounded-xl border border-line-strong bg-input px-3 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-accent",
  inputCompact:
    "min-h-9 w-full rounded-lg border border-line-strong bg-input px-2.5 text-[11px] text-ink outline-none placeholder:text-ink-muted focus:border-accent",
  select:
    "min-h-10 w-full rounded-xl border border-line-strong bg-input px-3 text-[12px] text-ink outline-none focus:border-accent",
  btnPrimary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
  btnSecondary:
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface font-semibold text-ink transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50",
  btnGhost:
    "inline-flex items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-hover hover:text-ink",
  btnDangerOutline:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-danger-border bg-surface font-semibold text-danger-text transition-colors hover:bg-danger-soft disabled:opacity-50",
  btnDangerSolid:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-danger font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50",
  badgeAccent:
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-[9px] font-semibold text-accent-text",
  badgeNeutral:
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-subtle px-2.5 py-0.5 text-[9px] font-semibold text-ink-secondary",
  badgeWarning:
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-warning-border bg-warning-soft px-2.5 py-0.5 text-[9px] font-semibold text-warning-text",
  badgeDanger:
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-danger-border bg-danger-soft px-2.5 py-0.5 text-[9px] font-semibold text-danger-text",
  segmentedTrack: "rounded-2xl border border-line bg-subtle p-1",
  modalBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4 backdrop-blur-xs",
  modalSheetBackdrop:
    "fixed inset-0 z-50 flex items-end justify-center bg-backdrop p-0 backdrop-blur-xs sm:items-center sm:p-4",
  modalCard:
    "w-full rounded-[24px] border border-line-strong bg-elevated text-ink shadow-2xl",
} as const;

export function isValidThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveThemeAppearance(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

/**
 * Inline zero-FOUC initialization script executed before first paint so the
 * saved theme (or default dark appearance) applies immediately on startup.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var p=(s==="light"||s==="dark"||s==="system")?s:"${DEFAULT_THEME_PREFERENCE}";var d=p==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var r=document.documentElement;r.setAttribute("data-theme",d);r.style.colorScheme=d;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",d==="dark"?"#121417":"#f5f7f9");}}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.style.colorScheme="dark";}})();`;

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  tokens: SemanticThemeTokens;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: "dark",
  tokens: THEME_TOKENS.dark,
  setPreference: () => {},
});

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolvedThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", THEME_TOKENS[resolved].metaThemeColor);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const saved = safeLocalGet(THEME_STORAGE_KEY);
    return isValidThemePreference(saved) ? saved : DEFAULT_THEME_PREFERENCE;
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    getSystemPrefersDark(),
  );

  // Hydrate preference & subscribe to OS color-scheme changes + cross-tab storage sync
  useEffect(() => {
    const saved = safeLocalGet(THEME_STORAGE_KEY);
    if (isValidThemePreference(saved)) {
      setPreferenceState(saved);
    }

    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    if (media) {
      setSystemPrefersDark(media.matches);
    }

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isValidThemePreference(event.newValue)) {
        setPreferenceState(event.newValue);
      }
    };

    media?.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      media?.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const resolvedTheme = useMemo(
    () => resolveThemeAppearance(preference, systemPrefersDark),
    [preference, systemPrefersDark],
  );

  useEffect(() => {
    applyResolvedThemeToDom(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      safeLocalSet(THEME_STORAGE_KEY, next);
      const immediateResolved = resolveThemeAppearance(next, getSystemPrefersDark());
      applyResolvedThemeToDom(immediateResolved);
    },
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      tokens: THEME_TOKENS[resolvedTheme],
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Full 3-option Appearance Settings control ("Light" | "Dark" | "System default")
 * for Profile / Application Settings screens.
 */
export function ThemePreferenceControl({ className = "" }: { className?: string }) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  const options: Array<{
    value: ThemePreference;
    label: string;
    icon: typeof Moon;
  }> = [
    { value: "dark", label: "Dark", icon: Moon },
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System default", icon: Monitor },
  ];

  return (
    <section
      aria-label="Appearance settings"
      className={`${ui.card} p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-ink">Appearance</p>
          <p className="mt-0.5 text-[10px] text-ink-secondary">
            {preference === "system"
              ? `Following device (${resolvedTheme === "dark" ? "Dark" : "Light"})`
              : preference === "dark"
                ? "Dark theme active"
                : "Light theme active"}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Theme preference"
        className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-subtle p-1"
      >
        {options.map(({ value, label, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                selected
                  ? "border border-accent-border bg-elevated text-accent-text"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Compact header button cycling Dark -> Light -> System default for auth/onboarding
 * screens before the user reaches Profile settings.
 */
export function ThemeHeaderSwitch({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  const cyclePreference = () => {
    const next: ThemePreference =
      preference === "dark" ? "light" : preference === "light" ? "system" : "dark";
    setPreference(next);
  };

  const Icon = preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  const label =
    preference === "dark"
      ? "Theme: Dark"
      : preference === "light"
        ? "Theme: Light"
        : "Theme: System default";

  return (
    <button
      type="button"
      onClick={cyclePreference}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-full border border-line-strong bg-subtle text-ink-secondary transition-colors hover:bg-hover hover:text-ink ${className}`}
    >
      <Icon size={14} aria-hidden="true" />
    </button>
  );
}
