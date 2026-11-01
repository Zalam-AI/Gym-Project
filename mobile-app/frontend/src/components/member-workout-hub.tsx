"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Award,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Dumbbell,
  LoaderCircle,
  Minus,
  Moon,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { ExerciseDemoVisual } from "@/components/exercise-demo-visual";
import {
  ActiveWorkoutPlayer,
  flushPendingCompletedWorkouts,
  type ActiveWorkoutExercise,
  type ActiveWorkoutSession,
  type ActiveWorkoutSet,
} from "@/components/active-workout-player";
import {
  matchesExerciseQuery,
  type ExerciseMediaCatalogEntry,
} from "@/lib/exercise-media";
import type { AchievementMilestone } from "@/lib/workout-achievements";
import {
  mobileFetch,
  readMobileJson,
  safeLocalGet,
  safeLocalRemove,
  safeLocalSet,
} from "@/lib/mobile-fetch";
import {
  applySkipRestTimer,
  DEFAULT_REST_SECONDS,
  useRestTimerSettings,
} from "@/lib/rest-timer";
import {
  DEFAULT_PROGRESSION_RULE_SETTINGS,
  type ExerciseHistorySummary,
  type ExerciseProgressionRecord,
  type ProgressionRuleSettings,
} from "@/lib/workout-progression";
import { ui } from "@/lib/theme";

export type { ActiveWorkoutSession };

export type RoutineWeekday = "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type GymAssignedExercise = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  muscle: string;
  day?: string;
  targetWeightKg?: number;
};

export type GymAssignedWorkoutPlan = {
  id: string;
  title: string;
  targetGoal: string;
  isAssignedByGym?: boolean;
  scheduledDays?: string[];
  createdByRole?: "staff" | "trainer";
  createdByName?: string;
  exercises: GymAssignedExercise[];
};

export type RoutineSetPlan = {
  setNumber: number;
  reps: string;
  targetWeightKg: number;
};

export type PersonalRoutineExercise = {
  id: number;
  name: string;
  muscle: string;
  sets: number;
  reps: string;
  restSeconds: number;
  targetWeightKg: number;
  notes: string;
  setPlans?: RoutineSetPlan[];
};

export type PersonalRoutineDay = {
  day: RoutineWeekday;
  isRestDay: boolean;
  focusLabel: string;
  exercises: PersonalRoutineExercise[];
};

export type PersonalRoutine = {
  id: string;
  title: string;
  targetGoal: string;
  notes: string;
  isActive?: boolean;
  archived?: boolean;
  scheduledDays: RoutineWeekday[];
  daySchedule?: PersonalRoutineDay[];
  sourceGymPlanId: string | null;
  lastPerformedAt: string | null;
  updatedAt: string | null;
  exercises: PersonalRoutineExercise[];
};

export type ActiveRoutineSelection = {
  mode: "personal" | "gym" | "none";
  personalRoutineId: string | null;
  gymPlanId: string | null;
};

export type ExerciseDefaultStat = {
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

export type UpcomingCoachSession = {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  notes: string;
  trainerName: string;
};

export type ActiveSessionSummary = {
  title: string;
  completedSets: number;
  totalSets: number;
};

type DraftSetPlan = {
  reps: string;
  targetWeightKg: string;
};

type DraftExercise = {
  key: string;
  name: string;
  muscle: string;
  sets: number;
  reps: string;
  restSeconds: number;
  targetWeightKg: string;
  notes: string;
  showNotes: boolean;
  useCustomSets: boolean;
  setPlans: DraftSetPlan[];
};

type DraftRoutineDay = {
  day: RoutineWeekday;
  isRestDay: boolean;
  customFocusLabel: string;
  exercises: DraftExercise[];
};

const WEEKDAYS: RoutineWeekday[] = [
  "Sat",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
];

const WEEKDAY_FULL_NAMES: Record<RoutineWeekday, string> = {
  Sat: "Saturday",
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

const JS_DAY_TO_WEEKDAY: RoutineWeekday[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

const REST_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 120, label: "2m" },
  { value: 180, label: "3m" },
  { value: 240, label: "4m" },
] as const;

const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Triceps",
  "Biceps",
  "Legs",
  "Glutes",
  "Core",
  "Full body",
  "Cardio",
] as const;

type LibraryExercise = {
  name: string;
  muscle: (typeof MUSCLE_GROUPS)[number];
  equipment: string;
  defaultSets: number;
  defaultReps: string;
  defaultRest: number;
};

const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Chest
  { name: "Barbell Bench Press", muscle: "Chest", equipment: "Barbell", defaultSets: 4, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Flat Dumbbell Bench Press", muscle: "Chest", equipment: "Dumbbell", defaultSets: 3, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Incline Machine Chest Press", muscle: "Chest", equipment: "Machine", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Cable Chest Fly", muscle: "Chest", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Pec Deck Machine Fly", muscle: "Chest", equipment: "Machine", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Weighted Chest Dips", muscle: "Chest", equipment: "Bodyweight", defaultSets: 3, defaultReps: "8-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Push-Ups", muscle: "Chest", equipment: "Bodyweight", defaultSets: 3, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },

  // Back
  { name: "Lat Pulldown", muscle: "Back", equipment: "Cable", defaultSets: 4, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Barbell Bent-Over Row", muscle: "Back", equipment: "Barbell", defaultSets: 4, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Seated Cable Row", muscle: "Back", equipment: "Cable", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Pull-Ups", muscle: "Back", equipment: "Bodyweight", defaultSets: 3, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "One-Arm Dumbbell Row", muscle: "Back", equipment: "Dumbbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Chest-Supported T-Bar Row", muscle: "Back", equipment: "Machine", defaultSets: 3, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Straight-Arm Lat Pulldown", muscle: "Back", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },

  // Shoulders
  { name: "Overhead Barbell Press", muscle: "Shoulders", equipment: "Barbell", defaultSets: 4, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Seated Dumbbell Shoulder Press", muscle: "Shoulders", equipment: "Dumbbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Dumbbell Lateral Raise", muscle: "Shoulders", equipment: "Dumbbell", defaultSets: 4, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Cable Lateral Raise", muscle: "Shoulders", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Rear Delt Reverse Pec Deck", muscle: "Shoulders", equipment: "Machine", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Face Pulls", muscle: "Shoulders", equipment: "Cable", defaultSets: 3, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Dumbbell Shrugs", muscle: "Shoulders", equipment: "Dumbbell", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },

  // Triceps
  { name: "Cable Tricep Pushdown", muscle: "Triceps", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Overhead Rope Tricep Extension", muscle: "Triceps", equipment: "Cable", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "EZ-Bar Skull Crushers", muscle: "Triceps", equipment: "Barbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Close-Grip Bench Press", muscle: "Triceps", equipment: "Barbell", defaultSets: 3, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Single-Arm Cable Kickback", muscle: "Triceps", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },

  // Biceps
  { name: "Barbell Bicep Curl", muscle: "Biceps", equipment: "Barbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Incline Dumbbell Curl", muscle: "Biceps", equipment: "Dumbbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Hammer Dumbbell Curl", muscle: "Biceps", equipment: "Dumbbell", defaultSets: 3, defaultReps: "12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "EZ-Bar Preacher Curl", muscle: "Biceps", equipment: "Barbell", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Cable Bayesian Curl", muscle: "Biceps", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },

  // Legs
  { name: "Barbell Back Squat", muscle: "Legs", equipment: "Barbell", defaultSets: 4, defaultReps: "6-8", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Leg Press", muscle: "Legs", equipment: "Machine", defaultSets: 4, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Romanian Deadlift", muscle: "Legs", equipment: "Barbell", defaultSets: 3, defaultReps: "8-10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Bulgarian Split Squat", muscle: "Legs", equipment: "Dumbbell", defaultSets: 3, defaultReps: "10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Leg Extension Machine", muscle: "Legs", equipment: "Machine", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Seated Leg Curl", muscle: "Legs", equipment: "Machine", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Walking Lunges", muscle: "Legs", equipment: "Dumbbell", defaultSets: 3, defaultReps: "12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Standing Calf Raise", muscle: "Legs", equipment: "Machine", defaultSets: 4, defaultReps: "15-20", defaultRest: DEFAULT_REST_SECONDS },

  // Glutes
  { name: "Barbell Hip Thrust", muscle: "Glutes", equipment: "Barbell", defaultSets: 4, defaultReps: "8-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Cable Glute Kickback", muscle: "Glutes", equipment: "Cable", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Hip Abduction Machine", muscle: "Glutes", equipment: "Machine", defaultSets: 3, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },

  // Core
  { name: "Hanging Leg Raise", muscle: "Core", equipment: "Bodyweight", defaultSets: 3, defaultReps: "12-15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Cable Rope Crunch", muscle: "Core", equipment: "Cable", defaultSets: 3, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Ab Wheel Rollout", muscle: "Core", equipment: "Bodyweight", defaultSets: 3, defaultReps: "10-12", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Plank Hold (sec)", muscle: "Core", equipment: "Bodyweight", defaultSets: 3, defaultReps: "45", defaultRest: DEFAULT_REST_SECONDS },

  // Full body & Cardio
  { name: "Trap Bar Deadlift", muscle: "Full body", equipment: "Barbell", defaultSets: 4, defaultReps: "5-6", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Kettlebell Swing", muscle: "Full body", equipment: "Kettlebell", defaultSets: 3, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Dumbbell Farmer's Carry", muscle: "Full body", equipment: "Dumbbell", defaultSets: 3, defaultReps: "40", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Incline Treadmill Walk", muscle: "Cardio", equipment: "Cardio", defaultSets: 1, defaultReps: "15", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Rowing Machine Intervals", muscle: "Cardio", equipment: "Cardio", defaultSets: 4, defaultReps: "10", defaultRest: DEFAULT_REST_SECONDS },
  { name: "Assault Bike Sprint", muscle: "Cardio", equipment: "Cardio", defaultSets: 5, defaultReps: "30", defaultRest: DEFAULT_REST_SECONDS },
];

type SplitTemplatePreset = {
  id: string;
  label: string;
  days: Partial<Record<RoutineWeekday, { focusLabel: string; exerciseNames: string[] }>>;
};

const QUICK_SPLIT_PRESETS: SplitTemplatePreset[] = [
  {
    id: "four-day",
    label: "4-Day Split",
    days: {
      Sat: {
        focusLabel: "Chest & Triceps",
        exerciseNames: [
          "Barbell Bench Press",
          "Incline Dumbbell Press",
          "Cable Chest Fly",
          "Cable Tricep Pushdown",
        ],
      },
      Sun: {
        focusLabel: "Back & Biceps",
        exerciseNames: [
          "Lat Pulldown",
          "Barbell Bent-Over Row",
          "Seated Cable Row",
          "Barbell Bicep Curl",
        ],
      },
      Tue: {
        focusLabel: "Legs",
        exerciseNames: [
          "Barbell Back Squat",
          "Romanian Deadlift",
          "Leg Extension Machine",
          "Standing Calf Raise",
        ],
      },
      Wed: {
        focusLabel: "Shoulders",
        exerciseNames: [
          "Overhead Barbell Press",
          "Dumbbell Lateral Raise",
          "Face Pulls",
        ],
      },
    },
  },
  {
    id: "ppl",
    label: "Push / Pull / Legs",
    days: {
      Sat: {
        focusLabel: "Push (Chest, Shoulders & Triceps)",
        exerciseNames: [
          "Barbell Bench Press",
          "Seated Dumbbell Shoulder Press",
          "Dumbbell Lateral Raise",
          "Cable Tricep Pushdown",
        ],
      },
      Mon: {
        focusLabel: "Pull (Back & Biceps)",
        exerciseNames: [
          "Lat Pulldown",
          "Barbell Bent-Over Row",
          "Face Pulls",
          "Hammer Dumbbell Curl",
        ],
      },
      Wed: {
        focusLabel: "Legs & Core",
        exerciseNames: [
          "Barbell Back Squat",
          "Romanian Deadlift",
          "Seated Leg Curl",
          "Hanging Leg Raise",
        ],
      },
    },
  },
  {
    id: "upper-lower",
    label: "Upper / Lower",
    days: {
      Sat: {
        focusLabel: "Upper Body A",
        exerciseNames: [
          "Barbell Bench Press",
          "Lat Pulldown",
          "Overhead Barbell Press",
          "Barbell Bicep Curl",
        ],
      },
      Sun: {
        focusLabel: "Lower Body A",
        exerciseNames: [
          "Barbell Back Squat",
          "Romanian Deadlift",
          "Standing Calf Raise",
        ],
      },
      Tue: {
        focusLabel: "Upper Body B",
        exerciseNames: [
          "Incline Dumbbell Press",
          "Seated Cable Row",
          "Dumbbell Lateral Raise",
          "Cable Tricep Pushdown",
        ],
      },
      Wed: {
        focusLabel: "Lower Body B",
        exerciseNames: [
          "Leg Press",
          "Bulgarian Split Squat",
          "Seated Leg Curl",
          "Hanging Leg Raise",
        ],
      },
    },
  },
];

function makeUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayWeekday(): RoutineWeekday {
  return JS_DAY_TO_WEEKDAY[new Date().getDay()] ?? "Sat";
}

function parseRestSeconds(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 60;
  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n) || n < 0) return 60;
  if (cleaned.includes("min") || (cleaned.includes("m") && !cleaned.includes("ms"))) {
    return Math.min(600, Math.round(n * 60));
  }
  return Math.min(600, Math.round(n));
}

function parseDefaultRepsNumber(repsStr: string): number {
  const m = repsStr.match(/(\d+)/);
  return m ? Math.max(1, Number.parseInt(m[1], 10)) : 10;
}

function formatShortRelativeDate(iso: string | null): string {
  if (!iso) return "Not started yet";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Not started yet";
  const diffDays = Math.floor((Date.now() - dt.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Trained today";
  if (diffDays === 1) return "Trained yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(dt);
}

function formatCoachSessionTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Scheduled";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function computeAutoFocusLabel(exercises: Array<{ muscle: string }>): string {
  const muscles: string[] = [];
  for (const ex of exercises) {
    const m = ex.muscle.trim();
    if (m && !muscles.includes(m)) {
      muscles.push(m);
    }
    if (muscles.length >= 3) break;
  }
  if (muscles.length === 0) return "Training";
  if (muscles.length === 1) return muscles[0];
  if (muscles.length === 2) return `${muscles[0]} & ${muscles[1]}`;
  return `${muscles[0]}, ${muscles[1]} & ${muscles[2]}`;
}

function normalizeRoutineDays(routine: PersonalRoutine): PersonalRoutineDay[] {
  if (Array.isArray(routine.daySchedule) && routine.daySchedule.length > 0) {
    const map = new Map<RoutineWeekday, PersonalRoutineDay>();
    for (const d of routine.daySchedule) {
      map.set(d.day, d);
    }
    return WEEKDAYS.map((day) => {
      const existing = map.get(day);
      if (!existing || existing.isRestDay || existing.exercises.length === 0) {
        return { day, isRestDay: true, focusLabel: "Rest", exercises: [] };
      }
      return {
        day,
        isRestDay: false,
        focusLabel: existing.focusLabel || computeAutoFocusLabel(existing.exercises),
        exercises: existing.exercises,
      };
    });
  }

  // Fallback for flat routines (e.g., copied from a single-day gym plan or simple routine)
  if (routine.scheduledDays.length > 0) {
    const activeSet = new Set<RoutineWeekday>(routine.scheduledDays);
    const focus = computeAutoFocusLabel(routine.exercises);
    return WEEKDAYS.map((day) =>
      activeSet.has(day)
        ? { day, isRestDay: false, focusLabel: focus, exercises: routine.exercises }
        : { day, isRestDay: true, focusLabel: "Rest", exercises: [] },
    );
  }

  return WEEKDAYS.map((day, idx) =>
    idx === 0
      ? {
          day,
          isRestDay: routine.exercises.length === 0,
          focusLabel:
            routine.exercises.length > 0
              ? computeAutoFocusLabel(routine.exercises)
              : "Rest",
          exercises: routine.exercises,
        }
      : { day, isRestDay: true, focusLabel: "Rest", exercises: [] },
  );
}

function buildEmptyDraftWeek(): DraftRoutineDay[] {
  return WEEKDAYS.map((day, index) => ({
    day,
    isRestDay: index !== 0,
    customFocusLabel: "",
    exercises: [],
  }));
}

function toDraftExerciseFromLibrary(
  lib: LibraryExercise,
  defaults: Record<string, ExerciseDefaultStat>,
  defaultRestSeconds = DEFAULT_REST_SECONDS,
): DraftExercise {
  const prev = defaults[lib.name.toLowerCase()];
  const weightStr =
    prev && prev.lastWeightKg > 0 ? String(prev.lastWeightKg) : "";
  return {
    key: makeUid(),
    name: lib.name,
    muscle: lib.muscle,
    sets: lib.defaultSets,
    reps: lib.defaultReps,
    restSeconds: defaultRestSeconds || lib.defaultRest || DEFAULT_REST_SECONDS,
    targetWeightKg: weightStr,
    notes: "",
    showNotes: false,
    useCustomSets: false,
    setPlans: Array.from({ length: lib.defaultSets }, () => ({
      reps: lib.defaultReps,
      targetWeightKg: weightStr,
    })),
  };
}

function toDraftExerciseFromSaved(ex: PersonalRoutineExercise): DraftExercise {
  const hasDistinctSets =
    Array.isArray(ex.setPlans) &&
    ex.setPlans.length > 0 &&
    ex.setPlans.some(
      (sp) =>
        sp.reps !== ex.reps ||
        Number(sp.targetWeightKg || 0) !== Number(ex.targetWeightKg || 0),
    );
  const count = Math.max(1, ex.sets || ex.setPlans?.length || 3);
  const weightStr = ex.targetWeightKg > 0 ? String(ex.targetWeightKg) : "";

  const setPlans: DraftSetPlan[] =
    ex.setPlans && ex.setPlans.length > 0
      ? ex.setPlans.map((sp) => ({
          reps: sp.reps || ex.reps || "10",
          targetWeightKg: sp.targetWeightKg > 0 ? String(sp.targetWeightKg) : "",
        }))
      : Array.from({ length: count }, () => ({
          reps: ex.reps || "10",
          targetWeightKg: weightStr,
        }));

  return {
    key: makeUid(),
    name: ex.name,
    muscle: ex.muscle,
    sets: setPlans.length,
    reps: ex.reps || "10",
    restSeconds: ex.restSeconds || 60,
    targetWeightKg: weightStr,
    notes: ex.notes ?? "",
    showNotes: Boolean(ex.notes && ex.notes.trim()),
    useCustomSets: hasDistinctSets,
    setPlans,
  };
}

function sanitizeHydratedSession(candidate: ActiveWorkoutSession): ActiveWorkoutSession {
  if (candidate.restEndsAtIso) {
    const endMs = Date.parse(candidate.restEndsAtIso);
    // Never allow an already-elapsed rest timer to resurrect or restart on reload/resume
    if (Number.isNaN(endMs) || endMs <= Date.now()) {
      return {
        ...candidate,
        ...applySkipRestTimer(),
      };
    }
  }
  return candidate;
}

export function MemberWorkoutHub({
  memberId,
  trainer,
  gymWorkoutPlan,
  gymCatalogPlans = [],
  archivedRoutines = [],
  activeSelection = { mode: "none", personalRoutineId: null, gymPlanId: null },
  serverActiveSession = null,
  workoutEntryNonce = 0,
  libraryEntryNonce = 0,
  freeWorkoutNonce = 0,
  upcomingSessions,
  personalRoutines,
  exerciseDefaults,
  exerciseHistory = [],
  exerciseMediaCatalog = null,
  progressionSettings = DEFAULT_PROGRESSION_RULE_SETTINGS,
  onWorkoutDataChanged,
  onNavigateToProgress,
  onNavigateToAchievements,
  onSessionUnauthorized,
  onActiveSessionPresenceChange,
}: {
  memberId: string;
  trainer: { name: string; specialty: string } | null;
  gymWorkoutPlan: GymAssignedWorkoutPlan | null;
  gymCatalogPlans?: GymAssignedWorkoutPlan[];
  archivedRoutines?: PersonalRoutine[];
  activeSelection?: ActiveRoutineSelection;
  serverActiveSession?: ActiveWorkoutSession | null;
  workoutEntryNonce?: number;
  libraryEntryNonce?: number;
  freeWorkoutNonce?: number;
  upcomingSessions: UpcomingCoachSession[];
  personalRoutines: PersonalRoutine[];
  exerciseDefaults: Record<string, ExerciseDefaultStat>;
  exerciseHistory?: ExerciseHistorySummary[];
  exerciseMediaCatalog?: Record<string, ExerciseMediaCatalogEntry> | null;
  progressionSettings?: ProgressionRuleSettings;
  onWorkoutDataChanged: () => Promise<void>;
  onNavigateToProgress: () => void;
  onNavigateToAchievements?: () => void;
  onSessionUnauthorized: () => void;
  onActiveSessionPresenceChange?: (summary: ActiveSessionSummary | null) => void;
}) {
  const activeStorageKey = `gymos_active_workout_v3_${memberId || "member"}`;
  const offlineQueueKey = `gymos_pending_workout_logs_v1_${memberId || "member"}`;
  const { settings: restSettings } = useRestTimerSettings();
  const todayWeekday = useMemo(() => getTodayWeekday(), []);

  const [routineSection, setRoutineSection] = useState<"personal" | "gym">(() =>
    activeSelection.mode === "gym" && personalRoutines.length === 0 ? "gym" : "personal",
  );
  const [hubError, setHubError] = useState("");
  const [hubSuccess, setHubSuccess] = useState("");
  const [busyRoutineId, setBusyRoutineId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedRoutineIds, setExpandedRoutineIds] = useState<Record<string, boolean>>({});
  const [selectedStartDayByRoutine, setSelectedStartDayByRoutine] = useState<
    Record<string, RoutineWeekday>
  >({});

  // Exercise Demonstration & Exercise Library state
  const [builderDemoExerciseKey, setBuilderDemoExerciseKey] = useState<string | null>(null);
  const [pickerPreviewName, setPickerPreviewName] = useState<string | null>(null);
  const [routinePreviewExerciseKey, setRoutinePreviewExerciseKey] = useState<string | null>(
    null,
  );
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryMuscle, setLibraryMuscle] = useState<string>("All");
  const lastHandledLibraryNonceRef = useRef<number>(libraryEntryNonce);

  useEffect(() => {
    if (libraryEntryNonce > 0 && libraryEntryNonce !== lastHandledLibraryNonceRef.current) {
      lastHandledLibraryNonceRef.current = libraryEntryNonce;
      setIsExerciseLibraryOpen(true);
    }
  }, [libraryEntryNonce]);

  // Routine Builder state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftGoal, setDraftGoal] = useState("Strength & Hypertrophy");
  const [draftSetActive, setDraftSetActive] = useState(true);
  const [draftDays, setDraftDays] = useState<DraftRoutineDay[]>(() =>
    buildEmptyDraftWeek(),
  );
  const [selectedBuilderDay, setSelectedBuilderDay] = useState<RoutineWeekday>("Sat");
  const [showWeeklyOverviewInBuilder, setShowWeeklyOverviewInBuilder] = useState(true);
  const [isSavingRoutine, setIsSavingRoutine] = useState(false);

  // Searchable Multi-Select Exercise Selector state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerMuscle, setPickerMuscle] = useState<string>("All");
  const [pickerSelectedNames, setPickerSelectedNames] = useState<string[]>([]);

  // Delete Confirmation Modal state
  const [deletingRoutine, setDeletingRoutine] = useState<PersonalRoutine | null>(null);
  const [isDeletingRoutine, setIsDeletingRoutine] = useState(false);

  // Ready-to-Train Workout Entry Modal state (triggered after QR check-in or Quick Start)
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [showAlternativeRoutinesInEntry, setShowAlternativeRoutinesInEntry] =
    useState(false);
  const handledEntryNonceRef = useRef<number>(0);

  // Active Guided Workout Session state + Dual Persistence
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
  const [isWorkoutMinimized, setIsWorkoutMinimized] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<{
    routineTitle: string;
    durationSeconds: number;
    completedSets: number;
    totalVolumeKg: number;
    exercises: Array<{
      name: string;
      sets: Array<{ setNumber: number; weightKg: number; reps: number }>;
    }>;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncingDraft, setIsSyncingDraft] = useState(false);
  const [celebrationPrs, setCelebrationPrs] = useState<
    Array<{ exerciseName: string; weightKg: number; reps: number }>
  >([]);
  const [celebrationMilestones, setCelebrationMilestones] = useState<
    AchievementMilestone[]
  >([]);
  const [postWorkoutRecommendations, setPostWorkoutRecommendations] = useState<
    ExerciseProgressionRecord[]
  >([]);
  const [lastUnsavedFreeLog, setLastUnsavedFreeLog] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [freeLogRoutineName, setFreeLogRoutineName] = useState("");
  const [isSavingFreeLogRoutine, setIsSavingFreeLogRoutine] = useState(false);
  const handledFreeWorkoutNonceRef = useRef<number>(freeWorkoutNonce);

  const respondToProgressionApi = useCallback(
    async (params: {
      exerciseName: string;
      decision: "accepted" | "adjusted" | "ignored";
      customWeightKg?: number;
      customReps?: number;
    }) => {
      try {
        const res = await mobileFetch("/api/member-workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "respond-progression",
            ...params,
          }),
        });
        if (res.status === 401) {
          onSessionUnauthorized();
          return;
        }
        if (res.ok) {
          setPostWorkoutRecommendations((prev) =>
            prev.map((item) =>
              item.exerciseName.trim().toLowerCase() ===
              params.exerciseName.trim().toLowerCase()
                ? {
                    ...item,
                    decision: params.decision,
                    appliedWeightKg:
                      params.decision === "accepted"
                        ? item.recommendedWeightKg
                        : params.decision === "adjusted"
                          ? (params.customWeightKg ?? item.recommendedWeightKg)
                          : null,
                    appliedReps:
                      params.decision === "accepted"
                        ? item.recommendedReps
                        : params.decision === "adjusted"
                          ? (params.customReps ?? item.recommendedReps)
                          : null,
                  }
                : item,
            ),
          );
          await onWorkoutDataChanged();
        }
      } catch {
        // Non-blocking if temporarily offline
      }
    },
    [onSessionUnauthorized, onWorkoutDataChanged],
  );

  const latestSessionRef = useRef<ActiveWorkoutSession | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const needsDraftSyncRef = useRef<boolean>(false);

  // Merge assigned gym plan + catalog plans without duplicates
  const allGymRoutines = useMemo(() => {
    const map = new Map<string, GymAssignedWorkoutPlan>();
    if (gymWorkoutPlan) {
      map.set(gymWorkoutPlan.id, { ...gymWorkoutPlan, isAssignedByGym: true });
    }
    for (const plan of gymCatalogPlans) {
      const existing = map.get(plan.id);
      map.set(plan.id, {
        ...plan,
        isAssignedByGym: Boolean(existing?.isAssignedByGym || plan.isAssignedByGym),
      });
    }
    return Array.from(map.values());
  }, [gymWorkoutPlan, gymCatalogPlans]);

  // Identify currently active routine (personal or gym)
  const activePersonalRoutine = useMemo(
    () =>
      personalRoutines.find(
        (r) =>
          Boolean(r.isActive) ||
          (activeSelection.mode === "personal" &&
            activeSelection.personalRoutineId === r.id),
      ) ?? null,
    [personalRoutines, activeSelection],
  );

  const selectedGymRoutine = useMemo(
    () =>
      activeSelection.mode === "gym" && activeSelection.gymPlanId
        ? allGymRoutines.find((p) => p.id === activeSelection.gymPlanId) ?? null
        : null,
    [allGymRoutines, activeSelection],
  );

  // Sync draft to backend (non-blocking, resilient to temporary connectivity loss)
  const syncDraftToBackend = useCallback(
    async (sessionSnapshot: ActiveWorkoutSession) => {
      if (!memberId) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        needsDraftSyncRef.current = true;
        return;
      }
      setIsSyncingDraft(true);
      try {
        const res = await mobileFetch("/api/member-workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync-active-session",
            ...sessionSnapshot,
          }),
        });
        if (res.status === 401) {
          onSessionUnauthorized();
          return;
        }
        if (res.ok) {
          needsDraftSyncRef.current = false;
        } else {
          needsDraftSyncRef.current = true;
        }
      } catch {
        needsDraftSyncRef.current = true;
      } finally {
        setIsSyncingDraft(false);
      }
    },
    [memberId, onSessionUnauthorized],
  );

  // Restore unfinished workout from localStorage or serverActiveSession (whichever is newer)
  // Sanitizes any elapsed rest timer so returning from background never restarts it!
  useEffect(() => {
    let localParsed: ActiveWorkoutSession | null = null;
    const raw = safeLocalGet(activeStorageKey);
    if (raw) {
      try {
        const candidate = JSON.parse(raw) as ActiveWorkoutSession;
        if (
          candidate &&
          typeof candidate.clientSessionId === "string" &&
          Array.isArray(candidate.exercises) &&
          candidate.routineTitle
        ) {
          localParsed = sanitizeHydratedSession(candidate);
        }
      } catch {
        safeLocalRemove(activeStorageKey);
      }
    }

    const sanitizedServer = serverActiveSession
      ? sanitizeHydratedSession(serverActiveSession)
      : null;

    let candidateToApply: ActiveWorkoutSession | null = null;
    if (localParsed && sanitizedServer) {
      candidateToApply =
        sanitizedServer.clientUpdatedAtMs > (localParsed.clientUpdatedAtMs || 0)
          ? sanitizedServer
          : localParsed;
    } else if (localParsed) {
      candidateToApply = localParsed;
    } else if (sanitizedServer) {
      candidateToApply = sanitizedServer;
    }

    if (!candidateToApply) return;

    setActiveSession((curr) => {
      if (
        curr &&
        curr.clientSessionId === candidateToApply.clientSessionId &&
        (curr.clientUpdatedAtMs || 0) >= (candidateToApply.clientUpdatedAtMs || 0)
      ) {
        return curr;
      }
      latestSessionRef.current = candidateToApply;
      safeLocalSet(activeStorageKey, JSON.stringify(candidateToApply));
      return candidateToApply;
    });
  }, [activeStorageKey, serverActiveSession]);

  // Report unfinished workout summary to parent (Pass tab & QR Check-in banner)
  useEffect(() => {
    latestSessionRef.current = activeSession;
    if (activeSession) {
      safeLocalSet(activeStorageKey, JSON.stringify(activeSession));
      let completedSets = 0;
      let totalSets = 0;
      for (const ex of activeSession.exercises) {
        for (const s of ex.sets) {
          totalSets += 1;
          if (s.completed) completedSets += 1;
        }
      }
      onActiveSessionPresenceChange?.({
        title: activeSession.routineTitle,
        completedSets,
        totalSets,
      });
    } else {
      safeLocalRemove(activeStorageKey);
      onActiveSessionPresenceChange?.(null);
    }
  }, [activeSession, activeStorageKey, onActiveSessionPresenceChange]);

  // Network online/offline + visibility recovery listeners
  useEffect(() => {
    const flushAll = async () => {
      const onlineNow = typeof navigator !== "undefined" ? navigator.onLine : true;
      setIsOnline(onlineNow);
      if (!onlineNow) return;

      if (needsDraftSyncRef.current && latestSessionRef.current) {
        await syncDraftToBackend(latestSessionRef.current);
      }
      const flushedLogs = await flushPendingCompletedWorkouts(
        offlineQueueKey,
        safeLocalGet,
        safeLocalSet,
        safeLocalRemove,
      );
      if (flushedLogs) {
        await onWorkoutDataChanged();
      }
    };

    const handleOffline = () => setIsOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void flushAll();
      } else if (latestSessionRef.current) {
        // Persist synchronously right as phone locks or app minimizes
        safeLocalSet(activeStorageKey, JSON.stringify(latestSessionRef.current));
      }
    };

    window.addEventListener("online", flushAll);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    void flushAll();

    return () => {
      window.removeEventListener("online", flushAll);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [activeStorageKey, offlineQueueKey, onWorkoutDataChanged, syncDraftToBackend]);

  // Open Ready-to-Train Workout Entry when triggered after QR check-in or Home Resume
  useEffect(() => {
    if (workoutEntryNonce > 0 && workoutEntryNonce !== handledEntryNonceRef.current) {
      handledEntryNonceRef.current = workoutEntryNonce;
      if (!latestSessionRef.current) {
        setShowAlternativeRoutinesInEntry(false);
        setIsEntryModalOpen(true);
      } else {
        setIsWorkoutMinimized(false);
      }
    }
  }, [workoutEntryNonce]);

  useEffect(() => {
    if (
      freeWorkoutNonce > 0 &&
      freeWorkoutNonce !== handledFreeWorkoutNonceRef.current
    ) {
      handledFreeWorkoutNonceRef.current = freeWorkoutNonce;
      if (!latestSessionRef.current) {
        setHubError("");
        setHubSuccess("");
        setCelebrationPrs([]);
        setCelebrationMilestones([]);
        setPostWorkoutRecommendations([]);
        setLastUnsavedFreeLog(null);
        setIsEntryModalOpen(false);
        const sessionObj: ActiveWorkoutSession = {
          clientSessionId: `sess-${makeUid()}`,
          sourceType: "free_workout",
          routineId: null,
          routineTitle: "Free Workout",
          dayLabel: "Free Workout",
          targetGoal: "General Fitness",
          startedAtIso: new Date().toISOString(),
          pausedSeconds: 0,
          isPaused: false,
          lastPauseStartedIso: null,
          restTimerId: "",
          restStartedAtIso: null,
          restEndsAtIso: null,
          restDurationSeconds: 0,
          restPausedRemainingMs: null,
          currentExerciseIndex: 0,
          clientUpdatedAtMs: Date.now(),
          exercises: [],
        };
        setActiveSession(sessionObj);
        latestSessionRef.current = sessionObj;
        safeLocalSet(activeStorageKey, JSON.stringify(sessionObj));
        void syncDraftToBackend(sessionObj);
      }
    }
  }, [activeStorageKey, freeWorkoutNonce, syncDraftToBackend]);

  function updateActiveSessionState(
    updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession,
    options?: { immediateSync?: boolean },
  ) {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      latestSessionRef.current = next;
      safeLocalSet(activeStorageKey, JSON.stringify(next));

      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      if (options?.immediateSync) {
        void syncDraftToBackend(next);
      } else {
        syncTimerRef.current = window.setTimeout(() => {
          if (latestSessionRef.current) {
            void syncDraftToBackend(latestSessionRef.current);
          }
        }, 550);
      }
      return next;
    });
  }

  function launchNewSession(sessionObj: ActiveWorkoutSession) {
    setHubError("");
    setHubSuccess("");
    setCelebrationPrs([]);
    setPostWorkoutRecommendations([]);
    setCompletedSummary(null);
    setIsWorkoutMinimized(false);
    setIsEntryModalOpen(false);
    latestSessionRef.current = sessionObj;
    safeLocalSet(activeStorageKey, JSON.stringify(sessionObj));
    setActiveSession(sessionObj);
    void syncDraftToBackend(sessionObj);
  }

  // Filtered library in Searchable Exercise Selector (supports both English & Egyptian Gym Arabic!)
  const filteredExerciseLibrary = useMemo(() => {
    const q = pickerQuery.trim();
    return EXERCISE_LIBRARY.filter((item) => {
      const matchesMuscle = pickerMuscle === "All" || item.muscle === pickerMuscle;
      return matchesMuscle && matchesExerciseQuery(item, q);
    });
  }, [pickerQuery, pickerMuscle]);

  const currentBuilderDayObj = useMemo(
    () =>
      draftDays.find((d) => d.day === selectedBuilderDay) ?? {
        day: selectedBuilderDay,
        isRestDay: false,
        customFocusLabel: "",
        exercises: [],
      },
    [draftDays, selectedBuilderDay],
  );

  const totalDraftExercises = useMemo(
    () =>
      draftDays.reduce(
        (acc, d) => acc + (d.isRestDay ? 0 : d.exercises.length),
        0,
      ),
    [draftDays],
  );

  // -------------------------------------------------------------------
  // WORKOUT PLAYER LAUNCHERS (SMART DEFAULTS + IDEMPOTENT SESSION IDS)
  // -------------------------------------------------------------------
  function startFromGymPlan(plan: GymAssignedWorkoutPlan) {
    const memberDefaultRest = restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS;
    const exercises: ActiveWorkoutExercise[] = plan.exercises.map((ex) => {
      const setTotal = Math.max(1, Math.min(20, Number.parseInt(ex.sets, 10) || 3));
      const defaultReps = parseDefaultRepsNumber(ex.reps);
      const parsedPlanRest = parseRestSeconds(ex.rest);
      const prev = exerciseDefaults[ex.name.trim().toLowerCase()];

      return {
        name: ex.name,
        muscle: ex.muscle,
        restSeconds: memberDefaultRest || parsedPlanRest || DEFAULT_REST_SECONDS,
        usesDefaultRest: true,
        targetRepsLabel: ex.reps,
        notes: "",
        sets: Array.from({ length: setTotal }, (_, idx) => {
          const rememberedSet = prev?.lastSets?.[idx];
          const weightKg =
            rememberedSet && rememberedSet.weightKg > 0
              ? String(rememberedSet.weightKg)
              : prev && prev.lastWeightKg > 0
                ? String(prev.lastWeightKg)
                : ex.targetWeightKg && ex.targetWeightKg > 0
                  ? String(ex.targetWeightKg)
                  : "0";
          const reps =
            rememberedSet && rememberedSet.reps > 0
              ? String(rememberedSet.reps)
              : prev && prev.lastReps > 0
                ? String(prev.lastReps)
                : String(defaultReps);
          return {
            setNumber: idx + 1,
            weightKg,
            reps,
            completed: false,
            completedAtIso: null,
          };
        }),
      };
    });

    launchNewSession({
      clientSessionId: `sess-${makeUid()}`,
      sourceType: "gym_assigned",
      routineId: plan.id,
      routineTitle: plan.title,
      dayLabel: "Gym Routine",
      targetGoal: plan.targetGoal,
      startedAtIso: new Date().toISOString(),
      pausedSeconds: 0,
      isPaused: false,
      lastPauseStartedIso: null,
      restTimerId: "",
      restStartedAtIso: null,
      restEndsAtIso: null,
      restDurationSeconds: 0,
      restPausedRemainingMs: null,
      currentExerciseIndex: 0,
      clientUpdatedAtMs: Date.now(),
      exercises,
    });
  }

  function startFromPersonalRoutine(routine: PersonalRoutine, dayOverride?: RoutineWeekday) {
    const normalizedDays = normalizeRoutineDays(routine);
    const trainingDays = normalizedDays.filter((d) => !d.isRestDay && d.exercises.length > 0);

    let chosenDay: PersonalRoutineDay | null = null;
    if (dayOverride) {
      chosenDay = trainingDays.find((d) => d.day === dayOverride) ?? null;
    }
    if (!chosenDay) {
      chosenDay =
        trainingDays.find((d) => d.day === todayWeekday) ?? trainingDays[0] ?? null;
    }

    const sourceExercises =
      chosenDay && chosenDay.exercises.length > 0
        ? chosenDay.exercises
        : routine.exercises;

    const exercises: ActiveWorkoutExercise[] = sourceExercises.map((ex) => {
      const prev = exerciseDefaults[ex.name.trim().toLowerCase()];
      const fallbackReps = String(parseDefaultRepsNumber(ex.reps));
      const setCount = Math.max(1, ex.sets || ex.setPlans?.length || 3);
      const hasAcceptedProgression =
        prev?.activeProgression?.decision === "accepted" ||
        prev?.activeProgression?.decision === "adjusted";

      const sets: ActiveWorkoutSet[] = Array.from({ length: setCount }, (_, idx) => {
        const sp = ex.setPlans?.[idx];
        const rememberedSet = prev?.lastSets?.[idx];

        const setWeight = hasAcceptedProgression
          ? String(prev?.lastWeightKg ?? 0)
          : sp && sp.targetWeightKg > 0
            ? String(sp.targetWeightKg)
            : rememberedSet && rememberedSet.weightKg > 0
              ? String(rememberedSet.weightKg)
              : prev && prev.lastWeightKg > 0
                ? String(prev.lastWeightKg)
                : ex.targetWeightKg > 0
                  ? String(ex.targetWeightKg)
                  : "0";

        const setReps = hasAcceptedProgression
          ? String(prev?.lastReps ?? parseDefaultRepsNumber(ex.reps))
          : sp?.reps
            ? String(parseDefaultRepsNumber(sp.reps))
            : rememberedSet && rememberedSet.reps > 0
              ? String(rememberedSet.reps)
              : prev && prev.lastReps > 0
                ? String(prev.lastReps)
                : fallbackReps;

        return {
          setNumber: idx + 1,
          weightKg: setWeight,
          reps: setReps,
          completed: false,
          completedAtIso: null,
        };
      });

      const memberDefaultRest = restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS;
      const hasCustomExerciseRest =
        Boolean(ex.restSeconds) &&
        ex.restSeconds !== DEFAULT_REST_SECONDS &&
        ex.restSeconds !== memberDefaultRest;

      return {
        name: ex.name,
        muscle: ex.muscle,
        restSeconds: hasCustomExerciseRest ? ex.restSeconds : memberDefaultRest,
        usesDefaultRest: !hasCustomExerciseRest,
        targetRepsLabel: ex.reps,
        notes: ex.notes ?? "",
        sets,
      };
    });

    const daySuffix =
      chosenDay && trainingDays.length > 1
        ? `${WEEKDAY_FULL_NAMES[chosenDay.day]} · ${chosenDay.focusLabel}`
        : undefined;

    launchNewSession({
      clientSessionId: `sess-${makeUid()}`,
      sourceType: "member_routine",
      routineId: routine.id,
      routineTitle: daySuffix ? `${routine.title} (${chosenDay!.day})` : routine.title,
      dayLabel: daySuffix ?? "Personal Routine",
      targetGoal: routine.targetGoal,
      startedAtIso: new Date().toISOString(),
      pausedSeconds: 0,
      isPaused: false,
      lastPauseStartedIso: null,
      restTimerId: "",
      restStartedAtIso: null,
      restEndsAtIso: null,
      restDurationSeconds: 0,
      restPausedRemainingMs: null,
      currentExerciseIndex: 0,
      clientUpdatedAtMs: Date.now(),
      exercises,
    });
  }

  function startFreeWorkout() {
    setLastUnsavedFreeLog(null);
    launchNewSession({
      clientSessionId: `sess-${makeUid()}`,
      sourceType: "free_workout",
      routineId: null,
      routineTitle: "Free Workout",
      dayLabel: "Free Workout",
      targetGoal: "General Fitness",
      startedAtIso: new Date().toISOString(),
      pausedSeconds: 0,
      isPaused: false,
      lastPauseStartedIso: null,
      restTimerId: "",
      restStartedAtIso: null,
      restEndsAtIso: null,
      restDurationSeconds: 0,
      restPausedRemainingMs: null,
      currentExerciseIndex: 0,
      clientUpdatedAtMs: Date.now(),
      exercises: [],
    });
  }

  async function saveCompletedFreeLogAsRoutine() {
    if (!lastUnsavedFreeLog || isSavingFreeLogRoutine) return;
    setIsSavingFreeLogRoutine(true);
    setHubError("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-log-as-routine",
          logId: lastUnsavedFreeLog.id,
          title: freeLogRoutineName.trim() || lastUnsavedFreeLog.title,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{
        error?: string;
        routine?: PersonalRoutine;
      }>(response, "Unable to save workout as routine.");
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save workout as routine.");
      }
      setLastUnsavedFreeLog(null);
      setHubSuccess(
        `Saved "${data.routine?.title ?? "Free Workout"}" to My Routines.`,
      );
      await onWorkoutDataChanged();
    } catch (err) {
      setHubError(
        err instanceof Error ? err.message : "Unable to save workout as routine.",
      );
    } finally {
      setIsSavingFreeLogRoutine(false);
    }
  }

  async function finalizeActiveWorkoutSession({
    durationSeconds,
    effortRating,
    sessionNotes,
    saveAsRoutine,
    saveRoutineTitle,
  }: {
    durationSeconds: number;
    effortRating: number;
    sessionNotes: string;
    saveAsRoutine?: boolean;
    saveRoutineTitle?: string;
  }) {
    const snap = latestSessionRef.current ?? activeSession;
    if (!snap) return;

    const logPayload = {
      action: "log-workout",
      clientSessionId: snap.clientSessionId,
      sourceType: snap.sourceType,
      routineId: snap.routineId,
      routineTitle: snap.routineTitle,
      targetGoal: snap.targetGoal,
      startedAt: snap.startedAtIso,
      durationSeconds,
      effortRating,
      sessionNotes,
      ...(saveAsRoutine
        ? {
            saveAsRoutine: true,
            saveRoutineTitle: saveRoutineTitle?.trim() || snap.routineTitle,
          }
        : {}),
      exercises: snap.exercises.map((ex) => ({
        exerciseName: ex.name,
        targetMuscleGroup: ex.muscle,
        targetSets: ex.sets.length,
        targetRepsLabel: ex.targetRepsLabel,
        feedback: ex.feedback ?? null,
        sets: ex.sets.map((s) => ({
          setNumber: s.setNumber,
          weightKg: Number.parseFloat(s.weightKg) || 0,
          reps: Number.parseInt(s.reps, 10) || 0,
          completed: s.completed,
        })),
      })),
    };

    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logPayload),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{
        error?: string;
        log?: { id: string; routineTitle: string; sourceType: string };
        savedRoutine?: PersonalRoutine;
        newPersonalRecords?: Array<{
          exerciseName: string;
          weightKg: number;
          reps: number;
        }>;
        newlyUnlockedAchievements?: AchievementMilestone[];
        progressionRecommendations?: ExerciseProgressionRecord[];
      }>(response, "Unable to save workout session.");
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save workout session.");
      }

      let summaryCompletedSets = 0;
      let summaryVolumeKg = 0;
      const summaryExercises = snap.exercises
        .map((ex) => {
          const doneSets = ex.sets
            .filter((s) => s.completed)
            .map((s) => {
              const w = Math.max(0, Number.parseFloat(s.weightKg) || 0);
              const r = Math.max(0, Number.parseInt(s.reps, 10) || 0);
              summaryCompletedSets += 1;
              summaryVolumeKg += w * r;
              return { setNumber: s.setNumber, weightKg: w, reps: r };
            });
          return { name: ex.name, sets: doneSets };
        })
        .filter((ex) => ex.sets.length > 0);

      setActiveSession(null);
      setIsWorkoutMinimized(false);
      latestSessionRef.current = null;
      safeLocalRemove(activeStorageKey);
      needsDraftSyncRef.current = false;
      setCompletedSummary({
        routineTitle: snap.routineTitle,
        durationSeconds,
        completedSets: summaryCompletedSets,
        totalVolumeKg: Math.round(summaryVolumeKg * 10) / 10,
        exercises: summaryExercises,
      });
      setCelebrationPrs(data.newPersonalRecords ?? []);
      setCelebrationMilestones(data.newlyUnlockedAchievements ?? []);
      setPostWorkoutRecommendations(data.progressionRecommendations ?? []);
      if (data.savedRoutine) {
        setLastUnsavedFreeLog(null);
        setHubSuccess(
          `Workout logged & saved as "${data.savedRoutine.title}" in My Routines.`,
        );
      } else {
        if (snap.sourceType === "free_workout" && data.log?.id) {
          const suggested = `Free Workout (${new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })})`;
          setLastUnsavedFreeLog({ id: data.log.id, title: suggested });
          setFreeLogRoutineName(suggested);
        } else {
          setLastUnsavedFreeLog(null);
        }
        setHubSuccess("Workout saved to your training log.");
      }
      await onWorkoutDataChanged();
    } catch (err) {
      // Offline / transient network loss fallback: queue locally with idempotent clientSessionId
      const isNetworkOffline =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (err instanceof TypeError && /fetch|network/i.test(err.message));

      if (isNetworkOffline) {
        let queued: Array<Record<string, unknown>> = [];
        try {
          const existing = safeLocalGet(offlineQueueKey);
          if (existing) {
            const parsed = JSON.parse(existing) as Array<Record<string, unknown>>;
            if (Array.isArray(parsed)) queued = parsed;
          }
        } catch {
          queued = [];
        }
        const filtered = queued.filter(
          (item) => item.clientSessionId !== snap.clientSessionId,
        );
        filtered.push(logPayload);
        safeLocalSet(offlineQueueKey, JSON.stringify(filtered));

        setActiveSession(null);
        latestSessionRef.current = null;
        safeLocalRemove(activeStorageKey);
        setHubSuccess(
          "Workout saved on your device and will sync automatically when you reconnect.",
        );
        return;
      }
      throw err;
    }
  }

  function discardActiveWorkoutSession() {
    const snap = latestSessionRef.current ?? activeSession;
    setActiveSession(null);
    latestSessionRef.current = null;
    safeLocalRemove(activeStorageKey);
    needsDraftSyncRef.current = false;
    if (snap?.clientSessionId) {
      void mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discard-active-session",
          clientSessionId: snap.clientSessionId,
        }),
      }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------
  // ROUTINE BUILDER HELPERS (WEEKLY DAYS, SEARCHABLE PICKER, PER-SET)
  // -------------------------------------------------------------------
  function openCreateRoutineModal() {
    setEditingRoutineId(null);
    setDraftTitle("");
    setDraftGoal("Strength & Hypertrophy");
    setDraftSetActive(personalRoutines.length === 0 || activeSelection.mode === "none");
    const emptyWeek = buildEmptyDraftWeek();
    setDraftDays(emptyWeek);
    setSelectedBuilderDay("Sat");
    setShowWeeklyOverviewInBuilder(false);
    setIsPickerOpen(false);
    setHubError("");
    setIsBuilderOpen(true);
  }

  function openEditRoutineModal(routine: PersonalRoutine) {
    setEditingRoutineId(routine.id);
    setDraftTitle(routine.title);
    setDraftGoal(routine.targetGoal || "Strength & Hypertrophy");
    setDraftSetActive(Boolean(routine.isActive));

    const normalized = normalizeRoutineDays(routine);
    const mappedDays: DraftRoutineDay[] = normalized.map((d) => {
      const autoFocus = computeAutoFocusLabel(d.exercises);
      const customFocus =
        !d.isRestDay && d.focusLabel && d.focusLabel !== autoFocus && d.focusLabel !== "Rest"
          ? d.focusLabel
          : "";
      return {
        day: d.day,
        isRestDay: d.isRestDay,
        customFocusLabel: customFocus,
        exercises: d.exercises.map((ex) => toDraftExerciseFromSaved(ex)),
      };
    });

    const firstTrainingDayObj = mappedDays.find((d) => !d.isRestDay);
    const firstTrainingDay = firstTrainingDayObj?.day ?? "Sat";
    setDraftDays(mappedDays);
    setSelectedBuilderDay(firstTrainingDay);
    setBuilderDemoExerciseKey(firstTrainingDayObj?.exercises[0]?.key ?? null);
    setShowWeeklyOverviewInBuilder(true);
    setIsPickerOpen(false);
    setHubError("");
    setIsBuilderOpen(true);
  }

  function applyQuickSplitPreset(preset: SplitTemplatePreset) {
    const nextDays: DraftRoutineDay[] = WEEKDAYS.map((day) => {
      const spec = preset.days[day];
      if (!spec) {
        return { day, isRestDay: true, customFocusLabel: "", exercises: [] };
      }
      const exercises: DraftExercise[] = spec.exerciseNames
        .map((name) => EXERCISE_LIBRARY.find((l) => l.name === name))
        .filter((l): l is LibraryExercise => Boolean(l))
        .map((lib) =>
          toDraftExerciseFromLibrary(
            lib,
            exerciseDefaults,
            restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS,
          ),
        );

      return {
        day,
        isRestDay: false,
        customFocusLabel: spec.focusLabel,
        exercises,
      };
    });

    const firstActive = nextDays.find((d) => !d.isRestDay)?.day ?? "Sat";
    setDraftDays(nextDays);
    setSelectedBuilderDay(firstActive);
    setShowWeeklyOverviewInBuilder(true);
    if (!draftTitle.trim()) {
      setDraftTitle(preset.label);
    }
  }

  function toggleDayTrainingState(day: RoutineWeekday, makeTraining: boolean) {
    setDraftDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, isRestDay: !makeTraining } : d)),
    );
  }

  function updateDayFocusLabel(day: RoutineWeekday, label: string) {
    setDraftDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, customFocusLabel: label } : d)),
    );
  }

  function openExercisePickerForDay(day: RoutineWeekday) {
    setSelectedBuilderDay(day);
    setPickerQuery("");
    setPickerMuscle("All");
    setPickerSelectedNames([]);
    setIsPickerOpen(true);
  }

  function togglePickerSelection(exerciseName: string) {
    setPickerSelectedNames((prev) =>
      prev.includes(exerciseName)
        ? prev.filter((n) => n !== exerciseName)
        : [...prev, exerciseName],
    );
  }

  function confirmAddSelectedExercises() {
    if (pickerSelectedNames.length === 0) {
      setIsPickerOpen(false);
      return;
    }

    const newDraftItems: DraftExercise[] = pickerSelectedNames.map((name) => {
      const found = EXERCISE_LIBRARY.find((l) => l.name === name);
      if (found) {
        return toDraftExerciseFromLibrary(
          found,
          exerciseDefaults,
          restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS,
        );
      }
      return {
        key: makeUid(),
        name,
        muscle: pickerMuscle === "All" ? "Full body" : pickerMuscle,
        sets: 3,
        reps: "10",
        restSeconds: restSettings.defaultRestSeconds || DEFAULT_REST_SECONDS,
        targetWeightKg: "",
        notes: "",
        showNotes: false,
        useCustomSets: false,
        setPlans: Array.from({ length: 3 }, () => ({ reps: "10", targetWeightKg: "" })),
      };
    });

    setDraftDays((prev) =>
      prev.map((d) => {
        if (d.day !== selectedBuilderDay) return d;
        const combined = [...d.exercises, ...newDraftItems].slice(0, 25);
        return {
          ...d,
          isRestDay: false,
          exercises: combined,
        };
      }),
    );
    if (newDraftItems[0]) {
      setBuilderDemoExerciseKey(newDraftItems[0].key);
    }
    setIsPickerOpen(false);
    setPickerSelectedNames([]);
    setPickerPreviewName(null);
  }

  function updateDraftExerciseOnDay(
    day: RoutineWeekday,
    key: string,
    updater: (ex: DraftExercise) => DraftExercise,
  ) {
    setDraftDays((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => (ex.key === key ? updater(ex) : ex)),
        };
      }),
    );
  }

  function adjustDraftExerciseSets(day: RoutineWeekday, key: string, delta: number) {
    updateDraftExerciseOnDay(day, key, (ex) => {
      const nextCount = Math.max(1, Math.min(20, ex.sets + delta));
      const nextPlans = [...ex.setPlans];
      while (nextPlans.length < nextCount) {
        const last = nextPlans[nextPlans.length - 1];
        nextPlans.push({
          reps: last?.reps ?? ex.reps ?? "10",
          targetWeightKg: last?.targetWeightKg ?? ex.targetWeightKg ?? "",
        });
      }
      if (nextPlans.length > nextCount) {
        nextPlans.length = nextCount;
      }
      return { ...ex, sets: nextCount, setPlans: nextPlans };
    });
  }

  function moveDraftExerciseOnDay(
    day: RoutineWeekday,
    index: number,
    direction: -1 | 1,
  ) {
    setDraftDays((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= d.exercises.length) return d;
        const next = [...d.exercises];
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        return { ...d, exercises: next };
      }),
    );
  }

  function removeDraftExerciseFromDay(day: RoutineWeekday, key: string) {
    setDraftDays((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const nextEx = d.exercises.filter((ex) => ex.key !== key);
        return {
          ...d,
          exercises: nextEx,
        };
      }),
    );
  }

  async function savePersonalRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingRoutine) return;

    const cleanTitle = draftTitle.trim();
    if (!cleanTitle) {
      setHubError("Give your routine a name to save it.");
      return;
    }
    if (totalDraftExercises < 1) {
      setHubError("Tap '+ Add Exercises' on at least one training day.");
      return;
    }

    setIsSavingRoutine(true);
    setHubError("");

    const daySchedulePayload = draftDays.map((d) => {
      if (d.isRestDay || d.exercises.length === 0) {
        return {
          day: d.day,
          isRestDay: true,
          focusLabel: "Rest",
          exercises: [],
        };
      }
      const focusLabel =
        d.customFocusLabel.trim() || computeAutoFocusLabel(d.exercises);

      return {
        day: d.day,
        isRestDay: false,
        focusLabel,
        exercises: d.exercises.map((ex) => {
          const uniformWeight = Math.max(0, Number.parseFloat(ex.targetWeightKg) || 0);
          const uniformReps = ex.reps.trim() || "10";
          const setPlans = ex.useCustomSets
            ? ex.setPlans.slice(0, ex.sets).map((sp, sIdx) => ({
                setNumber: sIdx + 1,
                reps: sp.reps.trim() || uniformReps,
                targetWeightKg: Math.max(0, Number.parseFloat(sp.targetWeightKg) || 0),
              }))
            : [];
          return {
            exerciseName: ex.name.trim(),
            targetMuscleGroup: ex.muscle,
            sets: ex.useCustomSets ? Math.max(1, setPlans.length) : ex.sets,
            reps: setPlans[0]?.reps ?? uniformReps,
            restSeconds: ex.restSeconds,
            targetWeightKg: setPlans[0]?.targetWeightKg ?? uniformWeight,
            notes: ex.notes.trim(),
            setPlans,
          };
        }),
      };
    });

    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingRoutineId ? "update-routine" : "create-routine",
          ...(editingRoutineId ? { routineId: editingRoutineId } : {}),
          title: cleanTitle,
          targetGoal: draftGoal,
          setAsActive: draftSetActive,
          daySchedule: daySchedulePayload,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to save routine.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save routine.");
      }

      setIsBuilderOpen(false);
      setRoutineSection("personal");
      setHubSuccess(editingRoutineId ? "Routine updated." : "Personal routine saved.");
      await onWorkoutDataChanged();
    } catch (err) {
      setHubError(err instanceof Error ? err.message : "Unable to save routine.");
    } finally {
      setIsSavingRoutine(false);
    }
  }

  // -------------------------------------------------------------------
  // ROUTINE MANAGEMENT ACTIONS (ACTIVATE, DUPLICATE, ARCHIVE, DELETE, GYM)
  // -------------------------------------------------------------------
  async function runRoutineAction(
    key: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    if (busyRoutineId) return;
    setBusyRoutineId(key);
    setHubError("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to update routine.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update routine.");
      }
      setHubSuccess(successMsg);
      await onWorkoutDataChanged();
    } catch (err) {
      setHubError(err instanceof Error ? err.message : "Unable to update routine.");
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function confirmDeleteRoutine() {
    if (!deletingRoutine || isDeletingRoutine) return;
    setIsDeletingRoutine(true);
    setHubError("");
    try {
      const response = await mobileFetch("/api/member-workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-routine",
          routineId: deletingRoutine.id,
        }),
      });
      if (response.status === 401) {
        onSessionUnauthorized();
        return;
      }
      const data = await readMobileJson<{ error?: string }>(
        response,
        "Unable to delete routine.",
      );
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete routine.");
      }
      setDeletingRoutine(null);
      setHubSuccess("Routine deleted.");
      await onWorkoutDataChanged();
    } catch (err) {
      setHubError(err instanceof Error ? err.message : "Unable to delete routine.");
    } finally {
      setIsDeletingRoutine(false);
    }
  }

  // -------------------------------------------------------------------
  // VIEW 1: DEDICATED FULL-SCREEN INTERACTIVE WORKOUT SESSION SCREEN
  // -------------------------------------------------------------------
  if (activeSession && !isWorkoutMinimized) {
    return (
      <ActiveWorkoutPlayer
        session={activeSession}
        exerciseDefaults={exerciseDefaults}
        exerciseHistory={exerciseHistory}
        progressionSettings={progressionSettings}
        exerciseCatalog={EXERCISE_LIBRARY}
        exerciseMediaCatalog={exerciseMediaCatalog}
        isOnline={isOnline}
        isSyncingDraft={isSyncingDraft}
        onChangeSession={updateActiveSessionState}
        onRespondPriorProgression={respondToProgressionApi}
        onFinishWorkout={finalizeActiveWorkoutSession}
        onDiscardSession={discardActiveWorkoutSession}
        onMinimizeWorkout={() => setIsWorkoutMinimized(true)}
      />
    );
  }

  // Full-Screen Clean Workout Completion Summary
  if (completedSummary) {
    return (
      <section
        aria-label="Workout completed summary"
        className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink"
      >
        <div className="mx-auto flex h-full w-full max-w-[460px] flex-col overflow-y-auto px-5 py-6">
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
              <Trophy size={26} aria-hidden="true" />
            </span>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-text">
              Workout Complete
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ink">
              {completedSummary.routineTitle}
            </h2>
            <p className="mt-1 text-[11px] text-ink-secondary">
              Saved to your workout history &amp; progress charts
            </p>
          </div>

          <div className={`${ui.cardElevated} mt-5 grid grid-cols-3 gap-2 p-4 text-center`}>
            <div>
              <p className="text-[10px] text-ink-secondary">Duration</p>
              <p data-no-translate="true" className="mt-1 text-[16px] font-bold text-ink">
                {Math.max(1, Math.round(completedSummary.durationSeconds / 60))} min
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ink-secondary">Sets Done</p>
              <p data-no-translate="true" className="mt-1 text-[16px] font-bold text-ink">
                {completedSummary.completedSets}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-ink-secondary">Volume</p>
              <p
                data-no-translate="true"
                className="mt-1 text-[16px] font-bold text-accent-text"
              >
                {completedSummary.totalVolumeKg.toLocaleString()} kg
              </p>
            </div>
          </div>

          {celebrationPrs.length > 0 && (
            <div className="mt-3.5 rounded-2xl border border-accent-border bg-accent-soft p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                Personal Records Unlocked
              </p>
              <ul className="mt-1.5 space-y-1">
                {celebrationPrs.map((pr) => (
                  <li
                    key={pr.exerciseName}
                    className="flex items-center justify-between text-[11px] font-semibold text-ink"
                  >
                    <span className="truncate">{pr.exerciseName}</span>
                    <span data-no-translate="true" className="text-accent-text">
                      {pr.weightKg > 0 ? `${pr.weightKg} kg × ${pr.reps}` : `${pr.reps} reps`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Logged Exercises
            </p>
            {completedSummary.exercises.map((ex, i) => (
              <div key={`${ex.name}-${i}`} className={`${ui.card} p-3`}>
                <p className="text-[12px] font-semibold text-ink">{ex.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ex.sets.map((s) => (
                    <span
                      key={s.setNumber}
                      data-no-translate="true"
                      className="rounded-lg border border-line bg-subtle px-2 py-0.5 text-[10px] font-semibold text-ink-secondary"
                    >
                      S{s.setNumber}: {s.weightKg > 0 ? `${s.weightKg} kg × ` : ""}
                      {s.reps}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-5">
            <button
              type="button"
              onClick={() => setCompletedSummary(null)}
              className={`${ui.btnPrimary} min-h-12 w-full rounded-2xl text-[13px]`}
            >
              Done · Back to App
            </button>
          </div>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------------
  // VIEW 2: WORKOUT HUB (ACTIVE ROUTINE HERO, MY ROUTINES & GYM ROUTINES)
  // -------------------------------------------------------------------
  const activePersonalDays = activePersonalRoutine
    ? normalizeRoutineDays(activePersonalRoutine)
    : [];
  const activeTodaySchedule = activePersonalDays.find((d) => d.day === todayWeekday) ?? null;
  const hasScheduledPersonalToday = Boolean(
    activePersonalRoutine &&
      activeSelection.mode !== "gym" &&
      activeTodaySchedule &&
      !activeTodaySchedule.isRestDay &&
      activeTodaySchedule.exercises.length > 0,
  );
  const hasScheduledGymToday = Boolean(
    activeSelection.mode === "gym" && selectedGymRoutine,
  );
  const hasAnyScheduledToday = hasScheduledPersonalToday || hasScheduledGymToday;

  return (
    <section aria-labelledby="workout-hub-heading" className="space-y-4">
      <div
        data-tour-id="workout-hub-actions"
        className="flex items-start justify-between gap-2"
      >
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Training &amp; Routines
          </p>
          <h2
            id="workout-hub-heading"
            className="mt-0.5 text-[19px] font-semibold tracking-[-0.035em] text-ink"
          >
            Workouts
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setIsExerciseLibraryOpen(true)}
            className={`${ui.btnSecondary} min-h-9 px-2.5 text-[10px]`}
          >
            <BookOpen size={13} className="text-accent-text" aria-hidden="true" />
            Library
          </button>
          <button
            type="button"
            onClick={openCreateRoutineModal}
            className={`${ui.btnPrimary} min-h-9 px-3 text-[11px]`}
          >
            <Plus size={14} aria-hidden="true" />
            New Routine
          </button>
        </div>
      </div>

      {/* Paused / Minimized Active Workout Resume Card */}
      {activeSession && isWorkoutMinimized && (
        <div
          role="region"
          aria-label="Paused workout session"
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent-soft p-3.5"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
              Workout in Progress
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-ink">
              {activeSession.routineTitle}
            </p>
            <p className="text-[10px] text-ink-secondary">
              Sets saved automatically · Ready to continue
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsWorkoutMinimized(false)}
            className={`${ui.btnPrimary} min-h-10 shrink-0 rounded-xl px-3.5 text-[11px]`}
          >
            <Play size={13} aria-hidden="true" />
            Resume
          </button>
        </div>
      )}

      {/* Dedicated 1-Tap Free Workout Entry (Never overwrites active routine) */}
      <div className={`${ui.card} flex items-center justify-between gap-3 p-3.5`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Zap size={13} className="shrink-0 text-accent-text" aria-hidden="true" />
            <p className="text-[12px] font-semibold text-ink">Free Workout</p>
          </div>
          <p className="mt-0.5 text-[10px] text-ink-secondary">
            Pick exercises dynamically without changing your active routine.
          </p>
        </div>
        <button
          type="button"
          onClick={startFreeWorkout}
          className={`${ui.btnSecondary} min-h-9 shrink-0 rounded-xl px-3 text-[11px]`}
        >
          <Play size={12} className="text-accent-text" aria-hidden="true" />
          Start Free Workout
        </button>
      </div>

      {/* Currently Active Routine Summary Card */}
      {activePersonalRoutine && activeSelection.mode !== "gym" && (
        <div
          aria-label="Currently active routine"
          className={`${ui.cardElevated} p-4`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={ui.badgeAccent}>
                <CheckCircle2 size={11} aria-hidden="true" />
                Active Routine
              </span>
              <h3 className="mt-1.5 truncate text-[16px] font-semibold text-ink">
                {activePersonalRoutine.title}
              </h3>
              <p className="mt-0.5 text-[10px] text-ink-secondary">
                {activeTodaySchedule && !activeTodaySchedule.isRestDay
                  ? `Today (${WEEKDAY_FULL_NAMES[todayWeekday]}): ${activeTodaySchedule.focusLabel} · ${activeTodaySchedule.exercises.length} exercises`
                  : `Today (${WEEKDAY_FULL_NAMES[todayWeekday]}): Rest Day`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openEditRoutineModal(activePersonalRoutine)}
              aria-label={`Edit ${activePersonalRoutine.title}`}
              className={`${ui.btnGhost} size-8 shrink-0`}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {activePersonalDays.map((d) => {
              const isToday = d.day === todayWeekday;
              return (
                <button
                  key={d.day}
                  type="button"
                  disabled={d.isRestDay}
                  onClick={() => startFromPersonalRoutine(activePersonalRoutine, d.day)}
                  title={
                    d.isRestDay
                      ? `${WEEKDAY_FULL_NAMES[d.day]}: Rest`
                      : `${WEEKDAY_FULL_NAMES[d.day]}: ${d.focusLabel}`
                  }
                  className={`flex flex-col items-center rounded-xl border py-1.5 text-center transition-colors ${
                    d.isRestDay
                      ? "cursor-default border-line bg-subtle opacity-60"
                      : isToday
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line-strong bg-surface text-ink hover:bg-hover"
                  }`}
                >
                  <span className="text-[9px] font-semibold">{d.day}</span>
                  <span className="mt-0.5 text-[8px] text-ink-muted">
                    {d.isRestDay ? "Rest" : `${d.exercises.length}ex`}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => startFromPersonalRoutine(activePersonalRoutine)}
            className={`${ui.btnPrimary} mt-3 min-h-10 w-full text-[11px]`}
          >
            <Play size={13} aria-hidden="true" />
            {activeTodaySchedule && !activeTodaySchedule.isRestDay
              ? `Start ${WEEKDAY_FULL_NAMES[todayWeekday]} · ${activeTodaySchedule.focusLabel}`
              : "Start Next Training Day"}
          </button>
        </div>
      )}

      {selectedGymRoutine && activeSelection.mode === "gym" && (
        <div
          aria-label="Currently active routine"
          className={`${ui.cardElevated} p-4`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className={ui.badgeAccent}>
                <CheckCircle2 size={11} aria-hidden="true" />
                Active · Gym Routine
              </span>
              <h3 className="mt-1.5 truncate text-[16px] font-semibold text-ink">
                {selectedGymRoutine.title}
              </h3>
              <p className="mt-0.5 text-[10px] text-ink-secondary">
                {selectedGymRoutine.exercises.length} exercises · Your personal routines remain saved
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => startFromGymPlan(selectedGymRoutine)}
              className={`${ui.btnPrimary} min-h-10 px-3 text-[11px]`}
            >
              <Play size={13} aria-hidden="true" />
              Start Workout
            </button>
            <button
              type="button"
              onClick={() => setRoutineSection("personal")}
              className={`${ui.btnSecondary} min-h-10 px-3 text-[11px]`}
            >
              Switch Routine
            </button>
          </div>
        </div>
      )}

      {/* Source Switcher: My Routines vs. Gym Routines */}
      <div
        role="tablist"
        aria-label="Workout routine source"
        className={`grid grid-cols-2 gap-1.5 ${ui.segmentedTrack}`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={routineSection === "personal"}
          onClick={() => setRoutineSection("personal")}
          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
            routineSection === "personal"
              ? "bg-elevated text-ink"
              : "text-ink-secondary hover:text-ink"
          }`}
        >
          <span>My Routines</span>
          <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-[9px] font-bold text-ink-secondary">
            {personalRoutines.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={routineSection === "gym"}
          onClick={() => setRoutineSection("gym")}
          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
            routineSection === "gym"
              ? "bg-elevated text-ink"
              : "text-ink-secondary hover:text-ink"
          }`}
        >
          <span>Gym Routines</span>
          {allGymRoutines.length > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent-text">
              {allGymRoutines.length}
            </span>
          )}
        </button>
      </div>

      {hubSuccess && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-[11px] font-medium text-accent-text"
        >
          <span>{hubSuccess}</span>
          <button
            type="button"
            onClick={() => setHubSuccess("")}
            className="text-[10px] font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {lastUnsavedFreeLog && (
        <div className={`${ui.card} space-y-2.5 p-3.5`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold text-ink">
                Save Free Workout as a Personal Routine?
              </p>
              <p className="mt-0.5 text-[10px] text-ink-secondary">
                Keep this exercise lineup in My Routines without overwriting your active routine.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss save routine prompt"
              onClick={() => setLastUnsavedFreeLog(null)}
              className={`${ui.btnGhost} size-6`}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={80}
              aria-label="Routine name for saved free workout"
              value={freeLogRoutineName}
              onChange={(e) => setFreeLogRoutineName(e.target.value)}
              placeholder="Routine name"
              className={`${ui.inputCompact} min-h-9 flex-1`}
            />
            <button
              type="button"
              disabled={isSavingFreeLogRoutine}
              onClick={() => void saveCompletedFreeLogAsRoutine()}
              className={`${ui.btnPrimary} min-h-9 shrink-0 rounded-xl px-3 text-[11px]`}
            >
              {isSavingFreeLogRoutine ? "Saving…" : "Save as Routine"}
            </button>
          </div>
        </div>
      )}

      {celebrationMilestones.length > 0 && (
        <div
          role="status"
          aria-label="Milestone unlocked"
          className="rounded-2xl border border-accent-border bg-surface p-3.5"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-accent-border bg-accent-soft text-accent-text">
                <Award size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                  Milestone Reached
                </p>
                {celebrationMilestones.map((ms) => (
                  <div key={ms.id} className="mt-0.5">
                    <p className="text-[12px] font-semibold text-ink">{ms.title}</p>
                    <p className="text-[10px] text-ink-secondary">{ms.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToAchievements) {
                    onNavigateToAchievements();
                  } else {
                    onNavigateToProgress();
                  }
                }}
                className="text-[10px] font-semibold text-accent-text underline"
              >
                Achievements
              </button>
              <button
                type="button"
                aria-label="Dismiss milestone notification"
                onClick={() => setCelebrationMilestones([])}
                className={`${ui.btnGhost} size-6`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {celebrationPrs.length > 0 && (
        <div className="rounded-2xl border border-accent-border bg-accent-soft p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-accent text-on-accent">
                <Trophy size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-ink">New Personal Record!</p>
                <p className="text-[10px] text-ink-secondary">
                  {celebrationPrs
                    .map((pr) => `${pr.exerciseName}: ${pr.weightKg} kg × ${pr.reps}`)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateToProgress}
              className="shrink-0 text-[10px] font-semibold text-accent-text underline"
            >
              View PRs
            </button>
          </div>
        </div>
      )}

      {postWorkoutRecommendations.length > 0 && (
        <div
          role="region"
          aria-label="Next session progression suggestions"
          className={`${ui.card} space-y-2.5 p-3.5`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent-text">
                <Sparkles size={14} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-ink">
                  Next Session Targets
                </p>
                <p className="text-[9px] text-ink-secondary">
                  Saved routines remain unchanged unless you edit them directly
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPostWorkoutRecommendations([])}
              className="text-[10px] font-semibold text-ink-muted hover:text-ink"
            >
              Dismiss
            </button>
          </div>

          <div className="space-y-2">
            {postWorkoutRecommendations.map((rec) => (
              <div
                key={rec.exerciseKey}
                className="rounded-xl border border-line bg-subtle p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-ink">
                    {rec.exerciseName}
                  </p>
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
                <p className="mt-1 text-[10px] text-ink-secondary">
                  {rec.summaryText}
                </p>
                {rec.decision === "pending" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void respondToProgressionApi({
                          exerciseName: rec.exerciseName,
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
                      onClick={() =>
                        void respondToProgressionApi({
                          exerciseName: rec.exerciseName,
                          decision: "ignored",
                        })
                      }
                      className={`${ui.btnSecondary} min-h-8 rounded-lg px-2.5 text-[10px]`}
                    >
                      Ignore
                    </button>
                    <button
                      type="button"
                      onClick={onNavigateToProgress}
                      className="px-1.5 text-[10px] font-semibold text-accent-text underline"
                    >
                      Adjust in Progress
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {hubError && !isBuilderOpen && (
        <p
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11px] text-danger-text"
        >
          {hubError}
        </p>
      )}

      {/* TAB 1: MEMBER-OWNED PERSONAL ROUTINES */}
      {routineSection === "personal" && (
        <div className="space-y-3">
          {personalRoutines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-accent-border bg-accent-soft text-accent-text">
                <Dumbbell size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-ink">
                Build your own weekly routine
              </p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                Pick your training days, tap exercises from the searchable library, and train your way — no gym plan required.
              </p>
              <button
                type="button"
                onClick={openCreateRoutineModal}
                className={`${ui.btnPrimary} mt-4 min-h-10 px-4 text-[11px]`}
              >
                <Plus size={14} aria-hidden="true" />
                Create Personal Routine
              </button>
            </div>
          ) : (
            personalRoutines.map((routine) => {
              const isCurrentlyActive =
                activeSelection.mode !== "gym" && Boolean(routine.isActive);
              const normalizedDays = normalizeRoutineDays(routine);
              const trainingDays = normalizedDays.filter(
                (d) => !d.isRestDay && d.exercises.length > 0,
              );
              const chosenDay =
                selectedStartDayByRoutine[routine.id] &&
                trainingDays.some((d) => d.day === selectedStartDayByRoutine[routine.id])
                  ? selectedStartDayByRoutine[routine.id]
                  : trainingDays.find((d) => d.day === todayWeekday)?.day ??
                    trainingDays[0]?.day ??
                    "Sat";
              const chosenDayObj =
                trainingDays.find((d) => d.day === chosenDay) ?? null;
              const isExpanded = Boolean(expandedRoutineIds[routine.id]);

              return (
                <div
                  key={routine.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    isCurrentlyActive
                      ? "border-accent-border bg-surface"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isCurrentlyActive ? (
                          <span className={ui.badgeAccent}>
                            <CheckCircle2 size={10} aria-hidden="true" />
                            Active Routine
                          </span>
                        ) : (
                          <span className={ui.badgeNeutral}>Personal Routine</span>
                        )}
                        {routine.sourceGymPlanId && (
                          <span className={ui.badgeNeutral}>From Gym Plan</span>
                        )}
                      </div>
                      <h3 className="mt-1.5 truncate text-[15px] font-semibold text-ink">
                        {routine.title}
                      </h3>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">
                        {trainingDays.length > 0
                          ? `${trainingDays.length} ${trainingDays.length === 1 ? "day" : "days"}/week`
                          : `${routine.exercises.length} exercises`}{" "}
                        · {formatShortRelativeDate(routine.lastPerformedAt)}
                      </p>
                    </div>

                    {!isCurrentlyActive && (
                      <button
                        type="button"
                        disabled={busyRoutineId === `activate-${routine.id}`}
                        onClick={() =>
                          void runRoutineAction(
                            `activate-${routine.id}`,
                            { action: "set-active-routine", routineId: routine.id },
                            `"${routine.title}" is now your active routine.`,
                          )
                        }
                        className={`${ui.btnSecondary} min-h-8 shrink-0 px-2.5 text-[10px]`}
                      >
                        Set Active
                      </button>
                    )}
                  </div>

                  {/* Selectable Training Day Pills */}
                  {trainingDays.length > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {trainingDays.map((d) => {
                          const isSelected = d.day === chosenDay;
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() =>
                                setSelectedStartDayByRoutine((prev) => ({
                                  ...prev,
                                  [routine.id]: d.day,
                                }))
                              }
                              className={`rounded-xl border px-2.5 py-1 text-start transition-colors ${
                                isSelected
                                  ? "border-accent bg-accent-soft text-accent-text"
                                  : "border-line bg-subtle text-ink-secondary hover:text-ink"
                              }`}
                            >
                              <span className="block text-[9px] font-bold">{d.day}</span>
                              <span className="block max-w-[96px] truncate text-[8px]">
                                {d.focusLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Selected Day Exercise Preview */}
                  <ul className={`${ui.cardSubtle} mt-3 space-y-1.5 p-2.5`}>
                    {(chosenDayObj ? chosenDayObj.exercises : routine.exercises)
                      .slice(0, 4)
                      .map((ex, idx) => {
                        const rowDemoKey = `p-${routine.id}-${idx}-${ex.name}`;
                        const showRowDemo = routinePreviewExerciseKey === rowDemoKey;
                        return (
                          <li key={`${ex.name}-${idx}`} className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setRoutinePreviewExerciseKey(
                                  showRowDemo ? null : rowDemoKey,
                                )
                              }
                              className="flex w-full items-center justify-between gap-2 text-start text-[10px]"
                            >
                              <span className="truncate font-medium text-ink">
                                {ex.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span
                                  data-no-translate="true"
                                  className="text-ink-secondary"
                                >
                                  {ex.sets} × {ex.reps}
                                  {ex.targetWeightKg > 0
                                    ? ` · ${ex.targetWeightKg}kg`
                                    : ""}
                                </span>
                                <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-accent-text">
                                  {showRowDemo ? "Hide" : "Demo"}
                                </span>
                              </span>
                            </button>
                            {showRowDemo && (
                              <ExerciseDemoVisual
                                exerciseName={ex.name}
                                targetMuscleGroup={ex.muscle}
                                mediaCatalog={exerciseMediaCatalog}
                                compact
                              />
                            )}
                          </li>
                        );
                      })}
                    {(chosenDayObj ? chosenDayObj.exercises : routine.exercises).length > 4 && (
                      <li className="text-[9px] text-ink-muted">
                        +
                        {(chosenDayObj ? chosenDayObj.exercises : routine.exercises).length -
                          4}{" "}
                        more exercises
                      </li>
                    )}
                  </ul>

                  {/* Expandable Full 7-Day Split Overview */}
                  {routine.daySchedule && routine.daySchedule.length > 0 && (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRoutineIds((prev) => ({
                            ...prev,
                            [routine.id]: !prev[routine.id],
                          }))
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-secondary hover:text-ink"
                      >
                        {isExpanded ? (
                          <ChevronUp size={13} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={13} aria-hidden="true" />
                        )}
                        {isExpanded ? "Hide weekly schedule" : "View full weekly schedule"}
                      </button>

                      {isExpanded && (
                        <ul className={`${ui.cardSubtle} mt-2 divide-y divide-divider px-3 py-1`}>
                          {normalizedDays.map((d) => (
                            <li
                              key={d.day}
                              className="flex items-center justify-between gap-2 py-1.5 text-[10px]"
                            >
                              <span className="font-semibold text-ink">
                                {WEEKDAY_FULL_NAMES[d.day]}
                              </span>
                              <span
                                className={
                                  d.isRestDay
                                    ? "text-ink-muted"
                                    : "font-medium text-accent-text"
                                }
                              >
                                {d.isRestDay
                                  ? "Rest"
                                  : `${d.focusLabel} (${d.exercises.length})`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => startFromPersonalRoutine(routine, chosenDay)}
                    className={`${ui.btnPrimary} mt-3.5 min-h-10 w-full text-[11px]`}
                  >
                    <Play size={13} aria-hidden="true" />
                    {chosenDayObj && trainingDays.length > 1
                      ? `Start ${chosenDayObj.day} · ${chosenDayObj.focusLabel}`
                      : "Start Workout"}
                  </button>

                  {/* Routine Management Action Bar: Edit, Duplicate, Archive, Delete */}
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-divider pt-2.5">
                    <button
                      type="button"
                      onClick={() => openEditRoutineModal(routine)}
                      className={`${ui.btnGhost} min-h-8 gap-1 text-[10px] font-semibold`}
                    >
                      <Pencil size={12} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyRoutineId === `dup-${routine.id}`}
                      onClick={() =>
                        void runRoutineAction(
                          `dup-${routine.id}`,
                          { action: "duplicate-routine", routineId: routine.id },
                          "Routine duplicated.",
                        )
                      }
                      className={`${ui.btnGhost} min-h-8 gap-1 text-[10px] font-semibold`}
                    >
                      <Copy size={12} aria-hidden="true" />
                      Copy
                    </button>
                    <button
                      type="button"
                      disabled={busyRoutineId === `arch-${routine.id}`}
                      onClick={() =>
                        void runRoutineAction(
                          `arch-${routine.id}`,
                          { action: "archive-routine", routineId: routine.id },
                          "Routine archived.",
                        )
                      }
                      className={`${ui.btnGhost} min-h-8 gap-1 text-[10px] font-semibold`}
                    >
                      <Archive size={12} aria-hidden="true" />
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingRoutine(routine)}
                      className={`${ui.btnGhost} min-h-8 gap-1 text-[10px] font-semibold hover:text-danger-text`}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Archived Routines Section */}
          {archivedRoutines.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-subtle px-3.5 py-2.5 text-[11px] font-semibold text-ink-secondary hover:text-ink"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Archive size={13} aria-hidden="true" />
                  Archived Routines ({archivedRoutines.length})
                </span>
                {showArchived ? (
                  <ChevronUp size={14} aria-hidden="true" />
                ) : (
                  <ChevronDown size={14} aria-hidden="true" />
                )}
              </button>

              {showArchived && (
                <div className="mt-2 space-y-2">
                  {archivedRoutines.map((archived) => (
                    <div
                      key={archived.id}
                      className={`${ui.card} flex items-center justify-between gap-2 p-3.5`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {archived.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-muted">
                          {archived.exercises.length} exercises · Archived
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyRoutineId === `restore-${archived.id}`}
                          onClick={() =>
                            void runRoutineAction(
                              `restore-${archived.id}`,
                              { action: "unarchive-routine", routineId: archived.id },
                              "Routine restored to My Routines.",
                            )
                          }
                          className={`${ui.btnSecondary} min-h-8 px-2.5 text-[10px]`}
                        >
                          <ArchiveRestore size={12} aria-hidden="true" />
                          Restore
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${archived.title}`}
                          onClick={() => setDeletingRoutine(archived)}
                          className={`${ui.btnGhost} size-8 hover:text-danger-text`}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GYM & TRAINER ROUTINES (PRESERVED + BROWSE & NON-DESTRUCTIVE SELECT) */}
      {routineSection === "gym" && (
        <div className="space-y-3.5">
          {upcomingSessions.length > 0 && (
            <div className={`${ui.card} p-3.5`}>
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-accent-text" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                  Scheduled 1-on-1 Coaching
                </p>
              </div>
              <ul className="mt-2 space-y-1.5">
                {upcomingSessions.slice(0, 3).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-[10px]"
                  >
                    <span className="truncate font-semibold text-ink">
                      {s.title} · {s.trainerName}
                    </span>
                    <span className="shrink-0 font-medium text-ink-secondary">
                      {formatCoachSessionTime(s.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allGymRoutines.length > 0 ? (
            <>
              <p className="px-1 text-[10px] text-ink-secondary">
                Browse routines provided by your gym. Selecting or starting a gym routine never replaces or deletes your personal routines.
              </p>
              {allGymRoutines.map((plan) => {
                const isSelectedActive =
                  activeSelection.mode === "gym" && activeSelection.gymPlanId === plan.id;

                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl border p-4 ${
                      isSelectedActive
                        ? "border-accent-border bg-surface"
                        : "border-line bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {plan.isAssignedByGym ? (
                            <span className={ui.badgeAccent}>
                              <Sparkles size={10} aria-hidden="true" />
                              Assigned by Coach
                            </span>
                          ) : plan.createdByRole === "trainer" ? (
                            <span className={ui.badgeAccent}>Coach Routine</span>
                          ) : (
                            <span className={ui.badgeNeutral}>Gym Routine</span>
                          )}
                          {isSelectedActive && (
                            <span className={ui.badgeAccent}>
                              <CheckCircle2 size={10} aria-hidden="true" />
                              Active
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 text-[16px] font-semibold text-ink">
                          {plan.title}
                        </h3>
                        <p className="mt-0.5 text-[10px] text-ink-secondary">
                          {plan.createdByRole === "trainer" && plan.createdByName
                            ? `Coach ${plan.createdByName} · ${plan.targetGoal}`
                            : plan.isAssignedByGym && trainer
                              ? `Coach ${trainer.name} · ${plan.targetGoal}`
                              : plan.targetGoal}
                        </p>
                        {plan.scheduledDays && plan.scheduledDays.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {plan.scheduledDays.map((day) => (
                              <span
                                key={day}
                                className="rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[9px] font-semibold text-ink-secondary"
                              >
                                {day}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={ui.badgeNeutral}>
                        {plan.exercises.length}{" "}
                        {plan.exercises.length === 1 ? "exercise" : "exercises"}
                      </span>
                    </div>

                    <ul className={`${ui.cardSubtle} mt-3.5 divide-y divide-divider px-3`}>
                      {plan.exercises.map((ex, idx) => {
                        const gymRowKey = `g-${plan.id}-${idx}-${ex.name}`;
                        const showGymDemo = routinePreviewExerciseKey === gymRowKey;
                        return (
                          <li key={ex.id} className="space-y-2 py-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setRoutinePreviewExerciseKey(
                                  showGymDemo ? null : gymRowKey,
                                )
                              }
                              className="flex w-full items-center justify-between gap-2 text-start"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold text-ink">
                                  {idx + 1}. {ex.name}
                                </p>
                                <p className="text-[9px] text-ink-secondary">
                                  {ex.day ? `${ex.day} · ` : ""}
                                  {ex.sets} sets · {ex.reps} reps
                                  {ex.targetWeightKg && ex.targetWeightKg > 0
                                    ? ` · ${ex.targetWeightKg} kg`
                                    : ""}{" "}
                                  · {ex.rest} rest
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className={ui.badgeNeutral}>{ex.muscle}</span>
                                <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-accent-text">
                                  {showGymDemo ? "Hide" : "Demo"}
                                </span>
                              </div>
                            </button>
                            {showGymDemo && (
                              <ExerciseDemoVisual
                                exerciseName={ex.name}
                                targetMuscleGroup={ex.muscle}
                                mediaCatalog={exerciseMediaCatalog}
                                compact
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-3.5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => startFromGymPlan(plan)}
                        className={`${ui.btnPrimary} min-h-10 px-3 text-[11px]`}
                      >
                        <Play size={13} aria-hidden="true" />
                        Start Workout
                      </button>
                      <button
                        type="button"
                        disabled={busyRoutineId === `select-gym-${plan.id}`}
                        onClick={() =>
                          void runRoutineAction(
                            `select-gym-${plan.id}`,
                            {
                              action: "select-gym-routine",
                              workoutPlanId: isSelectedActive ? "" : plan.id,
                            },
                            isSelectedActive
                              ? "Stopped following gym routine. Your personal routines remain ready."
                              : `Following "${plan.title}". Your personal routines remain saved.`,
                          )
                        }
                        className={`${ui.btnSecondary} min-h-10 px-3 text-[11px]`}
                      >
                        {isSelectedActive ? "Unselect Active" : "Set as Active"}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={busyRoutineId === `copy-gym-${plan.id}`}
                      onClick={() =>
                        void runRoutineAction(
                          `copy-gym-${plan.id}`,
                          { action: "duplicate-gym-plan", workoutPlanId: plan.id },
                          `Copied "${plan.title}" to My Routines so you can customize it.`,
                        )
                      }
                      className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-subtle py-2 text-[10px] font-semibold text-ink-secondary transition-colors hover:text-ink"
                    >
                      <Copy size={12} aria-hidden="true" />
                      Copy to My Routines to Customize
                    </button>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-line bg-subtle text-ink-secondary">
                <Dumbbell size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-ink">
                No gym routines published yet
              </p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                You don&apos;t need to wait for a gym plan — build and follow your own personal routine anytime.
              </p>
              <button
                type="button"
                onClick={openCreateRoutineModal}
                className={`${ui.btnPrimary} mt-4 min-h-10 px-4 text-[11px]`}
              >
                <Plus size={14} aria-hidden="true" />
                Create Personal Routine
              </button>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PERSONAL ROUTINE BUILDER MODAL (WEEKLY SPLIT + EXERCISE CONFIG)     */}
      {/* =================================================================== */}
      {isBuilderOpen && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSavingRoutine) {
              setIsBuilderOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="routine-builder-title"
            className="flex max-h-[94%] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-center justify-between border-b border-divider px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                  {editingRoutineId ? "Edit Routine" : "Personal Routine Builder"}
                </p>
                <h3 id="routine-builder-title" className="text-[16px] font-semibold text-ink">
                  {editingRoutineId ? "Customize Routine" : "New Personal Routine"}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close routine builder"
                onClick={() => setIsBuilderOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            <form
              onSubmit={savePersonalRoutine}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {hubError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11px] text-danger-text"
                  >
                    {hubError}
                  </p>
                )}

                {/* 1. Routine Name (The ONLY text field required!) */}
                <div>
                  <label
                    htmlFor="routine-title-input"
                    className="mb-1 block text-[10px] font-semibold text-ink-secondary"
                  >
                    Routine Name
                  </label>
                  <input
                    id="routine-title-input"
                    required
                    maxLength={80}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g. My 4-Day Split, Push / Pull / Legs"
                    className={`${ui.input} min-h-10`}
                  />

                  {/* Optional 1-Tap Quick Split Templates for instant setup */}
                  {!editingRoutineId && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-medium text-ink-muted">
                        Quick start:
                      </span>
                      {QUICK_SPLIT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyQuickSplitPreset(preset)}
                          className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[9px] font-semibold text-ink-secondary transition-colors hover:border-accent hover:text-accent-text"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Weekly Training Day Selector (Sat -> Fri) */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-ink-secondary">
                      Weekly Schedule
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowWeeklyOverviewInBuilder((v) => !v)}
                      className="text-[9px] font-semibold text-accent-text hover:underline"
                    >
                      {showWeeklyOverviewInBuilder ? "Hide week summary" : "View all 7 days"}
                    </button>
                  </div>

                  <div
                    role="tablist"
                    aria-label="Select day of week"
                    className="grid grid-cols-7 gap-1"
                  >
                    {draftDays.map((d) => {
                      const isSelected = d.day === selectedBuilderDay;
                      const isTraining = !d.isRestDay && d.exercises.length > 0;
                      return (
                        <button
                          key={d.day}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => setSelectedBuilderDay(d.day)}
                          className={`flex flex-col items-center rounded-xl border py-2 text-center transition-colors ${
                            isSelected
                              ? "border-accent bg-accent text-on-accent"
                              : isTraining
                                ? "border-accent-border bg-accent-soft text-accent-text"
                                : "border-line bg-surface text-ink-secondary hover:text-ink"
                          }`}
                        >
                          <span className="text-[10px] font-bold">{d.day}</span>
                          <span
                            className={`mt-0.5 text-[8px] ${
                              isSelected
                                ? "text-on-accent"
                                : isTraining
                                  ? "text-accent-text"
                                  : "text-ink-muted"
                            }`}
                          >
                            {d.isRestDay
                              ? "Rest"
                              : d.exercises.length > 0
                                ? `${d.exercises.length} ex`
                                : "Train"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Compact 7-Day Split Overview (e.g. Saturday: Chest & Triceps, Monday: Rest) */}
                  {showWeeklyOverviewInBuilder && (
                    <ul className={`${ui.cardSubtle} mt-2 divide-y divide-divider px-3 py-1`}>
                      {draftDays.map((d) => {
                        const label =
                          d.isRestDay || d.exercises.length === 0
                            ? "Rest"
                            : d.customFocusLabel.trim() ||
                              computeAutoFocusLabel(d.exercises);
                        return (
                          <li key={d.day} className="py-1">
                            <button
                              type="button"
                              onClick={() => setSelectedBuilderDay(d.day)}
                              className="flex w-full items-center justify-between gap-2 text-start text-[10px]"
                            >
                              <span
                                className={`font-semibold ${
                                  d.day === selectedBuilderDay
                                    ? "text-accent-text"
                                    : "text-ink"
                                }`}
                              >
                                {WEEKDAY_FULL_NAMES[d.day]}
                              </span>
                              <span
                                className={
                                  label === "Rest"
                                    ? "text-ink-muted"
                                    : "truncate font-medium text-ink-secondary"
                                }
                              >
                                {label === "Rest"
                                  ? "Rest"
                                  : `${label} · ${d.exercises.length} ex`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* 3. Selected Day Configuration Card */}
                <div className={`${ui.card} p-3.5`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        {WEEKDAY_FULL_NAMES[selectedBuilderDay]}
                      </p>
                      <p className="text-[10px] text-ink-secondary">
                        {currentBuilderDayObj.isRestDay
                          ? "Scheduled as a recovery / rest day"
                          : currentBuilderDayObj.exercises.length > 0
                            ? currentBuilderDayObj.customFocusLabel.trim() ||
                              computeAutoFocusLabel(currentBuilderDayObj.exercises)
                            : "Tap + Add Exercises to build this day"}
                      </p>
                    </div>

                    {/* Simple Training Day vs. Rest Day Switch */}
                    <div className="inline-flex rounded-xl border border-line bg-subtle p-0.5">
                      <button
                        type="button"
                        onClick={() => toggleDayTrainingState(selectedBuilderDay, true)}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          !currentBuilderDayObj.isRestDay
                            ? "bg-accent text-on-accent"
                            : "text-ink-secondary hover:text-ink"
                        }`}
                      >
                        Train
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDayTrainingState(selectedBuilderDay, false)}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          currentBuilderDayObj.isRestDay
                            ? "bg-elevated text-ink"
                            : "text-ink-secondary hover:text-ink"
                        }`}
                      >
                        Rest
                      </button>
                    </div>
                  </div>

                  {currentBuilderDayObj.isRestDay ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-subtle px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-[11px] text-ink-secondary">
                        <Moon size={14} className="text-ink-muted" aria-hidden="true" />
                        Rest &amp; recovery day
                      </span>
                      <button
                        type="button"
                        onClick={() => openExercisePickerForDay(selectedBuilderDay)}
                        className="text-[10px] font-semibold text-accent-text hover:underline"
                      >
                        + Add exercises instead
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {currentBuilderDayObj.exercises.length > 0 && (
                        <input
                          type="text"
                          maxLength={60}
                          value={currentBuilderDayObj.customFocusLabel}
                          onChange={(e) =>
                            updateDayFocusLabel(selectedBuilderDay, e.target.value)
                          }
                          placeholder={`Day label: ${computeAutoFocusLabel(
                            currentBuilderDayObj.exercises,
                          )} (optional)`}
                          aria-label={`${WEEKDAY_FULL_NAMES[selectedBuilderDay]} focus label`}
                          className={`${ui.inputCompact} min-h-8`}
                        />
                      )}

                      {/* Assigned Exercises List on Selected Day */}
                      {currentBuilderDayObj.exercises.map((ex, idx) => {
                        const isDemoOpen = builderDemoExerciseKey === ex.key;
                        return (
                        <div
                          key={ex.key}
                          className="rounded-xl border border-line bg-subtle p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-ink">
                                {idx + 1}. {ex.name}
                              </p>
                              <p className="text-[9px] text-ink-muted">{ex.muscle}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setBuilderDemoExerciseKey(
                                    isDemoOpen ? null : ex.key,
                                  )
                                }
                                className="rounded-lg border border-line bg-surface px-2 py-1 text-[9px] font-semibold text-accent-text hover:bg-hover"
                              >
                                {isDemoOpen ? "Hide demo" : "Demo"}
                              </button>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  moveDraftExerciseOnDay(selectedBuilderDay, idx, -1)
                                }
                                aria-label={`Move ${ex.name} up`}
                                className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-hover disabled:opacity-30"
                              >
                                <ArrowUp size={13} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  idx === currentBuilderDayObj.exercises.length - 1
                                }
                                onClick={() =>
                                  moveDraftExerciseOnDay(selectedBuilderDay, idx, 1)
                                }
                                aria-label={`Move ${ex.name} down`}
                                className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-hover disabled:opacity-30"
                              >
                                <ArrowDown size={13} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeDraftExerciseFromDay(selectedBuilderDay, ex.key)
                                }
                                aria-label={`Remove ${ex.name}`}
                                className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-danger-soft hover:text-danger-text"
                              >
                                <X size={13} aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {isDemoOpen && (
                            <div className="mt-2.5">
                              <ExerciseDemoVisual
                                exerciseName={ex.name}
                                targetMuscleGroup={ex.muscle}
                                mediaCatalog={exerciseMediaCatalog}
                                compact
                              />
                            </div>
                          )}

                          {/* Simple Uniform Controls OR Per-Set Configuration */}
                          {!ex.useCustomSets ? (
                            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                              <div>
                                <span className="mb-0.5 block text-[8px] font-semibold uppercase text-ink-muted">
                                  Sets
                                </span>
                                <div className="flex min-h-8 items-center justify-between rounded-lg border border-line-strong bg-input px-1">
                                  <button
                                    type="button"
                                    aria-label={`Decrease sets for ${ex.name}`}
                                    onClick={() =>
                                      adjustDraftExerciseSets(selectedBuilderDay, ex.key, -1)
                                    }
                                    className="grid size-6 place-items-center text-ink-secondary hover:text-ink"
                                  >
                                    <Minus size={11} aria-hidden="true" />
                                  </button>
                                  <span
                                    data-no-translate="true"
                                    className="text-[11px] font-bold text-ink"
                                  >
                                    {ex.sets}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Increase sets for ${ex.name}`}
                                    onClick={() =>
                                      adjustDraftExerciseSets(selectedBuilderDay, ex.key, 1)
                                    }
                                    className="grid size-6 place-items-center text-ink-secondary hover:text-ink"
                                  >
                                    <Plus size={11} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>

                              <label className="block">
                                <span className="mb-0.5 block text-[8px] font-semibold uppercase text-ink-muted">
                                  Reps
                                </span>
                                <input
                                  type="text"
                                  maxLength={16}
                                  value={ex.reps}
                                  onChange={(e) =>
                                    updateDraftExerciseOnDay(
                                      selectedBuilderDay,
                                      ex.key,
                                      (cur) => ({ ...cur, reps: e.target.value }),
                                    )
                                  }
                                  className={`${ui.inputCompact} min-h-8 px-1.5 text-center font-semibold`}
                                />
                              </label>

                              <label className="block">
                                <span className="mb-0.5 block text-[8px] font-semibold uppercase text-ink-muted">
                                  Weight kg
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={1000}
                                  step="0.5"
                                  placeholder="—"
                                  value={ex.targetWeightKg}
                                  onChange={(e) =>
                                    updateDraftExerciseOnDay(
                                      selectedBuilderDay,
                                      ex.key,
                                      (cur) => ({ ...cur, targetWeightKg: e.target.value }),
                                    )
                                  }
                                  className={`${ui.inputCompact} min-h-8 px-1.5 text-center font-semibold`}
                                />
                              </label>

                              <label className="block">
                                <span className="mb-0.5 block text-[8px] font-semibold uppercase text-ink-muted">
                                  Rest
                                </span>
                                <select
                                  value={ex.restSeconds}
                                  onChange={(e) =>
                                    updateDraftExerciseOnDay(
                                      selectedBuilderDay,
                                      ex.key,
                                      (cur) => ({
                                        ...cur,
                                        restSeconds: Number.parseInt(e.target.value, 10) || 60,
                                      }),
                                    )
                                  }
                                  className={`${ui.inputCompact} min-h-8 px-1 font-semibold`}
                                >
                                  {REST_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ) : (
                            <div className="mt-2.5 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-semibold text-accent-text">
                                  Individual Set Targets
                                </span>
                                <select
                                  aria-label={`Rest duration for ${ex.name}`}
                                  value={ex.restSeconds}
                                  onChange={(e) =>
                                    updateDraftExerciseOnDay(
                                      selectedBuilderDay,
                                      ex.key,
                                      (cur) => ({
                                        ...cur,
                                        restSeconds: Number.parseInt(e.target.value, 10) || 60,
                                      }),
                                    )
                                  }
                                  className="rounded-lg border border-line-strong bg-input px-2 py-0.5 text-[10px] font-semibold text-ink"
                                >
                                  {REST_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      Rest {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {ex.setPlans.slice(0, ex.sets).map((sp, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="grid grid-cols-[44px_1fr_1fr] items-center gap-1.5"
                                >
                                  <span
                                    data-no-translate="true"
                                    className="text-[10px] font-semibold text-ink-secondary"
                                  >
                                    Set {sIdx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    maxLength={16}
                                    aria-label={`${ex.name} Set ${sIdx + 1} target reps`}
                                    placeholder="Reps"
                                    value={sp.reps}
                                    onChange={(e) =>
                                      updateDraftExerciseOnDay(
                                        selectedBuilderDay,
                                        ex.key,
                                        (cur) => {
                                          const nextPlans = cur.setPlans.map((p, idxP) =>
                                            idxP === sIdx
                                              ? { ...p, reps: e.target.value }
                                              : p,
                                          );
                                          return { ...cur, setPlans: nextPlans };
                                        },
                                      )
                                    }
                                    className={`${ui.inputCompact} min-h-8 text-center font-semibold`}
                                  />
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    max={1000}
                                    step="0.5"
                                    aria-label={`${ex.name} Set ${sIdx + 1} target weight kg`}
                                    placeholder="kg"
                                    value={sp.targetWeightKg}
                                    onChange={(e) =>
                                      updateDraftExerciseOnDay(
                                        selectedBuilderDay,
                                        ex.key,
                                        (cur) => {
                                          const nextPlans = cur.setPlans.map((p, idxP) =>
                                            idxP === sIdx
                                              ? { ...p, targetWeightKg: e.target.value }
                                              : p,
                                          );
                                          return { ...cur, setPlans: nextPlans };
                                        },
                                      )
                                    }
                                    className={`${ui.inputCompact} min-h-8 text-center font-semibold`}
                                  />
                                </div>
                              ))}

                              <div className="flex items-center gap-3 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustDraftExerciseSets(selectedBuilderDay, ex.key, 1)
                                  }
                                  className="text-[10px] font-semibold text-accent-text hover:underline"
                                >
                                  + Add set
                                </button>
                                {ex.sets > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      adjustDraftExerciseSets(selectedBuilderDay, ex.key, -1)
                                    }
                                    className="text-[10px] font-semibold text-ink-muted hover:text-ink"
                                  >
                                    − Remove last set
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Optional Toggles: Per-Set Targets & Exercise Note */}
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftExerciseOnDay(
                                  selectedBuilderDay,
                                  ex.key,
                                  (cur) => {
                                    const enabling = !cur.useCustomSets;
                                    const syncedPlans = Array.from(
                                      { length: cur.sets },
                                      (_, sIdx) => ({
                                        reps: cur.setPlans[sIdx]?.reps || cur.reps || "10",
                                        targetWeightKg:
                                          cur.setPlans[sIdx]?.targetWeightKg ??
                                          cur.targetWeightKg ??
                                          "",
                                      }),
                                    );
                                    return {
                                      ...cur,
                                      useCustomSets: enabling,
                                      setPlans: syncedPlans,
                                    };
                                  },
                                )
                              }
                              className="inline-flex items-center gap-1 text-[9px] font-semibold text-ink-secondary hover:text-accent-text"
                            >
                              <SlidersHorizontal size={11} aria-hidden="true" />
                              {ex.useCustomSets ? "Use uniform sets" : "Customize each set"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateDraftExerciseOnDay(
                                  selectedBuilderDay,
                                  ex.key,
                                  (cur) => ({ ...cur, showNotes: !cur.showNotes }),
                                )
                              }
                              className="inline-flex items-center gap-1 text-[9px] font-semibold text-ink-secondary hover:text-accent-text"
                            >
                              <StickyNote size={11} aria-hidden="true" />
                              {ex.showNotes ? "Hide note" : "+ Add note"}
                            </button>
                          </div>

                          {ex.showNotes && (
                            <input
                              type="text"
                              maxLength={160}
                              value={ex.notes}
                              onChange={(e) =>
                                updateDraftExerciseOnDay(
                                  selectedBuilderDay,
                                  ex.key,
                                  (cur) => ({ ...cur, notes: e.target.value }),
                                )
                              }
                              placeholder="Optional note (e.g. pause 1s at bottom, seat #4)"
                              aria-label={`Notes for ${ex.name}`}
                              className={`${ui.inputCompact} mt-2 min-h-8`}
                            />
                          )}
                        </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => openExercisePickerForDay(selectedBuilderDay)}
                        className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent-border bg-accent-soft px-3 text-[11px] font-semibold text-accent-text transition-colors hover:bg-hover"
                      >
                        <Plus size={14} aria-hidden="true" />
                        Add Exercises to {WEEKDAY_FULL_NAMES[selectedBuilderDay]}
                      </button>
                    </div>
                  )}
                </div>

                {/* Set as Active Routine Toggle */}
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2.5">
                  <div>
                    <p className="text-[11px] font-semibold text-ink">
                      Set as my active routine
                    </p>
                    <p className="text-[9px] text-ink-secondary">
                      Highlights today&apos;s scheduled workout at the top of Workouts
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftSetActive}
                    onChange={(e) => setDraftSetActive(e.target.checked)}
                    className="size-4 accent-accent"
                  />
                </label>
              </div>

              <footer className="grid grid-cols-2 gap-2.5 border-t border-divider bg-surface px-5 py-3.5">
                <button
                  type="button"
                  disabled={isSavingRoutine}
                  onClick={() => setIsBuilderOpen(false)}
                  className={`${ui.btnSecondary} min-h-11 px-3 text-[11px]`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRoutine}
                  className={`${ui.btnPrimary} min-h-11 px-3 text-[12px]`}
                >
                  {isSavingRoutine && (
                    <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                  )}
                  {isSavingRoutine
                    ? "Saving…"
                    : editingRoutineId
                      ? "Save Changes"
                      : "Save Routine"}
                </button>
              </footer>
            </form>
          </div>

          {/* =============================================================== */}
          {/* SEARCHABLE MULTI-SELECT EXERCISE SELECTOR SHEET                 */}
          {/* =============================================================== */}
          {isPickerOpen && (
            <div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-backdrop p-0 sm:items-center sm:p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setIsPickerOpen(false);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="exercise-selector-title"
                className="flex max-h-[92%] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
              >
                <header className="flex items-center justify-between border-b border-divider px-5 py-3.5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                      {WEEKDAY_FULL_NAMES[selectedBuilderDay]}
                    </p>
                    <h4
                      id="exercise-selector-title"
                      className="text-[15px] font-semibold text-ink"
                    >
                      Select Exercises
                    </h4>
                  </div>
                  <button
                    type="button"
                    aria-label="Close exercise selector"
                    onClick={() => setIsPickerOpen(false)}
                    className={`${ui.btnGhost} size-8`}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>

                <div className="border-b border-divider px-4 py-3">
                  <div className="relative">
                    <Search
                      size={14}
                      aria-hidden="true"
                      className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <input
                      type="search"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="Search exercises or muscle group..."
                      aria-label="Search exercises"
                      className={`${ui.inputCompact} min-h-10 rounded-xl ps-9`}
                    />
                  </div>

                  {/* Muscle Filter Chips */}
                  <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
                    {["All", ...MUSCLE_GROUPS].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPickerMuscle(m)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          pickerMuscle === m
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-surface text-ink-secondary hover:text-ink"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
                  {filteredExerciseLibrary.map((lib) => {
                    const isSelected = pickerSelectedNames.includes(lib.name);
                    const prev = exerciseDefaults[lib.name.toLowerCase()];
                    const isPreviewOpen = pickerPreviewName === lib.name;
                    return (
                      <div
                        key={lib.name}
                        className={`space-y-2 rounded-xl border p-3 transition-colors ${
                          isSelected
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-surface hover:bg-hover"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => togglePickerSelection(lib.name)}
                            className="min-w-0 flex-1 text-start"
                          >
                            <p className="truncate text-[12px] font-semibold text-ink">
                              {lib.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-secondary">
                              {lib.muscle} · {lib.equipment} · {lib.defaultSets} × {lib.defaultReps}
                              {prev && prev.bestWeightKg > 0
                                ? ` · PR ${prev.bestWeightKg}kg`
                                : ""}
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPickerPreviewName(isPreviewOpen ? null : lib.name)
                              }
                              className="rounded-lg border border-line bg-subtle px-2 py-1 text-[9px] font-semibold text-accent-text hover:bg-hover"
                            >
                              {isPreviewOpen ? "Hide" : "Demo"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Select ${lib.name}`}
                              aria-pressed={isSelected}
                              onClick={() => togglePickerSelection(lib.name)}
                              className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                                isSelected
                                  ? "border-accent bg-accent text-on-accent"
                                  : "border-line-strong bg-subtle text-transparent"
                              }`}
                            >
                              <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {isPreviewOpen && (
                          <ExerciseDemoVisual
                            exerciseName={lib.name}
                            targetMuscleGroup={lib.muscle}
                            mediaCatalog={exerciseMediaCatalog}
                            compact
                          />
                        )}
                      </div>
                    );
                  })}

                  {pickerQuery.trim() &&
                    !EXERCISE_LIBRARY.some(
                      (l) => l.name.toLowerCase() === pickerQuery.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() => togglePickerSelection(pickerQuery.trim())}
                        className="flex w-full items-center justify-between rounded-xl border border-dashed border-accent-border bg-accent-soft p-3 text-start"
                      >
                        <div>
                          <p className="text-[12px] font-semibold text-accent-text">
                            + Add &ldquo;{pickerQuery.trim()}&rdquo;
                          </p>
                          <p className="text-[10px] text-ink-secondary">
                            Add custom exercise to {WEEKDAY_FULL_NAMES[selectedBuilderDay]}
                          </p>
                        </div>
                        {pickerSelectedNames.includes(pickerQuery.trim()) && (
                          <Check size={15} className="text-accent-text" aria-hidden="true" />
                        )}
                      </button>
                    )}
                </div>

                <footer className="border-t border-divider bg-surface px-4 py-3">
                  <button
                    type="button"
                    disabled={pickerSelectedNames.length === 0}
                    onClick={confirmAddSelectedExercises}
                    className={`${ui.btnPrimary} min-h-11 w-full text-[12px]`}
                  >
                    {pickerSelectedNames.length > 0
                      ? `Add ${pickerSelectedNames.length} ${
                          pickerSelectedNames.length === 1 ? "Exercise" : "Exercises"
                        } to ${WEEKDAY_FULL_NAMES[selectedBuilderDay]}`
                      : "Tap exercises above to select"}
                  </button>
                </footer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* POST-CHECK-IN "READY TO TRAIN?" WORKOUT ENTRY SHEET                 */}
      {/* =================================================================== */}
      {isEntryModalOpen && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsEntryModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-entry-title"
            className="flex max-h-[92%] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-center justify-between border-b border-divider px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                  Ready to train? · {WEEKDAY_FULL_NAMES[todayWeekday]}
                </p>
                <h3
                  id="workout-entry-title"
                  className="mt-0.5 text-[16px] font-semibold text-ink"
                >
                  {hasScheduledPersonalToday && activeTodaySchedule
                    ? `${activePersonalRoutine!.title} · ${activeTodaySchedule.focusLabel}`
                    : hasScheduledGymToday && selectedGymRoutine
                      ? selectedGymRoutine.title
                      : `No workout scheduled for ${WEEKDAY_FULL_NAMES[todayWeekday]}`}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close workout entry"
                onClick={() => setIsEntryModalOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              {/* Case A: Active Personal Routine has a scheduled workout today */}
              {hasScheduledPersonalToday &&
                activePersonalRoutine &&
                activeTodaySchedule && (
                  <div className={`${ui.card} p-3.5`}>
                    <div className="flex items-center justify-between">
                      <span className={ui.badgeAccent}>
                        <CheckCircle2 size={10} aria-hidden="true" />
                        Today&apos;s Scheduled Split
                      </span>
                      <span className="text-[10px] text-ink-secondary">
                        {activeTodaySchedule.exercises.length}{" "}
                        {activeTodaySchedule.exercises.length === 1
                          ? "exercise"
                          : "exercises"}
                      </span>
                    </div>

                    <ol className={`${ui.cardSubtle} mt-3 divide-y divide-divider px-3`}>
                      {activeTodaySchedule.exercises.map((ex, idx) => {
                        const prev = exerciseDefaults[ex.name.trim().toLowerCase()];
                        return (
                          <li
                            key={`${ex.name}-${idx}`}
                            className="flex items-center justify-between gap-2 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-ink">
                                {idx + 1}. {ex.name}
                              </p>
                              <p className="text-[10px] text-ink-secondary">
                                {ex.sets} sets × {ex.reps} reps
                                {prev && prev.lastWeightKg > 0
                                  ? ` · Last: ${prev.lastWeightKg} kg × ${prev.lastReps}`
                                  : ex.targetWeightKg > 0
                                    ? ` · Target: ${ex.targetWeightKg} kg`
                                    : ""}
                              </p>
                            </div>
                            <span className={ui.badgeNeutral}>{ex.muscle}</span>
                          </li>
                        );
                      })}
                    </ol>

                    <button
                      type="button"
                      onClick={() =>
                        startFromPersonalRoutine(activePersonalRoutine, todayWeekday)
                      }
                      className={`${ui.btnPrimary} mt-3.5 min-h-11 w-full text-[12px]`}
                    >
                      <Play size={14} aria-hidden="true" />
                      Start Workout Now
                    </button>
                  </div>
                )}

              {/* Case B: Following a Gym Routine */}
              {hasScheduledGymToday && selectedGymRoutine && (
                <div className={`${ui.card} p-3.5`}>
                  <div className="flex items-center justify-between">
                    <span className={ui.badgeAccent}>
                      <CheckCircle2 size={10} aria-hidden="true" />
                      Active Gym Routine
                    </span>
                    <span className="text-[10px] text-ink-secondary">
                      {selectedGymRoutine.exercises.length} exercises
                    </span>
                  </div>

                  <ol className={`${ui.cardSubtle} mt-3 divide-y divide-divider px-3`}>
                    {selectedGymRoutine.exercises.map((ex, idx) => {
                      const prev = exerciseDefaults[ex.name.trim().toLowerCase()];
                      return (
                        <li
                          key={ex.id}
                          className="flex items-center justify-between gap-2 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-ink">
                              {idx + 1}. {ex.name}
                            </p>
                            <p className="text-[10px] text-ink-secondary">
                              {ex.sets} sets × {ex.reps} reps
                              {prev && prev.lastWeightKg > 0
                                ? ` · Last: ${prev.lastWeightKg} kg × ${prev.lastReps}`
                                : ""}
                            </p>
                          </div>
                          <span className={ui.badgeNeutral}>{ex.muscle}</span>
                        </li>
                      );
                    })}
                  </ol>

                  <button
                    type="button"
                    onClick={() => startFromGymPlan(selectedGymRoutine)}
                    className={`${ui.btnPrimary} mt-3.5 min-h-11 w-full text-[12px]`}
                  >
                    <Play size={14} aria-hidden="true" />
                    Start Workout Now
                  </button>
                </div>
              )}

              {/* Case C: No workout scheduled today OR user wants another option */}
              {!hasAnyScheduledToday && (
                <div className="rounded-2xl border border-line bg-surface p-3.5">
                  <p className="text-[12px] font-semibold text-ink">
                    {activePersonalRoutine
                      ? `Today is a rest day on "${activePersonalRoutine.title}"`
                      : "No active workout scheduled for today"}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-secondary">
                    Start an unscheduled session right away or pick any saved routine below.
                  </p>
                  <button
                    type="button"
                    onClick={startFreeWorkout}
                    className={`${ui.btnPrimary} mt-3 min-h-11 w-full text-[12px]`}
                  >
                    <Zap size={14} aria-hidden="true" />
                    Start Free Workout
                  </button>
                </div>
              )}

              {hasAnyScheduledToday && (
                <button
                  type="button"
                  onClick={() => setShowAlternativeRoutinesInEntry((v) => !v)}
                  className="inline-flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-ink-secondary hover:text-ink"
                >
                  {showAlternativeRoutinesInEntry
                    ? "Hide other options"
                    : "Choose another routine or start free workout"}
                  {showAlternativeRoutinesInEntry ? (
                    <ChevronUp size={13} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={13} aria-hidden="true" />
                  )}
                </button>
              )}

              {(!hasAnyScheduledToday || showAlternativeRoutinesInEntry) && (
                <div className="space-y-2">
                  {hasAnyScheduledToday && (
                    <button
                      type="button"
                      onClick={startFreeWorkout}
                      className={`${ui.btnSecondary} min-h-10 w-full text-[11px]`}
                    >
                      <Zap size={13} className="text-accent-text" aria-hidden="true" />
                      Start Free Workout
                    </button>
                  )}

                  {personalRoutines.map((routine) => {
                    const days = normalizeRoutineDays(routine).filter(
                      (d) => !d.isRestDay && d.exercises.length > 0,
                    );
                    return (
                      <div key={routine.id} className={`${ui.card} p-3`}>
                        <p className="text-[12px] font-semibold text-ink">
                          {routine.title}
                        </p>
                        {days.length > 1 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {days.map((d) => (
                              <button
                                key={d.day}
                                type="button"
                                onClick={() => startFromPersonalRoutine(routine, d.day)}
                                className="rounded-xl border border-line-strong bg-subtle px-2.5 py-1.5 text-start text-[10px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent-text"
                              >
                                {d.day} · {d.focusLabel}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startFromPersonalRoutine(routine)}
                            className={`${ui.btnSecondary} mt-2 min-h-9 w-full text-[10px]`}
                          >
                            <Play size={12} aria-hidden="true" />
                            Start {routine.title}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {allGymRoutines.map((plan) => (
                    <div
                      key={plan.id}
                      className={`${ui.card} flex items-center justify-between gap-2 p-3`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {plan.title}
                        </p>
                        <p className="text-[10px] text-ink-secondary">
                          Gym routine · {plan.exercises.length} exercises
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startFromGymPlan(plan)}
                        className={`${ui.btnSecondary} min-h-9 shrink-0 px-3 text-[10px]`}
                      >
                        Start
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DELETE ROUTINE CONFIRMATION DIALOG                                  */}
      {/* =================================================================== */}
      {deletingRoutine && (
        <div
          className={ui.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isDeletingRoutine) {
              setDeletingRoutine(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-routine-title"
            className={`${ui.modalCard} max-w-[360px] p-5`}
          >
            <h3 id="delete-routine-title" className="text-[15px] font-semibold text-ink">
              Delete &ldquo;{deletingRoutine.title}&rdquo;?
            </h3>
            <p className="mt-1.5 text-[11px] leading-4 text-ink-secondary">
              This removes the routine permanently. Your completed workout history and PRs will stay saved in Progress.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isDeletingRoutine}
                onClick={() => setDeletingRoutine(null)}
                className={`${ui.btnSecondary} min-h-10 px-3 text-[11px]`}
              >
                Cancel
              </button>
                <button
                  type="button"
                  disabled={isDeletingRoutine}
                  onClick={() => void confirmDeleteRoutine()}
                  className={`${ui.btnDangerSolid} min-h-10 px-3 text-[11px]`}
                >
                  {isDeletingRoutine ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* =================================================================== */}
      {/* DEDICATED EXERCISE LIBRARY & VISUAL DEMONSTRATION BROWSER           */}
      {/* =================================================================== */}
      {isExerciseLibraryOpen && (
        <div
          className={ui.modalSheetBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsExerciseLibraryOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-library-modal-title"
            className="flex max-h-[92%] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[26px] border border-line-strong bg-elevated text-ink shadow-2xl sm:rounded-[26px]"
          >
            <header className="flex items-center justify-between border-b border-divider px-5 py-3.5">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-text">
                  Movement Guide
                </p>
                <h3
                  id="exercise-library-modal-title"
                  className="text-[15px] font-semibold text-ink"
                >
                  Exercise Library
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close exercise library"
                onClick={() => setIsExerciseLibraryOpen(false)}
                className={`${ui.btnGhost} size-8`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="border-b border-divider px-4 py-3">
              <div className="relative">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Search exercise, equipment, or muscle..."
                  aria-label="Search exercise library"
                  className={`${ui.inputCompact} min-h-10 rounded-xl ps-9`}
                />
              </div>

              <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
                {["All", ...MUSCLE_GROUPS].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLibraryMuscle(m)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      libraryMuscle === m
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-ink-secondary hover:text-ink"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {EXERCISE_LIBRARY.filter((lib) => {
                if (libraryMuscle !== "All" && lib.muscle !== libraryMuscle) {
                  return false;
                }
                return matchesExerciseQuery(lib, libraryQuery);
              }).map((lib, idx) => {
                const prev = exerciseDefaults[lib.name.toLowerCase()];
                const libDemoKey = `lib-${lib.name}`;
                const showLibDemo =
                  routinePreviewExerciseKey === libDemoKey ||
                  (routinePreviewExerciseKey === null && idx === 0);
                return (
                  <div
                    key={lib.name}
                    className="space-y-2 rounded-xl border border-line bg-surface p-3"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setRoutinePreviewExerciseKey(showLibDemo ? "__none__" : libDemoKey)
                      }
                      className="flex w-full items-center justify-between gap-2 text-start"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {lib.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-secondary">
                          {lib.muscle} · {lib.equipment} · {lib.defaultSets} × {lib.defaultReps}
                          {prev && prev.bestWeightKg > 0
                            ? ` · PR ${prev.bestWeightKg} kg`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-line bg-subtle px-2 py-1 text-[9px] font-semibold text-accent-text">
                        {showLibDemo ? "Hide demo" : "Demo"}
                      </span>
                    </button>
                    {showLibDemo && (
                      <ExerciseDemoVisual
                        exerciseName={lib.name}
                        targetMuscleGroup={lib.muscle}
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
    </section>
  );
}
