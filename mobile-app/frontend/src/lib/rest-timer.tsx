"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Bell, BellOff, Minus, Plus, Smartphone, Timer } from "lucide-react";
import { mobileFetch, safeLocalGet, safeLocalSet } from "@/lib/mobile-fetch";
import { ui } from "@/lib/theme";

export const DEFAULT_REST_SECONDS = 60;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
export const REST_SETTINGS_STORAGE_KEY = "gymos_rest_timer_settings_v1";

export const REST_DURATION_PRESETS = [30, 45, 60, 90, 120, 180] as const;

export type RestTimerSettings = {
  defaultRestSeconds: number;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
};

export const DEFAULT_REST_TIMER_SETTINGS: RestTimerSettings = {
  defaultRestSeconds: DEFAULT_REST_SECONDS,
  vibrationEnabled: true,
  notificationsEnabled: true,
};

export type RestTimerStateFields = {
  restTimerId?: string;
  restStartedAtIso?: string | null;
  restEndsAtIso: string | null;
  restDurationSeconds: number;
  restPausedRemainingMs?: number | null;
};

export type RestTimerStatus = "idle" | "running" | "paused" | "expired";

export type RestTimerSnapshot = {
  status: RestTimerStatus;
  timerId: string;
  remainingMs: number;
  remainingSeconds: number;
  totalDurationSeconds: number;
  progressRatio: number;
  isFinalFive: boolean;
  expiredAgoMs: number;
};

export type RestDeviceCapabilities = {
  isNativeApp: boolean;
  vibrationSupported: boolean;
  amplitudeSupported: boolean;
  notificationsSupported: boolean;
  notificationPermission: "granted" | "denied" | "default" | "unsupported";
};

interface GymOSRestFeedbackNativePlugin {
  getCapabilities(): Promise<{
    vibrationSupported: boolean;
    amplitudeSupported: boolean;
    notificationsSupported: boolean;
    notificationPermission: "granted" | "denied" | "default";
  }>;
  vibrateTick(options: { second: number }): Promise<void>;
  vibrateComplete(): Promise<void>;
  cancelVibration(): Promise<void>;
  requestNotificationPermission(): Promise<{ permission: "granted" | "denied" }>;
  scheduleRestNotification(options: {
    endAtMs: number;
    title: string;
    body: string;
    vibrateEnabled: boolean;
  }): Promise<void>;
  cancelRestNotification(): Promise<void>;
}

let cachedNativePlugin: GymOSRestFeedbackNativePlugin | null = null;

function getNativeRestFeedback(): GymOSRestFeedbackNativePlugin {
  if (!cachedNativePlugin) {
    cachedNativePlugin = registerPlugin<GymOSRestFeedbackNativePlugin>(
      "GymOSRestFeedback",
    );
  }
  return cachedNativePlugin;
}

declare global {
  interface Window {
    __gymosVibrationLog?: Array<{
      kind: "tick" | "complete";
      second: number;
      pattern: number | number[];
      atMs: number;
    }>;
  }
}

export function clampRestDurationSeconds(
  raw: unknown,
  fallback = DEFAULT_REST_SECONDS,
): number {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(MIN_REST_SECONDS, Math.min(MAX_REST_SECONDS, Math.round(num)));
}

export function normalizeRestTimerSettings(
  raw: Partial<RestTimerSettings> | null | undefined,
): RestTimerSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_REST_TIMER_SETTINGS };
  }
  return {
    defaultRestSeconds: clampRestDurationSeconds(
      raw.defaultRestSeconds,
      DEFAULT_REST_SECONDS,
    ),
    vibrationEnabled:
      typeof raw.vibrationEnabled === "boolean" ? raw.vibrationEnabled : true,
    notificationsEnabled:
      typeof raw.notificationsEnabled === "boolean"
        ? raw.notificationsEnabled
        : true,
  };
}

export function makeRestTimerId(nowMs = Date.now()): string {
  return `rt-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// PURE TIMESTAMP-BASED REST TIMER ENGINE (ZERO CONTINUOUS TIMER DRIFT)
// ---------------------------------------------------------------------------
export function computeRestTimerSnapshot(
  state: RestTimerStateFields,
  nowMs = Date.now(),
): RestTimerSnapshot {
  const timerId = state.restTimerId || "";
  const pausedMs =
    typeof state.restPausedRemainingMs === "number" &&
    Number.isFinite(state.restPausedRemainingMs) &&
    state.restPausedRemainingMs > 0
      ? Math.min(MAX_REST_SECONDS * 1000, Math.round(state.restPausedRemainingMs))
      : 0;

  if (pausedMs > 0 && !state.restEndsAtIso) {
    const remainingSeconds = Math.max(1, Math.ceil(pausedMs / 1000));
    const totalDurationSeconds = Math.max(
      remainingSeconds,
      Math.round(state.restDurationSeconds || remainingSeconds),
    );
    const progressRatio = Math.max(
      0,
      Math.min(1, pausedMs / (totalDurationSeconds * 1000)),
    );
    return {
      status: "paused",
      timerId,
      remainingMs: pausedMs,
      remainingSeconds,
      totalDurationSeconds,
      progressRatio,
      isFinalFive: remainingSeconds >= 1 && remainingSeconds <= 5,
      expiredAgoMs: 0,
    };
  }

  if (state.restEndsAtIso) {
    const endMs = Date.parse(state.restEndsAtIso);
    if (!Number.isNaN(endMs)) {
      const diffMs = endMs - nowMs;
      if (diffMs > 0) {
        const remainingSeconds = Math.max(1, Math.ceil(diffMs / 1000));
        const totalDurationSeconds = Math.max(
          remainingSeconds,
          Math.round(state.restDurationSeconds || remainingSeconds),
        );
        const progressRatio = Math.max(
          0,
          Math.min(1, diffMs / (totalDurationSeconds * 1000)),
        );
        return {
          status: "running",
          timerId,
          remainingMs: diffMs,
          remainingSeconds,
          totalDurationSeconds,
          progressRatio,
          isFinalFive: remainingSeconds >= 1 && remainingSeconds <= 5,
          expiredAgoMs: 0,
        };
      }
      return {
        status: "expired",
        timerId,
        remainingMs: 0,
        remainingSeconds: 0,
        totalDurationSeconds: Math.max(0, Math.round(state.restDurationSeconds || 0)),
        progressRatio: 0,
        isFinalFive: false,
        expiredAgoMs: Math.max(0, nowMs - endMs),
      };
    }
  }

  return {
    status: "idle",
    timerId: "",
    remainingMs: 0,
    remainingSeconds: 0,
    totalDurationSeconds: 0,
    progressRatio: 0,
    isFinalFive: false,
    expiredAgoMs: 0,
  };
}

export function applyStartRestTimer(
  durationSeconds: number,
  nowMs = Date.now(),
): Required<RestTimerStateFields> {
  const clampedSec = Math.max(0, Math.min(MAX_REST_SECONDS, Math.round(durationSeconds)));
  if (clampedSec <= 0) {
    return applySkipRestTimer();
  }
  return {
    restTimerId: makeRestTimerId(nowMs),
    restStartedAtIso: new Date(nowMs).toISOString(),
    restEndsAtIso: new Date(nowMs + clampedSec * 1000).toISOString(),
    restDurationSeconds: clampedSec,
    restPausedRemainingMs: null,
  };
}

export function applyPauseRestTimer(
  state: RestTimerStateFields,
  nowMs = Date.now(),
): Required<RestTimerStateFields> {
  const snap = computeRestTimerSnapshot(state, nowMs);
  if (snap.status !== "running") {
    return {
      restTimerId: state.restTimerId || "",
      restStartedAtIso: state.restStartedAtIso ?? null,
      restEndsAtIso: state.restEndsAtIso,
      restDurationSeconds: state.restDurationSeconds,
      restPausedRemainingMs: state.restPausedRemainingMs ?? null,
    };
  }
  return {
    restTimerId: state.restTimerId || makeRestTimerId(nowMs),
    restStartedAtIso: state.restStartedAtIso ?? new Date(nowMs).toISOString(),
    restEndsAtIso: null,
    restDurationSeconds: snap.totalDurationSeconds,
    restPausedRemainingMs: Math.max(500, Math.round(snap.remainingMs)),
  };
}

export function applyResumeRestTimer(
  state: RestTimerStateFields,
  nowMs = Date.now(),
): Required<RestTimerStateFields> {
  const pausedMs =
    typeof state.restPausedRemainingMs === "number" && state.restPausedRemainingMs > 0
      ? Math.min(MAX_REST_SECONDS * 1000, Math.round(state.restPausedRemainingMs))
      : 0;
  if (pausedMs <= 0) {
    return {
      restTimerId: state.restTimerId || "",
      restStartedAtIso: state.restStartedAtIso ?? null,
      restEndsAtIso: state.restEndsAtIso,
      restDurationSeconds: state.restDurationSeconds,
      restPausedRemainingMs: null,
    };
  }
  const totalDurationSeconds = Math.max(
    Math.ceil(pausedMs / 1000),
    Math.round(state.restDurationSeconds || Math.ceil(pausedMs / 1000)),
  );
  return {
    restTimerId: state.restTimerId || makeRestTimerId(nowMs),
    restStartedAtIso: state.restStartedAtIso ?? new Date(nowMs).toISOString(),
    restEndsAtIso: new Date(nowMs + pausedMs).toISOString(),
    restDurationSeconds: totalDurationSeconds,
    restPausedRemainingMs: null,
  };
}

export function applyAdjustRestTimer(
  state: RestTimerStateFields,
  deltaSeconds: number,
  nowMs = Date.now(),
): Required<RestTimerStateFields> {
  const snap = computeRestTimerSnapshot(state, nowMs);
  const deltaMs = Math.round(deltaSeconds * 1000);

  if (snap.status === "paused") {
    const nextPausedMs = snap.remainingMs + deltaMs;
    if (nextPausedMs <= 400) {
      return applySkipRestTimer();
    }
    const cappedMs = Math.min(MAX_REST_SECONDS * 1000, nextPausedMs);
    const nextTotalSec = Math.min(
      MAX_REST_SECONDS,
      Math.max(
        Math.ceil(cappedMs / 1000),
        snap.totalDurationSeconds + Math.max(0, Math.round(deltaSeconds)),
      ),
    );
    return {
      restTimerId: state.restTimerId || makeRestTimerId(nowMs),
      restStartedAtIso: state.restStartedAtIso ?? new Date(nowMs).toISOString(),
      restEndsAtIso: null,
      restDurationSeconds: nextTotalSec,
      restPausedRemainingMs: cappedMs,
    };
  }

  const baseRemainingMs = snap.status === "running" ? snap.remainingMs : 0;
  const nextRemainingMs = baseRemainingMs + deltaMs;
  if (nextRemainingMs <= 400) {
    return applySkipRestTimer();
  }
  const cappedMs = Math.min(MAX_REST_SECONDS * 1000, nextRemainingMs);
  const nextTotalSec = Math.min(
    MAX_REST_SECONDS,
    snap.status === "running"
      ? Math.max(
          Math.ceil(cappedMs / 1000),
          snap.totalDurationSeconds + Math.max(0, Math.round(deltaSeconds)),
        )
      : Math.ceil(cappedMs / 1000),
  );
  return {
    restTimerId: state.restTimerId || makeRestTimerId(nowMs),
    restStartedAtIso: state.restStartedAtIso ?? new Date(nowMs).toISOString(),
    restEndsAtIso: new Date(nowMs + cappedMs).toISOString(),
    restDurationSeconds: nextTotalSec,
    restPausedRemainingMs: null,
  };
}

export function applySkipRestTimer(): Required<RestTimerStateFields> {
  return {
    restTimerId: "",
    restStartedAtIso: null,
    restEndsAtIso: null,
    restDurationSeconds: 0,
    restPausedRemainingMs: null,
  };
}

// ---------------------------------------------------------------------------
// DEVICE-COMPATIBLE PROGRESSIVE VIBRATION & LOCAL NOTIFICATION CONTROLLERS
// ---------------------------------------------------------------------------
function isNativePlatformSafe(): boolean {
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getWebCountdownVibrationPattern(second: number): number | number[] {
  const clamped = Math.max(1, Math.min(5, Math.round(second)));
  // Progressively more noticeable from 5s -> 1s
  switch (clamped) {
    case 5:
      return 30;
    case 4:
      return 50;
    case 3:
      return 75;
    case 2:
      return 105;
    case 1:
    default:
      return [65, 40, 100];
  }
}

export const WEB_COMPLETION_VIBRATION_PATTERN: number[] = [180, 70, 220, 70, 300];

function recordVibrationDiagnostic(
  kind: "tick" | "complete",
  second: number,
  pattern: number | number[],
) {
  if (typeof window === "undefined") return;
  if (!Array.isArray(window.__gymosVibrationLog)) {
    window.__gymosVibrationLog = [];
  }
  window.__gymosVibrationLog.push({
    kind,
    second,
    pattern,
    atMs: Date.now(),
  });
  if (window.__gymosVibrationLog.length > 30) {
    window.__gymosVibrationLog.shift();
  }
}

export async function detectRestDeviceCapabilities(): Promise<RestDeviceCapabilities> {
  if (typeof window === "undefined") {
    return {
      isNativeApp: false,
      vibrationSupported: false,
      amplitudeSupported: false,
      notificationsSupported: false,
      notificationPermission: "unsupported",
    };
  }

  if (isNativePlatformSafe()) {
    try {
      const nativeCaps = await getNativeRestFeedback().getCapabilities();
      return {
        isNativeApp: true,
        vibrationSupported: Boolean(nativeCaps.vibrationSupported),
        amplitudeSupported: Boolean(nativeCaps.amplitudeSupported),
        notificationsSupported: Boolean(nativeCaps.notificationsSupported),
        notificationPermission: nativeCaps.notificationPermission ?? "default",
      };
    } catch {
      // Fall back cleanly to web API inspection inside WebView
    }
  }

  const vibrationSupported =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const notificationsSupported = "Notification" in window;
  const notificationPermission: RestDeviceCapabilities["notificationPermission"] =
    notificationsSupported ? window.Notification.permission : "unsupported";

  return {
    isNativeApp: false,
    vibrationSupported,
    amplitudeSupported: false,
    notificationsSupported,
    notificationPermission,
  };
}

export function triggerFinalFiveTickVibration(
  second: number,
  vibrationEnabled: boolean,
): void {
  if (!vibrationEnabled || typeof window === "undefined") return;
  const clamped = Math.max(1, Math.min(5, Math.round(second)));
  const pattern = getWebCountdownVibrationPattern(clamped);
  recordVibrationDiagnostic("tick", clamped, pattern);

  if (isNativePlatformSafe()) {
    getNativeRestFeedback()
      .vibrateTick({ second: clamped })
      .catch(() => {
        vibrateWebSafely(pattern, 30 + (6 - clamped) * 22);
      });
    return;
  }

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return;
  }
  vibrateWebSafely(pattern, 30 + (6 - clamped) * 22);
}

export function triggerRestCompletionVibration(vibrationEnabled: boolean): void {
  if (!vibrationEnabled || typeof window === "undefined") return;
  recordVibrationDiagnostic("complete", 0, WEB_COMPLETION_VIBRATION_PATTERN);

  if (isNativePlatformSafe()) {
    getNativeRestFeedback()
      .vibrateComplete()
      .catch(() => {
        vibrateWebSafely(WEB_COMPLETION_VIBRATION_PATTERN, 360);
      });
    return;
  }

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return;
  }
  vibrateWebSafely(WEB_COMPLETION_VIBRATION_PATTERN, 360);
}

export function cancelRestVibration(): void {
  if (typeof window === "undefined") return;
  if (isNativePlatformSafe()) {
    getNativeRestFeedback()
      .cancelVibration()
      .catch(() => {});
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore on browsers that disallow vibrate(0) without prior activation
    }
  }
}

function vibrateWebSafely(primaryPattern: number | number[], simpleFallbackMs: number) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    const accepted = navigator.vibrate(primaryPattern);
    // Some mobile browsers only accept a single duration integer rather than pulse arrays
    if (!accepted && Array.isArray(primaryPattern)) {
      navigator.vibrate(simpleFallbackMs);
    }
  } catch {
    // Respect OS/browser vibration policies silently
  }
}

export async function requestRestNotificationPermission(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (typeof window === "undefined") return "unsupported";
  if (isNativePlatformSafe()) {
    try {
      const res = await getNativeRestFeedback().requestNotificationPermission();
      return res.permission;
    } catch {
      // Fall back to web Notification API
    }
  }
  if (!("Notification" in window)) {
    return "unsupported";
  }
  if (window.Notification.permission === "granted") {
    return "granted";
  }
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

async function postMessageToServiceWorker(payload: Record<string, unknown>) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
      return true;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const target = reg?.active || reg?.waiting || reg?.installing;
    if (target) {
      target.postMessage(payload);
      return true;
    }
  } catch {
    // Ignore restricted iframe SW errors
  }
  return false;
}

export async function scheduleBackgroundRestNotification(options: {
  timerId: string;
  endAtMs: number;
  exerciseName?: string;
  nextSetNumber?: number;
  notificationsEnabled: boolean;
  vibrationEnabled: boolean;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (!options.notificationsEnabled || !options.timerId) {
    await cancelBackgroundRestNotification();
    return;
  }

  const title = "Rest Complete · GymOS";
  const body = options.exerciseName
    ? options.nextSetNumber
      ? `Ready for ${options.exerciseName} · Set ${options.nextSetNumber}`
      : `Ready to continue ${options.exerciseName}`
    : "Your rest period is finished. Ready for your next set!";

  if (isNativePlatformSafe()) {
    try {
      await getNativeRestFeedback().scheduleRestNotification({
        endAtMs: options.endAtMs,
        title,
        body,
        vibrateEnabled: options.vibrationEnabled,
      });
      return;
    } catch {
      // Fall through to web SW scheduling
    }
  }

  if (!("Notification" in window) || window.Notification.permission !== "granted") {
    return;
  }

  await postMessageToServiceWorker({
    type: "SCHEDULE_REST_NOTIFICATION",
    timerId: options.timerId,
    endAtMs: options.endAtMs,
    title,
    body,
    vibrateEnabled: options.vibrationEnabled,
  });
}

export async function cancelBackgroundRestNotification(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNativePlatformSafe()) {
    getNativeRestFeedback()
      .cancelRestNotification()
      .catch(() => {});
  }
  await postMessageToServiceWorker({ type: "CANCEL_REST_NOTIFICATION" });
}

export async function fireFallbackHiddenRestNotification(options: {
  timerId: string;
  exerciseName?: string;
  nextSetNumber?: number;
  notificationsEnabled: boolean;
  vibrationEnabled: boolean;
}): Promise<void> {
  if (
    typeof window === "undefined" ||
    !options.notificationsEnabled ||
    isNativePlatformSafe() ||
    typeof document === "undefined" ||
    document.visibilityState !== "hidden"
  ) {
    return;
  }
  if (!("Notification" in window) || window.Notification.permission !== "granted") {
    return;
  }

  const title = "Rest Complete · GymOS";
  const body = options.exerciseName
    ? options.nextSetNumber
      ? `Ready for ${options.exerciseName} · Set ${options.nextSetNumber}`
      : `Ready to continue ${options.exerciseName}`
    : "Your rest period is finished. Ready for your next set!";

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          tag: "gymos-rest-timer",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          silent: !options.vibrationEnabled,
          data: { timerId: options.timerId },
        });
        return;
      }
    }
    new window.Notification(title, {
      body,
      tag: "gymos-rest-timer",
      icon: "/icons/icon-192.png",
      silent: !options.vibrationEnabled,
    });
  } catch {
    // Ignore browser notification restrictions
  }
}

// ---------------------------------------------------------------------------
// PERSISTED MEMBER REST SETTINGS CONTEXT & UI CONTROL
// ---------------------------------------------------------------------------
type RestTimerSettingsContextValue = {
  settings: RestTimerSettings;
  capabilities: RestDeviceCapabilities;
  updateSettings: (
    patch: Partial<RestTimerSettings>,
    options?: { syncBackend?: boolean },
  ) => Promise<void>;
  hydrateFromServer: (
    memberId: string | null,
    serverSettings?: Partial<RestTimerSettings> | null,
  ) => void;
  refreshCapabilities: () => Promise<void>;
};

const RestTimerSettingsContext = createContext<RestTimerSettingsContextValue>({
  settings: DEFAULT_REST_TIMER_SETTINGS,
  capabilities: {
    isNativeApp: false,
    vibrationSupported: false,
    amplitudeSupported: false,
    notificationsSupported: false,
    notificationPermission: "unsupported",
  },
  updateSettings: async () => {},
  hydrateFromServer: () => {},
  refreshCapabilities: async () => {},
});

function readStoredRestSettings(memberId: string | null): RestTimerSettings | null {
  const key = memberId
    ? `${REST_SETTINGS_STORAGE_KEY}_${memberId}`
    : REST_SETTINGS_STORAGE_KEY;
  const raw = safeLocalGet(key) ?? safeLocalGet(REST_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeRestTimerSettings(JSON.parse(raw) as Partial<RestTimerSettings>);
  } catch {
    return null;
  }
}

function writeStoredRestSettings(memberId: string | null, settings: RestTimerSettings) {
  const serialized = JSON.stringify(settings);
  safeLocalSet(REST_SETTINGS_STORAGE_KEY, serialized);
  if (memberId) {
    safeLocalSet(`${REST_SETTINGS_STORAGE_KEY}_${memberId}`, serialized);
  }
}

export function RestTimerSettingsProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [settings, setSettings] = useState<RestTimerSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_REST_TIMER_SETTINGS;
    return readStoredRestSettings(null) ?? DEFAULT_REST_TIMER_SETTINGS;
  });
  const [capabilities, setCapabilities] = useState<RestDeviceCapabilities>({
    isNativeApp: false,
    vibrationSupported: false,
    amplitudeSupported: false,
    notificationsSupported: false,
    notificationPermission: "unsupported",
  });

  const latestSettingsRef = useRef<RestTimerSettings>(settings);
  latestSettingsRef.current = settings;

  const refreshCapabilities = useCallback(async () => {
    const caps = await detectRestDeviceCapabilities();
    setCapabilities(caps);
  }, []);

  useEffect(() => {
    void refreshCapabilities();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshCapabilities();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshCapabilities]);

  const hydrateFromServer = useCallback(
    (nextMemberId: string | null, serverSettings?: Partial<RestTimerSettings> | null) => {
      setMemberId(nextMemberId);
      if (serverSettings) {
        const normalized = normalizeRestTimerSettings(serverSettings);
        setSettings(normalized);
        latestSettingsRef.current = normalized;
        writeStoredRestSettings(nextMemberId, normalized);
        return;
      }
      const local = readStoredRestSettings(nextMemberId);
      if (local) {
        setSettings(local);
        latestSettingsRef.current = local;
      }
    },
    [],
  );

  const updateSettings = useCallback(
    async (
      patch: Partial<RestTimerSettings>,
      options?: { syncBackend?: boolean },
    ) => {
      const merged = normalizeRestTimerSettings({
        ...latestSettingsRef.current,
        ...patch,
      });

      // Request OS notification permission cleanly when user explicitly turns notifications ON
      if (
        patch.notificationsEnabled === true &&
        capabilities.notificationsSupported &&
        capabilities.notificationPermission === "default"
      ) {
        await requestRestNotificationPermission();
        await refreshCapabilities();
      }

      if (patch.notificationsEnabled === false) {
        void cancelBackgroundRestNotification();
      }
      if (patch.vibrationEnabled === false) {
        cancelRestVibration();
      }

      setSettings(merged);
      latestSettingsRef.current = merged;
      writeStoredRestSettings(memberId, merged);

      if (options?.syncBackend !== false && memberId) {
        try {
          await mobileFetch("/api/member-workouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update-rest-settings",
              defaultRestSeconds: merged.defaultRestSeconds,
              vibrationEnabled: merged.vibrationEnabled,
              notificationsEnabled: merged.notificationsEnabled,
            }),
          });
        } catch {
          // Local storage already persisted; syncs cleanly on next online change
        }
      }
    },
    [
      capabilities.notificationPermission,
      capabilities.notificationsSupported,
      memberId,
      refreshCapabilities,
    ],
  );

  const value = useMemo<RestTimerSettingsContextValue>(
    () => ({
      settings,
      capabilities,
      updateSettings,
      hydrateFromServer,
      refreshCapabilities,
    }),
    [capabilities, hydrateFromServer, refreshCapabilities, settings, updateSettings],
  );

  return (
    <RestTimerSettingsContext.Provider value={value}>
      {children}
    </RestTimerSettingsContext.Provider>
  );
}

export function useRestTimerSettings() {
  return useContext(RestTimerSettingsContext);
}

export function formatRestDurationShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return `${mins}m (${s}s)`;
  return `${mins}m ${rem}s`;
}

// ---------------------------------------------------------------------------
// APPLICATION SETTINGS CARD: DEFAULT REST DURATION, VIBRATION & NOTIFICATIONS
// ---------------------------------------------------------------------------
export function RestTimerSettingsControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { settings, capabilities, updateSettings, refreshCapabilities } =
    useRestTimerSettings();
  const [customInput, setCustomInput] = useState<string>(
    String(settings.defaultRestSeconds),
  );

  useEffect(() => {
    setCustomInput(String(settings.defaultRestSeconds));
  }, [settings.defaultRestSeconds]);

  function commitCustomInput(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setCustomInput(String(settings.defaultRestSeconds));
      return;
    }
    const clamped = clampRestDurationSeconds(parsed, settings.defaultRestSeconds);
    setCustomInput(String(clamped));
    if (clamped !== settings.defaultRestSeconds) {
      void updateSettings({ defaultRestSeconds: clamped });
    }
  }

  async function handleEnableNotificationsPrompt() {
    await requestRestNotificationPermission();
    await refreshCapabilities();
    await updateSettings({ notificationsEnabled: true });
  }

  return (
    <div
      aria-label="Rest timer settings"
      className={compact ? "space-y-3" : `${ui.card} space-y-3.5 p-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer size={15} className="text-accent-text" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-semibold text-ink">Workout rest timer</p>
            <p className="text-[9px] text-ink-muted">
              Default rest duration, countdown vibration &amp; background alerts
            </p>
          </div>
        </div>
        <span data-no-translate="true" className={ui.badgeAccent}>
          {settings.defaultRestSeconds}s
        </span>
      </div>

      {/* Default Rest Duration Presets + Stepper */}
      <div className="space-y-2 rounded-xl border border-line bg-subtle p-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="rest-default-seconds-input"
            className="text-[10px] font-semibold text-ink"
          >
            Default rest duration
          </label>
          <span className="text-[9px] text-ink-secondary">
            {formatRestDurationShort(settings.defaultRestSeconds)}
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {REST_DURATION_PRESETS.map((sec) => {
            const selected = settings.defaultRestSeconds === sec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => void updateSettings({ defaultRestSeconds: sec })}
                aria-pressed={selected}
                className={`min-h-8 rounded-lg border text-[10px] font-semibold transition-colors ${
                  selected
                    ? "border-accent-border bg-accent text-on-accent"
                    : "border-line bg-surface text-ink-secondary hover:text-ink"
                }`}
              >
                <span data-no-translate="true">{sec}s</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            aria-label="Decrease default rest by 15 seconds"
            onClick={() =>
              void updateSettings({
                defaultRestSeconds: clampRestDurationSeconds(
                  settings.defaultRestSeconds - 15,
                ),
              })
            }
            className={`${ui.btnSecondary} size-9 shrink-0 rounded-lg p-0`}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <div className="relative flex-1">
            <input
              id="rest-default-seconds-input"
              type="number"
              inputMode="numeric"
              min={MIN_REST_SECONDS}
              max={MAX_REST_SECONDS}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onBlur={(e) => commitCustomInput(e.target.value)}
              aria-label="Default rest duration in seconds"
              className={`${ui.inputCompact} min-h-9 pr-12 text-center font-semibold`}
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[10px] text-ink-muted">
              sec
            </span>
          </div>
          <button
            type="button"
            aria-label="Increase default rest by 15 seconds"
            onClick={() =>
              void updateSettings({
                defaultRestSeconds: clampRestDurationSeconds(
                  settings.defaultRestSeconds + 15,
                ),
              })
            }
            className={`${ui.btnSecondary} size-9 shrink-0 rounded-lg p-0`}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Vibration Toggle */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Smartphone
            size={15}
            className={
              settings.vibrationEnabled ? "shrink-0 text-accent-text" : "shrink-0 text-ink-muted"
            }
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink">Rest vibration</p>
            <p className="text-[9px] text-ink-secondary">
              {capabilities.vibrationSupported
                ? "Pulses during final 5s & strong alert at 0s"
                : "Preference saved · Device limits browser vibration"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.vibrationEnabled}
          aria-label="Toggle rest timer vibration"
          onClick={() => {
            const next = !settings.vibrationEnabled;
            void updateSettings({ vibrationEnabled: next });
            if (next) {
              triggerFinalFiveTickVibration(3, true);
            }
          }}
          className={`min-h-8 shrink-0 rounded-full border px-3 text-[10px] font-semibold transition-colors ${
            settings.vibrationEnabled
              ? "border-accent-border bg-accent text-on-accent"
              : "border-line bg-surface text-ink-secondary"
          }`}
        >
          {settings.vibrationEnabled ? "On" : "Off"}
        </button>
      </div>

      {/* Background Rest Notifications Toggle */}
      <div className="space-y-2 rounded-xl border border-line bg-subtle px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {settings.notificationsEnabled ? (
              <Bell size={15} className="shrink-0 text-accent-text" aria-hidden="true" />
            ) : (
              <BellOff size={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink">Rest notifications</p>
              <p className="text-[9px] text-ink-secondary">
                {!capabilities.notificationsSupported
                  ? "Local notifications unavailable in this browser"
                  : capabilities.notificationPermission === "denied"
                    ? "Blocked in device/browser notification settings"
                    : "Notify when rest finishes in the background"}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.notificationsEnabled}
            aria-label="Toggle rest timer notifications"
            onClick={() =>
              void updateSettings({
                notificationsEnabled: !settings.notificationsEnabled,
              })
            }
            className={`min-h-8 shrink-0 rounded-full border px-3 text-[10px] font-semibold transition-colors ${
              settings.notificationsEnabled
                ? "border-accent-border bg-accent text-on-accent"
                : "border-line bg-surface text-ink-secondary"
            }`}
          >
            {settings.notificationsEnabled ? "On" : "Off"}
          </button>
        </div>

        {settings.notificationsEnabled &&
          capabilities.notificationsSupported &&
          capabilities.notificationPermission === "default" && (
            <button
              type="button"
              onClick={() => void handleEnableNotificationsPrompt()}
              className={`${ui.btnSecondary} min-h-8 w-full rounded-lg text-[10px]`}
            >
              Allow device notification permission
            </button>
          )}
      </div>
    </div>
  );
}
