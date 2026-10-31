import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MemberRoutineModel, {
  ROUTINE_WEEKDAYS,
  type RoutineWeekday,
} from "gymos-admin-backend/models/member-routine";
import ActiveWorkoutSessionModel from "gymos-admin-backend/models/active-workout-session";
import ExerciseMediaModel, {
  type ExerciseMediaSource,
  type ExerciseMediaType,
} from "gymos-admin-backend/models/exercise-media";
import ExerciseProgressionModel, {
  PROGRESSION_ACTIONS,
  PROGRESSION_DECISIONS,
  type ProgressionAction,
  type ProgressionDecision,
} from "gymos-admin-backend/models/exercise-progression";
import {
  DEFAULT_PROGRESSION_RULE_SETTINGS,
  evaluateExerciseProgression,
  type ProgressionPace,
  type ProgressionRuleSettings,
} from "gymos-admin-backend/lib/workout-progression";
import { evaluateMemberAchievements } from "gymos-admin-backend/lib/workout-achievements";
import WorkoutLogModel, {
  WORKOUT_SOURCE_TYPES,
  type WorkoutSourceType,
} from "gymos-admin-backend/models/workout-log";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";
import {
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
} from "@/lib/member-auth";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import {
  getPlatformTokenFromRequest,
  PLATFORM_SESSION_COOKIE,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";
import { hasConflictingGymRef } from "@/lib/tenant-guard";

export const runtime = "nodejs";

type LeanSetPlan = {
  setNumber: number;
  reps: string;
  targetWeightKg: number;
};

type LeanRoutineExercise = {
  exerciseName: string;
  targetMuscleGroup: string;
  sets: number;
  reps: string;
  restSeconds: number;
  targetWeightKg?: number;
  notes?: string;
  setPlans?: LeanSetPlan[];
};

type LeanRoutineDay = {
  day: RoutineWeekday;
  isRestDay: boolean;
  focusLabel?: string;
  exercises: LeanRoutineExercise[];
};

type LeanMemberRoutine = {
  _id: Types.ObjectId;
  memberId: Types.ObjectId;
  gymId?: Types.ObjectId | null;
  title: string;
  targetGoal: string;
  notes?: string;
  scheduledDays?: RoutineWeekday[];
  daySchedule?: LeanRoutineDay[];
  sourceGymPlanId?: Types.ObjectId | null;
  exercises: LeanRoutineExercise[];
  isActive?: boolean;
  archived?: boolean;
  lastPerformedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type LeanGymWorkoutPlan = {
  _id: Types.ObjectId;
  gymId: Types.ObjectId;
  title: string;
  targetGoal: string;
  assignedMemberIds?: Types.ObjectId[];
  exercises: Array<{
    exerciseName: string;
    sets: string;
    reps: string;
    restTime: string;
    targetMuscleGroup: string;
  }>;
  updatedAt?: Date;
};

type LeanLoggedSet = {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed: boolean;
};

type LeanLoggedRecommendation = {
  action: ProgressionAction;
  recommendedWeightKg: number;
  recommendedReps: number;
  summaryText?: string;
  reasonCode?: string;
  decision?: ProgressionDecision;
  appliedWeightKg?: number | null;
  appliedReps?: number | null;
};

type LeanLoggedExercise = {
  exerciseName: string;
  targetMuscleGroup: string;
  targetSets?: number | null;
  targetRepsLabel?: string;
  difficultyRating?: number | null;
  reportedDiscomfort?: boolean;
  recommendation?: LeanLoggedRecommendation | null;
  sets: LeanLoggedSet[];
};

type LeanWorkoutLog = {
  _id: Types.ObjectId;
  memberId: Types.ObjectId;
  gymId?: Types.ObjectId | null;
  clientSessionId?: string | null;
  sourceType: WorkoutSourceType;
  routineId?: Types.ObjectId | null;
  routineTitle: string;
  targetGoal?: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  totalSetsCompleted: number;
  totalRepsCompleted: number;
  totalVolumeKg: number;
  effortRating?: number | null;
  sessionNotes?: string;
  exercises: LeanLoggedExercise[];
};

type LeanActiveSessionSet = {
  setNumber: number;
  weightKg: number;
  reps: number;
  completed: boolean;
  completedAt?: Date | null;
};

type LeanActiveSessionFeedback = {
  difficultyRating: number;
  reportedDiscomfort?: boolean;
  action: ProgressionAction;
  recommendedWeightKg: number;
  recommendedReps: number;
  summaryText?: string;
  reasonCode?: string;
  decision?: ProgressionDecision;
  appliedWeightKg?: number | null;
  appliedReps?: number | null;
};

type LeanActiveSessionExercise = {
  exerciseName: string;
  targetMuscleGroup: string;
  restSeconds: number;
  usesDefaultRest?: boolean;
  targetRepsLabel?: string;
  notes?: string;
  feedback?: LeanActiveSessionFeedback | null;
  sets: LeanActiveSessionSet[];
};

type LeanExerciseProgression = {
  _id: Types.ObjectId;
  memberId: Types.ObjectId;
  gymId?: Types.ObjectId | null;
  exerciseKey: string;
  exerciseName: string;
  targetMuscleGroup?: string;
  sourceLogId?: Types.ObjectId | null;
  basedOnWeightKg: number;
  basedOnReps: number;
  basedOnSets: number;
  basedOnDifficulty?: number | null;
  reportedDiscomfort?: boolean;
  action: ProgressionAction;
  recommendedWeightKg: number;
  recommendedReps: number;
  summaryText?: string;
  reasonCode?: string;
  decision: ProgressionDecision;
  appliedWeightKg?: number | null;
  appliedReps?: number | null;
  decidedAt?: Date | null;
  updatedAt?: Date;
};

type LeanActiveWorkoutSession = {
  _id: Types.ObjectId;
  memberId: Types.ObjectId;
  gymId?: Types.ObjectId | null;
  clientSessionId: string;
  sourceType: WorkoutSourceType;
  routineId?: Types.ObjectId | null;
  routineTitle: string;
  dayLabel?: string;
  targetGoal?: string;
  startedAt: Date;
  pausedSeconds: number;
  isPaused: boolean;
  lastPauseStartedAt?: Date | null;
  restTimerId?: string;
  restStartedAt?: Date | null;
  restEndsAt?: Date | null;
  restDurationSeconds: number;
  restPausedRemainingMs?: number | null;
  currentExerciseIndex: number;
  clientUpdatedAtMs: number;
  exercises: LeanActiveSessionExercise[];
  updatedAt?: Date;
};

const VALID_WEEKDAY_SET = new Set<string>(ROUTINE_WEEKDAYS);
const VALID_SOURCE_SET = new Set<string>(WORKOUT_SOURCE_TYPES);
const VALID_PROGRESSION_ACTION_SET = new Set<string>(PROGRESSION_ACTIONS);
const VALID_PROGRESSION_DECISION_SET = new Set<string>(PROGRESSION_DECISIONS);

function sanitizeFeedbackPayload(raw: unknown): LeanActiveSessionFeedback | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  const ratingRaw = Number(f.difficultyRating);
  if (!Number.isFinite(ratingRaw) || ratingRaw < 1 || ratingRaw > 10) return null;
  const difficultyRating = Math.max(1, Math.min(10, Math.round(ratingRaw)));
  const reportedDiscomfort = Boolean(f.reportedDiscomfort);
  const actionRaw = typeof f.action === "string" ? f.action : "";
  const action: ProgressionAction = VALID_PROGRESSION_ACTION_SET.has(actionRaw)
    ? (actionRaw as ProgressionAction)
    : "maintain";
  const recommendedWeightKg = Math.max(
    0,
    Math.min(1000, Math.round((Number(f.recommendedWeightKg) || 0) * 100) / 100),
  );
  const recommendedReps = Math.max(
    1,
    Math.min(500, Math.round(Number(f.recommendedReps) || 10)),
  );
  const summaryText =
    typeof f.summaryText === "string" ? f.summaryText.trim().slice(0, 240) : "";
  const reasonCode =
    typeof f.reasonCode === "string" ? f.reasonCode.trim().slice(0, 80) : "";
  const decisionRaw = typeof f.decision === "string" ? f.decision : "pending";
  const decision: ProgressionDecision = VALID_PROGRESSION_DECISION_SET.has(decisionRaw)
    ? (decisionRaw as ProgressionDecision)
    : "pending";
  const appliedWeightKg =
    f.appliedWeightKg !== null &&
    f.appliedWeightKg !== undefined &&
    Number.isFinite(Number(f.appliedWeightKg))
      ? Math.max(
          0,
          Math.min(1000, Math.round(Number(f.appliedWeightKg) * 100) / 100),
        )
      : null;
  const appliedReps =
    f.appliedReps !== null &&
    f.appliedReps !== undefined &&
    Number.isFinite(Number(f.appliedReps))
      ? Math.max(1, Math.min(500, Math.round(Number(f.appliedReps))))
      : null;

  return {
    difficultyRating,
    reportedDiscomfort,
    action,
    recommendedWeightKg,
    recommendedReps,
    summaryText,
    reasonCode,
    decision,
    appliedWeightKg,
    appliedReps,
  };
}

function serializeProgressionRecord(doc: LeanExerciseProgression) {
  return {
    exerciseKey: doc.exerciseKey,
    exerciseName: doc.exerciseName,
    muscle: doc.targetMuscleGroup || "General",
    action: doc.action,
    basedOnWeightKg: doc.basedOnWeightKg ?? 0,
    basedOnReps: doc.basedOnReps ?? 10,
    basedOnDifficulty: doc.basedOnDifficulty ?? null,
    reportedDiscomfort: Boolean(doc.reportedDiscomfort),
    recommendedWeightKg: doc.recommendedWeightKg ?? 0,
    recommendedReps: doc.recommendedReps ?? 10,
    summaryText: doc.summaryText ?? "",
    reasonCode: doc.reasonCode ?? "",
    decision: doc.decision ?? "pending",
    appliedWeightKg:
      typeof doc.appliedWeightKg === "number" ? doc.appliedWeightKg : null,
    appliedReps: typeof doc.appliedReps === "number" ? doc.appliedReps : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function parseRestSecondsFromLabel(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return 60;
  const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 60;
  const val = Number.parseFloat(numMatch[1]);
  if (!Number.isFinite(val) || val < 0) return 60;
  if (cleaned.includes("min") || (cleaned.includes("m") && !cleaned.includes("ms"))) {
    return Math.min(600, Math.round(val * 60));
  }
  return Math.min(600, Math.round(val));
}

function deriveDayFocusLabel(exercises: LeanRoutineExercise[]): string {
  const seen: string[] = [];
  for (const ex of exercises) {
    const m = (ex.targetMuscleGroup || "").trim();
    if (m && !seen.includes(m)) {
      seen.push(m);
    }
    if (seen.length >= 3) break;
  }
  if (seen.length === 0) return "Training";
  if (seen.length === 1) return seen[0];
  if (seen.length === 2) return `${seen[0]} & ${seen[1]}`;
  return `${seen[0]}, ${seen[1]} & ${seen[2]}`;
}

function serializeExercise(ex: LeanRoutineExercise, idx: number) {
  return {
    id: idx + 1,
    name: ex.exerciseName,
    muscle: ex.targetMuscleGroup,
    sets: ex.sets,
    reps: ex.reps,
    restSeconds: ex.restSeconds,
    targetWeightKg: ex.targetWeightKg ?? 0,
    notes: ex.notes ?? "",
    setPlans: (ex.setPlans ?? []).map((sp, sIdx) => ({
      setNumber: sp.setNumber || sIdx + 1,
      reps: sp.reps || ex.reps || "10",
      targetWeightKg: sp.targetWeightKg ?? ex.targetWeightKg ?? 0,
    })),
  };
}

function serializeRoutine(doc: LeanMemberRoutine) {
  const validScheduled = (doc.scheduledDays ?? []).filter((d): d is RoutineWeekday =>
    VALID_WEEKDAY_SET.has(d),
  );

  const rawDaySchedule = Array.isArray(doc.daySchedule) ? doc.daySchedule : [];
  let serializedDaySchedule: Array<{
    day: RoutineWeekday;
    isRestDay: boolean;
    focusLabel: string;
    exercises: ReturnType<typeof serializeExercise>[];
  }> = [];

  if (rawDaySchedule.length > 0) {
    const byDay = new Map<RoutineWeekday, LeanRoutineDay>();
    for (const entry of rawDaySchedule) {
      if (entry && VALID_WEEKDAY_SET.has(entry.day)) {
        byDay.set(entry.day, entry);
      }
    }
    serializedDaySchedule = ROUTINE_WEEKDAYS.map((day) => {
      const found = byDay.get(day);
      if (!found || found.isRestDay || (found.exercises ?? []).length === 0) {
        return {
          day,
          isRestDay: true,
          focusLabel: "Rest",
          exercises: [],
        };
      }
      const exList = found.exercises ?? [];
      return {
        day,
        isRestDay: false,
        focusLabel:
          found.focusLabel && found.focusLabel.trim()
            ? found.focusLabel.trim()
            : deriveDayFocusLabel(exList),
        exercises: exList.map((ex, i) => serializeExercise(ex, i)),
      };
    });
  } else if (validScheduled.length > 0 && (doc.exercises ?? []).length > 0) {
    const scheduledSet = new Set<RoutineWeekday>(validScheduled);
    const defaultFocus = deriveDayFocusLabel(doc.exercises ?? []);
    serializedDaySchedule = ROUTINE_WEEKDAYS.map((day) => {
      if (!scheduledSet.has(day)) {
        return { day, isRestDay: true, focusLabel: "Rest", exercises: [] };
      }
      return {
        day,
        isRestDay: false,
        focusLabel: defaultFocus,
        exercises: (doc.exercises ?? []).map((ex, i) => serializeExercise(ex, i)),
      };
    });
  }

  return {
    id: String(doc._id),
    title: doc.title,
    targetGoal: doc.targetGoal || "General Fitness",
    notes: doc.notes ?? "",
    isActive: Boolean(doc.isActive),
    archived: Boolean(doc.archived),
    scheduledDays: validScheduled,
    daySchedule: serializedDaySchedule,
    sourceGymPlanId: doc.sourceGymPlanId ? String(doc.sourceGymPlanId) : null,
    lastPerformedAt: doc.lastPerformedAt ? new Date(doc.lastPerformedAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    exercises: (doc.exercises ?? []).map((ex, idx) => serializeExercise(ex, idx)),
  };
}

function serializeGymPlan(doc: LeanGymWorkoutPlan, memberId: Types.ObjectId) {
  const isAssignedByGym = (doc.assignedMemberIds ?? []).some(
    (assignedId) => String(assignedId) === String(memberId),
  );
  return {
    id: String(doc._id),
    title: doc.title,
    targetGoal: doc.targetGoal || "General Fitness",
    isAssignedByGym,
    exercises: (doc.exercises ?? []).map((ex, idx) => ({
      id: idx + 1,
      name: ex.exerciseName,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.restTime,
      muscle: ex.targetMuscleGroup,
    })),
  };
}

function serializeLog(doc: LeanWorkoutLog) {
  return {
    id: String(doc._id),
    clientSessionId: doc.clientSessionId ?? null,
    sourceType: doc.sourceType,
    routineId: doc.routineId ? String(doc.routineId) : null,
    routineTitle: doc.routineTitle,
    targetGoal: doc.targetGoal ?? "",
    startedAt: new Date(doc.startedAt).toISOString(),
    completedAt: new Date(doc.completedAt).toISOString(),
    durationSeconds: doc.durationSeconds,
    totalSetsCompleted: doc.totalSetsCompleted,
    totalRepsCompleted: doc.totalRepsCompleted,
    totalVolumeKg: Math.round(doc.totalVolumeKg * 10) / 10,
    effortRating: doc.effortRating ?? null,
    sessionNotes: doc.sessionNotes ?? "",
    exercises: (doc.exercises ?? []).map((ex) => ({
      name: ex.exerciseName,
      muscle: ex.targetMuscleGroup,
      targetSets: ex.targetSets ?? null,
      targetRepsLabel: ex.targetRepsLabel ?? "",
      difficultyRating:
        typeof ex.difficultyRating === "number" ? ex.difficultyRating : null,
      reportedDiscomfort: Boolean(ex.reportedDiscomfort),
      recommendation: ex.recommendation
        ? {
            action: ex.recommendation.action,
            recommendedWeightKg: ex.recommendation.recommendedWeightKg ?? 0,
            recommendedReps: ex.recommendation.recommendedReps ?? 10,
            summaryText: ex.recommendation.summaryText ?? "",
            reasonCode: ex.recommendation.reasonCode ?? "",
            decision: ex.recommendation.decision ?? "pending",
            appliedWeightKg:
              typeof ex.recommendation.appliedWeightKg === "number"
                ? ex.recommendation.appliedWeightKg
                : null,
            appliedReps:
              typeof ex.recommendation.appliedReps === "number"
                ? ex.recommendation.appliedReps
                : null,
          }
        : null,
      sets: (ex.sets ?? []).map((s) => ({
        setNumber: s.setNumber,
        reps: s.reps,
        weightKg: s.weightKg,
        completed: s.completed,
      })),
    })),
  };
}

function serializeActiveWorkoutSession(doc: LeanActiveWorkoutSession) {
  return {
    clientSessionId: doc.clientSessionId,
    sourceType: doc.sourceType,
    routineId: doc.routineId ? String(doc.routineId) : null,
    routineTitle: doc.routineTitle,
    dayLabel: doc.dayLabel ?? "",
    targetGoal: doc.targetGoal ?? "",
    startedAtIso: new Date(doc.startedAt).toISOString(),
    pausedSeconds: doc.pausedSeconds ?? 0,
    isPaused: Boolean(doc.isPaused),
    lastPauseStartedIso: doc.lastPauseStartedAt
      ? new Date(doc.lastPauseStartedAt).toISOString()
      : null,
    restTimerId: doc.restTimerId ?? "",
    restStartedAtIso: doc.restStartedAt
      ? new Date(doc.restStartedAt).toISOString()
      : null,
    restEndsAtIso: doc.restEndsAt ? new Date(doc.restEndsAt).toISOString() : null,
    restDurationSeconds: doc.restDurationSeconds ?? 0,
    restPausedRemainingMs:
      typeof doc.restPausedRemainingMs === "number" && doc.restPausedRemainingMs > 0
        ? Math.round(doc.restPausedRemainingMs)
        : null,
    currentExerciseIndex: doc.currentExerciseIndex ?? 0,
    clientUpdatedAtMs: doc.clientUpdatedAtMs ?? 0,
    exercises: (doc.exercises ?? []).map((ex) => ({
      name: ex.exerciseName,
      muscle: ex.targetMuscleGroup,
      restSeconds: ex.restSeconds ?? 60,
      usesDefaultRest: ex.usesDefaultRest !== false,
      targetRepsLabel: ex.targetRepsLabel ?? "10",
      notes: ex.notes ?? "",
      feedback: ex.feedback
        ? {
            difficultyRating: ex.feedback.difficultyRating,
            reportedDiscomfort: Boolean(ex.feedback.reportedDiscomfort),
            action: ex.feedback.action,
            recommendedWeightKg: ex.feedback.recommendedWeightKg ?? 0,
            recommendedReps: ex.feedback.recommendedReps ?? 10,
            summaryText: ex.feedback.summaryText ?? "",
            reasonCode: ex.feedback.reasonCode ?? "",
            decision: ex.feedback.decision ?? "pending",
            appliedWeightKg:
              typeof ex.feedback.appliedWeightKg === "number"
                ? ex.feedback.appliedWeightKg
                : null,
            appliedReps:
              typeof ex.feedback.appliedReps === "number"
                ? ex.feedback.appliedReps
                : null,
          }
        : null,
      sets: (ex.sets ?? []).map((s, idx) => ({
        setNumber: s.setNumber || idx + 1,
        weightKg: String(s.weightKg ?? 0),
        reps: String(s.reps ?? 10),
        completed: Boolean(s.completed),
        completedAtIso: s.completedAt ? new Date(s.completedAt).toISOString() : null,
      })),
    })),
  };
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatRepsSummary(sets: Array<{ reps: number }>): string {
  if (sets.length === 0) return "0";
  const allEqual = sets.every((s) => s.reps === sets[0].reps);
  if (allEqual) {
    return `${sets.length} × ${sets[0].reps}`;
  }
  return sets.map((s) => String(s.reps)).join(", ");
}

function computeProgressSummary(
  allLogs: LeanWorkoutLog[],
  progressionDocs: LeanExerciseProgression[] = [],
) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  let validWorkoutsCount = 0;
  let workoutsThisWeek = 0;
  let workoutsThisMonth = 0;
  let workoutsLast30Days = 0;
  let totalVolumeKg = 0;
  let volumeLast30DaysKg = 0;
  let totalSeconds = 0;

  const activeDayKeys = new Set<string>();
  const byDayKey = new Map<
    string,
    { workouts: number; volumeKg: number; minutes: number }
  >();
  const muscleSets = new Map<string, number>();

  const progressionByKey = new Map<string, ReturnType<typeof serializeProgressionRecord>>();
  for (const doc of progressionDocs) {
    if (doc.exerciseKey) {
      progressionByKey.set(doc.exerciseKey.toLowerCase(), serializeProgressionRecord(doc));
    }
  }

  const exerciseDefaults: Record<
    string,
    {
      exerciseName: string;
      lastWeightKg: number;
      lastReps: number;
      lastPerformedWeightKg: number;
      lastPerformedReps: number;
      lastDifficultyRating: number | null;
      lastReportedDiscomfort: boolean;
      lastSets: Array<{ setNumber: number; weightKg: number; reps: number }>;
      bestWeightKg: number;
      bestRepsAtMaxWeight: number;
      bestSetVolumeKg: number;
      lastPerformedAt: string;
      achievedAt: string;
      muscle: string;
      activeProgression: ReturnType<typeof serializeProgressionRecord> | null;
    }
  > = {};

  const historySessionsByKey = new Map<
    string,
    Array<{
      logId: string;
      completedAt: string;
      workingWeightKg: number;
      topWeightKg: number;
      totalSets: number;
      repsSummary: string;
      sets: Array<{ setNumber: number; weightKg: number; reps: number }>;
      sessionVolumeKg: number;
      difficultyRating: number | null;
      reportedDiscomfort: boolean;
      recommendationSummary: string;
    }>
  >();

  for (const log of allLogs) {
    const hasCompletedSet = (log.exercises ?? []).some((ex) =>
      (ex.sets ?? []).some((s) => Boolean(s.completed) && (s.reps || 0) > 0),
    );
    if (!hasCompletedSet) continue;

    validWorkoutsCount += 1;
    const completedAt = new Date(log.completedAt);
    const dayKey = toUtcDayKey(completedAt);
    activeDayKeys.add(dayKey);

    totalVolumeKg += log.totalVolumeKg || 0;
    totalSeconds += log.durationSeconds || 0;
    if (completedAt >= sevenDaysAgo) workoutsThisWeek += 1;
    if (
      completedAt.getUTCFullYear() === now.getUTCFullYear() &&
      completedAt.getUTCMonth() === now.getUTCMonth()
    ) {
      workoutsThisMonth += 1;
    }
    if (completedAt >= thirtyDaysAgo) {
      workoutsLast30Days += 1;
      volumeLast30DaysKg += log.totalVolumeKg || 0;
    }

    const bucket = byDayKey.get(dayKey) ?? { workouts: 0, volumeKg: 0, minutes: 0 };
    bucket.workouts += 1;
    bucket.volumeKg += log.totalVolumeKg || 0;
    bucket.minutes += Math.max(1, Math.round((log.durationSeconds || 0) / 60));
    byDayKey.set(dayKey, bucket);

    for (const ex of log.exercises ?? []) {
      const completedSets = (ex.sets ?? []).filter((s) => s.completed);
      if (completedSets.length === 0) continue;

      const muscle = ex.targetMuscleGroup || "General";
      muscleSets.set(muscle, (muscleSets.get(muscle) ?? 0) + completedSets.length);

      const key = ex.exerciseName.trim().toLowerCase();
      if (!key) continue;

      const topSetInSession = completedSets.reduce((best, curr) => {
        if (curr.weightKg > best.weightKg) return curr;
        if (curr.weightKg === best.weightKg && curr.reps > best.reps) return curr;
        return best;
      }, completedSets[0]);

      const existing = exerciseDefaults[key];
      const sessionBestVolume = completedSets.reduce(
        (maxV, s) => Math.max(maxV, s.weightKg * s.reps),
        0,
      );
      const sessionTotalVolume = completedSets.reduce(
        (sumV, s) => sumV + s.weightKg * s.reps,
        0,
      );
      const normalizedSetList = completedSets.map((s, idx) => ({
        setNumber: idx + 1,
        weightKg: s.weightKg,
        reps: s.reps,
      }));
      const diffRating =
        typeof ex.difficultyRating === "number" ? ex.difficultyRating : null;
      const reportedDiscomfort = Boolean(ex.reportedDiscomfort);

      const prevHistoryList = historySessionsByKey.get(key) ?? [];
      if (prevHistoryList.length < 90) {
        prevHistoryList.push({
          logId: String(log._id),
          completedAt: completedAt.toISOString(),
          workingWeightKg: topSetInSession.weightKg,
          topWeightKg: topSetInSession.weightKg,
          totalSets: normalizedSetList.length,
          repsSummary: formatRepsSummary(normalizedSetList),
          sets: normalizedSetList,
          sessionVolumeKg: Math.round(sessionTotalVolume * 10) / 10,
          difficultyRating: diffRating,
          reportedDiscomfort,
          recommendationSummary: ex.recommendation?.summaryText ?? "",
        });
        historySessionsByKey.set(key, prevHistoryList);
      }

      if (!existing) {
        const activeProg = progressionByKey.get(key) ?? null;
        // Never silently modify routines or auto-apply pending/ignored recommendations.
        // Only apply progression to smart defaults when the member explicitly Accepted or Adjusted it!
        const progUpdatedMs =
          activeProg?.updatedAt && !Number.isNaN(Date.parse(activeProg.updatedAt))
            ? Date.parse(activeProg.updatedAt)
            : 0;
        const logCompletedMs = completedAt.getTime();
        const shouldApplyAcceptedTarget =
          activeProg !== null &&
          (activeProg.decision === "accepted" || activeProg.decision === "adjusted") &&
          progUpdatedMs >= logCompletedMs - 5000;

        const effectiveWeightKg = shouldApplyAcceptedTarget
          ? (activeProg.appliedWeightKg ?? activeProg.recommendedWeightKg)
          : topSetInSession.weightKg;
        const effectiveReps = shouldApplyAcceptedTarget
          ? (activeProg.appliedReps ?? activeProg.recommendedReps)
          : topSetInSession.reps;

        exerciseDefaults[key] = {
          exerciseName: ex.exerciseName,
          muscle,
          lastWeightKg: effectiveWeightKg,
          lastReps: effectiveReps,
          lastPerformedWeightKg: topSetInSession.weightKg,
          lastPerformedReps: topSetInSession.reps,
          lastDifficultyRating: diffRating,
          lastReportedDiscomfort: reportedDiscomfort,
          lastSets: shouldApplyAcceptedTarget
            ? normalizedSetList.map((s) => ({
                setNumber: s.setNumber,
                weightKg: effectiveWeightKg,
                reps: effectiveReps,
              }))
            : normalizedSetList,
          bestWeightKg: topSetInSession.weightKg,
          bestRepsAtMaxWeight: topSetInSession.reps,
          bestSetVolumeKg: Math.round(sessionBestVolume * 10) / 10,
          lastPerformedAt: completedAt.toISOString(),
          achievedAt: completedAt.toISOString(),
          activeProgression: activeProg,
        };
      } else {
        if (
          topSetInSession.weightKg > existing.bestWeightKg ||
          (topSetInSession.weightKg === existing.bestWeightKg &&
            topSetInSession.reps > existing.bestRepsAtMaxWeight)
        ) {
          existing.bestWeightKg = topSetInSession.weightKg;
          existing.bestRepsAtMaxWeight = topSetInSession.reps;
          existing.achievedAt = completedAt.toISOString();
        }
        if (sessionBestVolume > existing.bestSetVolumeKg) {
          existing.bestSetVolumeKg = Math.round(sessionBestVolume * 10) / 10;
        }
      }
    }
  }

  const exerciseHistory = Array.from(historySessionsByKey.entries())
    .map(([key, sessions]) => {
      const def = exerciseDefaults[key];
      let trend: "improving" | "steady" | "challenging" | "new" = "new";
      let weightDeltaKg = 0;

      if (sessions.length >= 2) {
        const latest = sessions[0];
        const prev = sessions[1];
        const oldest = sessions[sessions.length - 1];
        weightDeltaKg =
          Math.round((latest.topWeightKg - oldest.topWeightKg) * 10) / 10;

        if (
          latest.reportedDiscomfort ||
          ((latest.difficultyRating ?? 0) >= 9 &&
            (prev.difficultyRating ?? 0) >= 9)
        ) {
          trend = "challenging";
        } else if (
          latest.topWeightKg > prev.topWeightKg ||
          (latest.topWeightKg === prev.topWeightKg &&
            latest.sessionVolumeKg > prev.sessionVolumeKg)
        ) {
          trend = "improving";
        } else if (
          latest.topWeightKg < prev.topWeightKg &&
          (latest.difficultyRating ?? 0) >= 8
        ) {
          trend = "challenging";
        } else {
          trend = "steady";
        }
      }

      return {
        exerciseKey: key,
        exerciseName: def?.exerciseName ?? key,
        muscle: def?.muscle ?? "General",
        totalSessions: sessions.length,
        trend,
        weightDeltaKg,
        personalRecord: {
          maxWeightKg: def?.bestWeightKg ?? 0,
          maxRepsAtMaxWeight: def?.bestRepsAtMaxWeight ?? 0,
          bestSetVolumeKg: def?.bestSetVolumeKg ?? 0,
          achievedAt: def?.achievedAt ?? sessions[0]?.completedAt ?? now.toISOString(),
        },
        latestRecommendation: progressionByKey.get(key) ?? null,
        sessions,
      };
    })
    .sort((a, b) => {
      const aLatest = a.sessions[0]?.completedAt ?? "";
      const bLatest = b.sessions[0]?.completedAt ?? "";
      return bLatest.localeCompare(aLatest);
    });

  let currentStreakDays = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!activeDayKeys.has(toUtcDayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (activeDayKeys.has(toUtcDayKey(cursor))) {
    currentStreakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyActivity: Array<{
    date: string;
    dayLabel: string;
    workouts: number;
    volumeKg: number;
    minutes: number;
  }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset),
    );
    const key = toUtcDayKey(dt);
    const stats = byDayKey.get(key) ?? { workouts: 0, volumeKg: 0, minutes: 0 };
    weeklyActivity.push({
      date: key,
      dayLabel: dayNames[dt.getUTCDay()],
      workouts: stats.workouts,
      volumeKg: Math.round(stats.volumeKg),
      minutes: stats.minutes,
    });
  }

  const muscleBreakdown = Array.from(muscleSets.entries())
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 6);

  const allPrEntries = Object.values(exerciseDefaults).filter(
    (item) => item.bestWeightKg > 0 || item.lastReps > 0,
  );
  const personalRecords = allPrEntries
    .sort((a, b) => b.bestWeightKg - a.bestWeightKg || b.bestSetVolumeKg - a.bestSetVolumeKg)
    .slice(0, 20)
    .map((item) => ({
      exerciseName: item.exerciseName,
      muscle: item.muscle,
      maxWeightKg: item.bestWeightKg,
      maxRepsAtMaxWeight: item.bestRepsAtMaxWeight,
      bestSetVolumeKg: item.bestSetVolumeKg,
      achievedAt: item.achievedAt,
    }));

  return {
    exerciseDefaults,
    exerciseHistory,
    progress: {
      totalWorkouts: validWorkoutsCount,
      workoutsThisWeek,
      workoutsThisMonth,
      workoutsLast30Days,
      currentStreakDays,
      totalPersonalRecords: allPrEntries.length,
      totalVolumeKg: Math.round(totalVolumeKg),
      volumeLast30DaysKg: Math.round(volumeLast30DaysKg),
      totalMinutesTrained: Math.round(totalSeconds / 60),
      weeklyActivity,
      muscleBreakdown,
      personalRecords,
    },
  };
}

type AuthorizedMemberContext = {
  memberId: Types.ObjectId;
  memberGymId: Types.ObjectId | null;
  activeRoutineMode: "personal" | "gym" | "none";
  selectedGymWorkoutPlanId: Types.ObjectId | null;
  restSettings: {
    defaultRestSeconds: number;
    vibrationEnabled: boolean;
    notificationsEnabled: boolean;
  };
  progressionSettings: ProgressionRuleSettings;
};

async function authorizeMemberWorkoutRequest(
  request: NextRequest,
  body?: Record<string, unknown> | null,
): Promise<
  | (AuthorizedMemberContext & { response?: never })
  | {
      memberId?: never;
      memberGymId?: never;
      activeRoutineMode?: never;
      selectedGymWorkoutPlanId?: never;
      restSettings?: never;
      progressionSettings?: never;
      response: Response;
    }
> {
  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session) {
    const [staffAttempt, platformAttempt] = await Promise.all([
      verifyStaffSessionToken(
        getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
      ),
      verifyPlatformSessionToken(
        getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
      ),
    ]);
    if (staffAttempt || platformAttempt) {
      return {
        response: memberApiResponse(
          request,
          { error: "Member account permissions are required." },
          403,
        ),
      };
    }
    return {
      response: memberApiResponse(request, { error: "Member authentication is required." }, 401),
    };
  }

  if (session.role !== "member" || !Types.ObjectId.isValid(session.memberId)) {
    return {
      response: memberApiResponse(
        request,
        { error: "Only member accounts can manage personal workouts." },
        403,
      ),
    };
  }

  await connectToDatabase();
  const member = await MemberModel.findById(session.memberId).lean<{
    _id: Types.ObjectId;
    gymId?: Types.ObjectId | null;
    status: string;
    activeRoutineMode?: "personal" | "gym" | "none";
    selectedGymWorkoutPlanId?: Types.ObjectId | null;
    defaultRestSeconds?: number;
    restVibrationEnabled?: boolean;
    restNotificationsEnabled?: boolean;
    progressionPace?: ProgressionPace;
    preferredIncrementKg?: number;
  } | null>();
  if (!member) {
    return {
      response: memberApiResponse(request, { error: "Member authentication is required." }, 401),
    };
  }
  if (member.status === "suspended") {
    return {
      response: memberApiResponse(
        request,
        { error: "Your member account is currently suspended." },
        403,
      ),
    };
  }

  let memberGymId: Types.ObjectId | null = null;
  if (member.gymId && Types.ObjectId.isValid(String(member.gymId))) {
    memberGymId = new Types.ObjectId(String(member.gymId));
    if (session.gymId && session.gymId !== memberGymId.toString()) {
      return {
        response: memberApiResponse(
          request,
          { error: "Member gym relationship could not be verified." },
          403,
        ),
      };
    }
    const gym = await GymModel.findById(memberGymId)
      .select("slug status")
      .lean<{ _id: Types.ObjectId; slug: string; status: string } | null>();
    if (!gym || gym.status !== "active") {
      return {
        response: memberApiResponse(
          request,
          { error: "This gym workspace is currently suspended." },
          403,
        ),
      };
    }
    if (hasConflictingGymRef(request, { id: memberGymId.toString(), slug: gym.slug }, body)) {
      return {
        response: memberApiResponse(request, { error: "Cross-gym access denied." }, 403),
      };
    }
  } else if (session.gymId) {
    return {
      response: memberApiResponse(
        request,
        { error: "Member gym relationship could not be verified." },
        403,
      ),
    };
  }

  const rawMode = member.activeRoutineMode;
  const activeRoutineMode: "personal" | "gym" | "none" =
    rawMode === "personal" || rawMode === "gym" ? rawMode : "none";
  const selectedGymWorkoutPlanId =
    member.selectedGymWorkoutPlanId &&
    Types.ObjectId.isValid(String(member.selectedGymWorkoutPlanId))
      ? new Types.ObjectId(String(member.selectedGymWorkoutPlanId))
      : null;

  const restSettings = {
    defaultRestSeconds:
      typeof member.defaultRestSeconds === "number" &&
      Number.isFinite(member.defaultRestSeconds)
        ? Math.max(15, Math.min(600, Math.round(member.defaultRestSeconds)))
        : 60,
    vibrationEnabled:
      typeof member.restVibrationEnabled === "boolean"
        ? member.restVibrationEnabled
        : true,
    notificationsEnabled:
      typeof member.restNotificationsEnabled === "boolean"
        ? member.restNotificationsEnabled
        : true,
  };

  const progressionSettings: ProgressionRuleSettings = {
    pace:
      member.progressionPace === "conservative" ||
      member.progressionPace === "aggressive"
        ? member.progressionPace
        : DEFAULT_PROGRESSION_RULE_SETTINGS.pace,
    preferredIncrementKg:
      typeof member.preferredIncrementKg === "number" &&
      Number.isFinite(member.preferredIncrementKg) &&
      member.preferredIncrementKg >= 0 &&
      member.preferredIncrementKg <= 10
        ? Math.round(member.preferredIncrementKg * 100) / 100
        : DEFAULT_PROGRESSION_RULE_SETTINGS.preferredIncrementKg,
  };

  return {
    memberId: member._id,
    memberGymId,
    activeRoutineMode,
    selectedGymWorkoutPlanId,
    restSettings,
    progressionSettings,
  };
}

function validateRoutineExercises(
  rawExercises: unknown,
  options: { allowEmpty?: boolean; maxItems?: number } = {},
): {
  exercises?: LeanRoutineExercise[];
  error?: string;
} {
  const maxItems = options.maxItems ?? 30;
  if (!Array.isArray(rawExercises)) {
    return options.allowEmpty
      ? { exercises: [] }
      : { error: `Add between 1 and ${maxItems} exercises to your routine.` };
  }
  if (!options.allowEmpty && rawExercises.length < 1) {
    return { error: `Add between 1 and ${maxItems} exercises to your routine.` };
  }
  if (rawExercises.length > maxItems) {
    return { error: `You can add at most ${maxItems} exercises.` };
  }

  const validated: LeanRoutineExercise[] = [];
  for (const raw of rawExercises) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { error: "Each exercise entry must be a valid object." };
    }
    const item = raw as Record<string, unknown>;
    const exerciseName =
      typeof item.exerciseName === "string"
        ? item.exerciseName.trim()
        : typeof item.name === "string"
          ? item.name.trim()
          : "";
    const targetMuscleGroup =
      typeof item.targetMuscleGroup === "string"
        ? item.targetMuscleGroup.trim()
        : typeof item.muscle === "string"
          ? item.muscle.trim()
          : "Full body";
    let setsRaw = typeof item.sets === "number" ? item.sets : Number(item.sets ?? 3);
    const repsRaw =
      typeof item.reps === "string" && item.reps.trim()
        ? item.reps.trim()
        : typeof item.reps === "number"
          ? String(item.reps)
          : "10";
    const restRaw =
      typeof item.restSeconds === "number" ? item.restSeconds : Number(item.restSeconds ?? 60);
    const weightRaw =
      typeof item.targetWeightKg === "number"
        ? item.targetWeightKg
        : Number(item.targetWeightKg ?? 0);
    const notesRaw = typeof item.notes === "string" ? item.notes.trim().slice(0, 160) : "";

    if (!exerciseName || exerciseName.length > 80) {
      return { error: "Every exercise needs a name (up to 80 characters)." };
    }
    if (!targetMuscleGroup || targetMuscleGroup.length > 40) {
      return { error: "Each exercise needs a valid muscle group." };
    }

    const parsedSetPlans: LeanSetPlan[] = [];
    if (Array.isArray(item.setPlans) && item.setPlans.length > 0) {
      if (item.setPlans.length > 20) {
        return { error: "Sets per exercise must be between 1 and 20." };
      }
      for (let i = 0; i < item.setPlans.length; i += 1) {
        const spRaw = item.setPlans[i];
        if (!spRaw || typeof spRaw !== "object" || Array.isArray(spRaw)) continue;
        const sp = spRaw as Record<string, unknown>;
        const spReps =
          typeof sp.reps === "string" && sp.reps.trim()
            ? sp.reps.trim().slice(0, 20)
            : typeof sp.reps === "number"
              ? String(sp.reps)
              : repsRaw;
        const spWeightRaw =
          typeof sp.targetWeightKg === "number"
            ? sp.targetWeightKg
            : Number(sp.targetWeightKg ?? weightRaw ?? 0);
        const spWeight = Number.isFinite(spWeightRaw)
          ? Math.max(0, Math.min(1000, Math.round(spWeightRaw * 10) / 10))
          : 0;
        parsedSetPlans.push({
          setNumber: i + 1,
          reps: spReps,
          targetWeightKg: spWeight,
        });
      }
      if (parsedSetPlans.length > 0) {
        setsRaw = parsedSetPlans.length;
      }
    }

    if (!Number.isInteger(setsRaw) || setsRaw < 1 || setsRaw > 20) {
      return { error: "Sets per exercise must be between 1 and 20." };
    }
    if (!repsRaw || repsRaw.length > 20) {
      return { error: "Reps must be 1 to 20 characters (e.g., 10 or 8-12)." };
    }
    const restSeconds = Number.isFinite(restRaw)
      ? Math.max(0, Math.min(600, Math.round(restRaw)))
      : 60;
    const targetWeightKg = Number.isFinite(weightRaw)
      ? Math.max(0, Math.min(1000, Math.round(weightRaw * 10) / 10))
      : 0;

    validated.push({
      exerciseName,
      targetMuscleGroup,
      sets: setsRaw,
      reps: parsedSetPlans[0]?.reps ?? repsRaw,
      restSeconds,
      targetWeightKg: parsedSetPlans[0]?.targetWeightKg ?? targetWeightKg,
      notes: notesRaw,
      setPlans: parsedSetPlans,
    });
  }
  return { exercises: validated };
}

function parseRoutineScheduleAndExercises(body: Record<string, unknown>): {
  scheduledDays?: RoutineWeekday[];
  daySchedule?: LeanRoutineDay[];
  exercises?: LeanRoutineExercise[];
  error?: string;
} {
  // Mode A: Per-day weekly split schedule (`daySchedule`)
  if (Array.isArray(body.daySchedule) && body.daySchedule.length > 0) {
    const incomingByDay = new Map<RoutineWeekday, Record<string, unknown>>();
    for (const rawDay of body.daySchedule) {
      if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) continue;
      const dObj = rawDay as Record<string, unknown>;
      if (typeof dObj.day === "string" && VALID_WEEKDAY_SET.has(dObj.day)) {
        incomingByDay.set(dObj.day as RoutineWeekday, dObj);
      }
    }

    const normalizedDays: LeanRoutineDay[] = [];
    const scheduledDays: RoutineWeekday[] = [];
    const flattenedExercises: LeanRoutineExercise[] = [];

    for (const day of ROUTINE_WEEKDAYS) {
      const entry = incomingByDay.get(day);
      if (!entry) {
        normalizedDays.push({ day, isRestDay: true, focusLabel: "Rest", exercises: [] });
        continue;
      }
      const parsedDayEx = validateRoutineExercises(entry.exercises, {
        allowEmpty: true,
        maxItems: 25,
      });
      if (parsedDayEx.error) {
        return { error: `${day}: ${parsedDayEx.error}` };
      }
      const dayExercises = parsedDayEx.exercises ?? [];
      const explicitRest = entry.isRestDay === true;

      if (explicitRest || dayExercises.length === 0) {
        normalizedDays.push({ day, isRestDay: true, focusLabel: "Rest", exercises: [] });
      } else {
        const customFocus =
          typeof entry.focusLabel === "string" && entry.focusLabel.trim()
            ? entry.focusLabel.trim().slice(0, 60)
            : deriveDayFocusLabel(dayExercises);
        normalizedDays.push({
          day,
          isRestDay: false,
          focusLabel: customFocus,
          exercises: dayExercises,
        });
        scheduledDays.push(day);
        flattenedExercises.push(...dayExercises);
      }
    }

    if (flattenedExercises.length < 1) {
      return {
        error: "Assign at least one exercise to a training day before saving your routine.",
      };
    }
    if (flattenedExercises.length > 80) {
      return {
        error: "A weekly routine can contain at most 80 total exercise slots.",
      };
    }

    return {
      scheduledDays,
      daySchedule: normalizedDays,
      exercises: flattenedExercises,
    };
  }

  // Mode B: Simple / flat routine (`exercises` + optional `scheduledDays`)
  const rawDays = Array.isArray(body.scheduledDays) ? body.scheduledDays : [];
  const scheduledDays = Array.from(
    new Set(
      rawDays.filter(
        (d): d is RoutineWeekday => typeof d === "string" && VALID_WEEKDAY_SET.has(d),
      ),
    ),
  );

  const parsedExercises = validateRoutineExercises(body.exercises, {
    allowEmpty: false,
    maxItems: 30,
  });
  if (!parsedExercises.exercises) {
    return { error: parsedExercises.error ?? "Invalid exercises." };
  }

  return {
    scheduledDays,
    daySchedule: [],
    exercises: parsedExercises.exercises,
  };
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }
  try {
    const auth = await authorizeMemberWorkoutRequest(request);
    if (auth.response) return auth.response;
    const {
      memberId,
      memberGymId,
      activeRoutineMode,
      selectedGymWorkoutPlanId,
      restSettings,
      progressionSettings,
    } = auth;

    type LeanExerciseMedia = {
      _id: Types.ObjectId;
      gymId?: Types.ObjectId | null;
      exerciseKey: string;
      exerciseName: string;
      aliases?: string[];
      targetMuscleGroup?: string;
      equipment?: string;
      mediaType: ExerciseMediaType;
      mediaSource: ExerciseMediaSource;
      mediaUrl?: string;
      posterUrl?: string;
      providerName?: string;
      providerExerciseId?: string;
      animationKey?: string;
      formCue?: string;
      license?: string;
    };

    const [
      routines,
      archivedRoutines,
      gymPlans,
      logs,
      activeSessionDoc,
      progressionDocs,
      exerciseMediaDocs,
    ] = await Promise.all([
      MemberRoutineModel.find({ memberId, archived: false })
        .sort({ isActive: -1, updatedAt: -1 })
        .limit(50)
        .lean<LeanMemberRoutine[]>(),
      MemberRoutineModel.find({ memberId, archived: true })
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean<LeanMemberRoutine[]>(),
      memberGymId
        ? WorkoutPlanModel.find({ gymId: memberGymId })
            .sort({ updatedAt: -1 })
            .limit(30)
            .lean<LeanGymWorkoutPlan[]>()
        : Promise.resolve([] as LeanGymWorkoutPlan[]),
      WorkoutLogModel.find({ memberId })
        .sort({ completedAt: -1 })
        .limit(250)
        .lean<LeanWorkoutLog[]>(),
      ActiveWorkoutSessionModel.findOne({ memberId }).lean<LeanActiveWorkoutSession | null>(),
      ExerciseProgressionModel.find({ memberId })
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean<LeanExerciseProgression[]>(),
      ExerciseMediaModel.find(
        memberGymId
          ? { $or: [{ gymId: null }, { gymId: memberGymId }] }
          : { gymId: null },
      )
        .limit(500)
        .lean<LeanExerciseMedia[]>(),
    ]);

    const exerciseMediaCatalog: Record<
      string,
      {
        exerciseKey: string;
        exerciseName: string;
        targetMuscleGroup: string;
        equipment: string;
        mediaType: ExerciseMediaType;
        mediaSource: ExerciseMediaSource;
        mediaUrl: string;
        posterUrl: string;
        providerName: string;
        providerExerciseId: string;
        animationKey: string;
        formCue: string;
        license: string;
      }
    > = {};
    // Apply global catalog first, then gym-specific overrides
    const orderedMediaDocs = [...exerciseMediaDocs].sort(
      (a, b) => (a.gymId ? 1 : 0) - (b.gymId ? 1 : 0),
    );
    for (const doc of orderedMediaDocs) {
      const serialized = {
        exerciseKey: doc.exerciseKey,
        exerciseName: doc.exerciseName,
        targetMuscleGroup: doc.targetMuscleGroup || "Full body",
        equipment: doc.equipment || "Bodyweight",
        mediaType: doc.mediaType,
        mediaSource: doc.mediaSource,
        mediaUrl: doc.mediaUrl || "",
        posterUrl: doc.posterUrl || "",
        providerName: doc.providerName || "gymos-2d",
        providerExerciseId: doc.providerExerciseId || "",
        animationKey: doc.animationKey || "",
        formCue: doc.formCue || "",
        license: doc.license || "GymOS First-Party Vector",
      };
      exerciseMediaCatalog[doc.exerciseKey] = serialized;
      for (const alias of doc.aliases ?? []) {
        const cleanAlias = alias.trim().toLowerCase();
        if (cleanAlias) exerciseMediaCatalog[cleanAlias] = serialized;
      }
    }

    const { exerciseDefaults, exerciseHistory, progress } = computeProgressSummary(
      logs,
      progressionDocs,
    );
    const achievements = evaluateMemberAchievements(logs);

    const activePersonal = routines.find((r) => Boolean(r.isActive)) ?? null;
    const validSelectedGymPlan =
      selectedGymWorkoutPlanId &&
      gymPlans.some((p) => String(p._id) === String(selectedGymWorkoutPlanId))
        ? String(selectedGymWorkoutPlanId)
        : null;

    let resolvedMode: "personal" | "gym" | "none" = activeRoutineMode;
    if (resolvedMode === "gym" && !validSelectedGymPlan) {
      resolvedMode = activePersonal ? "personal" : "none";
    } else if (resolvedMode === "personal" && !activePersonal) {
      resolvedMode = "none";
    } else if (resolvedMode === "none" && activePersonal) {
      resolvedMode = "personal";
    }

    return memberApiResponse(request, {
      personalRoutines: routines.map(serializeRoutine),
      archivedRoutines: archivedRoutines.map(serializeRoutine),
      gymCatalogPlans: gymPlans.map((plan) => serializeGymPlan(plan, memberId)),
      activeSelection: {
        mode: resolvedMode,
        personalRoutineId: activePersonal ? String(activePersonal._id) : null,
        gymPlanId: validSelectedGymPlan,
      },
      restSettings,
      progressionSettings,
      activeWorkoutSession: activeSessionDoc
        ? serializeActiveWorkoutSession(activeSessionDoc)
        : null,
      recentLogs: logs.slice(0, 90).map(serializeLog),
      exerciseDefaults,
      exerciseHistory,
      exerciseMediaCatalog,
      achievements,
      progress,
    });
  } catch (error) {
    console.error("Failed to fetch member workouts & progress:", error);
    return memberApiResponse(
      request,
      { error: "Unable to load your workouts and progress right now." },
      503,
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  let body: Record<string, unknown> | null = null;
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch {
    return memberApiResponse(request, { error: "Request body must be valid JSON." }, 400);
  }
  if (!body) {
    return memberApiResponse(request, { error: "Request body must be a JSON object." }, 400);
  }

  try {
    const auth = await authorizeMemberWorkoutRequest(request, body);
    if (auth.response) return auth.response;
    const {
      memberId,
      memberGymId,
      activeRoutineMode,
      restSettings,
      progressionSettings,
    } = auth;

    const action = typeof body.action === "string" ? body.action : "";

    if (action === "update-progression-settings") {
      const paceRaw =
        typeof body.pace === "string" ? body.pace.trim() : progressionSettings.pace;
      if (
        paceRaw !== "conservative" &&
        paceRaw !== "balanced" &&
        paceRaw !== "aggressive"
      ) {
        return memberApiResponse(
          request,
          { error: "Progression pace must be conservative, balanced, or aggressive." },
          400,
        );
      }

      const incRaw =
        body.preferredIncrementKg !== undefined
          ? Number(body.preferredIncrementKg)
          : progressionSettings.preferredIncrementKg;
      if (!Number.isFinite(incRaw) || incRaw < 0 || incRaw > 10) {
        return memberApiResponse(
          request,
          { error: "Preferred increment must be between 0 and 10 kg." },
          400,
        );
      }
      const roundedIncrement = Math.round(incRaw * 100) / 100;

      await MemberModel.updateOne(
        { _id: memberId },
        {
          $set: {
            progressionPace: paceRaw,
            preferredIncrementKg: roundedIncrement,
          },
        },
      );

      return memberApiResponse(request, {
        ok: true,
        progressionSettings: {
          pace: paceRaw as ProgressionPace,
          preferredIncrementKg: roundedIncrement,
        },
      });
    }

    if (action === "respond-progression") {
      const rawName =
        typeof body.exerciseName === "string" && body.exerciseName.trim()
          ? body.exerciseName.trim()
          : typeof body.exerciseKey === "string" && body.exerciseKey.trim()
            ? body.exerciseKey.trim()
            : "";
      const exerciseKey = rawName.toLowerCase();
      if (!exerciseKey || exerciseKey.length > 80) {
        return memberApiResponse(
          request,
          { error: "A valid exerciseName is required." },
          400,
        );
      }

      const decisionRaw = typeof body.decision === "string" ? body.decision.trim() : "";
      if (
        decisionRaw !== "accepted" &&
        decisionRaw !== "adjusted" &&
        decisionRaw !== "ignored"
      ) {
        return memberApiResponse(
          request,
          { error: "decision must be accepted, adjusted, or ignored." },
          400,
        );
      }
      const decision = decisionRaw as ProgressionDecision;

      const existing = await ExerciseProgressionModel.findOne({
        memberId,
        exerciseKey,
      }).lean<LeanExerciseProgression | null>();

      if (!existing) {
        return memberApiResponse(
          request,
          { error: "No progression recommendation was found for this exercise." },
          404,
        );
      }

      let appliedWeightKg: number | null = null;
      let appliedReps: number | null = null;

      if (decision === "accepted") {
        appliedWeightKg = existing.recommendedWeightKg;
        appliedReps = existing.recommendedReps;
      } else if (decision === "adjusted") {
        const customWeightRaw =
          body.customWeightKg !== undefined
            ? Number(body.customWeightKg)
            : existing.recommendedWeightKg;
        const customRepsRaw =
          body.customReps !== undefined
            ? Number(body.customReps)
            : existing.recommendedReps;

        if (!Number.isFinite(customWeightRaw) || customWeightRaw < 0 || customWeightRaw > 1000) {
          return memberApiResponse(
            request,
            { error: "Adjusted weight must be between 0 and 1000 kg." },
            400,
          );
        }
        if (!Number.isFinite(customRepsRaw) || customRepsRaw < 1 || customRepsRaw > 500) {
          return memberApiResponse(
            request,
            { error: "Adjusted repetitions must be between 1 and 500." },
            400,
          );
        }
        appliedWeightKg = Math.round(customWeightRaw * 100) / 100;
        appliedReps = Math.round(customRepsRaw);
      }

      const updatedProgression = await ExerciseProgressionModel.findOneAndUpdate(
        { memberId, exerciseKey },
        {
          $set: {
            decision,
            appliedWeightKg,
            appliedReps,
            decidedAt: new Date(),
          },
        },
        { new: true },
      ).lean<LeanExerciseProgression | null>();

      const targetLogId =
        typeof body.logId === "string" && Types.ObjectId.isValid(body.logId)
          ? new Types.ObjectId(body.logId)
          : existing.sourceLogId && Types.ObjectId.isValid(String(existing.sourceLogId))
            ? new Types.ObjectId(String(existing.sourceLogId))
            : null;

      if (targetLogId) {
        const logDoc = await WorkoutLogModel.findOne({
          _id: targetLogId,
          memberId,
        });
        if (logDoc && Array.isArray(logDoc.exercises)) {
          let changed = false;
          for (const ex of logDoc.exercises) {
            if (ex.exerciseName?.trim().toLowerCase() === exerciseKey && ex.recommendation) {
              ex.recommendation.decision = decision;
              ex.recommendation.appliedWeightKg = appliedWeightKg;
              ex.recommendation.appliedReps = appliedReps;
              changed = true;
            }
          }
          if (changed) {
            await logDoc.save();
          }
        }
      }

      // Note: MemberRoutineModel and WorkoutPlanModel are intentionally NEVER modified here.
      return memberApiResponse(request, {
        ok: true,
        progression: updatedProgression
          ? serializeProgressionRecord(updatedProgression)
          : null,
      });
    }

    if (action === "update-rest-settings") {
      const nextDefaultRest =
        body.defaultRestSeconds !== undefined
          ? Number(body.defaultRestSeconds)
          : restSettings.defaultRestSeconds;
      if (!Number.isFinite(nextDefaultRest) || nextDefaultRest < 15 || nextDefaultRest > 600) {
        return memberApiResponse(
          request,
          { error: "Default rest duration must be between 15 and 600 seconds." },
          400,
        );
      }
      const roundedDefaultRest = Math.round(nextDefaultRest);
      const nextVibration =
        typeof body.vibrationEnabled === "boolean"
          ? body.vibrationEnabled
          : restSettings.vibrationEnabled;
      const nextNotifications =
        typeof body.notificationsEnabled === "boolean"
          ? body.notificationsEnabled
          : restSettings.notificationsEnabled;

      await MemberModel.updateOne(
        { _id: memberId },
        {
          $set: {
            defaultRestSeconds: roundedDefaultRest,
            restVibrationEnabled: nextVibration,
            restNotificationsEnabled: nextNotifications,
          },
        },
      );

      return memberApiResponse(request, {
        ok: true,
        restSettings: {
          defaultRestSeconds: roundedDefaultRest,
          vibrationEnabled: nextVibration,
          notificationsEnabled: nextNotifications,
        },
      });
    }

    if (action === "create-routine" || action === "update-routine") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const targetGoal =
        typeof body.targetGoal === "string" && body.targetGoal.trim()
          ? body.targetGoal.trim()
          : "General Fitness";
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 240) : "";

      if (!title || title.length > 80) {
        return memberApiResponse(
          request,
          { error: "Routine title is required (up to 80 characters)." },
          400,
        );
      }
      if (targetGoal.length > 80) {
        return memberApiResponse(
          request,
          { error: "Target goal must be 80 characters or fewer." },
          400,
        );
      }

      const parsed = parseRoutineScheduleAndExercises(body);
      if (!parsed.exercises) {
        return memberApiResponse(
          request,
          { error: parsed.error ?? "Invalid routine exercises." },
          400,
        );
      }

      if (action === "create-routine") {
        const activeCount = await MemberRoutineModel.countDocuments({
          memberId,
          archived: false,
        });
        if (activeCount >= 30) {
          return memberApiResponse(
            request,
            { error: "You can keep up to 30 active personal routines." },
            400,
          );
        }

        const existingActive = await MemberRoutineModel.exists({
          memberId,
          archived: false,
          isActive: true,
        });
        const shouldActivate =
          body.setAsActive === true ||
          (body.setAsActive !== false && !existingActive && activeRoutineMode !== "gym");

        if (shouldActivate) {
          await MemberRoutineModel.updateMany(
            { memberId, isActive: true },
            { $set: { isActive: false } },
          );
        }

        const created = await MemberRoutineModel.create({
          memberId,
          gymId: memberGymId,
          title,
          targetGoal,
          notes,
          scheduledDays: parsed.scheduledDays ?? [],
          daySchedule: parsed.daySchedule ?? [],
          exercises: parsed.exercises,
          isActive: shouldActivate,
          archived: false,
        });

        if (shouldActivate) {
          await MemberModel.updateOne(
            { _id: memberId },
            { $set: { activeRoutineMode: "personal" } },
          );
        }

        return memberApiResponse(
          request,
          { routine: serializeRoutine(created.toObject() as unknown as LeanMemberRoutine) },
          201,
        );
      }

      const routineId = typeof body.routineId === "string" ? body.routineId.trim() : "";
      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }
      const targetObjectId = new Types.ObjectId(routineId);

      const updateFields: Record<string, unknown> = {
        title,
        targetGoal,
        notes,
        scheduledDays: parsed.scheduledDays ?? [],
        daySchedule: parsed.daySchedule ?? [],
        exercises: parsed.exercises,
      };
      if (body.setAsActive === true) {
        await MemberRoutineModel.updateMany(
          { memberId, _id: { $ne: targetObjectId }, isActive: true },
          { $set: { isActive: false } },
        );
        updateFields.isActive = true;
      }

      const updated = await MemberRoutineModel.findOneAndUpdate(
        { _id: targetObjectId, memberId, archived: false },
        { $set: updateFields },
        { new: true },
      ).lean<LeanMemberRoutine | null>();

      if (!updated) {
        return memberApiResponse(request, { error: "Personal routine was not found." }, 404);
      }

      if (body.setAsActive === true) {
        await MemberModel.updateOne(
          { _id: memberId },
          { $set: { activeRoutineMode: "personal" } },
        );
      }

      return memberApiResponse(request, { routine: serializeRoutine(updated) });
    }

    if (action === "duplicate-routine") {
      const routineId = typeof body.routineId === "string" ? body.routineId.trim() : "";
      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }

      const activeCount = await MemberRoutineModel.countDocuments({
        memberId,
        archived: false,
      });
      if (activeCount >= 30) {
        return memberApiResponse(
          request,
          { error: "You can keep up to 30 active personal routines." },
          400,
        );
      }

      const source = await MemberRoutineModel.findOne({
        _id: new Types.ObjectId(routineId),
        memberId,
      }).lean<LeanMemberRoutine | null>();

      if (!source) {
        return memberApiResponse(request, { error: "Personal routine was not found." }, 404);
      }

      const customTitle =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 80)
          : `${source.title} (Copy)`.slice(0, 80);

      const duplicated = await MemberRoutineModel.create({
        memberId,
        gymId: memberGymId,
        title: customTitle,
        targetGoal: source.targetGoal || "General Fitness",
        notes: source.notes ?? "",
        scheduledDays: source.scheduledDays ?? [],
        daySchedule: source.daySchedule ?? [],
        sourceGymPlanId: source.sourceGymPlanId ?? null,
        exercises: source.exercises ?? [],
        isActive: false,
        archived: false,
      });

      return memberApiResponse(
        request,
        { routine: serializeRoutine(duplicated.toObject() as unknown as LeanMemberRoutine) },
        201,
      );
    }

    if (action === "set-active-routine") {
      const routineId =
        typeof body.routineId === "string" ? body.routineId.trim() : "";

      if (!routineId) {
        await MemberRoutineModel.updateMany(
          { memberId, isActive: true },
          { $set: { isActive: false } },
        );
        await MemberModel.updateOne(
          { _id: memberId },
          { $set: { activeRoutineMode: "none" } },
        );
        return memberApiResponse(request, {
          ok: true,
          activeSelection: { mode: "none", personalRoutineId: null, gymPlanId: null },
        });
      }

      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }
      const targetId = new Types.ObjectId(routineId);
      const target = await MemberRoutineModel.findOne({
        _id: targetId,
        memberId,
        archived: false,
      }).lean<LeanMemberRoutine | null>();

      if (!target) {
        return memberApiResponse(request, { error: "Personal routine was not found." }, 404);
      }

      await MemberRoutineModel.updateMany(
        { memberId, _id: { $ne: targetId }, isActive: true },
        { $set: { isActive: false } },
      );
      const activated = await MemberRoutineModel.findOneAndUpdate(
        { _id: targetId, memberId, archived: false },
        { $set: { isActive: true } },
        { new: true },
      ).lean<LeanMemberRoutine | null>();

      await MemberModel.updateOne(
        { _id: memberId },
        { $set: { activeRoutineMode: "personal" } },
      );

      return memberApiResponse(request, {
        ok: true,
        routine: activated ? serializeRoutine(activated) : null,
        activeSelection: {
          mode: "personal",
          personalRoutineId: String(targetId),
          gymPlanId: null,
        },
      });
    }

    if (action === "archive-routine") {
      const routineId = typeof body.routineId === "string" ? body.routineId.trim() : "";
      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }
      const archived = await MemberRoutineModel.findOneAndUpdate(
        { _id: new Types.ObjectId(routineId), memberId, archived: false },
        { $set: { archived: true, isActive: false } },
        { new: true },
      ).lean<LeanMemberRoutine | null>();

      if (!archived) {
        return memberApiResponse(request, { error: "Personal routine was not found." }, 404);
      }

      const stillHasActive = await MemberRoutineModel.exists({
        memberId,
        archived: false,
        isActive: true,
      });
      if (!stillHasActive && activeRoutineMode === "personal") {
        await MemberModel.updateOne(
          { _id: memberId },
          { $set: { activeRoutineMode: "none" } },
        );
      }

      return memberApiResponse(request, { ok: true, routine: serializeRoutine(archived) });
    }

    if (action === "unarchive-routine") {
      const routineId = typeof body.routineId === "string" ? body.routineId.trim() : "";
      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }
      const activeCount = await MemberRoutineModel.countDocuments({
        memberId,
        archived: false,
      });
      if (activeCount >= 30) {
        return memberApiResponse(
          request,
          { error: "You can keep up to 30 active personal routines." },
          400,
        );
      }

      const restored = await MemberRoutineModel.findOneAndUpdate(
        { _id: new Types.ObjectId(routineId), memberId, archived: true },
        { $set: { archived: false } },
        { new: true },
      ).lean<LeanMemberRoutine | null>();

      if (!restored) {
        return memberApiResponse(request, { error: "Archived routine was not found." }, 404);
      }

      return memberApiResponse(request, { ok: true, routine: serializeRoutine(restored) });
    }

    if (action === "delete-routine") {
      const routineId = typeof body.routineId === "string" ? body.routineId.trim() : "";
      if (!Types.ObjectId.isValid(routineId)) {
        return memberApiResponse(request, { error: "A valid routineId is required." }, 400);
      }
      const deleted = await MemberRoutineModel.findOneAndDelete({
        _id: new Types.ObjectId(routineId),
        memberId,
      }).lean<LeanMemberRoutine | null>();

      if (!deleted) {
        return memberApiResponse(request, { error: "Personal routine was not found." }, 404);
      }

      if (deleted.isActive && activeRoutineMode === "personal") {
        await MemberModel.updateOne(
          { _id: memberId },
          { $set: { activeRoutineMode: "none" } },
        );
      }

      return memberApiResponse(request, { ok: true, routineId });
    }

    if (action === "select-gym-routine") {
      if (!memberGymId) {
        return memberApiResponse(
          request,
          { error: "Connect to a gym first to select a gym workout routine." },
          400,
        );
      }

      const workoutPlanId =
        typeof body.workoutPlanId === "string" ? body.workoutPlanId.trim() : "";

      if (!workoutPlanId) {
        const activePersonal = await MemberRoutineModel.findOne({
          memberId,
          archived: false,
          isActive: true,
        })
          .select("_id")
          .lean<{ _id: Types.ObjectId } | null>();

        const nextMode = activePersonal ? "personal" : "none";
        await MemberModel.updateOne(
          { _id: memberId },
          {
            $set: {
              selectedGymWorkoutPlanId: null,
              activeRoutineMode: nextMode,
            },
          },
        );
        return memberApiResponse(request, {
          ok: true,
          activeSelection: {
            mode: nextMode,
            personalRoutineId: activePersonal ? String(activePersonal._id) : null,
            gymPlanId: null,
          },
        });
      }

      if (!Types.ObjectId.isValid(workoutPlanId)) {
        return memberApiResponse(
          request,
          { error: "A valid workoutPlanId is required." },
          400,
        );
      }

      const planId = new Types.ObjectId(workoutPlanId);
      const gymPlan = await WorkoutPlanModel.findOne({
        _id: planId,
        gymId: memberGymId,
      })
        .select("_id title")
        .lean<{ _id: Types.ObjectId; title: string } | null>();

      if (!gymPlan) {
        return memberApiResponse(
          request,
          { error: "Gym workout routine was not found in your gym." },
          404,
        );
      }

      // Non-destructive: selecting a gym routine never deletes, overwrites, or alters personal routines!
      await MemberModel.updateOne(
        { _id: memberId },
        {
          $set: {
            selectedGymWorkoutPlanId: gymPlan._id,
            activeRoutineMode: "gym",
          },
        },
      );

      return memberApiResponse(request, {
        ok: true,
        activeSelection: {
          mode: "gym",
          personalRoutineId: null,
          gymPlanId: String(gymPlan._id),
        },
      });
    }

    if (action === "duplicate-gym-plan") {
      if (!memberGymId) {
        return memberApiResponse(
          request,
          { error: "Connect to a gym first to copy a gym workout routine." },
          400,
        );
      }

      const activeCount = await MemberRoutineModel.countDocuments({
        memberId,
        archived: false,
      });
      if (activeCount >= 30) {
        return memberApiResponse(
          request,
          { error: "You can keep up to 30 active personal routines." },
          400,
        );
      }

      const workoutPlanId =
        typeof body.workoutPlanId === "string" ? body.workoutPlanId.trim() : "";
      const gymPlanQuery = Types.ObjectId.isValid(workoutPlanId)
        ? { _id: new Types.ObjectId(workoutPlanId), gymId: memberGymId }
        : { gymId: memberGymId, assignedMemberIds: memberId };

      const gymPlan = await WorkoutPlanModel.findOne(gymPlanQuery).lean<LeanGymWorkoutPlan | null>();

      if (!gymPlan) {
        return memberApiResponse(
          request,
          { error: "Gym workout routine was not found." },
          404,
        );
      }

      const customTitle =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 80)
          : `${gymPlan.title} (My Copy)`.slice(0, 80);

      const mappedExercises: LeanRoutineExercise[] = (gymPlan.exercises ?? []).map((ex) => ({
        exerciseName: ex.exerciseName,
        targetMuscleGroup: ex.targetMuscleGroup || "Full body",
        sets: Math.max(1, Math.min(20, Number.parseInt(ex.sets, 10) || 3)),
        reps: ex.reps || "10",
        restSeconds: parseRestSecondsFromLabel(ex.restTime || "60s"),
        targetWeightKg: 0,
        notes: "",
        setPlans: [],
      }));

      if (mappedExercises.length === 0) {
        return memberApiResponse(
          request,
          { error: "Cannot duplicate an empty workout plan." },
          400,
        );
      }

      const created = await MemberRoutineModel.create({
        memberId,
        gymId: memberGymId,
        title: customTitle,
        targetGoal: gymPlan.targetGoal || "General Fitness",
        notes: `Customized from gym routine: ${gymPlan.title}`.slice(0, 240),
        scheduledDays: [],
        daySchedule: [],
        sourceGymPlanId: gymPlan._id,
        exercises: mappedExercises,
        isActive: false,
        archived: false,
      });

      return memberApiResponse(
        request,
        { routine: serializeRoutine(created.toObject() as unknown as LeanMemberRoutine) },
        201,
      );
    }

    if (action === "sync-active-session") {
      const clientSessionId =
        typeof body.clientSessionId === "string"
          ? body.clientSessionId.trim().slice(0, 80)
          : "";
      if (clientSessionId.length < 4) {
        return memberApiResponse(
          request,
          { error: "A valid clientSessionId is required." },
          400,
        );
      }

      // If this session was already finalized as a WorkoutLog, do not recreate the draft
      const alreadyCompleted = await WorkoutLogModel.exists({
        memberId,
        clientSessionId,
      });
      if (alreadyCompleted) {
        await ActiveWorkoutSessionModel.deleteOne({ memberId, clientSessionId });
        return memberApiResponse(request, {
          ok: true,
          alreadyCompleted: true,
          activeWorkoutSession: null,
        });
      }

      const sourceTypeRaw = typeof body.sourceType === "string" ? body.sourceType : "";
      if (!VALID_SOURCE_SET.has(sourceTypeRaw)) {
        return memberApiResponse(
          request,
          { error: "sourceType must be gym_assigned, member_routine, or free_workout." },
          400,
        );
      }
      const sourceType = sourceTypeRaw as WorkoutSourceType;
      const routineIdRaw = typeof body.routineId === "string" ? body.routineId.trim() : "";
      let routineObjectId: Types.ObjectId | null = null;

      if (routineIdRaw && sourceType !== "free_workout") {
        if (!Types.ObjectId.isValid(routineIdRaw)) {
          return memberApiResponse(request, { error: "Invalid routineId." }, 400);
        }
        routineObjectId = new Types.ObjectId(routineIdRaw);
        if (sourceType === "member_routine") {
          const ownsRoutine = await MemberRoutineModel.exists({
            _id: routineObjectId,
            memberId,
          });
          if (!ownsRoutine) {
            return memberApiResponse(
              request,
              { error: "Personal routine could not be verified." },
              403,
            );
          }
        } else if (sourceType === "gym_assigned") {
          if (!memberGymId) {
            return memberApiResponse(
              request,
              { error: "Gym workout plan could not be verified." },
              403,
            );
          }
          const validGymPlan = await WorkoutPlanModel.exists({
            _id: routineObjectId,
            gymId: memberGymId,
          });
          if (!validGymPlan) {
            return memberApiResponse(
              request,
              { error: "Gym workout plan could not be verified." },
              403,
            );
          }
        }
      }

      const routineTitle =
        typeof body.routineTitle === "string" && body.routineTitle.trim()
          ? body.routineTitle.trim().slice(0, 80)
          : "Workout Session";
      const dayLabel =
        typeof body.dayLabel === "string" ? body.dayLabel.trim().slice(0, 80) : "";
      const targetGoal =
        typeof body.targetGoal === "string" ? body.targetGoal.trim().slice(0, 80) : "";

      const startedAt =
        typeof body.startedAtIso === "string" && !Number.isNaN(Date.parse(body.startedAtIso))
          ? new Date(body.startedAtIso)
          : typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt))
            ? new Date(body.startedAt)
            : new Date();

      const pausedSeconds = Math.max(
        0,
        Math.min(86400, Number(body.pausedSeconds) || 0),
      );
      const isPaused = Boolean(body.isPaused);
      const lastPauseStartedAt =
        isPaused &&
        typeof body.lastPauseStartedIso === "string" &&
        !Number.isNaN(Date.parse(body.lastPauseStartedIso))
          ? new Date(body.lastPauseStartedIso)
          : null;

      const restTimerId =
        typeof body.restTimerId === "string" ? body.restTimerId.trim().slice(0, 80) : "";
      const restStartedAt =
        typeof body.restStartedAtIso === "string" &&
        !Number.isNaN(Date.parse(body.restStartedAtIso))
          ? new Date(body.restStartedAtIso)
          : null;
      const restEndsAt =
        typeof body.restEndsAtIso === "string" &&
        !Number.isNaN(Date.parse(body.restEndsAtIso))
          ? new Date(body.restEndsAtIso)
          : null;
      const restDurationSeconds = Math.max(
        0,
        Math.min(600, Math.round(Number(body.restDurationSeconds) || 0)),
      );
      const rawPausedRem = Number(body.restPausedRemainingMs);
      const restPausedRemainingMs =
        body.restPausedRemainingMs !== null &&
        body.restPausedRemainingMs !== undefined &&
        Number.isFinite(rawPausedRem) &&
        rawPausedRem > 0
          ? Math.min(600_000, Math.round(rawPausedRem))
          : null;
      const currentExerciseIndex = Math.max(
        0,
        Math.min(40, Math.floor(Number(body.currentExerciseIndex) || 0)),
      );
      const clientUpdatedAtMs = Math.max(
        0,
        Math.floor(Number(body.clientUpdatedAtMs) || Date.now()),
      );

      if (!Array.isArray(body.exercises) || body.exercises.length > 40) {
        return memberApiResponse(
          request,
          { error: "Active workout exercises must be a valid array (up to 40)." },
          400,
        );
      }

      const normalizedExercises: LeanActiveSessionExercise[] = [];
      for (const rawEx of body.exercises) {
        if (!rawEx || typeof rawEx !== "object" || Array.isArray(rawEx)) continue;
        const exObj = rawEx as Record<string, unknown>;
        const exerciseName =
          typeof exObj.exerciseName === "string"
            ? exObj.exerciseName.trim().slice(0, 80)
            : typeof exObj.name === "string"
              ? exObj.name.trim().slice(0, 80)
              : "";
        if (!exerciseName) continue;

        const targetMuscleGroup =
          typeof exObj.targetMuscleGroup === "string" && exObj.targetMuscleGroup.trim()
            ? exObj.targetMuscleGroup.trim().slice(0, 40)
            : typeof exObj.muscle === "string" && exObj.muscle.trim()
              ? exObj.muscle.trim().slice(0, 40)
              : "Full body";
        const restSeconds = Math.max(
          0,
          Math.min(600, Math.round(Number(exObj.restSeconds) || restSettings.defaultRestSeconds || 60)),
        );
        const usesDefaultRest = exObj.usesDefaultRest !== false;
        const targetRepsLabel =
          typeof exObj.targetRepsLabel === "string" && exObj.targetRepsLabel.trim()
            ? exObj.targetRepsLabel.trim().slice(0, 20)
            : "10";
        const notes =
          typeof exObj.notes === "string" ? exObj.notes.trim().slice(0, 160) : "";

        // Deduplicate sets by setNumber so retried sync calls never create duplicate sets
        const dedupedBySetNumber = new Map<number, LeanActiveSessionSet>();
        const rawSets = Array.isArray(exObj.sets) ? exObj.sets : [];
        for (let sIdx = 0; sIdx < Math.min(30, rawSets.length); sIdx += 1) {
          const rs = rawSets[sIdx];
          if (!rs || typeof rs !== "object" || Array.isArray(rs)) continue;
          const s = rs as Record<string, unknown>;
          const rawNum = Math.floor(Number(s.setNumber) || sIdx + 1);
          const setNumber = Math.max(1, Math.min(30, rawNum));
          const weightKg = Math.max(
            0,
            Math.min(1000, Math.round((Number(s.weightKg) || 0) * 10) / 10),
          );
          const reps = Math.max(0, Math.min(500, Math.round(Number(s.reps) || 0)));
          const completed = Boolean(s.completed);
          const completedAt =
            completed &&
            typeof s.completedAtIso === "string" &&
            !Number.isNaN(Date.parse(s.completedAtIso))
              ? new Date(s.completedAtIso)
              : completed
                ? new Date()
                : null;

          dedupedBySetNumber.set(setNumber, {
            setNumber,
            weightKg,
            reps,
            completed,
            completedAt,
          });
        }

        const orderedSets = Array.from(dedupedBySetNumber.values())
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((item, idx) => ({ ...item, setNumber: idx + 1 }));

        const feedback = sanitizeFeedbackPayload(exObj.feedback);

        normalizedExercises.push({
          exerciseName,
          targetMuscleGroup,
          restSeconds,
          usesDefaultRest,
          targetRepsLabel,
          notes,
          feedback,
          sets: orderedSets,
        });
      }

      const existingDraft =
        await ActiveWorkoutSessionModel.findOne({ memberId }).lean<LeanActiveWorkoutSession | null>();
      if (
        existingDraft &&
        existingDraft.clientSessionId === clientSessionId &&
        existingDraft.clientUpdatedAtMs > clientUpdatedAtMs
      ) {
        return memberApiResponse(request, {
          ok: true,
          staleIgnored: true,
          activeWorkoutSession: serializeActiveWorkoutSession(existingDraft),
        });
      }

      const savedDraft = await ActiveWorkoutSessionModel.findOneAndUpdate(
        { memberId },
        {
          $set: {
            gymId: memberGymId,
            clientSessionId,
            sourceType,
            routineId: routineObjectId,
            routineTitle,
            dayLabel,
            targetGoal,
            startedAt,
            pausedSeconds,
            isPaused,
            lastPauseStartedAt,
            restTimerId,
            restStartedAt,
            restEndsAt,
            restDurationSeconds,
            restPausedRemainingMs,
            currentExerciseIndex,
            clientUpdatedAtMs,
            exercises: normalizedExercises,
          },
        },
        { upsert: true, new: true },
      ).lean<LeanActiveWorkoutSession | null>();

      return memberApiResponse(request, {
        ok: true,
        activeWorkoutSession: savedDraft
          ? serializeActiveWorkoutSession(savedDraft)
          : null,
      });
    }

    if (action === "discard-active-session") {
      const clientSessionId =
        typeof body.clientSessionId === "string" && body.clientSessionId.trim()
          ? body.clientSessionId.trim().slice(0, 80)
          : "";
      await ActiveWorkoutSessionModel.deleteOne(
        clientSessionId ? { memberId, clientSessionId } : { memberId },
      );
      return memberApiResponse(request, { ok: true });
    }

    if (action === "log-workout") {
      const clientSessionId =
        typeof body.clientSessionId === "string" && body.clientSessionId.trim()
          ? body.clientSessionId.trim().slice(0, 80)
          : null;

      // Idempotency guard: prevent duplicate submissions from creating duplicate logs/sets
      if (clientSessionId) {
        const existingLog = await WorkoutLogModel.findOne({
          memberId,
          clientSessionId,
        }).lean<LeanWorkoutLog | null>();
        if (existingLog) {
          await ActiveWorkoutSessionModel.deleteOne({ memberId, clientSessionId });
          return memberApiResponse(
            request,
            {
              log: serializeLog(existingLog),
              deduplicated: true,
              newPersonalRecords: [],
            },
            200,
          );
        }
      }

      const sourceTypeRaw = typeof body.sourceType === "string" ? body.sourceType : "";
      if (!VALID_SOURCE_SET.has(sourceTypeRaw)) {
        return memberApiResponse(
          request,
          { error: "sourceType must be gym_assigned, member_routine, or free_workout." },
          400,
        );
      }
      const sourceType = sourceTypeRaw as WorkoutSourceType;
      const routineIdRaw = typeof body.routineId === "string" ? body.routineId.trim() : "";
      let routineObjectId: Types.ObjectId | null = null;

      if (routineIdRaw && sourceType !== "free_workout") {
        if (!Types.ObjectId.isValid(routineIdRaw)) {
          return memberApiResponse(request, { error: "Invalid routineId." }, 400);
        }
        routineObjectId = new Types.ObjectId(routineIdRaw);
        if (sourceType === "member_routine") {
          const ownsRoutine = await MemberRoutineModel.exists({
            _id: routineObjectId,
            memberId,
          });
          if (!ownsRoutine) {
            return memberApiResponse(
              request,
              { error: "Personal routine could not be verified." },
              403,
            );
          }
        } else if (sourceType === "gym_assigned") {
          if (!memberGymId) {
            return memberApiResponse(
              request,
              { error: "Assigned gym workout plan could not be verified." },
              403,
            );
          }
          const validGymPlan = await WorkoutPlanModel.exists({
            _id: routineObjectId,
            gymId: memberGymId,
          });
          if (!validGymPlan) {
            return memberApiResponse(
              request,
              { error: "Gym workout plan could not be verified." },
              403,
            );
          }
        }
      }

      const routineTitle =
        typeof body.routineTitle === "string" ? body.routineTitle.trim().slice(0, 80) : "";
      if (!routineTitle) {
        return memberApiResponse(request, { error: "routineTitle is required." }, 400);
      }
      const targetGoal =
        typeof body.targetGoal === "string" ? body.targetGoal.trim().slice(0, 80) : "";
      const durationRaw =
        typeof body.durationSeconds === "number"
          ? body.durationSeconds
          : Number(body.durationSeconds ?? 1800);
      const durationSeconds = Number.isFinite(durationRaw)
        ? Math.max(1, Math.min(43200, Math.round(durationRaw)))
        : 1800;

      const now = new Date();
      let startedAt = new Date(now.getTime() - durationSeconds * 1000);
      if (typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt))) {
        startedAt = new Date(body.startedAt);
      }

      const effortRaw =
        body.effortRating === null || body.effortRating === undefined
          ? null
          : Number(body.effortRating);
      const effortRating =
        effortRaw !== null && Number.isInteger(effortRaw) && effortRaw >= 1 && effortRaw <= 5
          ? effortRaw
          : null;
      const sessionNotes =
        typeof body.sessionNotes === "string" ? body.sessionNotes.trim().slice(0, 280) : "";

      if (!Array.isArray(body.exercises) || body.exercises.length < 1 || body.exercises.length > 40) {
        return memberApiResponse(
          request,
          { error: "Log at least one exercise to save your workout." },
          400,
        );
      }

      let totalSetsCompleted = 0;
      let totalRepsCompleted = 0;
      let totalVolumeKg = 0;
      const loggedExercises: Array<
        LeanLoggedExercise & {
          _clientDecision?: ProgressionDecision;
          _clientAppliedWeightKg?: number | null;
          _clientAppliedReps?: number | null;
        }
      > = [];

      for (const rawEx of body.exercises) {
        if (!rawEx || typeof rawEx !== "object" || Array.isArray(rawEx)) continue;
        const exObj = rawEx as Record<string, unknown>;
        const exerciseName =
          typeof exObj.exerciseName === "string"
            ? exObj.exerciseName.trim().slice(0, 80)
            : typeof exObj.name === "string"
              ? exObj.name.trim().slice(0, 80)
              : "";
        const targetMuscleGroup =
          typeof exObj.targetMuscleGroup === "string"
            ? exObj.targetMuscleGroup.trim().slice(0, 40)
            : typeof exObj.muscle === "string"
              ? exObj.muscle.trim().slice(0, 40)
              : "Full body";

        if (!exerciseName || !Array.isArray(exObj.sets)) continue;

        const feedbackObj =
          exObj.feedback && typeof exObj.feedback === "object" && !Array.isArray(exObj.feedback)
            ? (exObj.feedback as Record<string, unknown>)
            : null;

        const rawDiff =
          exObj.difficultyRating !== undefined && exObj.difficultyRating !== null
            ? Number(exObj.difficultyRating)
            : feedbackObj?.difficultyRating !== undefined &&
                feedbackObj?.difficultyRating !== null
              ? Number(feedbackObj.difficultyRating)
              : null;
        const difficultyRating =
          rawDiff !== null && Number.isFinite(rawDiff) && rawDiff >= 1 && rawDiff <= 10
            ? Math.round(rawDiff)
            : null;

        const reportedDiscomfort =
          Boolean(exObj.reportedDiscomfort) || Boolean(feedbackObj?.reportedDiscomfort);

        const targetRepsLabel =
          typeof exObj.targetRepsLabel === "string" && exObj.targetRepsLabel.trim()
            ? exObj.targetRepsLabel.trim().slice(0, 20)
            : "";

        const rawTargetSets =
          exObj.targetSets !== undefined && exObj.targetSets !== null
            ? Number(exObj.targetSets)
            : exObj.sets.length;

        const rawDecision =
          typeof exObj.decision === "string"
            ? exObj.decision
            : typeof feedbackObj?.decision === "string"
              ? feedbackObj.decision
              : "pending";
        const clientDecision: ProgressionDecision = VALID_PROGRESSION_DECISION_SET.has(
          rawDecision,
        )
          ? (rawDecision as ProgressionDecision)
          : "pending";

        const rawAppliedWeight =
          exObj.appliedWeightKg !== undefined
            ? exObj.appliedWeightKg
            : feedbackObj?.appliedWeightKg;
        const clientAppliedWeightKg =
          rawAppliedWeight !== null &&
          rawAppliedWeight !== undefined &&
          Number.isFinite(Number(rawAppliedWeight))
            ? Math.max(0, Math.min(1000, Math.round(Number(rawAppliedWeight) * 100) / 100))
            : null;

        const rawAppliedReps =
          exObj.appliedReps !== undefined
            ? exObj.appliedReps
            : feedbackObj?.appliedReps;
        const clientAppliedReps =
          rawAppliedReps !== null &&
          rawAppliedReps !== undefined &&
          Number.isFinite(Number(rawAppliedReps))
            ? Math.max(1, Math.min(500, Math.round(Number(rawAppliedReps))))
            : null;

        // Deduplicate sets by setNumber so retried or double-tapped set completions never duplicate
        const dedupedSetsByNumber = new Map<
          number,
          { reps: number; weightKg: number }
        >();
        for (let idx = 0; idx < Math.min(30, exObj.sets.length); idx += 1) {
          const rawSet = exObj.sets[idx];
          if (!rawSet || typeof rawSet !== "object" || Array.isArray(rawSet)) continue;
          const s = rawSet as Record<string, unknown>;
          const completed = Boolean(s.completed);
          if (!completed) continue;

          const explicitNum = Math.floor(Number(s.setNumber) || idx + 1);
          const setKey = Math.max(1, Math.min(30, explicitNum));
          const repsVal = Math.max(
            0,
            Math.min(500, Math.round(Number(s.reps) || 0)),
          );
          const weightVal = Math.max(
            0,
            Math.min(1000, Math.round((Number(s.weightKg) || 0) * 10) / 10),
          );

          dedupedSetsByNumber.set(setKey, { reps: repsVal, weightKg: weightVal });
        }

        const cleanedSets: LeanLoggedSet[] = Array.from(dedupedSetsByNumber.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, val], idx) => {
            totalSetsCompleted += 1;
            totalRepsCompleted += val.reps;
            totalVolumeKg += val.reps * val.weightKg;
            return {
              setNumber: idx + 1,
              reps: val.reps,
              weightKg: val.weightKg,
              completed: true,
            };
          });

        if (cleanedSets.length > 0) {
          const targetSets = Number.isFinite(rawTargetSets)
            ? Math.max(cleanedSets.length, Math.min(30, Math.round(rawTargetSets)))
            : cleanedSets.length;

          loggedExercises.push({
            exerciseName,
            targetMuscleGroup,
            targetSets,
            targetRepsLabel,
            difficultyRating,
            reportedDiscomfort,
            recommendation: null,
            sets: cleanedSets,
            _clientDecision: clientDecision,
            _clientAppliedWeightKg: clientAppliedWeightKg,
            _clientAppliedReps: clientAppliedReps,
          });
        }
      }

      if (totalSetsCompleted < 1 || loggedExercises.length < 1) {
        return memberApiResponse(
          request,
          { error: "Complete at least one set before finishing your workout." },
          400,
        );
      }

      const [priorLogs, priorProgressions] = await Promise.all([
        WorkoutLogModel.find({ memberId })
          .sort({ completedAt: -1 })
          .limit(250)
          .lean<LeanWorkoutLog[]>(),
        ExerciseProgressionModel.find({ memberId }).lean<LeanExerciseProgression[]>(),
      ]);
      const priorDefaults = computeProgressSummary(
        priorLogs,
        priorProgressions,
      ).exerciseDefaults;
      const priorProgressionByKey = new Map<string, LeanExerciseProgression>();
      for (const p of priorProgressions) {
        if (p.exerciseKey) {
          priorProgressionByKey.set(p.exerciseKey.toLowerCase(), p);
        }
      }

      const newPersonalRecords: Array<{
        exerciseName: string;
        weightKg: number;
        reps: number;
      }> = [];

      const progressionsToUpsert: Array<{
        exerciseKey: string;
        exerciseName: string;
        targetMuscleGroup: string;
        basedOnWeightKg: number;
        basedOnReps: number;
        basedOnSets: number;
        basedOnDifficulty: number | null;
        reportedDiscomfort: boolean;
        action: ProgressionAction;
        recommendedWeightKg: number;
        recommendedReps: number;
        summaryText: string;
        reasonCode: string;
        decision: ProgressionDecision;
        appliedWeightKg: number | null;
        appliedReps: number | null;
      }> = [];

      for (const ex of loggedExercises) {
        const key = ex.exerciseName.toLowerCase();
        const bestSet = ex.sets.reduce((best, curr) => {
          if (curr.weightKg > best.weightKg) return curr;
          if (curr.weightKg === best.weightKg && curr.reps > best.reps) return curr;
          return best;
        }, ex.sets[0]);

        if (bestSet.weightKg > 0) {
          const prev = priorDefaults[key];
          if (
            !prev ||
            bestSet.weightKg > prev.bestWeightKg ||
            (bestSet.weightKg === prev.bestWeightKg &&
              bestSet.reps > prev.bestRepsAtMaxWeight)
          ) {
            newPersonalRecords.push({
              exerciseName: ex.exerciseName,
              weightKg: bestSet.weightKg,
              reps: bestSet.reps,
            });
          }
        }

        // Evaluate intelligent progression ONLY when feedback (difficulty or discomfort) was reported.
        // Never recommend increasing weights simply because an exercise was completed!
        if (ex.difficultyRating !== null || ex.reportedDiscomfort) {
          const recentHistory: Array<{
            weightKg: number;
            reps: number;
            setsCompleted: number;
            difficultyRating: number | null;
            reportedDiscomfort?: boolean;
          }> = [];

          for (const pLog of priorLogs) {
            const matchEx = (pLog.exercises ?? []).find(
              (pe) => pe.exerciseName.trim().toLowerCase() === key,
            );
            if (!matchEx) continue;
            const compSets = (matchEx.sets ?? []).filter((s) => s.completed);
            if (compSets.length === 0) continue;
            const topPrev = compSets.reduce((b, c) => (c.weightKg > b.weightKg ? c : b), compSets[0]);
            const avgPrevReps = Math.round(
              compSets.reduce((acc, s) => acc + s.reps, 0) / compSets.length,
            );
            recentHistory.push({
              weightKg: topPrev.weightKg,
              reps: avgPrevReps,
              setsCompleted: compSets.length,
              difficultyRating:
                typeof matchEx.difficultyRating === "number"
                  ? matchEx.difficultyRating
                  : null,
              reportedDiscomfort: Boolean(matchEx.reportedDiscomfort),
            });
            if (recentHistory.length >= 5) break;
          }

          const prevRec = priorProgressionByKey.get(key) ?? null;
          const fallbackRepsLabel =
            ex.targetRepsLabel || String(ex.sets[0]?.reps ?? 10);

          const evaluated = evaluateExerciseProgression({
            exerciseName: ex.exerciseName,
            muscle: ex.targetMuscleGroup,
            targetGoal,
            targetSets: ex.targetSets ?? ex.sets.length,
            targetRepsLabel: fallbackRepsLabel,
            completedSets: ex.sets.map((s) => ({
              weightKg: s.weightKg,
              reps: s.reps,
            })),
            difficultyRating: ex.difficultyRating ?? 6,
            reportedDiscomfort: Boolean(ex.reportedDiscomfort),
            recentHistory,
            previousRecommendation: prevRec
              ? {
                  action: prevRec.action,
                  recommendedWeightKg: prevRec.recommendedWeightKg,
                  recommendedReps: prevRec.recommendedReps,
                  decision: prevRec.decision,
                }
              : null,
            ruleSettings: progressionSettings,
          });

          const decision = ex._clientDecision ?? "pending";
          let appliedWeightKg: number | null = null;
          let appliedReps: number | null = null;
          if (decision === "accepted") {
            appliedWeightKg = evaluated.recommendedWeightKg;
            appliedReps = evaluated.recommendedReps;
          } else if (decision === "adjusted") {
            appliedWeightKg =
              ex._clientAppliedWeightKg ?? evaluated.recommendedWeightKg;
            appliedReps = ex._clientAppliedReps ?? evaluated.recommendedReps;
          }

          ex.recommendation = {
            action: evaluated.action,
            recommendedWeightKg: evaluated.recommendedWeightKg,
            recommendedReps: evaluated.recommendedReps,
            summaryText: evaluated.summaryText,
            reasonCode: evaluated.reasonCode,
            decision,
            appliedWeightKg,
            appliedReps,
          };

          const avgCurrentReps = Math.max(
            1,
            Math.round(
              ex.sets.reduce((acc, s) => acc + s.reps, 0) / ex.sets.length,
            ),
          );
          progressionsToUpsert.push({
            exerciseKey: key,
            exerciseName: ex.exerciseName,
            targetMuscleGroup: ex.targetMuscleGroup,
            basedOnWeightKg: bestSet.weightKg,
            basedOnReps: avgCurrentReps,
            basedOnSets: ex.sets.length,
            basedOnDifficulty: ex.difficultyRating ?? null,
            reportedDiscomfort: Boolean(ex.reportedDiscomfort),
            action: evaluated.action,
            recommendedWeightKg: evaluated.recommendedWeightKg,
            recommendedReps: evaluated.recommendedReps,
            summaryText: evaluated.summaryText,
            reasonCode: evaluated.reasonCode,
            decision,
            appliedWeightKg,
            appliedReps,
          });
        }
      }

      const dbExercises: LeanLoggedExercise[] = loggedExercises.map((item) => ({
        exerciseName: item.exerciseName,
        targetMuscleGroup: item.targetMuscleGroup,
        targetSets: item.targetSets,
        targetRepsLabel: item.targetRepsLabel,
        difficultyRating: item.difficultyRating,
        reportedDiscomfort: item.reportedDiscomfort,
        recommendation: item.recommendation,
        sets: item.sets,
      }));

      let createdLogDoc: LeanWorkoutLog;
      try {
        const createdLog = await WorkoutLogModel.create({
          memberId,
          gymId: memberGymId,
          ...(clientSessionId ? { clientSessionId } : {}),
          sourceType,
          routineId: routineObjectId,
          routineTitle,
          targetGoal,
          startedAt,
          completedAt: now,
          durationSeconds,
          totalSetsCompleted,
          totalRepsCompleted,
          totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
          effortRating,
          sessionNotes,
          exercises: dbExercises,
        });
        createdLogDoc = createdLog.toObject() as unknown as LeanWorkoutLog;
      } catch (err) {
        const isDuplicateKey =
          Boolean(clientSessionId) &&
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: number }).code === 11000;
        if (isDuplicateKey && clientSessionId) {
          const raced = await WorkoutLogModel.findOne({
            memberId,
            clientSessionId,
          }).lean<LeanWorkoutLog | null>();
          if (raced) {
            await ActiveWorkoutSessionModel.deleteOne({ memberId, clientSessionId });
            return memberApiResponse(
              request,
              {
                log: serializeLog(raced),
                deduplicated: true,
                newPersonalRecords: [],
                newlyUnlockedAchievements: [],
                progressionRecommendations: [],
              },
              200,
            );
          }
        }
        throw err;
      }

      const beforeAch = evaluateMemberAchievements(priorLogs);
      const beforeUnlockedSet = new Set(
        beforeAch.milestones.filter((m) => m.unlocked).map((m) => m.id),
      );
      const afterAch = evaluateMemberAchievements([createdLogDoc, ...priorLogs]);
      const newlyUnlockedAchievements = afterAch.milestones.filter(
        (m) => m.unlocked && !beforeUnlockedSet.has(m.id),
      );

      // Also surface newly broken Highest Reps or Best Set Volume PRs if not already in newPersonalRecords
      const beforeRecMap = new Map(
        beforeAch.exerciseRecords.map((r) => [r.exerciseKey, r]),
      );
      const alreadyPrNames = new Set(
        newPersonalRecords.map((p) => p.exerciseName.toLowerCase()),
      );
      for (const afterRec of afterAch.exerciseRecords) {
        if (alreadyPrNames.has(afterRec.exerciseKey)) continue;
        const prevRec = beforeRecMap.get(afterRec.exerciseKey);
        if (!prevRec) {
          newPersonalRecords.push({
            exerciseName: afterRec.exerciseName,
            weightKg: afterRec.heaviestWeight.weightKg,
            reps: afterRec.heaviestWeight.reps,
          });
          alreadyPrNames.add(afterRec.exerciseKey);
        } else if (
          afterRec.bestPerformance.volumeKg > prevRec.bestPerformance.volumeKg ||
          (afterRec.highestRepsAtWeight.reps > prevRec.highestRepsAtWeight.reps &&
            afterRec.highestRepsAtWeight.weightKg >=
              prevRec.highestRepsAtWeight.weightKg)
        ) {
          newPersonalRecords.push({
            exerciseName: afterRec.exerciseName,
            weightKg: afterRec.bestPerformance.weightKg,
            reps: afterRec.bestPerformance.reps,
          });
          alreadyPrNames.add(afterRec.exerciseKey);
        }
      }

      const savedProgressions: ReturnType<typeof serializeProgressionRecord>[] = [];
      if (progressionsToUpsert.length > 0) {
        const upsertedDocs = await Promise.all(
          progressionsToUpsert.map((prog) =>
            ExerciseProgressionModel.findOneAndUpdate(
              { memberId, exerciseKey: prog.exerciseKey },
              {
                $set: {
                  gymId: memberGymId,
                  exerciseName: prog.exerciseName,
                  targetMuscleGroup: prog.targetMuscleGroup,
                  sourceLogId: createdLogDoc._id,
                  basedOnWeightKg: prog.basedOnWeightKg,
                  basedOnReps: prog.basedOnReps,
                  basedOnSets: prog.basedOnSets,
                  basedOnDifficulty: prog.basedOnDifficulty,
                  reportedDiscomfort: prog.reportedDiscomfort,
                  action: prog.action,
                  recommendedWeightKg: prog.recommendedWeightKg,
                  recommendedReps: prog.recommendedReps,
                  summaryText: prog.summaryText,
                  reasonCode: prog.reasonCode,
                  decision: prog.decision,
                  appliedWeightKg: prog.appliedWeightKg,
                  appliedReps: prog.appliedReps,
                  decidedAt: prog.decision !== "pending" ? new Date() : null,
                },
              },
              { upsert: true, new: true },
            ).lean<LeanExerciseProgression | null>(),
          ),
        );
        for (const doc of upsertedDocs) {
          if (doc) {
            savedProgressions.push(serializeProgressionRecord(doc));
          }
        }
      }

      if (sourceType === "member_routine" && routineObjectId) {
        await MemberRoutineModel.updateOne(
          { _id: routineObjectId, memberId },
          { $set: { lastPerformedAt: now } },
        );
      }

      let savedRoutine: ReturnType<typeof serializeRoutine> | null = null;
      if (body.saveAsRoutine === true && createdLogDoc.exercises.length > 0) {
        const activeCount = await MemberRoutineModel.countDocuments({
          memberId,
          archived: false,
        });
        if (activeCount < 30) {
          const customRoutineTitle =
            typeof body.saveRoutineTitle === "string" && body.saveRoutineTitle.trim()
              ? body.saveRoutineTitle.trim().slice(0, 80)
              : routineTitle.slice(0, 80);
          const routineExercises: LeanRoutineExercise[] = createdLogDoc.exercises.map(
            (ex) => {
              const completedSets = (ex.sets ?? []).filter(
                (s) => s.completed && s.reps > 0,
              );
              const setsCount = Math.max(1, Math.min(20, completedSets.length || 3));
              const firstSet = completedSets[0];
              const topWeight = completedSets.reduce(
                (maxW, s) => Math.max(maxW, Number(s.weightKg) || 0),
                0,
              );
              const defaultReps = firstSet ? String(firstSet.reps) : "10";
              return {
                exerciseName: ex.exerciseName,
                targetMuscleGroup: ex.targetMuscleGroup || "Full body",
                sets: setsCount,
                reps: ex.targetRepsLabel?.trim() || defaultReps,
                restSeconds: restSettings.defaultRestSeconds || 60,
                targetWeightKg: topWeight,
                notes: "",
                setPlans: completedSets.slice(0, 20).map((s, idx) => ({
                  setNumber: idx + 1,
                  reps: String(s.reps),
                  targetWeightKg: Math.max(0, Number(s.weightKg) || 0),
                })),
              };
            },
          );

          const createdRoutine = await MemberRoutineModel.create({
            memberId,
            gymId: memberGymId,
            title: customRoutineTitle,
            targetGoal: targetGoal || "General Fitness",
            notes: "Saved from completed Free Workout",
            scheduledDays: [],
            daySchedule: [],
            exercises: routineExercises,
            // Never silently overwrite the member's currently active routine
            isActive: false,
            lastPerformedAt: now,
            archived: false,
          });
          savedRoutine = serializeRoutine(
            createdRoutine.toObject() as unknown as LeanMemberRoutine,
          );
        }
      }

      await ActiveWorkoutSessionModel.deleteOne(
        clientSessionId ? { memberId, clientSessionId } : { memberId },
      );

      return memberApiResponse(
        request,
        {
          log: serializeLog(createdLogDoc),
          newPersonalRecords,
          newlyUnlockedAchievements,
          progressionRecommendations: savedProgressions,
          ...(savedRoutine ? { savedRoutine } : {}),
        },
        201,
      );
    }

    if (action === "save-log-as-routine") {
      const logId = typeof body.logId === "string" ? body.logId.trim() : "";
      if (!Types.ObjectId.isValid(logId)) {
        return memberApiResponse(request, { error: "A valid logId is required." }, 400);
      }

      const activeCount = await MemberRoutineModel.countDocuments({
        memberId,
        archived: false,
      });
      if (activeCount >= 30) {
        return memberApiResponse(
          request,
          { error: "You can keep up to 30 active personal routines." },
          400,
        );
      }

      const sourceLog = await WorkoutLogModel.findOne({
        _id: new Types.ObjectId(logId),
        memberId,
      }).lean<LeanWorkoutLog | null>();

      if (!sourceLog || !Array.isArray(sourceLog.exercises) || sourceLog.exercises.length === 0) {
        return memberApiResponse(
          request,
          { error: "Completed workout log was not found." },
          404,
        );
      }

      const customTitle =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 80)
          : sourceLog.routineTitle.slice(0, 80) || "Saved Free Workout";

      const routineExercises: LeanRoutineExercise[] = sourceLog.exercises.map((ex) => {
        const completedSets = (ex.sets ?? []).filter((s) => s.completed && s.reps > 0);
        const setsCount = Math.max(1, Math.min(20, completedSets.length || 3));
        const firstSet = completedSets[0];
        const topWeight = completedSets.reduce(
          (maxW, s) => Math.max(maxW, Number(s.weightKg) || 0),
          0,
        );
        const defaultReps = firstSet ? String(firstSet.reps) : "10";
        return {
          exerciseName: ex.exerciseName,
          targetMuscleGroup: ex.targetMuscleGroup || "Full body",
          sets: setsCount,
          reps: ex.targetRepsLabel?.trim() || defaultReps,
          restSeconds: restSettings.defaultRestSeconds || 60,
          targetWeightKg: topWeight,
          notes: "",
          setPlans: completedSets.slice(0, 20).map((s, idx) => ({
            setNumber: idx + 1,
            reps: String(s.reps),
            targetWeightKg: Math.max(0, Number(s.weightKg) || 0),
          })),
        };
      });

      const createdRoutine = await MemberRoutineModel.create({
        memberId,
        gymId: memberGymId,
        title: customTitle,
        targetGoal: sourceLog.targetGoal || "General Fitness",
        notes: "Saved from completed workout session",
        scheduledDays: [],
        daySchedule: [],
        exercises: routineExercises,
        // Strictly preserve existing active routine selection
        isActive: false,
        lastPerformedAt: sourceLog.completedAt,
        archived: false,
      });

      return memberApiResponse(
        request,
        {
          routine: serializeRoutine(
            createdRoutine.toObject() as unknown as LeanMemberRoutine,
          ),
        },
        201,
      );
    }

    if (action === "delete-log") {
      const logId = typeof body.logId === "string" ? body.logId.trim() : "";
      if (!Types.ObjectId.isValid(logId)) {
        return memberApiResponse(request, { error: "A valid logId is required." }, 400);
      }
      const deleted = await WorkoutLogModel.findOneAndDelete({
        _id: new Types.ObjectId(logId),
        memberId,
      }).lean<LeanWorkoutLog | null>();
      if (!deleted) {
        return memberApiResponse(request, { error: "Workout log was not found." }, 404);
      }
      return memberApiResponse(request, { ok: true, logId });
    }

    return memberApiResponse(request, { error: "Unsupported workout action." }, 400);
  } catch (error) {
    console.error("Failed to process member workout action:", error);
    return memberApiResponse(
      request,
      { error: "Unable to save workout changes right now." },
      503,
    );
  }
}
