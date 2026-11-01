"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Eye,
  Flame,
  History,
  Lock,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { mobileFetch, readMobileJson } from "@/lib/mobile-fetch";
import { matchesExerciseQuery } from "@/lib/exercise-media";
import {
  evaluateMemberAchievements,
  type MemberAchievementsSummary,
} from "@/lib/workout-achievements";
import {
  DEFAULT_PROGRESSION_RULE_SETTINGS,
  describeDifficultyRating,
  type ExerciseHistorySummary,
  type ProgressionPace,
  type ProgressionRuleSettings,
} from "@/lib/workout-progression";
import { ui } from "@/lib/theme";

export type LoggedWorkoutSet = {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed: boolean;
};

export type LoggedWorkoutItem = {
  id: string;
  sourceType: "gym_assigned" | "member_routine" | "free_workout";
  routineId: string | null;
  routineTitle: string;
  targetGoal: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalVolumeKg: number;
  effortRating: number | null;
  sessionNotes: string;
  exercises: Array<{
    name: string;
    muscle: string;
    targetSets?: number | null;
    targetRepsLabel?: string;
    difficultyRating?: number | null;
    reportedDiscomfort?: boolean;
    recommendation?: {
      action: string;
      recommendedWeightKg: number;
      recommendedReps: number;
      summaryText: string;
      reasonCode?: string;
      decision?: "pending" | "accepted" | "adjusted" | "ignored";
      appliedWeightKg?: number | null;
      appliedReps?: number | null;
    } | null;
    sets: LoggedWorkoutSet[];
  }>;
};

export type MemberProgressSummary = {
  totalWorkouts: number;
  workoutsThisWeek: number;
  workoutsThisMonth?: number;
  workoutsLast30Days: number;
  currentStreakDays: number;
  totalPersonalRecords?: number;
  totalVolumeKg: number;
  volumeLast30DaysKg: number;
  totalMinutesTrained: number;
  weeklyActivity: Array<{
    date: string;
    dayLabel: string;
    workouts: number;
    volumeKg: number;
    minutes: number;
  }>;
  muscleBreakdown: Array<{ muscle: string; sets: number }>;
  personalRecords: Array<{
    exerciseName: string;
    muscle: string;
    maxWeightKg: number;
    maxRepsAtMaxWeight: number;
    bestSetVolumeKg: number;
    achievedAt: string;
  }>;
};

export type ProgressDateRange = "7d" | "30d" | "90d" | "all";

const DATE_RANGE_OPTIONS: Array<{ id: ProgressDateRange; label: string; days: number | null }> = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "all", label: "All", days: null },
];

function formatLogDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function formatShortChartDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(dt);
}

function formatPrDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt);
}

function formatMinutesLabel(durationSeconds: number): string {
  const mins = Math.max(1, Math.round(durationSeconds / 60));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
}

function isWithinDateRange(iso: string, range: ProgressDateRange, nowMs: number): boolean {
  if (range === "all") return true;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return ts >= nowMs - days * 86_400_000;
}

function ExerciseProgressionChart({
  points,
  metric,
}: {
  points: Array<{
    dateIso: string;
    weightKg: number;
    bestReps: number;
    volumeKg: number;
  }>;
  metric: "weight" | "reps";
}) {
  if (points.length === 0) {
    return (
      <div className={`${ui.cardSubtle} px-3 py-4 text-center text-[11px] text-ink-secondary`}>
        No logged sets for this exercise in the selected date range.
      </div>
    );
  }

  const values = points.map((p) => (metric === "weight" ? p.weightKg : p.bestReps));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || Math.max(1, maxVal * 0.2);

  const width = 300;
  const height = 112;
  const padX = 18;
  const padTop = 18;
  const padBottom = 22;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const coords = points.map((pt, idx) => {
    const val = metric === "weight" ? pt.weightKg : pt.bestReps;
    const x =
      points.length === 1
        ? width / 2
        : padX + (idx / (points.length - 1)) * plotW;
    const norm = maxVal === minVal ? 0.55 : (val - minVal) / span;
    const y = padTop + plotH - norm * plotH;
    return { x, y, val, dateIso: pt.dateIso };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const firstDate = formatShortChartDate(points[0].dateIso);
  const lastDate = formatShortChartDate(points[points.length - 1].dateIso);
  const latestVal = values[values.length - 1];
  const firstVal = values[0];
  const delta = Math.round((latestVal - firstVal) * 10) / 10;
  const unit = metric === "weight" ? "kg" : "reps";

  return (
    <div
      data-testid="exercise-progression-chart"
      className={`${ui.cardSubtle} p-3`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px]">
        <span className="font-semibold text-ink-secondary">
          {metric === "weight" ? "Top Set Weight Trend" : "Best Set Reps Trend"}
        </span>
        <span
          dir="ltr"
          data-no-translate="true"
          className="font-semibold text-accent-text"
        >
          {points.length >= 2 && delta !== 0
            ? `${delta > 0 ? "+" : ""}${delta} ${unit}`
            : `${latestVal} ${unit}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full overflow-visible text-accent-text"
        role="img"
        aria-label={
          metric === "weight"
            ? "Exercise weight progression chart"
            : "Exercise rep progression chart"
        }
      >
        {/* Horizontal baseline & top guide */}
        <line
          x1={padX}
          y1={padTop}
          x2={width - padX}
          y2={padTop}
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <line
          x1={padX}
          y1={padTop + plotH}
          x2={width - padX}
          y2={padTop + plotH}
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
        />

        {coords.length >= 2 && (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        )}

        {coords.map((c, idx) => {
          const showLabel =
            coords.length <= 5 || idx === 0 || idx === coords.length - 1;
          return (
            <g key={`${c.dateIso}-${idx}`}>
              <circle
                cx={c.x}
                cy={c.y}
                r={idx === coords.length - 1 ? 4.2 : 3.2}
                fill="currentColor"
              />
              {showLabel && (
                <text
                  x={c.x}
                  y={Math.max(10, c.y - 7)}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="8.5"
                  fontWeight="700"
                >
                  {c.val}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[9px] text-ink-muted">
        <span data-no-translate="true">{firstDate}</span>
        <span>{`${points.length} sessions plotted`}</span>
        <span data-no-translate="true">
          {points.length > 1 ? lastDate : "Latest"}
        </span>
      </div>
    </div>
  );
}

type MemberProgressViewProps = {
  progress: MemberProgressSummary;
  recentLogs: LoggedWorkoutItem[];
  exerciseHistory?: ExerciseHistorySummary[];
  achievements?: MemberAchievementsSummary | null;
  progressionSettings?: ProgressionRuleSettings;
  initialSection?: "progress" | "history" | "achievements";
  sectionNonce?: number;
  onWorkoutDataChanged: () => Promise<void>;
  onNavigateToWorkouts: () => void;
  onSessionUnauthorized: () => void;
};

export function MemberProgressView({
  progress,
  recentLogs,
  exerciseHistory = [],
  achievements = null,
  progressionSettings = DEFAULT_PROGRESSION_RULE_SETTINGS,
  initialSection = "progress",
  sectionNonce = 0,
  onWorkoutDataChanged,
  onNavigateToWorkouts,
  onSessionUnauthorized,
}: MemberProgressViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "progress" | "history" | "achievements"
  >(initialSection);
  const lastHandledNonceRef = useRef<number>(sectionNonce);

  useEffect(() => {
    if (sectionNonce !== lastHandledNonceRef.current) {
      lastHandledNonceRef.current = sectionNonce;
      setActiveSubTab(initialSection);
    }
  }, [initialSection, sectionNonce]);

  const resolvedAchievements = useMemo(
    () => achievements ?? evaluateMemberAchievements(recentLogs),
    [achievements, recentLogs],
  );

  const [dateRange, setDateRange] = useState<ProgressDateRange>("30d");
  const [chartMetric, setChartMetric] = useState<"volume" | "minutes">("volume");

  // Exercise Analytics Tracker state
  const [selectedChartExerciseKey, setSelectedChartExerciseKey] = useState<string>(
    () => exerciseHistory[0]?.exerciseKey ?? "",
  );
  const [exerciseChartMetric, setExerciseChartMetric] = useState<"weight" | "reps">(
    "weight",
  );
  const [exerciseFilterQuery, setExerciseFilterQuery] = useState("");

  useEffect(() => {
    if (
      exerciseHistory.length > 0 &&
      (!selectedChartExerciseKey ||
        !exerciseHistory.some((e) => e.exerciseKey === selectedChartExerciseKey))
    ) {
      setSelectedChartExerciseKey(exerciseHistory[0].exerciseKey);
    }
  }, [exerciseHistory, selectedChartExerciseKey]);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(
    recentLogs[0]?.id ?? null,
  );
  const [inspectedLog, setInspectedLog] = useState<LoggedWorkoutItem | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(
    exerciseHistory[0]?.exerciseKey ?? null,
  );
  const [adjustingExerciseKey, setAdjustingExerciseKey] = useState<string | null>(null);
  const [customWeightInput, setCustomWeightInput] = useState("0");
  const [customRepsInput, setCustomRepsInput] = useState("10");
  const [busyProgressionKey, setBusyProgressionKey] = useState<string | null>(null);

  const [showRuleSettings, setShowRuleSettings] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);

  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Filter strictly valid member-owned logs by selected date range & search query
  const filteredLogs = useMemo(() => {
    const nowMs = Date.now();
    const q = historySearch.trim().toLowerCase();
    return recentLogs.filter((log) => {
      if (log.totalSetsCompleted <= 0) return false;
      if (!isWithinDateRange(log.completedAt, dateRange, nowMs)) return false;
      if (!q) return true;
      return (
        log.routineTitle.toLowerCase().includes(q) ||
        log.exercises.some((ex) => ex.name.toLowerCase().includes(q))
      );
    });
  }, [dateRange, historySearch, recentLogs]);

  // Selected Exercise Progression Analytics (weight chart, rep chart, PRs, frequency)
  const selectedExerciseSummary = useMemo(() => {
    const found =
      exerciseHistory.find((e) => e.exerciseKey === selectedChartExerciseKey) ??
      exerciseHistory[0] ??
      null;
    if (!found) return null;

    const nowMs = Date.now();
    const sessionsInRange = found.sessions
      .filter((s) => isWithinDateRange(s.completedAt, dateRange, nowMs))
      .slice()
      .reverse(); // chronological oldest -> newest for chart

    const points = sessionsInRange.map((s) => {
      const bestReps = s.sets.reduce((mx, st) => Math.max(mx, st.reps || 0), 0);
      return {
        dateIso: s.completedAt,
        weightKg: s.topWeightKg,
        bestReps,
        volumeKg: s.sessionVolumeKg,
      };
    });

    // Compute weekly training frequency over active window
    let spanWeeks = 4;
    if (dateRange === "7d") {
      spanWeeks = 1;
    } else if (dateRange === "30d") {
      spanWeeks = 4.3;
    } else if (dateRange === "90d") {
      spanWeeks = 12.8;
    } else if (found.sessions.length >= 2) {
      const newestMs = Date.parse(found.sessions[0].completedAt);
      const oldestMs = Date.parse(found.sessions[found.sessions.length - 1].completedAt);
      spanWeeks = Math.max(1, (newestMs - oldestMs) / (7 * 86_400_000));
    } else {
      spanWeeks = 1;
    }

    const sessionsCount = sessionsInRange.length;
    const perWeek = Math.round((sessionsCount / spanWeeks) * 10) / 10;

    return {
      exercise: found,
      points,
      sessionsCount,
      perWeek,
    };
  }, [dateRange, exerciseHistory, selectedChartExerciseKey]);

  const filteredExercisePickerList = useMemo(() => {
    const q = exerciseFilterQuery.trim();
    if (!q) return exerciseHistory;
    return exerciseHistory.filter((ex) =>
      matchesExerciseQuery({ name: ex.exerciseName, muscle: ex.muscle }, q),
    );
  }, [exerciseFilterQuery, exerciseHistory]);

  const maxBarValue = Math.max(
    1,
    ...progress.weeklyActivity.map((d) =>
      chartMetric === "volume" ? d.volumeKg : d.minutes,
    ),
  );

  const maxMuscleSets = Math.max(
    1,
    ...progress.muscleBreakdown.map((m) => m.sets),
  );

  async function handleUpdateProgressionRules(patch: Partial<ProgressionRuleSettings>) {
    if (isSavingRules) return;
    setIsSavingRules(true);
    setErrorMessage("");
    setStatusMessage("");
    const nextPace: ProgressionPace = patch.pace ?? progressionSettings.pace;
    const nextInc =
      patch.preferredIncrementKg !== undefined
        ? patch.preferredIncrementKg
        : progressionSettings.preferredIncrementKg;

    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-progression-settings",
          pace: nextPace,
          preferredIncrementKg: nextInc,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to save progression preferences.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save progression preferences.");
      }
      setStatusMessage("Progression preferences updated.");
      await onWorkoutDataChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save progression preferences.",
      );
    } finally {
      setIsSavingRules(false);
    }
  }

  async function handleRespondProgression(params: {
    exerciseKey: string;
    exerciseName: string;
    decision: "accepted" | "adjusted" | "ignored";
    customWeightKg?: number;
    customReps?: number;
  }) {
    if (busyProgressionKey) return;
    setBusyProgressionKey(params.exerciseKey);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond-progression",
          exerciseName: params.exerciseName,
          decision: params.decision,
          ...(params.decision === "adjusted"
            ? {
                customWeightKg: params.customWeightKg,
                customReps: params.customReps,
              }
            : {}),
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to update progression target.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update progression target.");
      }
      setAdjustingExerciseKey(null);
      setStatusMessage(
        params.decision === "accepted"
          ? `Accepted next target for ${params.exerciseName}.`
          : params.decision === "adjusted"
            ? `Saved custom target for ${params.exerciseName}.`
            : `Ignored suggestion for ${params.exerciseName}.`,
      );
      await onWorkoutDataChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update progression target.",
      );
    } finally {
      setBusyProgressionKey(null);
    }
  }

  async function handleDeleteLog(logId: string) {
    if (deletingLogId) return;
    setDeletingLogId(logId);
    setErrorMessage("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-log",
          logId,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to delete workout log.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete workout log.");
      }
      if (inspectedLog?.id === logId) {
        setInspectedLog(null);
      }
      await onWorkoutDataChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete workout log.",
      );
    } finally {
      setDeletingLogId(null);
    }
  }

  const [savingRoutineLogId, setSavingRoutineLogId] = useState<string | null>(null);
  const [savedRoutineNotice, setSavedRoutineNotice] = useState<string>("");

  async function handleSaveLogAsRoutine(log: LoggedWorkoutItem) {
    if (savingRoutineLogId) return;
    setSavingRoutineLogId(log.id);
    setErrorMessage("");
    setSavedRoutineNotice("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-log-as-routine",
          logId: log.id,
          title: `${log.routineTitle} (${formatPrDate(log.completedAt)})`,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{
        error?: string;
        routine?: { title: string };
      }>(response, "Unable to save workout as routine.");
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save workout as routine.");
      }
      setSavedRoutineNotice(
        `Saved "${data.routine?.title ?? log.routineTitle}" to My Routines.`,
      );
      await onWorkoutDataChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save workout as routine.",
      );
    } finally {
      setSavingRoutineLogId(null);
    }
  }

  function formatSourceLabel(sourceType: LoggedWorkoutItem["sourceType"]): string {
    if (sourceType === "gym_assigned") return "Gym Plan";
    if (sourceType === "free_workout") return "Free Workout";
    return "Personal Routine";
  }

  return (
    <section aria-labelledby="progress-heading" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Analytics &amp; History
          </p>
          <h2
            id="progress-heading"
            className="mt-0.5 text-[19px] font-semibold tracking-[-0.035em] text-ink"
          >
            Training Progress
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={showRuleSettings}
            onClick={() => setShowRuleSettings((v) => !v)}
            className={`${ui.btnSecondary} min-h-8 rounded-lg px-2.5 text-[10px]`}
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            Rules
          </button>
          <span className={ui.badgeAccent}>
            <Flame size={12} aria-hidden="true" />
            {`${progress.currentStreakDays}d streak`}
          </span>
        </div>
      </div>

      {/* Sub-navigation + Date Range Selector */}
      <div data-tour-id="tour-progress-overview" className="space-y-2">
        <div
          role="tablist"
          aria-label="Progress and history sections"
          className={`grid grid-cols-3 gap-1 ${ui.segmentedTrack}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "progress"}
            onClick={() => setActiveSubTab("progress")}
            className={`min-h-8 rounded-xl px-2 text-[10px] font-semibold transition-colors ${
              activeSubTab === "progress"
                ? "bg-elevated text-ink"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            Progress
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "history"}
            onClick={() => setActiveSubTab("history")}
            className={`min-h-8 rounded-xl px-2 text-[10px] font-semibold transition-colors ${
              activeSubTab === "history"
                ? "bg-elevated text-ink"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            {`History (${recentLogs.length})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "achievements"}
            onClick={() => setActiveSubTab("achievements")}
            className={`min-h-8 rounded-xl px-2 text-[10px] font-semibold transition-colors ${
              activeSubTab === "achievements"
                ? "bg-elevated text-ink"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            {`Achievements (${resolvedAchievements.unlockedCount}/${resolvedAchievements.totalCount})`}
          </button>
        </div>

        {activeSubTab !== "achievements" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-ink-muted">
              Date range
            </span>
            <div
              role="group"
              aria-label="Select date range"
              className="inline-flex rounded-xl border border-line bg-subtle p-0.5"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={dateRange === opt.id}
                  onClick={() => setDateRange(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    dateRange === opt.id
                      ? "bg-accent text-on-accent"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Configurable Progression Rules Panel */}
      {showRuleSettings && (
        <div
          role="region"
          aria-label="Progression rule settings"
          className={`${ui.card} space-y-3 p-4`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[12px] font-semibold text-ink">
                Progression Rules
              </h3>
              <p className="text-[10px] text-ink-secondary">
                Customize how next-session suggestions respond to your difficulty ratings
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-ink-secondary">
              Progression Pace
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "conservative", label: "Conservative", hint: "Rate ≤ 5/10" },
                  { id: "balanced", label: "Balanced", hint: "Rate ≤ 6/10" },
                  { id: "aggressive", label: "Aggressive", hint: "Rate ≤ 7/10" },
                ] as const
              ).map((opt) => {
                const active = progressionSettings.pace === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isSavingRules}
                    aria-pressed={active}
                    onClick={() => void handleUpdateProgressionRules({ pace: opt.id })}
                    className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                      active
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line-strong bg-surface text-ink-secondary hover:text-ink"
                    }`}
                  >
                    <span className="block text-[10px] font-semibold">{opt.label}</span>
                    <span className="mt-0.5 block text-[8px] text-ink-muted">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold text-ink-secondary">
              Preferred Weight Increment
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { value: 0, label: "Auto" },
                { value: 1.25, label: "+1.25 kg" },
                { value: 2.5, label: "+2.5 kg" },
                { value: 5, label: "+5 kg" },
              ].map((stepOpt) => {
                const active =
                  Math.abs(progressionSettings.preferredIncrementKg - stepOpt.value) <
                  0.05;
                return (
                  <button
                    key={stepOpt.label}
                    type="button"
                    disabled={isSavingRules}
                    aria-pressed={active}
                    onClick={() =>
                      void handleUpdateProgressionRules({
                        preferredIncrementKg: stepOpt.value,
                      })
                    }
                    className={`min-h-9 rounded-xl border px-2 text-[10px] font-semibold transition-colors ${
                      active
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line-strong bg-surface text-ink-secondary hover:text-ink"
                    }`}
                  >
                    <span dir="ltr">{stepOpt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[9px] leading-snug text-ink-muted">
            Suggestions are rule-based calculations from your logged sets — not medical advice or personal coaching. Saved routines are never modified automatically.
          </p>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2 text-[11px] font-medium text-accent-text"
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage("")}
            className="text-[10px] font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11px] text-danger-text"
        >
          {errorMessage}
        </p>
      )}

      {activeSubTab === "progress" && (
        <div className="space-y-4">
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`${ui.card} p-3.5`}>
              <div className="flex items-center justify-between text-accent-text">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                  Last 30 Days
                </span>
                <Activity size={14} aria-hidden="true" />
              </div>
              <p data-no-translate="true" className="mt-1.5 text-[20px] font-bold text-ink">
                {progress.workoutsLast30Days}
              </p>
              <p className="text-[10px] text-ink-secondary">
                {`${progress.workoutsThisWeek} this week · ${progress.totalWorkouts} total`}
              </p>
            </div>

            <div className={`${ui.card} p-3.5`}>
              <div className="flex items-center justify-between text-accent-text">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                  30-Day Volume
                </span>
                <TrendingUp size={14} aria-hidden="true" />
              </div>
              <p data-no-translate="true" className="mt-1.5 text-[20px] font-bold text-ink">
                {progress.volumeLast30DaysKg.toLocaleString()}{" "}
                <span className="text-[12px] font-semibold text-ink-secondary">kg</span>
              </p>
              <p className="text-[10px] text-ink-secondary">
                {`${progress.totalVolumeKg.toLocaleString()} kg lifetime`}
              </p>
            </div>

            <div className={`${ui.card} p-3.5`}>
              <div className="flex items-center justify-between text-accent-text">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                  Active Streak
                </span>
                <Flame size={14} aria-hidden="true" />
              </div>
              <p data-no-translate="true" className="mt-1.5 text-[20px] font-bold text-ink">
                {progress.currentStreakDays}{" "}
                <span className="text-[12px] font-semibold text-ink-secondary">days</span>
              </p>
              <p className="text-[10px] text-ink-secondary">Consecutive training days</p>
            </div>

            <div className={`${ui.card} p-3.5`}>
              <div className="flex items-center justify-between text-accent-text">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                  Time Trained
                </span>
                <Clock size={14} aria-hidden="true" />
              </div>
              <p data-no-translate="true" className="mt-1.5 text-[20px] font-bold text-ink">
                {progress.totalMinutesTrained}{" "}
                <span className="text-[12px] font-semibold text-ink-secondary">min</span>
              </p>
              <p className="text-[10px] text-ink-secondary">Logged active duration</p>
            </div>
          </div>

          {/* Per-Exercise Weight / Rep Progression Chart, PRs & Training Frequency */}
          <div
            aria-label="Exercise progression analytics"
            className={`${ui.card} space-y-3 p-4`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  Exercise Progression Charts
                </h3>
                <p className="text-[10px] text-ink-secondary">
                  Weight &amp; rep trends, PRs, and training frequency over time
                </p>
              </div>
              {selectedExerciseSummary && (
                <div className="inline-flex rounded-xl border border-line bg-subtle p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setExerciseChartMetric("weight")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      exerciseChartMetric === "weight"
                        ? "bg-elevated text-ink"
                        : "text-ink-secondary hover:text-ink"
                    }`}
                  >
                    Weight
                  </button>
                  <button
                    type="button"
                    onClick={() => setExerciseChartMetric("reps")}
                    className={`rounded-lg px-2.5 py-1 transition-colors ${
                      exerciseChartMetric === "reps"
                        ? "bg-elevated text-ink"
                        : "text-ink-secondary hover:text-ink"
                    }`}
                  >
                    Reps
                  </button>
                </div>
              )}
            </div>

            {exerciseHistory.length === 0 ? (
              <p className={`${ui.cardSubtle} px-3 py-3 text-center text-[11px] text-ink-secondary`}>
                Complete a workout to unlock per-exercise weight and rep progression charts.
              </p>
            ) : (
              <>
                {exerciseHistory.length > 5 && (
                  <div className="relative">
                    <Search
                      size={13}
                      aria-hidden="true"
                      className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <input
                      type="search"
                      value={exerciseFilterQuery}
                      onChange={(e) => setExerciseFilterQuery(e.target.value)}
                      placeholder="Filter exercises..."
                      aria-label="Filter exercises"
                      className={`${ui.inputCompact} min-h-8 rounded-xl ps-8`}
                    />
                  </div>
                )}

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {filteredExercisePickerList.map((ex) => {
                    const isSelected =
                      selectedExerciseSummary?.exercise.exerciseKey === ex.exerciseKey;
                    return (
                      <button
                        key={ex.exerciseKey}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedChartExerciseKey(ex.exerciseKey)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          isSelected
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-subtle text-ink-secondary hover:text-ink"
                        }`}
                      >
                        {ex.exerciseName}
                      </button>
                    );
                  })}
                </div>

                {selectedExerciseSummary && (
                  <>
                    <ExerciseProgressionChart
                      points={selectedExerciseSummary.points}
                      metric={exerciseChartMetric}
                    />

                    {/* Exercise PRs & Training Frequency */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`${ui.cardSubtle} p-2.5`}>
                        <p className="text-[9px] text-ink-muted">Heaviest PR</p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[13px] font-bold text-accent-text"
                        >
                          {selectedExerciseSummary.exercise.personalRecord.maxWeightKg > 0
                            ? `${selectedExerciseSummary.exercise.personalRecord.maxWeightKg} kg`
                            : "Bodyweight"}
                        </p>
                        <p className="text-[8px] text-ink-secondary">
                          {`× ${selectedExerciseSummary.exercise.personalRecord.maxRepsAtMaxWeight} reps`}
                        </p>
                      </div>

                      <div className={`${ui.cardSubtle} p-2.5`}>
                        <p className="text-[9px] text-ink-muted">Best Set Vol</p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[13px] font-bold text-ink"
                        >
                          {selectedExerciseSummary.exercise.personalRecord.bestSetVolumeKg >
                          0
                            ? `${selectedExerciseSummary.exercise.personalRecord.bestSetVolumeKg} kg`
                            : "—"}
                        </p>
                        <p className="text-[8px] text-ink-secondary">Single set</p>
                      </div>

                      <div className={`${ui.cardSubtle} p-2.5`}>
                        <p className="text-[9px] text-ink-muted">Frequency</p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[13px] font-bold text-ink"
                        >
                          {`${selectedExerciseSummary.perWeek}/wk`}
                        </p>
                        <p className="text-[8px] text-ink-secondary">
                          {`${selectedExerciseSummary.sessionsCount} in range`}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* 7-Day Activity Bar Chart */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-ink">Last 7 Days</p>
                <p className="text-[10px] text-ink-secondary">
                  {chartMetric === "volume"
                    ? "Daily total weight lifted (kg)"
                    : "Daily workout duration (min)"}
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-line bg-subtle p-0.5 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => setChartMetric("volume")}
                  className={`rounded-lg px-2.5 py-1 transition-colors ${
                    chartMetric === "volume"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  Volume
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric("minutes")}
                  className={`rounded-lg px-2.5 py-1 transition-colors ${
                    chartMetric === "minutes"
                      ? "bg-elevated text-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  Minutes
                </button>
              </div>
            </div>

            <div className="mt-4 grid h-28 grid-cols-7 items-end gap-2 pt-4">
              {progress.weeklyActivity.map((day) => {
                const val = chartMetric === "volume" ? day.volumeKg : day.minutes;
                const heightPct =
                  val > 0 ? Math.max(14, Math.round((val / maxBarValue) * 100)) : 8;
                return (
                  <div
                    key={day.date}
                    className="flex h-full flex-col items-center justify-end gap-1"
                  >
                    <span
                      data-no-translate="true"
                      className="text-[8px] font-semibold text-ink-secondary"
                    >
                      {val > 0 ? val : ""}
                    </span>
                    <div className="flex h-20 w-full items-end justify-center rounded-lg border border-line bg-subtle p-0.5">
                      <div
                        className={`w-full rounded-md transition-all ${
                          val > 0 ? "bg-accent" : "bg-line-strong"
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-semibold text-ink-muted">
                      {day.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Member-Scoped Exercise History, Trends, PRs & Progression Controls */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                  <History size={14} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[12px] font-semibold text-ink">
                    Exercise History &amp; Progression
                  </h3>
                  <p className="text-[9px] text-ink-secondary">
                    Previous weights, reps, PRs, trends &amp; difficulty ratings
                  </p>
                </div>
              </div>
              {exerciseHistory.length > 0 && (
                <span className="text-[10px] font-medium text-ink-muted">
                  {`${exerciseHistory.length} ${exerciseHistory.length === 1 ? "exercise" : "exercises"}`}
                </span>
              )}
            </div>

            {exerciseHistory.length === 0 ? (
              <p className={`${ui.cardSubtle} mt-3 px-3 py-3 text-center text-[11px] text-ink-secondary`}>
                Complete an exercise to track your weight progression, PRs, and difficulty trends.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {exerciseHistory.map((exHist) => {
                  const latestSession = exHist.sessions[0] ?? null;
                  const isExpanded = expandedExerciseKey === exHist.exerciseKey;
                  const rec = exHist.latestRecommendation;
                  const isAdjusting = adjustingExerciseKey === exHist.exerciseKey;

                  return (
                    <div
                      key={exHist.exerciseKey}
                      className="overflow-hidden rounded-xl border border-line bg-subtle"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedExerciseKey(isExpanded ? null : exHist.exerciseKey)
                        }
                        className="flex w-full items-start justify-between gap-2 p-3 text-start"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[12px] font-semibold text-ink">
                              {exHist.exerciseName}
                            </p>
                            <span
                              className={
                                exHist.trend === "improving"
                                  ? ui.badgeAccent
                                  : exHist.trend === "challenging"
                                    ? ui.badgeWarning
                                    : ui.badgeNeutral
                              }
                            >
                              {exHist.trend === "improving"
                                ? "Improving"
                                : exHist.trend === "challenging"
                                  ? "Challenging"
                                  : exHist.trend === "steady"
                                    ? "Steady"
                                    : "Baseline"}
                            </span>
                            {exHist.weightDeltaKg !== 0 && (
                              <span
                                dir="ltr"
                                data-no-translate="true"
                                className="text-[9px] font-semibold text-accent-text"
                              >
                                {exHist.weightDeltaKg > 0
                                  ? `+${exHist.weightDeltaKg} kg`
                                  : `${exHist.weightDeltaKg} kg`}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-ink-secondary">
                            {latestSession && (
                              <span data-no-translate="true">
                                Last:{" "}
                                {latestSession.topWeightKg > 0
                                  ? `${latestSession.topWeightKg} kg · `
                                  : ""}
                                {latestSession.repsSummary}
                              </span>
                            )}
                            <span
                              data-no-translate="true"
                              className="font-semibold text-accent-text"
                            >
                              PR:{" "}
                              {exHist.personalRecord.maxWeightKg > 0
                                ? `${exHist.personalRecord.maxWeightKg} kg × ${exHist.personalRecord.maxRepsAtMaxWeight}`
                                : `${exHist.personalRecord.maxRepsAtMaxWeight} reps`}
                            </span>
                            {typeof latestSession?.difficultyRating === "number" && (
                              <span>
                                {`Effort ${latestSession.difficultyRating}/10`}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-secondary">
                          {isExpanded ? (
                            <ChevronUp size={13} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={13} aria-hidden="true" />
                          )}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-2.5 border-t border-divider bg-surface p-3">
                          {rec && (
                            <div className="space-y-2 rounded-xl border border-accent-border bg-accent-soft p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5">
                                  <Sparkles
                                    size={13}
                                    className="mt-0.5 shrink-0 text-accent-text"
                                    aria-hidden="true"
                                  />
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                                      Next Session Suggestion
                                    </p>
                                    <p className="mt-0.5 text-[11px] font-medium text-ink">
                                      {rec.summaryText}
                                    </p>
                                  </div>
                                </div>
                                <span className={ui.badgeNeutral}>
                                  {rec.decision === "accepted"
                                    ? "Accepted"
                                    : rec.decision === "adjusted"
                                      ? "Adjusted"
                                      : rec.decision === "ignored"
                                        ? "Ignored"
                                        : "Pending"}
                                </span>
                              </div>

                              {isAdjusting ? (
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
                                        aria-label={`Custom weight for ${exHist.exerciseName}`}
                                        value={customWeightInput}
                                        onChange={(e) => setCustomWeightInput(e.target.value)}
                                        className={`${ui.inputCompact} mt-1 min-h-8 text-center font-semibold`}
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
                                        aria-label={`Custom reps for ${exHist.exerciseName}`}
                                        value={customRepsInput}
                                        onChange={(e) => setCustomRepsInput(e.target.value)}
                                        className={`${ui.inputCompact} mt-1 min-h-8 text-center font-semibold`}
                                      />
                                    </label>
                                  </div>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setAdjustingExerciseKey(null)}
                                      className={`${ui.btnSecondary} min-h-8 px-2.5 text-[10px]`}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyProgressionKey === exHist.exerciseKey}
                                      onClick={() =>
                                        void handleRespondProgression({
                                          exerciseKey: exHist.exerciseKey,
                                          exerciseName: exHist.exerciseName,
                                          decision: "adjusted",
                                          customWeightKg: Math.max(
                                            0,
                                            Number.parseFloat(customWeightInput) || 0,
                                          ),
                                          customReps: Math.max(
                                            1,
                                            Number.parseInt(customRepsInput, 10) ||
                                              rec.recommendedReps,
                                          ),
                                        })
                                      }
                                      className={`${ui.btnPrimary} min-h-8 px-3 text-[10px]`}
                                    >
                                      Save Target
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={busyProgressionKey === exHist.exerciseKey}
                                    onClick={() =>
                                      void handleRespondProgression({
                                        exerciseKey: exHist.exerciseKey,
                                        exerciseName: exHist.exerciseName,
                                        decision: "accepted",
                                      })
                                    }
                                    className={`${ui.btnPrimary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                                  >
                                    <Check size={12} aria-hidden="true" />
                                    {rec.recommendedWeightKg > 0
                                      ? `Accept (${rec.recommendedWeightKg} kg × ${rec.recommendedReps})`
                                      : `Accept (${rec.recommendedReps} reps)`}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyProgressionKey === exHist.exerciseKey}
                                    onClick={() => {
                                      setCustomWeightInput(
                                        String(
                                          rec.appliedWeightKg ??
                                            rec.recommendedWeightKg ??
                                            0,
                                        ),
                                      );
                                      setCustomRepsInput(
                                        String(
                                          rec.appliedReps ?? rec.recommendedReps ?? 10,
                                        ),
                                      );
                                      setAdjustingExerciseKey(exHist.exerciseKey);
                                    }}
                                    className={`${ui.btnSecondary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                                  >
                                    Adjust
                                  </button>
                                  {rec.decision !== "ignored" && (
                                    <button
                                      type="button"
                                      disabled={busyProgressionKey === exHist.exerciseKey}
                                      onClick={() =>
                                        void handleRespondProgression({
                                          exerciseKey: exHist.exerciseKey,
                                          exerciseName: exHist.exerciseName,
                                          decision: "ignored",
                                        })
                                      }
                                      className={`${ui.btnGhost} min-h-8 rounded-lg px-2 text-[10px]`}
                                    >
                                      Ignore
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Session-by-Session History Rows */}
                          <div className="space-y-1.5">
                            {exHist.sessions.slice(0, 8).map((sess) => (
                              <div
                                key={sess.logId}
                                className="rounded-lg border border-line bg-subtle px-2.5 py-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] font-semibold text-ink-secondary">
                                    {formatPrDate(sess.completedAt)}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {sess.reportedDiscomfort && (
                                      <span className={ui.badgeWarning}>Discomfort</span>
                                    )}
                                    {typeof sess.difficultyRating === "number" && (
                                      <span className={ui.badgeNeutral}>
                                        {`${sess.difficultyRating}/10 · ${describeDifficultyRating(sess.difficultyRating)}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {sess.sets.map((s) => (
                                    <span
                                      key={s.setNumber}
                                      data-no-translate="true"
                                      className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-ink"
                                    >
                                      S{s.setNumber}:{" "}
                                      {s.weightKg > 0 ? `${s.weightKg}kg × ` : ""}
                                      {s.reps}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Personal Records (PRs) */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                  <Trophy size={14} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[12px] font-semibold text-ink">
                    Personal Records
                  </h3>
                  <p className="text-[9px] text-ink-secondary">
                    Top weight lifted per exercise
                  </p>
                </div>
              </div>
            </div>

            {progress.personalRecords.length === 0 ? (
              <p className={`${ui.cardSubtle} mt-3 px-3 py-3 text-center text-[11px] text-ink-secondary`}>
                Complete a workout with logged weights to unlock your Personal Records board.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-divider">
                {progress.personalRecords.slice(0, 8).map((pr) => (
                  <li
                    key={pr.exerciseName}
                    className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-ink">
                        {pr.exerciseName}
                      </p>
                      <p className="text-[9px] text-ink-muted">
                        {`${pr.muscle} · ${formatPrDate(pr.achievedAt)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p
                        data-no-translate="true"
                        className="text-[12px] font-bold text-accent-text"
                      >
                        {pr.maxWeightKg > 0 ? `${pr.maxWeightKg} kg` : "Bodyweight"} ×{" "}
                        {pr.maxRepsAtMaxWeight}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Muscle Focus Distribution */}
          {progress.muscleBreakdown.length > 0 && (
            <div className={`${ui.card} p-4`}>
              <h3 className="text-[12px] font-semibold text-ink">
                Muscle Group Focus
              </h3>
              <p className="text-[9px] text-ink-secondary">
                Completed sets by target muscle group
              </p>
              <div className="mt-3 space-y-2.5">
                {progress.muscleBreakdown.map((item) => {
                  const pct = Math.max(8, Math.round((item.sets / maxMuscleSets) * 100));
                  return (
                    <div key={item.muscle}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-ink">{item.muscle}</span>
                        <span className="font-medium text-ink-secondary">
                          {`${item.sets} sets`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* DEDICATED ACHIEVEMENTS & EXERCISE PERSONAL RECORDS SECTION          */}
      {/* =================================================================== */}
      {activeSubTab === "achievements" && (
        <div aria-label="Achievements and personal records" className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`${ui.card} p-3 text-center`}>
              <p
                data-no-translate="true"
                className="text-[17px] font-bold text-accent-text"
              >
                {`${resolvedAchievements.unlockedCount}/${resolvedAchievements.totalCount}`}
              </p>
              <p className="mt-0.5 text-[9px] text-ink-secondary">Milestones</p>
            </div>
            <div className={`${ui.card} p-3 text-center`}>
              <p data-no-translate="true" className="text-[17px] font-bold text-ink">
                {`${resolvedAchievements.bestStreakDays}d`}
              </p>
              <p className="mt-0.5 text-[9px] text-ink-secondary">Best streak</p>
            </div>
            <div className={`${ui.card} p-3 text-center`}>
              <p data-no-translate="true" className="text-[17px] font-bold text-ink">
                {resolvedAchievements.exerciseRecords.length}
              </p>
              <p className="mt-0.5 text-[9px] text-ink-secondary">Exercise PRs</p>
            </div>
          </div>

          {/* Training Milestones */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                <Award size={14} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[12px] font-semibold text-ink">
                  Training Milestones
                </h3>
                <p className="text-[9px] text-ink-secondary">
                  Earned strictly from verified completed workouts
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {resolvedAchievements.milestones.map((ms) => {
                const pct = Math.min(
                  100,
                  Math.round((ms.currentValue / Math.max(1, ms.targetValue)) * 100),
                );
                return (
                  <div
                    key={ms.id}
                    className={`rounded-xl border p-3 ${
                      ms.unlocked
                        ? "border-accent-border bg-accent-soft"
                        : "border-line bg-subtle"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border ${
                            ms.unlocked
                              ? "border-accent-border bg-accent text-on-accent"
                              : "border-line bg-surface text-ink-muted"
                          }`}
                        >
                          {ms.unlocked ? (
                            <CheckCircle2 size={14} aria-hidden="true" />
                          ) : (
                            <Lock size={13} aria-hidden="true" />
                          )}
                        </span>
                        <div>
                          <p className="text-[12px] font-semibold text-ink">
                            {ms.title}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-secondary">
                            {ms.description}
                          </p>
                        </div>
                      </div>

                      <span
                        className={ms.unlocked ? ui.badgeAccent : ui.badgeNeutral}
                      >
                        {ms.unlocked ? "Unlocked" : ms.progressLabel}
                      </span>
                    </div>

                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className={`h-full rounded-full transition-all ${
                          ms.unlocked ? "bg-accent" : "bg-line-strong"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {ms.unlocked && ms.unlockedAt && (
                      <p className="mt-1.5 text-[9px] text-ink-muted">
                        {`Achieved ${formatPrDate(ms.unlockedAt)}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exercise Personal Records Breakdown (Heaviest Weight, Highest Reps at Weight, Best Performance) */}
          <div className={`${ui.card} p-4`}>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                <Trophy size={14} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[12px] font-semibold text-ink">
                  Exercise Personal Records
                </h3>
                <p className="text-[9px] text-ink-secondary">
                  Heaviest weight, highest reps at weight &amp; best single-set performance
                </p>
              </div>
            </div>

            {resolvedAchievements.exerciseRecords.length === 0 ? (
              <p className={`${ui.cardSubtle} mt-3 px-3 py-3 text-center text-[11px] text-ink-secondary`}>
                Complete a workout with logged sets to establish your exercise personal records.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {resolvedAchievements.exerciseRecords.map((rec) => (
                  <div
                    key={rec.exerciseKey}
                    className="space-y-2 rounded-xl border border-line bg-subtle p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {rec.exerciseName}
                      </p>
                      <span className={ui.badgeNeutral}>{rec.muscle}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="rounded-lg border border-line bg-surface p-2">
                        <p className="text-[8px] font-semibold uppercase text-ink-muted">
                          Heaviest
                        </p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[11px] font-bold text-accent-text"
                        >
                          {rec.heaviestWeight.weightKg > 0
                            ? `${rec.heaviestWeight.weightKg} kg`
                            : "Bodyweight"}
                        </p>
                        <p className="text-[8px] text-ink-secondary">
                          {`× ${rec.heaviestWeight.reps} reps`}
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-2">
                        <p className="text-[8px] font-semibold uppercase text-ink-muted">
                          Most Reps
                        </p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[11px] font-bold text-ink"
                        >
                          {`${rec.highestRepsAtWeight.reps} reps`}
                        </p>
                        <p
                          data-no-translate="true"
                          className="text-[8px] text-ink-secondary"
                        >
                          {rec.highestRepsAtWeight.weightKg > 0
                            ? `@ ${rec.highestRepsAtWeight.weightKg} kg`
                            : "Bodyweight"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-2">
                        <p className="text-[8px] font-semibold uppercase text-ink-muted">
                          Best Set
                        </p>
                        <p
                          data-no-translate="true"
                          className="mt-0.5 text-[11px] font-bold text-ink"
                        >
                          {rec.bestPerformance.volumeKg > 0
                            ? `${rec.bestPerformance.volumeKg} kg`
                            : `${rec.bestPerformance.reps} reps`}
                        </p>
                        <p
                          data-no-translate="true"
                          className="text-[8px] text-ink-secondary"
                        >
                          {rec.bestPerformance.weightKg > 0
                            ? `${rec.bestPerformance.weightKg}kg × ${rec.bestPerformance.reps}`
                            : "Volume"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* WORKOUT HISTORY SECTION (Visible in History tab & summarized below) */}
      {/* =================================================================== */}
      {activeSubTab !== "achievements" && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">Workout History</h3>
          <span className="text-[10px] font-medium text-ink-muted">
            {`${filteredLogs.length} ${filteredLogs.length === 1 ? "session" : "sessions"}`}
          </span>
        </div>

        {activeSubTab === "history" && recentLogs.length > 0 && (
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search routine or exercise..."
              aria-label="Search workout history"
              className={`${ui.inputCompact} min-h-9 rounded-xl ps-9`}
            />
          </div>
        )}

        {recentLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
              <Dumbbell size={18} aria-hidden="true" />
            </span>
            <p className="mt-2.5 text-[12px] font-semibold text-ink">
              No workouts logged yet
            </p>
            <p className="mt-1 text-[10px] text-ink-secondary">
              Start a session from your Gym Plan or Personal Routines to track every set and PR.
            </p>
            <button
              type="button"
              onClick={onNavigateToWorkouts}
              className={`${ui.btnPrimary} mt-3.5 min-h-9 px-4 text-[11px]`}
            >
              Go to Workouts
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <p className={`${ui.cardSubtle} px-3 py-4 text-center text-[11px] text-ink-secondary`}>
            No workout sessions match the selected date range or search filter.
          </p>
        ) : (
          (activeSubTab === "history" ? filteredLogs : filteredLogs.slice(0, 8)).map(
            (log) => {
              const expanded = expandedLogId === log.id;
              const completedExerciseCount = log.exercises.filter((ex) =>
                ex.sets.some((s) => s.completed),
              ).length;
              return (
                <div key={log.id} className={`${ui.card} overflow-hidden`}>
                  <div className="flex items-start justify-between gap-2 p-3.5">
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(expanded ? null : log.id)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            log.sourceType === "gym_assigned"
                              ? ui.badgeAccent
                              : ui.badgeNeutral
                          }
                        >
                          {formatSourceLabel(log.sourceType)}
                        </span>
                        <span className="text-[9px] text-ink-muted">
                          {formatLogDate(log.completedAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[13px] font-semibold text-ink">
                        {log.routineTitle}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">
                        {`${completedExerciseCount} exercises · ${formatMinutesLabel(log.durationSeconds)} · ${log.totalSetsCompleted} sets · `}
                        <span
                          data-no-translate="true"
                          className="font-semibold text-accent-text"
                        >
                          {log.totalVolumeKg.toLocaleString()} kg
                        </span>
                      </p>
                    </button>

                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Inspect ${log.routineTitle} details`}
                        onClick={() => setInspectedLog(log)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-subtle px-2 text-[9px] font-semibold text-accent-text hover:bg-hover"
                      >
                        <Eye size={11} aria-hidden="true" />
                        Details
                      </button>
                      <button
                        type="button"
                        aria-label={expanded ? "Collapse session" : "Expand session"}
                        onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        className="grid size-7 place-items-center rounded-lg border border-line bg-subtle text-ink-secondary"
                      >
                        {expanded ? (
                          <ChevronUp size={14} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={14} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-divider bg-subtle px-3.5 py-3">
                      <div className="space-y-2">
                        {log.exercises.map((ex, idx) => (
                          <div key={`${ex.name}-${idx}`} className={`${ui.card} p-2.5`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold text-ink">
                                {ex.name}
                              </p>
                              <div className="flex items-center gap-1.5">
                                {typeof ex.difficultyRating === "number" && (
                                  <span className={ui.badgeNeutral}>
                                    {`${ex.difficultyRating}/10`}
                                  </span>
                                )}
                                <span className="text-[9px] text-ink-muted">
                                  {ex.muscle}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {ex.sets.map((s) => (
                                <span
                                  key={s.setNumber}
                                  data-no-translate="true"
                                  className="rounded-md border border-line bg-subtle px-2 py-0.5 text-[9px] font-semibold text-ink-secondary"
                                >
                                  S{s.setNumber}:{" "}
                                  {s.weightKg > 0 ? `${s.weightKg}kg × ` : ""}
                                  {s.reps}
                                </span>
                              ))}
                            </div>
                            {ex.recommendation?.summaryText && (
                              <p className="mt-1.5 text-[9px] text-ink-secondary">
                                {ex.recommendation.summaryText}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {log.sessionNotes && (
                        <p className={`${ui.card} mt-2.5 px-2.5 py-1.5 text-[10px] italic text-ink-secondary`}>
                          “{log.sessionNotes}”
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[9px] text-ink-muted">
                          {log.effortRating ? `Effort: ${log.effortRating}/5` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={deletingLogId === log.id}
                          onClick={() => void handleDeleteLog(log.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-danger-text transition-colors hover:bg-danger-soft disabled:opacity-50"
                        >
                          <Trash2 size={11} aria-hidden="true" />
                          {deletingLogId === log.id ? "Removing…" : "Delete log"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            },
          )
        )}
      </div>
      )}

      {/* =================================================================== */}
      {/* FULL WORKOUT SESSION DETAIL INSPECTOR MODAL                         */}
      {/* =================================================================== */}
      {inspectedLog && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setInspectedLog(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-inspector-title"
            className="flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={ui.badgeAccent}>
                    {formatSourceLabel(inspectedLog.sourceType)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
                    <Calendar size={11} aria-hidden="true" />
                    {formatLogDate(inspectedLog.completedAt)}
                  </span>
                </div>
                <h3
                  id="session-inspector-title"
                  className="mt-1.5 truncate text-[16px] font-semibold text-ink"
                >
                  {inspectedLog.routineTitle}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close session details"
                onClick={() => setInspectedLog(null)}
                className={`${ui.btnGhost} size-8 shrink-0`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {/* Session Performance Summary Grid */}
              <div className="grid grid-cols-4 gap-2">
                <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                  <p data-no-translate="true" className="text-[14px] font-bold text-ink">
                    {inspectedLog.exercises.filter((e) => e.sets.some((s) => s.completed))
                      .length}
                  </p>
                  <p className="text-[9px] text-ink-secondary">Exercises</p>
                </div>
                <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                  <p data-no-translate="true" className="text-[14px] font-bold text-ink">
                    {inspectedLog.totalSetsCompleted}
                  </p>
                  <p className="text-[9px] text-ink-secondary">Sets</p>
                </div>
                <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                  <p data-no-translate="true" className="text-[14px] font-bold text-ink">
                    {formatMinutesLabel(inspectedLog.durationSeconds)}
                  </p>
                  <p className="text-[9px] text-ink-secondary">Duration</p>
                </div>
                <div className={`${ui.cardSubtle} p-2.5 text-center`}>
                  <p
                    data-no-translate="true"
                    className="text-[14px] font-bold text-accent-text"
                  >
                    {`${inspectedLog.totalVolumeKg.toLocaleString()} kg`}
                  </p>
                  <p className="text-[9px] text-ink-secondary">Volume</p>
                </div>
              </div>

              {(inspectedLog.effortRating || inspectedLog.totalRepsCompleted > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[10px] text-ink-secondary">
                  <span>{`Total reps completed: ${inspectedLog.totalRepsCompleted}`}</span>
                  {inspectedLog.effortRating ? (
                    <span className="font-semibold text-ink">
                      {`Session effort: ${inspectedLog.effortRating}/5`}
                    </span>
                  ) : null}
                </div>
              )}

              {inspectedLog.sessionNotes && (
                <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[11px] italic text-ink-secondary">
                  “{inspectedLog.sessionNotes}”
                </div>
              )}

              {/* Per-Exercise Set Breakdown */}
              <div className="space-y-2.5">
                {inspectedLog.exercises.map((ex, idx) => {
                  const exVol = ex.sets.reduce(
                    (sum, s) => sum + (s.completed ? (s.weightKg || 0) * (s.reps || 0) : 0),
                    0,
                  );
                  return (
                    <div
                      key={`${ex.name}-${idx}`}
                      className="space-y-2 rounded-xl border border-line bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-semibold text-ink">
                            {`${idx + 1}. ${ex.name}`}
                          </p>
                          <p className="text-[10px] text-ink-muted">{ex.muscle}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {ex.reportedDiscomfort && (
                            <span className={ui.badgeWarning}>Discomfort</span>
                          )}
                          {typeof ex.difficultyRating === "number" && (
                            <span className={ui.badgeNeutral}>
                              {`Effort ${ex.difficultyRating}/10`}
                            </span>
                          )}
                          {exVol > 0 && (
                            <span
                              data-no-translate="true"
                              className="text-[10px] font-semibold text-accent-text"
                            >
                              {`${Math.round(exVol)} kg`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        {ex.sets.map((s) => (
                          <div
                            key={s.setNumber}
                            className="flex items-center justify-between rounded-lg border border-line bg-subtle px-2.5 py-1.5 text-[10px]"
                          >
                            <span className="font-semibold text-ink">
                              {`Set ${s.setNumber}`}
                            </span>
                            <span
                              data-no-translate="true"
                              className="font-semibold text-ink-secondary"
                            >
                              {s.weightKg > 0 ? `${s.weightKg} kg × ` : ""}
                              {`${s.reps} reps`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {ex.recommendation?.summaryText && (
                        <p className="text-[10px] text-ink-secondary">
                          {ex.recommendation.summaryText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {savedRoutineNotice && (
              <div className="border-t border-accent-border bg-accent-soft px-4 py-2 text-[10px] font-semibold text-accent-text">
                {savedRoutineNotice}
              </div>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-surface px-4 py-3">
              <button
                type="button"
                disabled={deletingLogId === inspectedLog.id}
                onClick={() => void handleDeleteLog(inspectedLog.id)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-danger-text hover:bg-danger-soft"
              >
                <Trash2 size={12} aria-hidden="true" />
                {deletingLogId === inspectedLog.id ? "Removing…" : "Delete log"}
              </button>
              <div className="flex items-center gap-2">
                {inspectedLog.sourceType === "free_workout" && (
                  <button
                    type="button"
                    disabled={savingRoutineLogId === inspectedLog.id}
                    onClick={() => void handleSaveLogAsRoutine(inspectedLog)}
                    className={`${ui.btnPrimary} min-h-9 px-3 text-[11px]`}
                  >
                    {savingRoutineLogId === inspectedLog.id
                      ? "Saving…"
                      : "Save as Routine"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSavedRoutineNotice("");
                    setInspectedLog(null);
                  }}
                  className={`${ui.btnSecondary} min-h-9 px-4 text-[11px]`}
                >
                  Done
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Clear Non-Medical / Non-Coaching Disclaimer */}
      <p className="px-1 text-center text-[9px] leading-relaxed text-ink-muted">
        Progression suggestions are automated calculations based on your logged sets and effort ratings — not medical advice or professional coaching. Listen to your body and consult a qualified professional if you experience pain.
      </p>
    </section>
  );
}
