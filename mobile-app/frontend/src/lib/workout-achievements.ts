export type MilestoneId =
  | "first_workout"
  | "workouts_10"
  | "workouts_50"
  | "first_pr"
  | "streak_7_days"
  | "consistent_4_weeks";

export type AchievementMilestone = {
  id: MilestoneId;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  currentValue: number;
  targetValue: number;
  progressLabel: string;
};

export type ExercisePrBreakdown = {
  exerciseKey: string;
  exerciseName: string;
  muscle: string;
  heaviestWeight: {
    weightKg: number;
    reps: number;
    achievedAt: string;
  };
  highestRepsAtWeight: {
    weightKg: number;
    reps: number;
    achievedAt: string;
  };
  bestPerformance: {
    volumeKg: number;
    weightKg: number;
    reps: number;
    achievedAt: string;
  };
};

export type MemberAchievementsSummary = {
  unlockedCount: number;
  totalCount: number;
  bestStreakDays: number;
  bestConsecutiveWeeks: number;
  milestones: AchievementMilestone[];
  exerciseRecords: ExercisePrBreakdown[];
};

export type AchievementInputLog = {
  completedAt: Date | string;
  exercises?: Array<{
    exerciseName?: string;
    name?: string;
    targetMuscleGroup?: string;
    muscle?: string;
    sets?: Array<{
      reps?: number;
      weightKg?: number;
      completed?: boolean;
    }>;
  }>;
};

function toUtcDayNumber(dt: Date): number {
  return Math.floor(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) / 86_400_000,
  );
}

function toUtcMondayWeekIndex(dt: Date): number {
  const dayNum = toUtcDayNumber(dt);
  return Math.floor((dayNum + 3) / 7);
}

export function isValidCompletedWorkoutLog(log: AchievementInputLog): boolean {
  const ts =
    log.completedAt instanceof Date
      ? log.completedAt.getTime()
      : Date.parse(String(log.completedAt));
  if (Number.isNaN(ts)) return false;
  const exercises = log.exercises ?? [];
  for (const ex of exercises) {
    const sets = ex.sets ?? [];
    for (const s of sets) {
      if (
        s.completed !== false &&
        Number(s.reps || 0) > 0 &&
        Number(s.weightKg ?? 0) >= 0
      ) {
        return true;
      }
    }
  }
  return false;
}

export function evaluateMemberAchievements(
  rawLogs: AchievementInputLog[],
): MemberAchievementsSummary {
  const validChronological = rawLogs
    .filter(isValidCompletedWorkoutLog)
    .map((log) => ({
      log,
      completedAt:
        log.completedAt instanceof Date
          ? log.completedAt
          : new Date(String(log.completedAt)),
    }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const totalValidWorkouts = validChronological.length;
  const firstWorkoutAt =
    totalValidWorkouts >= 1 ? validChronological[0].completedAt.toISOString() : null;
  const tenthWorkoutAt =
    totalValidWorkouts >= 10 ? validChronological[9].completedAt.toISOString() : null;
  const fiftiethWorkoutAt =
    totalValidWorkouts >= 50 ? validChronological[49].completedAt.toISOString() : null;

  let bestStreakDays = 0;
  let runningDayStreak = 0;
  let prevDayNum: number | null = null;
  let streak7UnlockedAt: string | null = null;

  let bestConsecutiveWeeks = 0;
  let runningWeekStreak = 0;
  let prevWeekIdx: number | null = null;
  let consistent4WeeksUnlockedAt: string | null = null;

  const prMap = new Map<string, ExercisePrBreakdown>();
  let firstPrUnlockedAt: string | null = null;

  for (const { log, completedAt } of validChronological) {
    const iso = completedAt.toISOString();
    const dayNum = toUtcDayNumber(completedAt);
    if (prevDayNum === null) {
      runningDayStreak = 1;
      prevDayNum = dayNum;
    } else if (dayNum === prevDayNum + 1) {
      runningDayStreak += 1;
      prevDayNum = dayNum;
    } else if (dayNum > prevDayNum + 1) {
      runningDayStreak = 1;
      prevDayNum = dayNum;
    }
    if (runningDayStreak > bestStreakDays) {
      bestStreakDays = runningDayStreak;
    }
    if (runningDayStreak >= 7 && !streak7UnlockedAt) {
      streak7UnlockedAt = iso;
    }

    const weekIdx = toUtcMondayWeekIndex(completedAt);
    if (prevWeekIdx === null) {
      runningWeekStreak = 1;
      prevWeekIdx = weekIdx;
    } else if (weekIdx === prevWeekIdx + 1) {
      runningWeekStreak += 1;
      prevWeekIdx = weekIdx;
    } else if (weekIdx > prevWeekIdx + 1) {
      runningWeekStreak = 1;
      prevWeekIdx = weekIdx;
    }
    if (runningWeekStreak > bestConsecutiveWeeks) {
      bestConsecutiveWeeks = runningWeekStreak;
    }
    if (runningWeekStreak >= 4 && !consistent4WeeksUnlockedAt) {
      consistent4WeeksUnlockedAt = iso;
    }

    for (const ex of log.exercises ?? []) {
      const exName = (ex.exerciseName || ex.name || "").trim();
      const exKey = exName.toLowerCase();
      if (!exKey) continue;
      const muscle = (ex.targetMuscleGroup || ex.muscle || "Full body").trim();

      for (const s of ex.sets ?? []) {
        if (s.completed === false) continue;
        const reps = Math.max(0, Math.round(Number(s.reps) || 0));
        const weightKg = Math.max(0, Math.round((Number(s.weightKg) || 0) * 100) / 100);
        if (reps <= 0) continue;

        if (!firstPrUnlockedAt) {
          firstPrUnlockedAt = iso;
        }

        const setVolume = Math.round(weightKg * reps * 10) / 10;
        const existing = prMap.get(exKey);

        if (!existing) {
          prMap.set(exKey, {
            exerciseKey: exKey,
            exerciseName: exName,
            muscle,
            heaviestWeight: {
              weightKg,
              reps,
              achievedAt: iso,
            },
            highestRepsAtWeight: {
              weightKg,
              reps,
              achievedAt: iso,
            },
            bestPerformance: {
              volumeKg: setVolume,
              weightKg,
              reps,
              achievedAt: iso,
            },
          });
          continue;
        }

        if (
          weightKg > existing.heaviestWeight.weightKg ||
          (weightKg === existing.heaviestWeight.weightKg &&
            reps > existing.heaviestWeight.reps)
        ) {
          existing.heaviestWeight = { weightKg, reps, achievedAt: iso };
        }

        const currLoaded = weightKg > 0;
        const prevLoaded = existing.highestRepsAtWeight.weightKg > 0;
        if (
          (currLoaded && !prevLoaded) ||
          (currLoaded === prevLoaded &&
            (reps > existing.highestRepsAtWeight.reps ||
              (reps === existing.highestRepsAtWeight.reps &&
                weightKg > existing.highestRepsAtWeight.weightKg)))
        ) {
          existing.highestRepsAtWeight = { weightKg, reps, achievedAt: iso };
        }

        if (
          setVolume > existing.bestPerformance.volumeKg ||
          (setVolume === 0 &&
            existing.bestPerformance.volumeKg === 0 &&
            reps > existing.bestPerformance.reps)
        ) {
          existing.bestPerformance = {
            volumeKg: setVolume,
            weightKg,
            reps,
            achievedAt: iso,
          };
        }
      }
    }
  }

  const exerciseRecords = Array.from(prMap.values()).sort(
    (a, b) =>
      b.heaviestWeight.weightKg - a.heaviestWeight.weightKg ||
      b.bestPerformance.volumeKg - a.bestPerformance.volumeKg ||
      b.highestRepsAtWeight.reps - a.highestRepsAtWeight.reps,
  );

  const milestones: AchievementMilestone[] = [
    {
      id: "first_workout",
      title: "First Session Logged",
      description: "Complete your first valid training session.",
      unlocked: totalValidWorkouts >= 1,
      unlockedAt: firstWorkoutAt,
      currentValue: Math.min(1, totalValidWorkouts),
      targetValue: 1,
      progressLabel: `${Math.min(1, totalValidWorkouts)} / 1 workout`,
    },
    {
      id: "first_pr",
      title: "First Personal Record",
      description: "Establish your first verified exercise personal record.",
      unlocked: Boolean(firstPrUnlockedAt),
      unlockedAt: firstPrUnlockedAt,
      currentValue: firstPrUnlockedAt ? 1 : 0,
      targetValue: 1,
      progressLabel: `${firstPrUnlockedAt ? 1 : 0} / 1 PR`,
    },
    {
      id: "workouts_10",
      title: "10 Workouts Completed",
      description: "Log 10 complete training sessions.",
      unlocked: totalValidWorkouts >= 10,
      unlockedAt: tenthWorkoutAt,
      currentValue: Math.min(10, totalValidWorkouts),
      targetValue: 10,
      progressLabel: `${Math.min(10, totalValidWorkouts)} / 10 workouts`,
    },
    {
      id: "streak_7_days",
      title: "7-Day Training Streak",
      description: "Train on 7 consecutive days.",
      unlocked: Boolean(streak7UnlockedAt),
      unlockedAt: streak7UnlockedAt,
      currentValue: Math.min(7, bestStreakDays),
      targetValue: 7,
      progressLabel: `${Math.min(7, bestStreakDays)} / 7 days`,
    },
    {
      id: "consistent_4_weeks",
      title: "4 Consistent Weeks",
      description: "Complete workouts across 4 consecutive weeks.",
      unlocked: Boolean(consistent4WeeksUnlockedAt),
      unlockedAt: consistent4WeeksUnlockedAt,
      currentValue: Math.min(4, bestConsecutiveWeeks),
      targetValue: 4,
      progressLabel: `${Math.min(4, bestConsecutiveWeeks)} / 4 weeks`,
    },
    {
      id: "workouts_50",
      title: "50 Workouts Completed",
      description: "Reach 50 complete training sessions.",
      unlocked: totalValidWorkouts >= 50,
      unlockedAt: fiftiethWorkoutAt,
      currentValue: Math.min(50, totalValidWorkouts),
      targetValue: 50,
      progressLabel: `${Math.min(50, totalValidWorkouts)} / 50 workouts`,
    },
  ];

  const unlockedCount = milestones.filter((m) => m.unlocked).length;

  return {
    unlockedCount,
    totalCount: milestones.length,
    bestStreakDays,
    bestConsecutiveWeeks,
    milestones,
    exerciseRecords,
  };
}
