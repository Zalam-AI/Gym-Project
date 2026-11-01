"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudOff,
  Flame,
  History,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Timer,
  Trophy,
  Wifi,
  X,
} from "lucide-react";
import { ExerciseDemoVisual } from "@/components/exercise-demo-visual";
import {
  REPS_WHEEL_VALUES,
  SETS_WHEEL_VALUES,
  WEIGHT_KG_WHEEL_VALUES,
  WheelNumberPicker,
} from "@/components/wheel-number-picker";
import {
  matchesExerciseQuery,
  type ExerciseMediaCatalogEntry,
} from "@/lib/exercise-media";
import { mobileFetch, readMobileJson } from "@/lib/mobile-fetch";
import {
  DEFAULT_PROGRESSION_RULE_SETTINGS,
  describeDifficultyRating,
  evaluateExerciseProgression,
  type ActiveExerciseFeedback,
  type ExerciseHistorySummary,
  type ExerciseProgressionRecord,
  type ProgressionRuleSettings,
} from "@/lib/workout-progression";
import {
  applyAdjustRestTimer,
  applyPauseRestTimer,
  applyResumeRestTimer,
  applySkipRestTimer,
  applyStartRestTimer,
  cancelBackgroundRestNotification,
  cancelRestVibration,
  computeRestTimerSnapshot,
  DEFAULT_REST_SECONDS,
  fireFallbackHiddenRestNotification,
  RestTimerSettingsControl,
  scheduleBackgroundRestNotification,
  triggerFinalFiveTickVibration,
  triggerRestCompletionVibration,
  useRestTimerSettings,
  type RestTimerSnapshot,
} from "@/lib/rest-timer";
import { ui } from "@/lib/theme";

export type ActiveWorkoutSet = {
  setNumber: number;
  weightKg: string;
  reps: string;
  completed: boolean;
  completedAtIso?: string | null;
};

export type ActiveWorkoutExercise = {
  name: string;
  muscle: string;
  restSeconds: number;
  usesDefaultRest?: boolean;
  targetRepsLabel: string;
  notes: string;
  feedback?: ActiveExerciseFeedback | null;
  sets: ActiveWorkoutSet[];
};

export type ActiveWorkoutSession = {
  clientSessionId: string;
  sourceType: "gym_assigned" | "member_routine" | "free_workout";
  routineId: string | null;
  routineTitle: string;
  dayLabel?: string;
  targetGoal: string;
  startedAtIso: string;
  pausedSeconds: number;
  isPaused: boolean;
  lastPauseStartedIso: string | null;
  restTimerId?: string;
  restStartedAtIso?: string | null;
  restEndsAtIso?: string | null;
  restDurationSeconds?: number;
  restPausedRemainingMs?: number | null;
  currentExerciseIndex: number;
  clientUpdatedAtMs: number;
  exercises: ActiveWorkoutExercise[];
};

export type PreviousExerciseStat = {
  exerciseName: string;
  muscle: string;
  lastWeightKg: number;
  lastReps: number;
  lastPerformedWeightKg?: number;
  lastPerformedReps?: number;
  lastDifficultyRating?: number | null;
  lastReportedDiscomfort?: boolean;
  lastSets?: Array<{ setNumber: number; weightKg: number; reps: number }>;
  bestWeightKg: number;
  bestRepsAtMaxWeight: number;
  bestSetVolumeKg: number;
  lastPerformedAt: string;
  achievedAt: string;
  activeProgression?: ExerciseProgressionRecord | null;
};

export type QuickAddExerciseOption = {
  name: string;
  muscle: string;
  defaultSets: number;
  defaultReps: string;
  defaultRest: number;
};

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function deduplicateExerciseSets(sets: ActiveWorkoutSet[]): ActiveWorkoutSet[] {
  const map = new Map<number, ActiveWorkoutSet>();
  for (let i = 0; i < sets.length; i += 1) {
    const s = sets[i];
    const num = Math.max(1, Math.min(30, s.setNumber || i + 1));
    map.set(num, { ...s, setNumber: num });
  }
  return Array.from(map.values())
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
}

/**
 * Intentional Swipe-to-Complete track with scroll/edge guards + accessible button alternative.
 * - Ignores touches within 22px of screen edges (prevents OS back-gesture collisions).
 * - Locks out horizontal drag if vertical scroll movement dominates first.
 * - Requires crossing 58% of usable track distance to complete.
 */
function SwipeSetCompletionBar({
  setNumber,
  weightKg,
  reps,
  onComplete,
}: {
  setNumber: number;
  weightKg: string;
  reps: string;
  onComplete: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    maxTravel: number;
    isRtl: boolean;
    lock: "pending" | "horizontal" | "vertical";
  } | null>(null);

  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Reset thumb position whenever active set changes
  useEffect(() => {
    setDragPx(0);
    setIsDragging(false);
    gestureRef.current = null;
  }, [setNumber]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 390;
    // Guard against OS edge back/forward swipe navigation gestures
    if (e.clientX < 22 || e.clientX > vw - 22) {
      return;
    }
    const trackEl = trackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const maxTravel = Math.max(90, rect.width - 54);
    const isRtl =
      typeof document !== "undefined" && document.documentElement.dir === "rtl";

    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      maxTravel,
      isRtl,
      lock: "pending",
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;

    const rawDx = e.clientX - g.startX;
    const dx = g.isRtl ? -rawDx : rawDx;
    const dy = e.clientY - g.startY;

    if (g.lock === "pending") {
      // If vertical motion starts first, treat as normal page scroll and abort swipe
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 0.75) {
        g.lock = "vertical";
        setIsDragging(false);
        setDragPx(0);
        return;
      }
      if (dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        g.lock = "horizontal";
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture optional fallback
        }
      } else {
        return;
      }
    }

    if (g.lock === "horizontal") {
      const clamped = Math.max(0, Math.min(g.maxTravel, dx));
      setDragPx(clamped);
    }
  }

  function finishGesture(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const reachedThreshold =
      !cancelled && g.lock === "horizontal" && dragPx >= g.maxTravel * 0.58;

    gestureRef.current = null;
    setIsDragging(false);
    setDragPx(0);

    if (reachedThreshold) {
      onComplete();
    }
  }

  return (
    <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishGesture(e, false)}
        onPointerCancel={(e) => finishGesture(e, true)}
        role="group"
        aria-label={`Swipe to complete Set ${setNumber}`}
        title={`${weightKg || "0"} kg × ${reps || "0"} reps`}
        className="relative flex h-12 select-none items-center overflow-hidden rounded-2xl border border-accent-border bg-accent-soft px-1.5 touch-pan-y"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 bg-accent opacity-20"
          style={{ width: `${dragPx + 44}px` }}
        />
        <span
          aria-hidden="true"
          style={{
            transform: `translateX(${
              typeof document !== "undefined" && document.documentElement.dir === "rtl"
                ? -dragPx
                : dragPx
            }px)`,
          }}
          className={` z-10 grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent shadow-sm ${
            isDragging ? "" : "transition-transform duration-200"
          }`}
        >
          <ArrowRight size={17} className="rtl:rotate-180" />
        </span>
        <span className="pointer-events-none flex-1 truncate px-2 text-center text-[11px] font-semibold text-accent-text">
          Swipe to complete
        </span>
      </div>

      {/* Always-accessible 1-tap button alternative */}
      <button
        type="button"
        onClick={onComplete}
        aria-label={`Complete Set ${setNumber}`}
        className={`${ui.btnPrimary} min-h-12 shrink-0 rounded-2xl px-3.5 text-[11px]`}
      >
        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
        Done
      </button>
    </div>
  );
}

export function ActiveWorkoutPlayer({
  session,
  exerciseDefaults,
  exerciseHistory = [],
  progressionSettings = DEFAULT_PROGRESSION_RULE_SETTINGS,
  exerciseCatalog,
  exerciseMediaCatalog = null,
  isOnline,
  isSyncingDraft,
  onChangeSession,
  onRespondPriorProgression,
  onFinishWorkout,
  onDiscardSession,
  onMinimizeWorkout,
}: {
  session: ActiveWorkoutSession;
  exerciseDefaults: Record<string, PreviousExerciseStat>;
  exerciseHistory?: ExerciseHistorySummary[];
  progressionSettings?: ProgressionRuleSettings;
  exerciseCatalog: QuickAddExerciseOption[];
  exerciseMediaCatalog?: Record<string, ExerciseMediaCatalogEntry> | null;
  isOnline: boolean;
  isSyncingDraft: boolean;
  onChangeSession: (
    updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession,
    options?: { immediateSync?: boolean },
  ) => void;
  onRespondPriorProgression?: (params: {
    exerciseName: string;
    decision: "accepted" | "adjusted" | "ignored";
    customWeightKg?: number;
    customReps?: number;
  }) => Promise<void>;
  onFinishWorkout: (params: {
    durationSeconds: number;
    effortRating: number;
    sessionNotes: string;
    saveAsRoutine?: boolean;
    saveRoutineTitle?: string;
  }) => Promise<void>;
  onDiscardSession: () => void;
  onMinimizeWorkout?: () => void;
}) {
  const { settings: restSettings } = useRestTimerSettings();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSnapshot, setRestSnapshot] = useState<RestTimerSnapshot>(() =>
    computeRestTimerSnapshot({
      restTimerId: session.restTimerId,
      restStartedAtIso: session.restStartedAtIso,
      restEndsAtIso: session.restEndsAtIso ?? null,
      restDurationSeconds: session.restDurationSeconds ?? 0,
      restPausedRemainingMs: session.restPausedRemainingMs ?? null,
    }),
  );
  const [restCompleteNotice, setRestCompleteNotice] = useState(false);
  const [isRestSettingsOpen, setIsRestSettingsOpen] = useState(false);
  const [exercisePhase, setExercisePhase] = useState<"setup" | "demo" | "track">(
    () => {
      const firstEx = session.exercises[session.currentExerciseIndex ?? 0];
      if (firstEx && firstEx.sets.some((s) => s.completed)) return "track";
      return "setup";
    },
  );
  const configuredExercisesRef = useRef<Set<number>>(new Set());
  const stageSwipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [autoAdvanceBanner, setAutoAdvanceBanner] = useState<string>("");
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(
    () => session.exercises.length === 0,
  );
  const [addSearch, setAddSearch] = useState("");
  const [addMuscleFilter, setAddMuscleFilter] = useState<string>("All");
  const [previewAddExerciseName, setPreviewAddExerciseName] = useState<string | null>(null);
  const [configuringAddExerciseName, setConfiguringAddExerciseName] = useState<
    string | null
  >(null);
  const [configSets, setConfigSets] = useState("3");
  const [configReps, setConfigReps] = useState("10");
  const [configWeightKg, setConfigWeightKg] = useState("0");
  const [customExerciseMuscle, setCustomExerciseMuscle] = useState("Full body");
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [effortRating, setEffortRating] = useState<number>(4);
  const [sessionNotes, setSessionNotes] = useState("");
  const [saveAsRoutine, setSaveAsRoutine] = useState(false);
  const [saveRoutineTitle, setSaveRoutineTitle] = useState(() =>
    session.sourceType === "free_workout"
      ? `Free Workout (${new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })})`
      : session.routineTitle,
  );
  const [isSubmittingFinish, setIsSubmittingFinish] = useState(false);
  const [playerError, setPlayerError] = useState("");

  // Intelligent Exercise Feedback & Progression UI State
  const [discomfortDraft, setDiscomfortDraft] = useState(false);
  const [isEditingFeedbackRating, setIsEditingFeedbackRating] = useState(false);
  const [isAdjustingRecommendation, setIsAdjustingRecommendation] = useState(false);
  const [customRecWeight, setCustomRecWeight] = useState("0");
  const [customRecReps, setCustomRecReps] = useState("10");
  const [isExerciseHistoryOpen, setIsExerciseHistoryOpen] = useState(false);
  const [isAdjustingPriorRec, setIsAdjustingPriorRec] = useState(false);
  const [priorCustomWeight, setPriorCustomWeight] = useState("0");
  const [priorCustomReps, setPriorCustomReps] = useState("10");
  const [dismissedPriorRecKeys, setDismissedPriorRecKeys] = useState<string[]>([]);

  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const restNoticeTimeoutRef = useRef<number | null>(null);
  const firedVibrationTicksRef = useRef<{ timerId: string; ticks: Set<number> }>({
    timerId: "",
    ticks: new Set(),
  });
  const completedRestTimerIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
      }
      if (restNoticeTimeoutRef.current) {
        window.clearTimeout(restNoticeTimeoutRef.current);
      }
    };
  }, []);

  const safeExIndex = Math.max(
    0,
    Math.min(Math.max(0, session.exercises.length - 1), session.currentExerciseIndex || 0),
  );
  const currentExercise = session.exercises[safeExIndex] ?? null;

  const getEffectiveExerciseRestSeconds = useCallback(
    (ex: ActiveWorkoutExercise | null): number => {
      if (!ex) return restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS;
      if (ex.usesDefaultRest !== false) {
        return restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS;
      }
      return ex.restSeconds > 0
        ? ex.restSeconds
        : restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS;
    },
    [restSettings.defaultRestSeconds],
  );

  // Recompute wall-clock elapsed workout timer & timestamp-based rest countdown
  // Pure timestamp math — never relies on a continuously decrementing JS timer!
  const recomputeClocks = useCallback(() => {
    const nowMs = Date.now();
    const startMs = Date.parse(session.startedAtIso);
    if (!Number.isNaN(startMs)) {
      const activePauseSec =
        session.isPaused && session.lastPauseStartedIso
          ? Math.max(0, (nowMs - Date.parse(session.lastPauseStartedIso)) / 1000)
          : 0;
      setElapsedSeconds(
        Math.max(
          0,
          Math.floor((nowMs - startMs) / 1000 - session.pausedSeconds - activePauseSec),
        ),
      );
    }

    const activeTimerKey = session.restTimerId || session.restEndsAtIso || "";
    if (activeTimerKey && completedRestTimerIdsRef.current.has(activeTimerKey)) {
      setRestSnapshot((prev) =>
        prev.status === "idle"
          ? prev
          : {
              status: "idle",
              timerId: "",
              remainingMs: 0,
              remainingSeconds: 0,
              totalDurationSeconds: 0,
              progressRatio: 0,
              isFinalFive: false,
              expiredAgoMs: 0,
            },
      );
      return;
    }

    const snap = computeRestTimerSnapshot(
      {
        restTimerId: session.restTimerId,
        restStartedAtIso: session.restStartedAtIso,
        restEndsAtIso: session.restEndsAtIso ?? null,
        restDurationSeconds: session.restDurationSeconds ?? 0,
        restPausedRemainingMs: session.restPausedRemainingMs ?? null,
      },
      nowMs,
    );

    if (snap.status === "running") {
      if (firedVibrationTicksRef.current.timerId !== activeTimerKey) {
        firedVibrationTicksRef.current = {
          timerId: activeTimerKey,
          ticks: new Set(),
        };
      }
      if (
        snap.remainingSeconds >= 1 &&
        snap.remainingSeconds <= 5 &&
        !firedVibrationTicksRef.current.ticks.has(snap.remainingSeconds)
      ) {
        firedVibrationTicksRef.current.ticks.add(snap.remainingSeconds);
        triggerFinalFiveTickVibration(
          snap.remainingSeconds,
          restSettings.vibrationEnabled,
        );
      }
      setRestSnapshot(snap);
      return;
    }

    if (snap.status === "paused") {
      setRestSnapshot(snap);
      return;
    }

    if (snap.status === "expired") {
      if (activeTimerKey) {
        completedRestTimerIdsRef.current.add(activeTimerKey);
      }
      const alreadyFiredZero =
        firedVibrationTicksRef.current.timerId === activeTimerKey &&
        firedVibrationTicksRef.current.ticks.has(0);

      if (!alreadyFiredZero) {
        if (firedVibrationTicksRef.current.timerId !== activeTimerKey) {
          firedVibrationTicksRef.current = {
            timerId: activeTimerKey,
            ticks: new Set([0]),
          };
        } else {
          firedVibrationTicksRef.current.ticks.add(0);
        }

        // Only buzz live completion if timer just hit zero (never minutes later after unlocking phone)
        if (snap.expiredAgoMs <= 2500) {
          triggerRestCompletionVibration(restSettings.vibrationEnabled);
        }
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          const nextIncomplete = currentExercise?.sets.find((s) => !s.completed);
          void fireFallbackHiddenRestNotification({
            timerId: activeTimerKey || "rest-done",
            exerciseName: currentExercise?.name,
            nextSetNumber: nextIncomplete?.setNumber,
            notificationsEnabled: restSettings.notificationsEnabled,
            vibrationEnabled: restSettings.vibrationEnabled,
          });
        }
      }

      setRestSnapshot({
        status: "idle",
        timerId: "",
        remainingMs: 0,
        remainingSeconds: 0,
        totalDurationSeconds: 0,
        progressRatio: 0,
        isFinalFive: false,
        expiredAgoMs: 0,
      });

      setRestCompleteNotice(true);
      if (restNoticeTimeoutRef.current) {
        window.clearTimeout(restNoticeTimeoutRef.current);
      }
      restNoticeTimeoutRef.current = window.setTimeout(() => {
        setRestCompleteNotice(false);
      }, 4000);

      // Clear expired timestamps in session state so returning from background never restarts it
      onChangeSession(
        (prev) => ({
          ...prev,
          ...applySkipRestTimer(),
          clientUpdatedAtMs: Date.now(),
        }),
        { immediateSync: true },
      );
      return;
    }

    setRestSnapshot((prev) => (prev.status === "idle" ? prev : snap));
  }, [
    currentExercise,
    onChangeSession,
    restSettings.notificationsEnabled,
    restSettings.vibrationEnabled,
    session.isPaused,
    session.lastPauseStartedIso,
    session.pausedSeconds,
    session.restDurationSeconds,
    session.restEndsAtIso,
    session.restPausedRemainingMs,
    session.restStartedAtIso,
    session.restTimerId,
    session.startedAtIso,
  ]);

  useEffect(() => {
    recomputeClocks();
    // 200ms wall-clock timestamp sample while visible ensures exact 5..1..0 second boundaries
    const id = window.setInterval(recomputeClocks, 200);
    const onVisibility = () => {
      recomputeClocks();
    };
    window.addEventListener("focus", recomputeClocks);
    window.addEventListener("pageshow", recomputeClocks);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", recomputeClocks);
      window.removeEventListener("pageshow", recomputeClocks);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [recomputeClocks]);

  // Synchronize OS / Service Worker local background notifications with running rest timestamp
  useEffect(() => {
    const endIso = session.restEndsAtIso;
    const pausedMs = session.restPausedRemainingMs;
    const timerKey = session.restTimerId || endIso || "";

    if (!endIso || (typeof pausedMs === "number" && pausedMs > 0)) {
      void cancelBackgroundRestNotification();
      return;
    }
    const endAtMs = Date.parse(endIso);
    if (
      Number.isNaN(endAtMs) ||
      endAtMs <= Date.now() + 300 ||
      completedRestTimerIdsRef.current.has(timerKey)
    ) {
      void cancelBackgroundRestNotification();
      return;
    }

    const nextIncomplete = currentExercise?.sets.find((s) => !s.completed);
    void scheduleBackgroundRestNotification({
      timerId: timerKey,
      endAtMs,
      exerciseName: currentExercise?.name,
      nextSetNumber: nextIncomplete?.setNumber,
      notificationsEnabled: restSettings.notificationsEnabled,
      vibrationEnabled: restSettings.vibrationEnabled,
    });
  }, [
    currentExercise?.name,
    currentExercise?.sets,
    restSettings.notificationsEnabled,
    restSettings.vibrationEnabled,
    session.restEndsAtIso,
    session.restPausedRemainingMs,
    session.restTimerId,
  ]);

  const currentPrevious = useMemo(() => {
    if (!currentExercise) return null;
    return exerciseDefaults[currentExercise.name.trim().toLowerCase()] ?? null;
  }, [currentExercise, exerciseDefaults]);

  const currentExerciseHistory = useMemo(() => {
    if (!currentExercise) return null;
    const key = currentExercise.name.trim().toLowerCase();
    return exerciseHistory.find((h) => h.exerciseKey === key) ?? null;
  }, [currentExercise, exerciseHistory]);

  const nextIncompleteExerciseIdx = useMemo(() => {
    for (let offset = 1; offset < session.exercises.length; offset += 1) {
      const candidateIdx = (safeExIndex + offset) % session.exercises.length;
      if (session.exercises[candidateIdx]?.sets.some((s) => !s.completed)) {
        return candidateIdx;
      }
    }
    return -1;
  }, [safeExIndex, session.exercises]);

  useEffect(() => {
    setDiscomfortDraft(Boolean(currentExercise?.feedback?.reportedDiscomfort));
    setIsEditingFeedbackRating(false);
    setIsAdjustingRecommendation(false);
    setIsAdjustingPriorRec(false);
  }, [safeExIndex, currentExercise?.name, currentExercise?.feedback?.reportedDiscomfort]);

  // Reset focused step phase when switching exercises: Setup -> Demo -> Track
  useEffect(() => {
    const ex = session.exercises[safeExIndex];
    if (!ex) return;
    if (ex.sets.some((s) => s.completed) || configuredExercisesRef.current.has(safeExIndex)) {
      setExercisePhase("track");
    } else {
      setExercisePhase("setup");
    }
    // Only run when active exercise index or exercise count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeExIndex, session.exercises.length]);

  const currentSetIndex = useMemo(() => {
    if (!currentExercise) return -1;
    return currentExercise.sets.findIndex((s) => !s.completed);
  }, [currentExercise]);

  const currentSet =
    currentExercise && currentSetIndex >= 0
      ? currentExercise.sets[currentSetIndex]
      : null;

  const sessionTotals = useMemo(() => {
    let totalSets = 0;
    let completedSets = 0;
    let completedReps = 0;
    let volumeKg = 0;
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        totalSets += 1;
        if (s.completed) {
          completedSets += 1;
          const r = Math.max(0, Number.parseInt(s.reps, 10) || 0);
          const w = Math.max(0, Number.parseFloat(s.weightKg) || 0);
          completedReps += r;
          volumeKg += r * w;
        }
      }
    }
    const percent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
    return {
      totalSets,
      completedSets,
      completedReps,
      volumeKg: Math.round(volumeKg * 10) / 10,
      percent,
    };
  }, [session.exercises]);

  const filteredAddCatalog = useMemo(() => {
    const q = addSearch.trim();
    const muscleLower = addMuscleFilter.toLowerCase();
    const filtered = exerciseCatalog.filter((item) => {
      if (
        addMuscleFilter !== "All" &&
        !item.muscle.toLowerCase().includes(muscleLower)
      ) {
        return false;
      }
      if (!q) return true;
      return matchesExerciseQuery(item, q);
    });
    return q ? filtered : filtered.slice(0, 28);
  }, [addMuscleFilter, addSearch, exerciseCatalog]);

  const trimmedCustomExerciseName = addSearch.trim();
  const canAddCustomExercise =
    trimmedCustomExerciseName.length >= 2 &&
    !exerciseCatalog.some(
      (item) => item.name.toLowerCase() === trimmedCustomExerciseName.toLowerCase(),
    );

  function applyExerciseSetupConfig(patch: {
    weightKg?: number;
    reps?: number;
    setsCount?: number;
  }) {
    onChangeSession((prev) => {
      const targetEx = prev.exercises[safeExIndex];
      if (!targetEx) return prev;
      const completedCount = targetEx.sets.filter((s) => s.completed).length;
      const desiredTotal =
        patch.setsCount !== undefined
          ? Math.max(Math.max(1, completedCount), Math.min(20, Math.round(patch.setsCount)))
          : targetEx.sets.length;
      const firstOpen = targetEx.sets.find((s) => !s.completed) ?? targetEx.sets[0];
      const nextWeightStr =
        patch.weightKg !== undefined
          ? String(Math.max(0, Math.round(patch.weightKg * 100) / 100))
          : firstOpen?.weightKg ?? "0";
      const nextRepsStr =
        patch.reps !== undefined
          ? String(Math.max(1, Math.round(patch.reps)))
          : firstOpen?.reps ?? "10";

      const rebuiltSets: ActiveWorkoutSet[] = [];
      for (let i = 0; i < desiredTotal; i += 1) {
        const existingSet = targetEx.sets[i];
        if (existingSet && existingSet.completed) {
          rebuiltSets.push({ ...existingSet, setNumber: i + 1 });
        } else {
          rebuiltSets.push({
            setNumber: i + 1,
            weightKg:
              patch.weightKg !== undefined
                ? nextWeightStr
                : existingSet?.weightKg ?? nextWeightStr,
            reps:
              patch.reps !== undefined
                ? nextRepsStr
                : existingSet?.reps ?? nextRepsStr,
            completed: false,
            completedAtIso: null,
          });
        }
      }

      return {
        ...prev,
        exercises: prev.exercises.map((ex, idx) =>
          idx === safeExIndex
            ? {
                ...ex,
                targetRepsLabel:
                  patch.reps !== undefined ? nextRepsStr : ex.targetRepsLabel,
                sets: deduplicateExerciseSets(rebuiltSets),
              }
            : ex,
        ),
        clientUpdatedAtMs: Date.now(),
      };
    });
  }

  function advanceFocusedStep() {
    if (!currentExercise) return;
    if (currentSet === null) {
      if (nextIncompleteExerciseIdx >= 0) {
        selectExerciseIndex(nextIncompleteExerciseIdx);
      } else if (sessionTotals.completedSets > 0) {
        setPlayerError("");
        setIsFinishModalOpen(true);
      }
      return;
    }
    if (exercisePhase === "setup") {
      configuredExercisesRef.current.add(safeExIndex);
      setExercisePhase("demo");
    } else if (exercisePhase === "demo") {
      configuredExercisesRef.current.add(safeExIndex);
      setExercisePhase("track");
    }
  }

  function stepBackFocusedStep() {
    if (!currentExercise) return;
    if (exercisePhase === "track" && currentSet !== null) {
      setExercisePhase("demo");
    } else if (exercisePhase === "demo") {
      setExercisePhase("setup");
    }
  }

  function handleStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        '[role="listbox"], input, textarea, select, [aria-label^="Swipe to complete"]',
      )
    ) {
      stageSwipeRef.current = null;
      return;
    }
    stageSwipeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
  }

  function handleStagePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = stageSwipeRef.current;
    stageSwipeRef.current = null;
    if (!start || start.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    if (Math.abs(rawDx) < 56 || Math.abs(rawDx) < Math.abs(dy) * 1.4) return;
    const isRtl =
      typeof document !== "undefined" && document.documentElement.dir === "rtl";
    const forwardSwipe = isRtl ? rawDx > 56 : rawDx < -56;
    if (forwardSwipe) {
      advanceFocusedStep();
    } else {
      stepBackFocusedStep();
    }
  }

  function selectExerciseIndex(idx: number) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setAutoAdvanceBanner("");
    onChangeSession((prev) => ({
      ...prev,
      currentExerciseIndex: Math.max(0, Math.min(prev.exercises.length - 1, idx)),
      clientUpdatedAtMs: Date.now(),
    }));
  }

  function togglePause() {
    onChangeSession(
      (prev) => {
        if (prev.isPaused) {
          const extra = prev.lastPauseStartedIso
            ? Math.max(0, (Date.now() - Date.parse(prev.lastPauseStartedIso)) / 1000)
            : 0;
          return {
            ...prev,
            isPaused: false,
            pausedSeconds: prev.pausedSeconds + extra,
            lastPauseStartedIso: null,
            clientUpdatedAtMs: Date.now(),
          };
        }
        return {
          ...prev,
          isPaused: true,
          lastPauseStartedIso: new Date().toISOString(),
          clientUpdatedAtMs: Date.now(),
        };
      },
      { immediateSync: true },
    );
  }

  function togglePauseRestTimer() {
    onChangeSession(
      (prev) => {
        const snap = computeRestTimerSnapshot(
          {
            restTimerId: prev.restTimerId,
            restStartedAtIso: prev.restStartedAtIso,
            restEndsAtIso: prev.restEndsAtIso ?? null,
            restDurationSeconds: prev.restDurationSeconds ?? 0,
            restPausedRemainingMs: prev.restPausedRemainingMs ?? null,
          },
          Date.now(),
        );
        if (snap.status === "running") {
          cancelRestVibration();
          void cancelBackgroundRestNotification();
          return {
            ...prev,
            ...applyPauseRestTimer(
              {
                restTimerId: prev.restTimerId,
                restStartedAtIso: prev.restStartedAtIso,
                restEndsAtIso: prev.restEndsAtIso ?? null,
                restDurationSeconds: prev.restDurationSeconds ?? 0,
                restPausedRemainingMs: prev.restPausedRemainingMs ?? null,
              },
              Date.now(),
            ),
            clientUpdatedAtMs: Date.now(),
          };
        }
        if (snap.status === "paused") {
          // Reset fired ticks above the resumed second so final-5s vibration works cleanly on resume
          firedVibrationTicksRef.current = {
            timerId: prev.restTimerId || "",
            ticks: new Set(),
          };
          return {
            ...prev,
            ...applyResumeRestTimer(
              {
                restTimerId: prev.restTimerId,
                restStartedAtIso: prev.restStartedAtIso,
                restEndsAtIso: prev.restEndsAtIso ?? null,
                restDurationSeconds: prev.restDurationSeconds ?? 0,
                restPausedRemainingMs: prev.restPausedRemainingMs ?? null,
              },
              Date.now(),
            ),
            clientUpdatedAtMs: Date.now(),
          };
        }
        return prev;
      },
      { immediateSync: true },
    );
  }

  function adjustRestTimer(deltaSeconds: number) {
    setRestCompleteNotice(false);
    onChangeSession(
      (prev) => {
        const updated = applyAdjustRestTimer(
          {
            restTimerId: prev.restTimerId,
            restStartedAtIso: prev.restStartedAtIso,
            restEndsAtIso: prev.restEndsAtIso ?? null,
            restDurationSeconds: prev.restDurationSeconds ?? 0,
            restPausedRemainingMs: prev.restPausedRemainingMs ?? null,
          },
          deltaSeconds,
          Date.now(),
        );
        if (deltaSeconds > 0 && updated.restTimerId) {
          // Allow final-5s vibration ticks to play again if user extended rest above 5s
          firedVibrationTicksRef.current = {
            timerId: updated.restTimerId,
            ticks: new Set(),
          };
        }
        if (!updated.restEndsAtIso && !updated.restPausedRemainingMs) {
          cancelRestVibration();
          void cancelBackgroundRestNotification();
        }
        return {
          ...prev,
          ...updated,
          clientUpdatedAtMs: Date.now(),
        };
      },
      { immediateSync: true },
    );
  }

  function clearRestTimer() {
    setRestCompleteNotice(false);
    cancelRestVibration();
    void cancelBackgroundRestNotification();
    if (session.restTimerId) {
      completedRestTimerIdsRef.current.add(session.restTimerId);
    }
    onChangeSession(
      (prev) => ({
        ...prev,
        ...applySkipRestTimer(),
        clientUpdatedAtMs: Date.now(),
      }),
      { immediateSync: true },
    );
  }

  function updateSetValues(
    exIdx: number,
    setIdx: number,
    patch: { weightKg?: string; reps?: string },
    propagateWeightToLaterSets = false,
  ) {
    onChangeSession((prev) => {
      const targetEx = prev.exercises[exIdx];
      if (!targetEx) return prev;
      const oldWeight = targetEx.sets[setIdx]?.weightKg;

      const nextExercises = prev.exercises.map((ex, i) => {
        if (i !== exIdx) return ex;
        const nextSets = ex.sets.map((s, j) => {
          if (j === setIdx) {
            return { ...s, ...patch };
          }
          // Smart propagation: if user adjusts weight on current set, carry it forward to untouched upcoming sets
          if (
            propagateWeightToLaterSets &&
            patch.weightKg !== undefined &&
            j > setIdx &&
            !s.completed &&
            s.weightKg === oldWeight
          ) {
            return { ...s, weightKg: patch.weightKg };
          }
          return s;
        });
        return { ...ex, sets: deduplicateExerciseSets(nextSets) };
      });

      return {
        ...prev,
        exercises: nextExercises,
        clientUpdatedAtMs: Date.now(),
      };
    });
  }

  function completeOrToggleSet(exIdx: number, setIdx: number, forceComplete?: boolean) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setPlayerError("");

    const ex = session.exercises[exIdx];
    const targetSet = ex?.sets[setIdx];
    if (!ex || !targetSet) return;

    const willComplete =
      forceComplete !== undefined ? forceComplete : !targetSet.completed;

    // Prevent duplicate completion if already completed and forceComplete=true
    if (forceComplete === true && targetSet.completed) {
      return;
    }

    const updatedSets = ex.sets.map((s, j) =>
      j === setIdx
        ? {
            ...s,
            completed: willComplete,
            completedAtIso: willComplete ? new Date().toISOString() : null,
          }
        : s,
    );
    const allSetsInExerciseDone = willComplete && updatedSets.every((s) => s.completed);

    // Find next exercise that still has incomplete sets
    let nextIncompleteExIdx = -1;
    if (allSetsInExerciseDone) {
      for (let offset = 1; offset < session.exercises.length; offset += 1) {
        const candidateIdx = (exIdx + offset) % session.exercises.length;
        if (session.exercises[candidateIdx]?.sets.some((s) => !s.completed)) {
          nextIncompleteExIdx = candidateIdx;
          break;
        }
      }
    }

    const restSec = willComplete ? getEffectiveExerciseRestSeconds(ex) : 0;
    const nextRestFields = willComplete
      ? applyStartRestTimer(restSec, Date.now())
      : null;

    if (willComplete && nextRestFields) {
      setRestCompleteNotice(false);
      firedVibrationTicksRef.current = {
        timerId: nextRestFields.restTimerId,
        ticks: new Set(),
      };
    }

    onChangeSession(
      (prev) => {
        const nextExercises = prev.exercises.map((item, i) => {
          if (i !== exIdx) return item;
          const nextItemSets = deduplicateExerciseSets(
            item.sets.map((s, j) =>
              j === setIdx
                ? {
                    ...s,
                    completed: willComplete,
                    completedAtIso: willComplete ? new Date().toISOString() : null,
                  }
                : s,
            ),
          );
          const stillAllDone = nextItemSets.every((s) => s.completed);
          return {
            ...item,
            feedback: stillAllDone ? (item.feedback ?? null) : null,
            sets: nextItemSets,
          };
        });

        return {
          ...prev,
          exercises: nextExercises,
          ...(nextRestFields ?? {}),
          clientUpdatedAtMs: Date.now(),
        };
      },
      { immediateSync: true },
    );

    if (allSetsInExerciseDone && nextIncompleteExIdx >= 0) {
      const nextExName = session.exercises[nextIncompleteExIdx].name;
      setAutoAdvanceBanner(`${ex.name} complete · Up next: ${nextExName}`);
    } else if (
      allSetsInExerciseDone &&
      nextIncompleteExIdx === -1 &&
      session.exercises.length > 0
    ) {
      setAutoAdvanceBanner("All scheduled sets complete! Ready to finish workout.");
    } else {
      setAutoAdvanceBanner("");
    }
  }

  function submitExerciseDifficulty(rating: number, overrideDiscomfort?: boolean) {
    if (!currentExercise) return;
    const discomfort =
      overrideDiscomfort !== undefined ? overrideDiscomfort : discomfortDraft;
    const completedSets = currentExercise.sets
      .filter((s) => s.completed)
      .map((s) => ({
        weightKg: Math.max(0, Number.parseFloat(s.weightKg) || 0),
        reps: Math.max(0, Number.parseInt(s.reps, 10) || 0),
      }));

    const recentHistory = (currentExerciseHistory?.sessions ?? [])
      .slice(0, 5)
      .map((item) => ({
        weightKg: item.topWeightKg,
        reps:
          item.sets.length > 0
            ? Math.round(
                item.sets.reduce((acc, s) => acc + s.reps, 0) / item.sets.length,
              )
            : 10,
        setsCompleted: item.totalSets,
        difficultyRating: item.difficultyRating,
        reportedDiscomfort: item.reportedDiscomfort,
      }));

    const evaluated = evaluateExerciseProgression({
      exerciseName: currentExercise.name,
      muscle: currentExercise.muscle,
      targetGoal: session.targetGoal,
      targetSets: currentExercise.sets.length,
      targetRepsLabel: currentExercise.targetRepsLabel || "10",
      completedSets,
      difficultyRating: rating,
      reportedDiscomfort: discomfort,
      recentHistory,
      previousRecommendation: currentPrevious?.activeProgression ?? null,
      ruleSettings: progressionSettings,
    });

    setCustomRecWeight(String(evaluated.recommendedWeightKg));
    setCustomRecReps(String(evaluated.recommendedReps));
    setIsEditingFeedbackRating(false);
    setIsAdjustingRecommendation(false);

    onChangeSession(
      (prev) => ({
        ...prev,
        exercises: prev.exercises.map((item, idx) =>
          idx === safeExIndex ? { ...item, feedback: evaluated } : item,
        ),
        clientUpdatedAtMs: Date.now(),
      }),
      { immediateSync: true },
    );
  }

  function respondToExerciseFeedback(
    decision: "pending" | "accepted" | "adjusted" | "ignored",
    customWeightRaw?: string,
    customRepsRaw?: string,
  ) {
    if (!currentExercise?.feedback) return;
    const fb = currentExercise.feedback;

    let appliedWeightKg: number | null = null;
    let appliedReps: number | null = null;
    if (decision === "accepted") {
      appliedWeightKg = fb.recommendedWeightKg;
      appliedReps = fb.recommendedReps;
    } else if (decision === "adjusted") {
      const parsedW = Math.max(
        0,
        Math.min(1000, Math.round((Number.parseFloat(customWeightRaw ?? customRecWeight) || 0) * 100) / 100),
      );
      const parsedR = Math.max(
        1,
        Math.min(500, Math.round(Number.parseInt(customRepsRaw ?? customRecReps, 10) || fb.recommendedReps)),
      );
      appliedWeightKg = parsedW;
      appliedReps = parsedR;
    }

    setIsAdjustingRecommendation(false);
    onChangeSession(
      (prev) => ({
        ...prev,
        exercises: prev.exercises.map((item, idx) =>
          idx === safeExIndex && item.feedback
            ? {
                ...item,
                feedback: {
                  ...item.feedback,
                  decision,
                  appliedWeightKg,
                  appliedReps,
                },
              }
            : item,
        ),
        clientUpdatedAtMs: Date.now(),
      }),
      { immediateSync: true },
    );
  }

  async function handlePriorProgressionDecision(
    decision: "accepted" | "adjusted" | "ignored",
  ) {
    if (!currentExercise || !currentPrevious?.activeProgression) return;
    const prog = currentPrevious.activeProgression;
    const key = currentExercise.name.trim().toLowerCase();

    const targetWeight =
      decision === "adjusted"
        ? Math.max(0, Math.min(1000, Math.round((Number.parseFloat(priorCustomWeight) || 0) * 100) / 100))
        : prog.recommendedWeightKg;
    const targetReps =
      decision === "adjusted"
        ? Math.max(1, Math.min(500, Math.round(Number.parseInt(priorCustomReps, 10) || prog.recommendedReps)))
        : prog.recommendedReps;

    if (decision === "accepted" || decision === "adjusted") {
      onChangeSession(
        (prev) => ({
          ...prev,
          exercises: prev.exercises.map((ex, idx) => {
            if (idx !== safeExIndex) return ex;
            return {
              ...ex,
              sets: ex.sets.map((s) =>
                s.completed
                  ? s
                  : {
                      ...s,
                      weightKg: String(targetWeight),
                      reps: String(targetReps),
                    },
              ),
            };
          }),
          clientUpdatedAtMs: Date.now(),
        }),
        { immediateSync: true },
      );
    }

    setDismissedPriorRecKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setIsAdjustingPriorRec(false);

    if (onRespondPriorProgression) {
      await onRespondPriorProgression({
        exerciseName: currentExercise.name,
        decision,
        ...(decision === "adjusted"
          ? { customWeightKg: targetWeight, customReps: targetReps }
          : {}),
      });
    }
  }

  function addSetToCurrentExercise() {
    if (!currentExercise) return;
    onChangeSession((prev) => {
      const nextExercises = prev.exercises.map((ex, idx) => {
        if (idx !== safeExIndex || ex.sets.length >= 25) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              setNumber: ex.sets.length + 1,
              weightKg: last?.weightKg ?? "0",
              reps: last?.reps ?? "10",
              completed: false,
              completedAtIso: null,
            },
          ],
        };
      });
      return {
        ...prev,
        exercises: nextExercises,
        clientUpdatedAtMs: Date.now(),
      };
    });
  }

  function openInlineAddConfig(option: QuickAddExerciseOption) {
    if (configuringAddExerciseName === option.name) {
      setConfiguringAddExerciseName(null);
      return;
    }
    const prevStat = exerciseDefaults[option.name.trim().toLowerCase()];
    setConfiguringAddExerciseName(option.name);
    setConfigSets(String(Math.max(1, option.defaultSets || 3)));
    setConfigReps(
      prevStat && prevStat.lastReps > 0
        ? String(prevStat.lastReps)
        : option.defaultReps.match(/(\d+)/)?.[1] ?? "10",
    );
    setConfigWeightKg(
      prevStat && prevStat.lastWeightKg > 0 ? String(prevStat.lastWeightKg) : "0",
    );
  }

  function addExerciseToActiveSession(
    option: QuickAddExerciseOption,
    overrides?: { setsCount?: number; repsStr?: string; weightStr?: string },
  ) {
    const prevStat = exerciseDefaults[option.name.trim().toLowerCase()];
    const setTotal = Math.max(
      1,
      Math.min(20, overrides?.setsCount ?? (option.defaultSets || 3)),
    );
    const hasWeightOverride =
      overrides?.weightStr !== undefined && overrides.weightStr.trim() !== "";
    const hasRepsOverride =
      overrides?.repsStr !== undefined && overrides.repsStr.trim() !== "";

    const sets: ActiveWorkoutSet[] = Array.from({ length: setTotal }, (_, idx) => {
      const rememberedSet = prevStat?.lastSets?.[idx];
      const w = hasWeightOverride
        ? String(Math.max(0, Number.parseFloat(overrides!.weightStr!) || 0))
        : rememberedSet && rememberedSet.weightKg > 0
          ? String(rememberedSet.weightKg)
          : prevStat && prevStat.lastWeightKg > 0
            ? String(prevStat.lastWeightKg)
            : "0";
      const r = hasRepsOverride
        ? String(Math.max(1, Number.parseInt(overrides!.repsStr!, 10) || 10))
        : rememberedSet && rememberedSet.reps > 0
          ? String(rememberedSet.reps)
          : prevStat && prevStat.lastReps > 0
            ? String(prevStat.lastReps)
            : option.defaultReps.match(/(\d+)/)?.[1] ?? "10";
      return {
        setNumber: idx + 1,
        weightKg: w,
        reps: r,
        completed: false,
        completedAtIso: null,
      };
    });

    const newIndex = session.exercises.length;
    onChangeSession(
      (prev) => ({
        ...prev,
        exercises: [
          ...prev.exercises,
          {
            name: option.name,
            muscle: option.muscle,
            restSeconds: restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS,
            usesDefaultRest: true,
            targetRepsLabel: hasRepsOverride
              ? String(Math.max(1, Number.parseInt(overrides!.repsStr!, 10) || 10))
              : option.defaultReps || "10",
            notes: "",
            sets,
          },
        ],
        currentExerciseIndex: newIndex,
        clientUpdatedAtMs: Date.now(),
      }),
      { immediateSync: true },
    );
    setConfiguringAddExerciseName(null);
    setIsAddExerciseOpen(false);
    setAddSearch("");
  }

  function removeCurrentExerciseFromSession() {
    if (!currentExercise) return;
    onChangeSession(
      (prev) => {
        const nextExercises = prev.exercises.filter((_, idx) => idx !== safeExIndex);
        const nextIdx = Math.max(0, Math.min(nextExercises.length - 1, safeExIndex));
        return {
          ...prev,
          exercises: nextExercises,
          currentExerciseIndex: nextIdx,
          clientUpdatedAtMs: Date.now(),
        };
      },
      { immediateSync: true },
    );
  }

  async function handleFinishSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmittingFinish) return;
    if (sessionTotals.completedSets < 1) {
      setPlayerError("Complete at least one set before finishing your workout.");
      return;
    }
    setIsSubmittingFinish(true);
    setPlayerError("");
    try {
      cancelRestVibration();
      void cancelBackgroundRestNotification();
      await onFinishWorkout({
        durationSeconds: Math.max(60, elapsedSeconds),
        effortRating,
        sessionNotes: sessionNotes.trim(),
        ...(saveAsRoutine
          ? {
              saveAsRoutine: true,
              saveRoutineTitle: saveRoutineTitle.trim() || session.routineTitle,
            }
          : {}),
      });
      setIsFinishModalOpen(false);
    } catch (err) {
      setPlayerError(
        err instanceof Error ? err.message : "Unable to finish workout right now.",
      );
    } finally {
      setIsSubmittingFinish(false);
    }
  }

  const setupTargetSet =
    currentExercise?.sets.find((s) => !s.completed) ??
    currentExercise?.sets[0] ??
    null;
  const setupWeightKgVal = Math.max(
    0,
    Number.parseFloat(setupTargetSet?.weightKg ?? "0") || 0,
  );
  const setupRepsVal = Math.max(
    1,
    Number.parseInt(setupTargetSet?.reps ?? "10", 10) || 10,
  );
  const setupSetsCountVal = Math.max(1, currentExercise?.sets.length ?? 3);

  return (
    <section
      aria-label="Active workout session"
      className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink"
    >
      <div className="mx-auto flex h-full w-full max-w-[460px] flex-col overflow-hidden">
        {/* Minimal Full-Screen Focused Workout Top Bar */}
        <header className="shrink-0 border-b border-divider bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsDiscardConfirmOpen(true)}
              aria-label="Exit workout mode"
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-line-strong bg-subtle px-2.5 text-[11px] font-semibold text-ink-secondary hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
              <span>Exit</span>
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-accent-text">
                  <Flame size={10} aria-hidden="true" />
                  {session.dayLabel || "Focused Workout"}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle px-1.5 py-0.5 text-[8px] font-medium text-ink-muted"
                  title={
                    isOnline
                      ? "Session automatically saved"
                      : "Offline — sets saved on device and will sync automatically"
                  }
                >
                  {isOnline ? (
                    <>
                      <Wifi size={8} className="text-accent-text" aria-hidden="true" />
                      {isSyncingDraft ? "Syncing" : "Saved"}
                    </>
                  ) : (
                    <>
                      <CloudOff size={8} className="text-warning-text" aria-hidden="true" />
                      Offline · Saved
                    </>
                  )}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-ink">
                {session.routineTitle}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={togglePause}
                aria-label={session.isPaused ? "Resume timer" : "Pause timer"}
                className={`${ui.btnSecondary} min-h-9 rounded-xl px-2 text-[10px]`}
              >
                {session.isPaused ? (
                  <Play size={11} aria-hidden="true" />
                ) : (
                  <Pause size={11} aria-hidden="true" />
                )}
                <span data-no-translate="true" className="font-mono">
                  {formatClock(elapsedSeconds)}
                </span>
              </button>
              <button
                type="button"
                disabled={sessionTotals.completedSets < 1}
                onClick={() => {
                  setPlayerError("");
                  setIsFinishModalOpen(true);
                }}
                className={`${ui.btnPrimary} min-h-9 rounded-xl px-3 text-[11px]`}
              >
                Finish
              </button>
            </div>
          </div>

          {/* Slim Progress Bar + Ordered Exercise Switcher Pills */}
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${sessionTotals.percent}%` }}
            />
          </div>

          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {session.exercises.map((ex, idx) => {
              const doneCount = ex.sets.filter((s) => s.completed).length;
              const isAllDone = ex.sets.length > 0 && doneCount === ex.sets.length;
              const isActive = idx === safeExIndex;
              return (
                <button
                  key={`${ex.name}-${idx}`}
                  type="button"
                  onClick={() => selectExerciseIndex(idx)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    isActive
                      ? "border-accent bg-accent text-on-accent"
                      : isAllDone
                        ? "border-accent-border bg-accent-soft text-accent-text"
                        : "border-line bg-subtle text-ink-secondary hover:text-ink"
                  }`}
                >
                  <span data-no-translate="true">{idx + 1}.</span>
                  <span className="max-w-[115px] truncate">{ex.name}</span>
                  {isAllDone && <Check size={11} strokeWidth={2.6} aria-hidden="true" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setIsAddExerciseOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong bg-surface px-2.5 py-1 text-[10px] font-semibold text-ink-secondary hover:text-accent-text"
            >
              <Plus size={11} aria-hidden="true" />
              Exercise
            </button>
          </div>
        </header>

        {/* Scrollable Focused Workout Stage */}
        <div
          onPointerDown={handleStagePointerDown}
          onPointerUp={handleStagePointerUp}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5"
        >
          {/* Compact Non-Dominating Automatic Rest Timer Bar */}
          {(restSnapshot.status === "running" || restSnapshot.status === "paused") && (
            <div
              role="region"
              aria-label="Active rest timer"
              className={`space-y-2 rounded-2xl border p-3 transition-colors ${
                restSnapshot.status === "paused"
                  ? "border-warning-border bg-warning-soft"
                  : restSnapshot.isFinalFive
                    ? "border-accent bg-accent-soft"
                    : "border-accent-border bg-accent-soft"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                      restSnapshot.status === "paused"
                        ? "border border-warning-border bg-surface text-warning-text"
                        : "bg-accent text-on-accent"
                    }`}
                  >
                    <Timer size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-accent-text">
                      {restSnapshot.status === "paused"
                        ? "Paused"
                        : restSnapshot.isFinalFive
                          ? "Get Ready"
                          : "Rest Timer"}
                    </p>
                    <p
                      data-no-translate="true"
                      aria-live="off"
                      className="font-mono text-[20px] font-bold leading-none tracking-tight text-ink"
                    >
                      {formatClock(restSnapshot.remainingSeconds)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Reduce rest by 15 seconds"
                    onClick={() => adjustRestTimer(-15)}
                    className={`${ui.btnSecondary} min-h-8 rounded-lg px-2 text-[10px]`}
                  >
                    <span data-no-translate="true">-15s</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Add 15 seconds to rest"
                    onClick={() => adjustRestTimer(15)}
                    className={`${ui.btnSecondary} min-h-8 rounded-lg px-2 text-[10px]`}
                  >
                    <span data-no-translate="true">+15s</span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      restSnapshot.status === "paused"
                        ? "Resume rest timer"
                        : "Pause rest timer"
                    }
                    onClick={togglePauseRestTimer}
                    className={`${ui.btnSecondary} min-h-8 rounded-lg px-2 text-[10px]`}
                  >
                    {restSnapshot.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    aria-label="Skip rest timer"
                    onClick={clearRestTimer}
                    className={`${ui.btnPrimary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                  >
                    Skip
                  </button>
                </div>
              </div>

              <div className="h-1 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ${
                    restSnapshot.status === "paused" ? "bg-warning-text" : "bg-accent"
                  }`}
                  style={{ width: `${Math.round(restSnapshot.progressRatio * 100)}%` }}
                />
              </div>
            </div>
          )}

          {restCompleteNotice && restSnapshot.status === "idle" && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3 py-2 text-[11px] font-semibold text-accent-text"
            >
              <span>Rest complete · Ready for your next set</span>
              <button
                type="button"
                onClick={() => setRestCompleteNotice(false)}
                className="text-[10px] text-ink-secondary hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          )}

          {autoAdvanceBanner && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3 py-2 text-[11px] font-semibold text-accent-text"
            >
              <span className="truncate">{autoAdvanceBanner}</span>
              {sessionTotals.completedSets === sessionTotals.totalSets &&
                sessionTotals.totalSets > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsFinishModalOpen(true)}
                    className="shrink-0 underline"
                  >
                    Finish Now
                  </button>
                )}
            </div>
          )}

          {playerError && (
            <p
              role="alert"
              className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11px] text-danger-text"
            >
              {playerError}
            </p>
          )}

          {/* DEDICATED FOCUSED EXERCISE STAGE (Setup -> Demo -> Set-Tracking -> Difficulty) */}
          {currentExercise ? (
            <div className={`${ui.cardElevated} space-y-4 p-4`}>
              {/* Top Exercise Header + Step Pills */}
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={ui.badgeNeutral}>{currentExercise.muscle}</span>
                      <span className="text-[10px] font-medium text-ink-muted">
                        {`Exercise ${safeExIndex + 1} of ${session.exercises.length}`}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-[20px] font-bold tracking-[-0.03em] text-ink">
                      {currentExercise.name}
                    </h2>
                  </div>

                  {currentExerciseHistory && currentExerciseHistory.totalSessions > 0 && (
                    <button
                      type="button"
                      aria-label="Open exercise history"
                      onClick={() => setIsExerciseHistoryOpen(true)}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-xl border border-line-strong bg-subtle px-2.5 text-[10px] font-semibold text-ink-secondary hover:text-ink"
                    >
                      <History size={12} aria-hidden="true" />
                      History
                    </button>
                  )}
                </div>

                {/* Focused Step Switcher: Setup · Demo · Track */}
                {currentSet !== null && (
                  <div
                    role="tablist"
                    aria-label="Exercise workflow step"
                    className={`grid grid-cols-3 gap-1 ${ui.segmentedTrack}`}
                  >
                    {(
                      [
                        { id: "setup", label: "Setup" },
                        { id: "demo", label: "Demo" },
                        { id: "track", label: "Track Sets" },
                      ] as const
                    ).map((step) => {
                      const active = exercisePhase === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            if (step.id !== "setup") {
                              configuredExercisesRef.current.add(safeExIndex);
                            }
                            setExercisePhase(step.id);
                          }}
                          className={`min-h-8 rounded-xl text-[10px] font-semibold transition-colors ${
                            active
                              ? "bg-elevated text-ink shadow-xs"
                              : "text-ink-secondary hover:text-ink"
                          }`}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* PHASE B: EXERCISE SETUP SCREEN (3 Vertical Rolling Wheels) */}
              {/* ========================================================= */}
              {currentSet !== null && exercisePhase === "setup" && (
                <div className="space-y-3.5" aria-label="Exercise setup">
                  {/* Subtle Previous Memory + Pending Progression Chip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-subtle px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                        Previous performance
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-ink">
                        {currentPrevious &&
                        ((currentPrevious.lastPerformedWeightKg ??
                          currentPrevious.lastWeightKg) > 0 ||
                          (currentPrevious.lastPerformedReps ??
                            currentPrevious.lastReps) > 0) ? (
                          <span data-no-translate="true">
                            {currentPrevious.lastPerformedWeightKg ??
                              currentPrevious.lastWeightKg}{" "}
                            kg ×{" "}
                            {currentPrevious.lastPerformedReps ??
                              currentPrevious.lastReps}{" "}
                            reps
                          </span>
                        ) : (
                          <span className="text-ink-secondary">
                            First session · Smart defaults ready
                          </span>
                        )}
                      </p>
                    </div>
                    {currentPrevious && currentPrevious.bestWeightKg > 0 && (
                      <span className={ui.badgeAccent} data-no-translate="true">
                        {`PR ${currentPrevious.bestWeightKg} kg × ${currentPrevious.bestRepsAtMaxWeight}`}
                      </span>
                    )}
                  </div>

                  {currentPrevious?.activeProgression &&
                    currentPrevious.activeProgression.decision === "pending" &&
                    !dismissedPriorRecKeys.includes(
                      currentExercise.name.trim().toLowerCase(),
                    ) && (
                      <div
                        role="region"
                        aria-label="Suggested progression from last session"
                        className="space-y-2 rounded-xl border border-accent-border bg-accent-soft p-3"
                      >
                        <div className="flex items-start gap-2">
                          <Sparkles
                            size={14}
                            className="mt-0.5 shrink-0 text-accent-text"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                              Suggested from last workout
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-ink">
                              {currentPrevious.activeProgression.summaryText}
                            </p>
                          </div>
                        </div>

                        {isAdjustingPriorRec ? (
                          <div className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <span className="text-[9px] font-semibold text-ink-secondary">
                                  Weight (kg)
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={1000}
                                  step="0.5"
                                  value={priorCustomWeight}
                                  onChange={(e) => setPriorCustomWeight(e.target.value)}
                                  className={`${ui.inputCompact} mt-1 min-h-9 text-center font-semibold`}
                                />
                              </label>
                              <label className="block">
                                <span className="text-[9px] font-semibold text-ink-secondary">
                                  Reps
                                </span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={500}
                                  value={priorCustomReps}
                                  onChange={(e) => setPriorCustomReps(e.target.value)}
                                  className={`${ui.inputCompact} mt-1 min-h-9 text-center font-semibold`}
                                />
                              </label>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setIsAdjustingPriorRec(false)}
                                className={`${ui.btnSecondary} min-h-8 px-2.5 text-[10px]`}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void handlePriorProgressionDecision("adjusted")}
                                className={`${ui.btnPrimary} min-h-8 px-3 text-[10px]`}
                              >
                                Apply Adjusted Target
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handlePriorProgressionDecision("accepted")}
                              className={`${ui.btnPrimary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                            >
                              <Check size={12} aria-hidden="true" />
                              {currentPrevious.activeProgression.recommendedWeightKg > 0
                                ? `Accept (${currentPrevious.activeProgression.recommendedWeightKg} kg × ${currentPrevious.activeProgression.recommendedReps})`
                                : `Accept (${currentPrevious.activeProgression.recommendedReps} reps)`}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPriorCustomWeight(
                                  String(
                                    currentPrevious.activeProgression?.recommendedWeightKg ??
                                      0,
                                  ),
                                );
                                setPriorCustomReps(
                                  String(
                                    currentPrevious.activeProgression?.recommendedReps ?? 10,
                                  ),
                                );
                                setIsAdjustingPriorRec(true);
                              }}
                              className={`${ui.btnSecondary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                            >
                              Adjust
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePriorProgressionDecision("ignored")}
                              className={`${ui.btnGhost} min-h-8 rounded-lg px-2 text-[10px]`}
                            >
                              Ignore
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Three Smooth Vertical Rolling Pickers: Weight · Reps · Sets */}
                  <div className="grid grid-cols-3 gap-2">
                    <WheelNumberPicker
                      label="Weight"
                      unit="kg"
                      values={WEIGHT_KG_WHEEL_VALUES}
                      value={setupWeightKgVal}
                      onChange={(nextW) => applyExerciseSetupConfig({ weightKg: nextW })}
                      ariaLabel={`${currentExercise.name} setup weight kg`}
                      minCustom={0}
                      maxCustom={1000}
                      stepCustom={0.5}
                    />
                    <WheelNumberPicker
                      label="Reps"
                      values={REPS_WHEEL_VALUES}
                      value={setupRepsVal}
                      onChange={(nextR) => applyExerciseSetupConfig({ reps: nextR })}
                      ariaLabel={`${currentExercise.name} setup repetitions`}
                      minCustom={1}
                      maxCustom={500}
                      stepCustom={1}
                    />
                    <WheelNumberPicker
                      label="Sets"
                      values={SETS_WHEEL_VALUES}
                      value={setupSetsCountVal}
                      onChange={(nextS) => applyExerciseSetupConfig({ setsCount: nextS })}
                      ariaLabel={`${currentExercise.name} setup sets`}
                      minCustom={1}
                      maxCustom={20}
                      stepCustom={1}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        configuredExercisesRef.current.add(safeExIndex);
                        setExercisePhase("demo");
                      }}
                      className={`${ui.btnPrimary} min-h-12 w-full rounded-2xl text-[13px]`}
                    >
                      <span>Next: Exercise Demo</span>
                      <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
                    </button>
                    <p className="text-center text-[10px] text-ink-muted">
                      Roll numbers to set your plan · Swipe or tap Next
                    </p>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* PHASE C: MINIMAL EXERCISE DEMONSTRATION SCREEN            */}
              {/* ========================================================= */}
              {currentSet !== null && exercisePhase === "demo" && (
                <div className="space-y-3.5" aria-label="Exercise demonstration">
                  <div className="flex items-center justify-between rounded-xl border border-line bg-subtle px-3 py-2 text-[11px]">
                    <span className="text-ink-secondary">Planned target</span>
                    <span data-no-translate="true" className="font-bold text-ink">
                      {setupSetsCountVal} × {setupRepsVal}
                      {setupWeightKgVal > 0 ? ` · ${setupWeightKgVal} kg` : ""}
                    </span>
                  </div>

                  <ExerciseDemoVisual
                    exerciseName={currentExercise.name}
                    muscle={currentExercise.muscle}
                    mediaCatalog={exerciseMediaCatalog}
                  />

                  <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setExercisePhase("setup")}
                      className={`${ui.btnSecondary} min-h-12 rounded-2xl px-3.5 text-[11px]`}
                    >
                      <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden="true" />
                      Setup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        configuredExercisesRef.current.add(safeExIndex);
                        setExercisePhase("track");
                      }}
                      className={`${ui.btnPrimary} min-h-12 rounded-2xl px-4 text-[13px]`}
                    >
                      <span>Start Sets</span>
                      <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-center text-[10px] text-ink-muted">
                    Swipe or tap Start Sets when ready
                  </p>
                </div>
              )}

              {/* ========================================================= */}
              {/* PHASE D: FOCUSED SET-TRACKING SCREEN (Actual Performed)   */}
              {/* ========================================================= */}
              {currentSet !== null && exercisePhase === "track" && (
                <div
                  aria-label={`Current set ${currentSet.setNumber}`}
                  className="space-y-3.5"
                >
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3 py-2">
                    <span className="text-[12px] font-bold text-accent-text">
                      {`Current Set · Set ${currentSet.setNumber} of ${currentExercise.sets.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsRestSettingsOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-[10px] font-semibold text-ink-secondary hover:text-ink"
                      aria-label="Configure rest timer"
                    >
                      <Timer size={11} aria-hidden="true" />
                      {`Rest ${getEffectiveExerciseRestSeconds(currentExercise)}s`}
                    </button>
                  </div>

                  {/* Compact Set Chips (Tap any completed set to undo/adjust, or + Set) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {currentExercise.sets.map((s, setIdx) => {
                      const isCurrent = setIdx === currentSetIndex;
                      return (
                        <button
                          key={s.setNumber}
                          type="button"
                          onClick={() => {
                            if (s.completed) {
                              completeOrToggleSet(safeExIndex, setIdx, false);
                            }
                          }}
                          title={
                            s.completed
                              ? "Tap to reopen this set"
                              : `Set ${s.setNumber}`
                          }
                          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                            s.completed
                              ? "border-accent bg-accent text-on-accent"
                              : isCurrent
                                ? "border-accent-border bg-surface text-accent-text"
                                : "border-line bg-subtle text-ink-muted"
                          }`}
                        >
                          <span data-no-translate="true">
                            {s.completed
                              ? `S${s.setNumber}: ${
                                  Number(s.weightKg) > 0 ? `${s.weightKg}kg×` : ""
                                }${s.reps}`
                              : `S${s.setNumber}`}
                          </span>
                          {s.completed && <Check size={10} strokeWidth={2.8} aria-hidden="true" />}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addSetToCurrentExercise}
                      className="inline-flex items-center gap-0.5 rounded-xl border border-dashed border-line-strong bg-surface px-2 py-1 text-[10px] font-semibold text-ink-secondary hover:text-accent-text"
                    >
                      <Plus size={11} aria-hidden="true" />
                      Add Set
                    </button>
                  </div>

                  {/* Actual Weight & Actual Reps Vertical Rolling Pickers */}
                  <div>
                    <p className="mb-1.5 text-center text-[10px] font-medium text-ink-secondary">
                      Record actual weight &amp; reps performed for this set
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <WheelNumberPicker
                        label="Actual Weight"
                        unit="kg"
                        values={WEIGHT_KG_WHEEL_VALUES}
                        value={Math.max(0, Number.parseFloat(currentSet.weightKg) || 0)}
                        onChange={(nextW) =>
                          updateSetValues(
                            safeExIndex,
                            currentSetIndex,
                            { weightKg: String(nextW) },
                            true,
                          )
                        }
                        ariaLabel={`Current Set ${currentSet.setNumber} weight kg`}
                        minCustom={0}
                        maxCustom={1000}
                        stepCustom={0.5}
                        compact
                      />
                      <WheelNumberPicker
                        label="Actual Reps"
                        values={REPS_WHEEL_VALUES}
                        value={Math.max(1, Number.parseInt(currentSet.reps, 10) || 1)}
                        onChange={(nextR) =>
                          updateSetValues(safeExIndex, currentSetIndex, {
                            reps: String(nextR),
                          })
                        }
                        ariaLabel={`Current Set ${currentSet.setNumber} reps`}
                        minCustom={1}
                        maxCustom={500}
                        stepCustom={1}
                        compact
                      />
                    </div>
                  </div>

                  {/* Swipe-to-Complete + 1-Tap Complete Set Button */}
                  <SwipeSetCompletionBar
                    setNumber={currentSet.setNumber}
                    weightKg={currentSet.weightKg}
                    reps={currentSet.reps}
                    onComplete={() =>
                      completeOrToggleSet(safeExIndex, currentSetIndex, true)
                    }
                  />

                  {currentExercise.notes && (
                    <p className="rounded-xl border border-line bg-subtle px-3 py-2 text-[10px] text-ink-secondary">
                      Note: {currentExercise.notes}
                    </p>
                  )}
                </div>
              )}

              {/* ========================================================= */}
              {/* PHASE E/F: EXERCISE DIFFICULTY (1–10) & NEXT PROGRESSION  */}
              {/* ========================================================= */}
              {currentSet === null && (
                <div
                  role="region"
                  aria-label="Exercise feedback and progression"
                  className="space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={18}
                        className="shrink-0 text-accent-text"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-[12px] font-semibold text-ink">
                          {`All sets completed for ${currentExercise.name}`}
                        </p>
                        <p className="text-[10px] text-ink-secondary">
                          {currentExercise.feedback && !isEditingFeedbackRating
                            ? "Feedback recorded · Review your next-session target below"
                            : "1 tap to rate difficulty & personalize your next session"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addSetToCurrentExercise}
                      className={`${ui.btnSecondary} min-h-8 shrink-0 rounded-lg px-2 text-[10px]`}
                    >
                      <Plus size={11} aria-hidden="true" />
                      Add Set
                    </button>
                  </div>

                  {/* Logged Actual Sets Recap */}
                  <div className="flex flex-wrap gap-1.5">
                    {currentExercise.sets.map((s) => (
                      <button
                        key={s.setNumber}
                        type="button"
                        onClick={() => completeOrToggleSet(safeExIndex, s.setNumber - 1, false)}
                        title="Tap to edit this set"
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-subtle px-2.5 py-1 text-[10px] font-semibold text-ink"
                      >
                        <span data-no-translate="true">
                          S{s.setNumber}: {Number(s.weightKg) > 0 ? `${s.weightKg} kg × ` : ""}
                          {s.reps}
                        </span>
                      </button>
                    ))}
                  </div>

                  {!currentExercise.feedback || isEditingFeedbackRating ? (
                    <div className="space-y-2.5 rounded-xl border border-line bg-subtle p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-bold text-ink">
                          How did that feel?
                        </p>
                        <button
                          type="button"
                          aria-pressed={discomfortDraft}
                          onClick={() => setDiscomfortDraft((v) => !v)}
                          className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-semibold transition-colors ${
                            discomfortDraft
                              ? "border-warning-border bg-warning-soft text-warning-text"
                              : "border-line-strong bg-surface text-ink-secondary hover:text-ink"
                          }`}
                        >
                          <AlertTriangle size={11} aria-hidden="true" />
                          {discomfortDraft ? "Discomfort noted" : "Any discomfort?"}
                        </button>
                      </div>

                      {discomfortDraft && (
                        <p className="rounded-lg border border-warning-border bg-warning-soft px-2.5 py-1.5 text-[10px] text-warning-text">
                          Weight increases are automatically paused whenever discomfort is reported.
                        </p>
                      )}

                      <div
                        role="group"
                        aria-label="How did that feel difficulty scale 1 to 10"
                        className="grid grid-cols-5 gap-1.5"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                          const isSelected =
                            currentExercise.feedback?.difficultyRating === score;
                          const isHighEffort = score >= 9;
                          return (
                            <button
                              key={score}
                              type="button"
                              aria-label={`Difficulty ${score} out of 10 (${describeDifficultyRating(score)})`}
                              aria-pressed={isSelected}
                              onClick={() => submitExerciseDifficulty(score)}
                              className={`flex min-h-10 flex-col items-center justify-center rounded-xl border text-[12px] font-bold transition-colors active:scale-95 ${
                                isSelected
                                  ? "border-accent bg-accent text-on-accent"
                                  : isHighEffort
                                    ? "border-warning-border bg-surface text-ink hover:bg-warning-soft"
                                    : "border-line-strong bg-surface text-ink hover:border-accent-border hover:bg-accent-soft"
                              }`}
                            >
                              <span data-no-translate="true">{score}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5 text-[9px] text-ink-muted">
                        <span>1–2: Extremely easy</span>
                        <span>3–4: Easy</span>
                        <span>5–6: Moderate</span>
                        <span>7–8: Difficult</span>
                        <span>9: Extremely difficult</span>
                        <span>10: Maximum effort</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 rounded-xl border border-accent-border bg-accent-soft p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={ui.badgeAccent}>
                            {`Felt ${currentExercise.feedback.difficultyRating}/10 · ${describeDifficultyRating(currentExercise.feedback.difficultyRating)}`}
                          </span>
                          {currentExercise.feedback.reportedDiscomfort && (
                            <span className={ui.badgeWarning}>Discomfort noted</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditingFeedbackRating(true)}
                          className="text-[10px] font-semibold text-ink-secondary underline hover:text-ink"
                        >
                          Edit rating
                        </button>
                      </div>

                      <p className="text-[12px] font-semibold leading-snug text-ink">
                        {currentExercise.feedback.summaryText}
                      </p>

                      {isAdjustingRecommendation ? (
                        <div className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
                          <p className="text-[10px] font-semibold text-ink">
                            Customize target for your next session
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[9px] font-semibold text-ink-secondary">
                                Next Weight (kg)
                              </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={1000}
                                step="0.5"
                                aria-label="Adjust recommended weight kg"
                                value={customRecWeight}
                                onChange={(e) => setCustomRecWeight(e.target.value)}
                                className={`${ui.inputCompact} mt-1 min-h-9 text-center font-semibold`}
                              />
                            </label>
                            <label className="block">
                              <span className="text-[9px] font-semibold text-ink-secondary">
                                Next Reps
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={500}
                                aria-label="Adjust recommended repetitions"
                                value={customRecReps}
                                onChange={(e) => setCustomRecReps(e.target.value)}
                                className={`${ui.inputCompact} mt-1 min-h-9 text-center font-semibold`}
                              />
                            </label>
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsAdjustingRecommendation(false)}
                              className={`${ui.btnSecondary} min-h-8 px-2.5 text-[10px]`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                respondToExerciseFeedback(
                                  "adjusted",
                                  customRecWeight,
                                  customRecReps,
                                )
                              }
                              className={`${ui.btnPrimary} min-h-8 px-3 text-[10px]`}
                            >
                              Save Adjusted Target
                            </button>
                          </div>
                        </div>
                      ) : currentExercise.feedback.decision === "pending" ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => respondToExerciseFeedback("accepted")}
                            className={`${ui.btnPrimary} min-h-9 rounded-xl px-3 text-[10px]`}
                          >
                            <Check size={13} aria-hidden="true" />
                            {currentExercise.feedback.recommendedWeightKg > 0
                              ? `Accept (${currentExercise.feedback.recommendedWeightKg} kg × ${currentExercise.feedback.recommendedReps})`
                              : `Accept (${currentExercise.feedback.recommendedReps} reps)`}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomRecWeight(
                                String(currentExercise.feedback?.recommendedWeightKg ?? 0),
                              );
                              setCustomRecReps(
                                String(currentExercise.feedback?.recommendedReps ?? 10),
                              );
                              setIsAdjustingRecommendation(true);
                            }}
                            className={`${ui.btnSecondary} min-h-9 rounded-xl px-2.5 text-[10px]`}
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => respondToExerciseFeedback("ignored")}
                            className={`${ui.btnGhost} min-h-9 rounded-xl px-2.5 text-[10px]`}
                          >
                            Ignore
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[10px]">
                          <span className="font-semibold text-ink">
                            {currentExercise.feedback.decision === "accepted"
                              ? `Accepted for next session: ${
                                  (currentExercise.feedback.appliedWeightKg ??
                                    currentExercise.feedback.recommendedWeightKg) > 0
                                    ? `${currentExercise.feedback.appliedWeightKg ?? currentExercise.feedback.recommendedWeightKg} kg × `
                                    : ""
                                }${currentExercise.feedback.appliedReps ?? currentExercise.feedback.recommendedReps} reps`
                              : currentExercise.feedback.decision === "adjusted"
                                ? `Adjusted for next session: ${
                                    (currentExercise.feedback.appliedWeightKg ?? 0) > 0
                                      ? `${currentExercise.feedback.appliedWeightKg} kg × `
                                      : ""
                                  }${currentExercise.feedback.appliedReps ?? currentExercise.feedback.recommendedReps} reps`
                                : "Suggestion ignored · Keeping your current target"}
                          </span>
                          <button
                            type="button"
                            onClick={() => respondToExerciseFeedback("pending")}
                            className="shrink-0 font-semibold text-accent-text underline"
                          >
                            Change
                          </button>
                        </div>
                      )}

                      <p className="text-[9px] leading-snug text-ink-muted">
                        Automated suggestion from your logged sets — not medical advice or personal coaching. Saved routines are never changed automatically.
                      </p>
                    </div>
                  )}

                  {nextIncompleteExerciseIdx >= 0 ? (
                    <button
                      type="button"
                      onClick={() => selectExerciseIndex(nextIncompleteExerciseIdx)}
                      className={`${ui.btnPrimary} flex min-h-12 w-full rounded-2xl text-[13px]`}
                    >
                      {`Continue to ${session.exercises[nextIncompleteExerciseIdx]?.name ?? "Next Exercise"}`}
                      <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerError("");
                        setIsFinishModalOpen(true);
                      }}
                      className={`${ui.btnPrimary} flex min-h-12 w-full rounded-2xl text-[13px]`}
                    >
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <span>{`Finish Workout (${sessionTotals.completedSets})`}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
              <p className="text-[14px] font-semibold text-ink">
                Pick your first exercise to begin
              </p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                Tap below to select an exercise — your last weights and reps load automatically.
              </p>
              <button
                type="button"
                onClick={() => setIsAddExerciseOpen(true)}
                className={`${ui.btnPrimary} mt-4 min-h-11 rounded-2xl px-5 text-[12px]`}
              >
                <Plus size={14} aria-hidden="true" />
                Choose Exercise
              </button>
            </div>
          )}

          {session.sourceType === "free_workout" &&
            currentExercise &&
            !currentExercise.sets.some((s) => s.completed) && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={removeCurrentExerciseFromSession}
                  className={`${ui.btnDangerOutline} min-h-9 px-3.5 text-[10px]`}
                >
                  Remove Exercise
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Add Exercise Mid-Session Sheet */}
      {isAddExerciseOpen && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsAddExerciseOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-session-exercise-title"
            className="flex max-h-[85dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-center justify-between border-b border-divider px-5 py-3.5">
              <div>
                <h3
                  id="add-session-exercise-title"
                  className="text-[15px] font-semibold text-ink"
                >
                  Add Exercise to Workout
                </h3>
                <p className="text-[10px] text-ink-secondary">
                  Tap + for smart defaults or Configure to set sets, reps &amp; weight
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add exercise"
                onClick={() => setIsAddExerciseOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-2.5 border-b border-divider px-4 py-3">
              <div className="relative">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search exercise..."
                  className={`${ui.inputCompact} min-h-10 rounded-xl ps-9`}
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"].map(
                  (muscle) => (
                    <button
                      key={muscle}
                      type="button"
                      onClick={() => setAddMuscleFilter(muscle)}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                        addMuscleFilter === muscle
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line bg-surface text-ink-secondary hover:text-ink"
                      }`}
                    >
                      {muscle}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
              {canAddCustomExercise && (
                <div className="space-y-2 rounded-xl border border-accent-border bg-accent-soft p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {trimmedCustomExerciseName}
                      </p>
                      <p className="text-[10px] text-ink-secondary">
                        Add custom exercise to this workout
                      </p>
                    </div>
                    <select
                      aria-label="Custom exercise muscle group"
                      value={customExerciseMuscle}
                      onChange={(e) => setCustomExerciseMuscle(e.target.value)}
                      className={`${ui.select} w-auto py-1 text-[10px]`}
                    >
                      <option value="Full body">Full body</option>
                      <option value="Chest">Chest</option>
                      <option value="Back">Back</option>
                      <option value="Legs">Legs</option>
                      <option value="Shoulders">Shoulders</option>
                      <option value="Arms">Arms</option>
                      <option value="Core">Core</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addExerciseToActiveSession({
                        name: trimmedCustomExerciseName,
                        muscle: customExerciseMuscle,
                        defaultSets: 3,
                        defaultReps: "10",
                        defaultRest: restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS,
                      })
                    }
                    className={`${ui.btnPrimary} min-h-9 w-full rounded-xl px-3 text-[11px]`}
                  >
                    <Plus size={13} aria-hidden="true" />
                    Add Custom Exercise
                  </button>
                </div>
              )}

              {filteredAddCatalog.map((opt) => {
                const prev = exerciseDefaults[opt.name.toLowerCase()];
                const isPreviewing = previewAddExerciseName === opt.name;
                const isConfiguring = configuringAddExerciseName === opt.name;
                return (
                  <div
                    key={opt.name}
                    className="space-y-2 rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => addExerciseToActiveSession(opt)}
                        className="min-w-0 flex-1 text-start"
                      >
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {opt.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-secondary">
                          {opt.muscle}
                          {prev && prev.lastWeightKg > 0
                            ? ` · Last: ${prev.lastWeightKg} kg × ${prev.lastReps}`
                            : ` · ${opt.defaultSets} × ${opt.defaultReps}`}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openInlineAddConfig(opt)}
                          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                            isConfiguring
                              ? "border-accent bg-accent-soft text-accent-text"
                              : "border-line bg-subtle text-ink-secondary hover:text-ink"
                          }`}
                        >
                          Configure
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewAddExerciseName(isPreviewing ? null : opt.name)
                          }
                          className="rounded-lg border border-line bg-subtle px-2 py-1 text-[10px] font-semibold text-ink-secondary hover:text-ink"
                        >
                          {isPreviewing ? "Hide demo" : "Demo"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Add ${opt.name}`}
                          onClick={() => addExerciseToActiveSession(opt)}
                          className="flex size-8 items-center justify-center rounded-lg border border-accent-border bg-accent-soft text-accent-text"
                        >
                          <Plus size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {isConfiguring && (
                      <div className="space-y-2 rounded-xl border border-line bg-subtle p-2.5">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="mb-1 block text-[9px] font-semibold text-ink-secondary">
                              Sets
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              aria-label={`Sets for ${opt.name}`}
                              value={configSets}
                              onChange={(e) => setConfigSets(e.target.value)}
                              className={ui.inputCompact}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[9px] font-semibold text-ink-secondary">
                              Reps
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={500}
                              aria-label={`Reps for ${opt.name}`}
                              value={configReps}
                              onChange={(e) => setConfigReps(e.target.value)}
                              className={ui.inputCompact}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[9px] font-semibold text-ink-secondary">
                              Weight (kg)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={1000}
                              step="0.5"
                              aria-label={`Weight kg for ${opt.name}`}
                              value={configWeightKg}
                              onChange={(e) => setConfigWeightKg(e.target.value)}
                              className={ui.inputCompact}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            addExerciseToActiveSession(opt, {
                              setsCount: Number.parseInt(configSets, 10) || 3,
                              repsStr: configReps,
                              weightStr: configWeightKg,
                            })
                          }
                          className={`${ui.btnPrimary} min-h-9 w-full rounded-xl px-3 text-[11px]`}
                        >
                          <Plus size={13} aria-hidden="true" />
                          Add Configured Exercise
                        </button>
                      </div>
                    )}
                    {isPreviewing && (
                      <ExerciseDemoVisual
                        exerciseName={opt.name}
                        muscle={opt.muscle}
                        mediaCatalog={exerciseMediaCatalog}
                        compact
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Exit / Pause / Discard Confirmation Modal (Prevents accidental workout loss) */}
      {isDiscardConfirmOpen && (
        <div
          className={ui.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsDiscardConfirmOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-session-title"
            className={`${ui.modalCard} max-w-[360px] p-5`}
          >
            <h3 id="discard-session-title" className="text-[15px] font-semibold text-ink">
              Leave active workout?
            </h3>
            <p className="mt-1.5 text-[11px] leading-4 text-ink-secondary">
              Your logged sets are saved automatically. You can pause and return to the app, or discard this session completely.
            </p>
            <div className="mt-4 space-y-2">
              {onMinimizeWorkout && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDiscardConfirmOpen(false);
                    onMinimizeWorkout();
                  }}
                  className={`${ui.btnPrimary} min-h-10 w-full px-3 text-[11px]`}
                >
                  Pause &amp; Return to App
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsDiscardConfirmOpen(false)}
                  className={`${ui.btnSecondary} min-h-10 px-3 text-[11px]`}
                >
                  Keep Workout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelRestVibration();
                    void cancelBackgroundRestNotification();
                    setIsDiscardConfirmOpen(false);
                    onDiscardSession();
                  }}
                  className={`${ui.btnDangerSolid} min-h-10 px-3 text-[11px]`}
                >
                  End Without Saving
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Finish & Save Workout Modal */}
      {isFinishModalOpen && (
        <div
          className={ui.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingFinish) {
              setIsFinishModalOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-workout-title"
            className={`${ui.modalCard} max-w-[400px] p-5`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                  Complete Session
                </p>
                <h3
                  id="finish-workout-title"
                  className="mt-0.5 text-[17px] font-semibold text-ink"
                >
                  Save {session.routineTitle}?
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsFinishModalOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className={`${ui.cardSubtle} mt-3.5 grid grid-cols-3 gap-2 p-3 text-center`}>
              <div>
                <p className="text-[9px] text-ink-secondary">Duration</p>
                <p data-no-translate="true" className="mt-0.5 text-[13px] font-bold text-ink">
                  {formatClock(elapsedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-ink-secondary">Completed Sets</p>
                <p data-no-translate="true" className="mt-0.5 text-[13px] font-bold text-ink">
                  {sessionTotals.completedSets}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-ink-secondary">Volume</p>
                <p
                  data-no-translate="true"
                  className="mt-0.5 text-[13px] font-bold text-accent-text"
                >
                  {sessionTotals.volumeKg.toLocaleString()} kg
                </p>
              </div>
            </div>

            <form onSubmit={handleFinishSubmit} className="mt-4 space-y-3.5">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold text-ink-secondary">
                  Effort (1–5)
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      aria-pressed={effortRating === score}
                      onClick={() => setEffortRating(score)}
                      className={`min-h-9 rounded-xl border text-[11px] font-semibold transition-colors ${
                        effortRating === score
                          ? "border-accent bg-accent-soft text-accent-text"
                          : "border-line-strong bg-surface text-ink-secondary hover:text-ink"
                      }`}
                    >
                      {score}/5
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="workout-session-notes"
                  className="mb-1 block text-[10px] font-semibold text-ink-secondary"
                >
                  Session notes (optional)
                </label>
                <input
                  id="workout-session-notes"
                  maxLength={280}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Strong bench sets, felt great..."
                  className={`${ui.input} min-h-10`}
                />
              </div>

              {session.sourceType === "free_workout" && (
                <div className="space-y-2 rounded-xl border border-line bg-subtle p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={saveAsRoutine}
                      onChange={(e) => setSaveAsRoutine(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-line-strong accent-current"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-ink">
                        Save as reusable Personal Routine
                      </span>
                      <span className="block text-[9px] text-ink-secondary">
                        Adds to My Routines without overwriting your active routine.
                      </span>
                    </span>
                  </label>

                  {saveAsRoutine && (
                    <div>
                      <label
                        htmlFor="free-workout-routine-title"
                        className="mb-1 block text-[9px] font-semibold text-ink-secondary"
                      >
                        Routine name
                      </label>
                      <input
                        id="free-workout-routine-title"
                        maxLength={80}
                        value={saveRoutineTitle}
                        onChange={(e) => setSaveRoutineTitle(e.target.value)}
                        placeholder="e.g. Upper Body Pump"
                        className={ui.inputCompact}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmittingFinish}
                  onClick={() => setIsFinishModalOpen(false)}
                  className={`${ui.btnSecondary} min-h-11 px-3 text-[11px]`}
                >
                  Keep Training
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFinish}
                  className={`${ui.btnPrimary} min-h-11 px-3 text-[12px]`}
                >
                  {isSubmittingFinish && (
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  )}
                  {isSubmittingFinish ? "Saving…" : "Save Workout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Quick Rest Timer Settings Modal */}
      {isRestSettingsOpen && (
        <div
          className={ui.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsRestSettingsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-rest-settings-title"
            className={`${ui.modalCard} max-w-[400px] p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3
                id="quick-rest-settings-title"
                className="text-[15px] font-semibold text-ink"
              >
                Rest Timer Settings
              </h3>
              <button
                type="button"
                aria-label="Close rest settings"
                onClick={() => setIsRestSettingsOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <RestTimerSettingsControl compact />
          </div>
        </div>
      )}

      {/* Inline Exercise History Sheet (Member-Scoped Weights, Reps, PRs, Trends & Difficulty) */}
      {isExerciseHistoryOpen && currentExerciseHistory && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsExerciseHistoryOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inline-exercise-history-title"
            className="flex max-h-[82dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-center justify-between border-b border-divider px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-accent-text">
                  Exercise History
                </p>
                <h3
                  id="inline-exercise-history-title"
                  className="truncate text-[15px] font-semibold text-ink"
                >
                  {currentExerciseHistory.exerciseName}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close exercise history"
                onClick={() => setIsExerciseHistoryOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div className={`${ui.cardSubtle} p-3`}>
                  <div className="flex items-center gap-1.5 text-accent-text">
                    <Trophy size={13} aria-hidden="true" />
                    <span className="text-[9px] font-semibold uppercase tracking-wide">
                      Personal Record
                    </span>
                  </div>
                  <p data-no-translate="true" className="mt-1 text-[14px] font-bold text-ink">
                    {currentExerciseHistory.personalRecord.maxWeightKg > 0
                      ? `${currentExerciseHistory.personalRecord.maxWeightKg} kg × ${currentExerciseHistory.personalRecord.maxRepsAtMaxWeight}`
                      : `${currentExerciseHistory.personalRecord.maxRepsAtMaxWeight} reps`}
                  </p>
                </div>
                <div className={`${ui.cardSubtle} p-3`}>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                    Performance Trend
                  </span>
                  <p className="mt-1 text-[13px] font-bold text-ink">
                    {currentExerciseHistory.trend === "improving"
                      ? "Improving"
                      : currentExerciseHistory.trend === "challenging"
                        ? "Challenging"
                        : currentExerciseHistory.trend === "steady"
                          ? "Steady"
                          : "Baseline"}
                  </p>
                  {currentExerciseHistory.weightDeltaKg !== 0 && (
                    <p
                      dir="ltr"
                      data-no-translate="true"
                      className="text-[10px] font-semibold text-accent-text"
                    >
                      {currentExerciseHistory.weightDeltaKg > 0
                        ? `+${currentExerciseHistory.weightDeltaKg} kg`
                        : `${currentExerciseHistory.weightDeltaKg} kg`}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {currentExerciseHistory.sessions.map((item) => (
                  <div key={item.logId} className={`${ui.card} p-3`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-ink-secondary">
                        {new Date(item.completedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.reportedDiscomfort && (
                          <span className={ui.badgeWarning}>Discomfort</span>
                        )}
                        {typeof item.difficultyRating === "number" && (
                          <span className={ui.badgeNeutral}>
                            {`Effort ${item.difficultyRating}/10`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.sets.map((s) => (
                        <span
                          key={s.setNumber}
                          data-no-translate="true"
                          className="rounded-md border border-line bg-subtle px-2 py-0.5 text-[10px] font-semibold text-ink"
                        >
                          S{s.setNumber}: {s.weightKg > 0 ? `${s.weightKg}kg × ` : ""}
                          {s.reps}
                        </span>
                      ))}
                    </div>
                    {item.recommendationSummary && (
                      <p className="mt-1.5 text-[10px] text-ink-secondary">
                        {item.recommendationSummary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Helper to flush queued offline completed workouts with idempotent clientSessionId.
 */
export async function flushPendingCompletedWorkouts(
  queueKey: string,
  getRaw: (k: string) => string | null,
  setRaw: (k: string, v: string) => void,
  removeRaw: (k: string) => void,
): Promise<boolean> {
  const raw = getRaw(queueKey);
  if (!raw) return false;
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      items = parsed as Array<Record<string, unknown>>;
    }
  } catch {
    removeRaw(queueKey);
    return false;
  }
  if (items.length === 0) {
    removeRaw(queueKey);
    return false;
  }

  const remaining: Array<Record<string, unknown>> = [];
  let syncedAny = false;

  for (const payload of items) {
    try {
      const res = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
        await readMobileJson(res, "Synced");
        syncedAny = true;
      } else {
        remaining.push(payload);
      }
    } catch {
      remaining.push(payload);
    }
  }

  if (remaining.length === 0) {
    removeRaw(queueKey);
  } else {
    setRaw(queueKey, JSON.stringify(remaining));
  }
  return syncedAny;
}
