export type ProgressionPace = "conservative" | "balanced" | "aggressive";

export type ProgressionRuleSettings = {
  pace: ProgressionPace;
  preferredIncrementKg: number; // 0 = automatic based on exercise/load, or 1.25 | 2.5 | 5
};

export const DEFAULT_PROGRESSION_RULE_SETTINGS: ProgressionRuleSettings = {
  pace: "balanced",
  preferredIncrementKg: 2.5,
};

export type ProgressionActionType =
  | "increase_weight"
  | "increase_reps"
  | "maintain"
  | "decrease_weight"
  | "hold_discomfort"
  | "review_configuration";

export type ProgressionDecisionType =
  | "pending"
  | "accepted"
  | "adjusted"
  | "ignored";

export type HistoricalExerciseSessionInput = {
  weightKg: number;
  reps: number;
  setsCompleted: number;
  difficultyRating: number | null;
  reportedDiscomfort?: boolean;
};

export type PreviousRecommendationInput = {
  action: ProgressionActionType;
  recommendedWeightKg: number;
  recommendedReps: number;
  decision: ProgressionDecisionType;
} | null;

export type EvaluateProgressionInput = {
  exerciseName: string;
  muscle?: string;
  targetGoal?: string;
  targetSets: number;
  targetRepsLabel: string;
  completedSets: Array<{ weightKg: number; reps: number }>;
  difficultyRating: number; // 1..10
  reportedDiscomfort?: boolean;
  recentHistory?: HistoricalExerciseSessionInput[];
  previousRecommendation?: PreviousRecommendationInput;
  ruleSettings?: Partial<ProgressionRuleSettings>;
};

export type ProgressionRecommendationOutput = {
  action: ProgressionActionType;
  recommendedWeightKg: number;
  recommendedReps: number;
  basedOnWeightKg: number;
  basedOnReps: number;
  difficultyRating: number;
  reportedDiscomfort: boolean;
  summaryText: string;
  reasonCode: string;
};

export function parseTargetRepBounds(label: string): { min: number; max: number } {
  const cleaned = (label || "").trim();
  const rangeMatch = cleaned.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (rangeMatch) {
    const a = Math.max(1, Math.min(500, Number.parseInt(rangeMatch[1], 10) || 10));
    const b = Math.max(a, Math.min(500, Number.parseInt(rangeMatch[2], 10) || a));
    return { min: a, max: b };
  }
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) {
    const val = Math.max(1, Math.min(500, Number.parseInt(singleMatch[1], 10) || 10));
    return { min: val, max: val };
  }
  return { min: 10, max: 10 };
}

function roundToGymIncrement(weightKg: number, step = 1.25): number {
  if (weightKg <= 0) return 0;
  const rounded = Math.round(weightKg / step) * step;
  return Math.max(0, Math.min(1000, Math.round(rounded * 100) / 100));
}

function resolveIncrementKg(
  currentWeightKg: number,
  muscle: string,
  rules: ProgressionRuleSettings,
): number {
  if (rules.preferredIncrementKg > 0) {
    return rules.preferredIncrementKg;
  }
  const lowerMuscle = (muscle || "").toLowerCase();
  const isLowerCompound =
    lowerMuscle.includes("leg") ||
    lowerMuscle.includes("glute") ||
    lowerMuscle.includes("full body");
  if (isLowerCompound && currentWeightKg >= 60 && rules.pace === "aggressive") {
    return 5;
  }
  if (currentWeightKg > 0 && currentWeightKg < 8) {
    return 1.25;
  }
  return 2.5;
}

function normalizeGoalCategory(
  goalRaw?: string,
): "strength" | "hypertrophy" | "endurance" | "general" {
  const g = (goalRaw || "").toLowerCase();
  if (g.includes("endurance") || g.includes("cardio") || g.includes("conditioning") || g.includes("fat loss")) {
    return "endurance";
  }
  if (g.includes("strength") && !g.includes("hypertrophy")) {
    return "strength";
  }
  if (g.includes("hypertrophy") || g.includes("muscle")) {
    return "hypertrophy";
  }
  return "general";
}

export function evaluateExerciseProgression(
  input: EvaluateProgressionInput,
): ProgressionRecommendationOutput {
  const rules: ProgressionRuleSettings = {
    pace:
      input.ruleSettings?.pace === "conservative" ||
      input.ruleSettings?.pace === "aggressive"
        ? input.ruleSettings.pace
        : "balanced",
    preferredIncrementKg:
      typeof input.ruleSettings?.preferredIncrementKg === "number" &&
      input.ruleSettings.preferredIncrementKg >= 0 &&
      input.ruleSettings.preferredIncrementKg <= 10
        ? input.ruleSettings.preferredIncrementKg
        : 2.5,
  };

  const difficulty = Math.max(1, Math.min(10, Math.round(input.difficultyRating || 6)));
  const discomfort = Boolean(input.reportedDiscomfort);
  const sets = input.completedSets.filter((s) => s.reps > 0 || s.weightKg >= 0);
  const completedCount = sets.length;
  const targetSets = Math.max(1, Math.round(input.targetSets || completedCount || 3));
  const repBounds = parseTargetRepBounds(input.targetRepsLabel);
  const goalCategory = normalizeGoalCategory(input.targetGoal);

  // Representative working weight & reps from completed sets
  const workingWeightKg =
    completedCount > 0
      ? Math.max(...sets.map((s) => Math.max(0, Number(s.weightKg) || 0)))
      : 0;
  const minReps =
    completedCount > 0
      ? Math.min(...sets.map((s) => Math.max(0, Math.round(Number(s.reps) || 0))))
      : repBounds.min;
  const avgReps =
    completedCount > 0
      ? Math.round(
          sets.reduce((acc, s) => acc + Math.max(0, Number(s.reps) || 0), 0) /
            completedCount,
        )
      : repBounds.min;

  const stepKg = resolveIncrementKg(workingWeightKg, input.muscle || "", rules);
  const reducedWeightKg =
    workingWeightKg > 0
      ? Math.max(
          0,
          roundToGymIncrement(
            workingWeightKg - Math.max(stepKg, workingWeightKg * 0.075),
            1.25,
          ),
        )
      : 0;

  // 1. PAIN / DISCOMFORT GUARD: Never recommend increasing weight or reps
  if (discomfort) {
    const safeWeight =
      difficulty >= 8 && workingWeightKg > 0 ? reducedWeightKg : workingWeightKg;
    const safeReps = Math.max(1, Math.min(avgReps || repBounds.min, repBounds.min));
    return {
      action: "hold_discomfort",
      recommendedWeightKg: safeWeight,
      recommendedReps: safeReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: true,
      summaryText:
        safeWeight < workingWeightKg
          ? `Discomfort noted. Consider easing back to ${safeWeight} kg and prioritizing comfortable movement.`
          : "Discomfort noted. Keep the load conservative next time and focus on comfortable technique.",
      reasonCode: "discomfort_reported",
    };
  }

  // 2. CONSISTENT EXTREME DIFFICULTY GUARD (9-10/10 across consecutive sessions)
  const history = input.recentHistory ?? [];
  const prevWasExtreme =
    history.length > 0 &&
    typeof history[0].difficultyRating === "number" &&
    history[0].difficultyRating >= 9;

  if (difficulty >= 9 && prevWasExtreme) {
    const reviewWeight = workingWeightKg > 0 ? reducedWeightKg : 0;
    return {
      action: "review_configuration",
      recommendedWeightKg: reviewWeight,
      recommendedReps: repBounds.min,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText:
        workingWeightKg > 0
          ? `You've rated recent sessions ${difficulty}/10 in a row. Consider reviewing your routine setup or easing to ${reviewWeight} kg.`
          : "You've rated recent sessions at extreme effort in a row. Consider reviewing your target sets, reps, or rest.",
      reasonCode: "consecutive_extreme_difficulty",
    };
  }

  const completedAllTargetSets = completedCount >= targetSets;
  const hitMinimumTargetReps = completedCount > 0 && minReps >= repBounds.min;
  const hitTopOfRepRange = completedCount > 0 && minReps >= repBounds.max;

  // 3. STRUGGLED TO COMPLETE TARGET SETS OR REPS
  if (!completedAllTargetSets || !hitMinimumTargetReps) {
    if (difficulty >= 8 && workingWeightKg > 0) {
      return {
        action: "decrease_weight",
        recommendedWeightKg: reducedWeightKg,
        recommendedReps: repBounds.min,
        basedOnWeightKg: workingWeightKg,
        basedOnReps: avgReps,
        difficultyRating: difficulty,
        reportedDiscomfort: false,
        summaryText: `That looked challenging. Consider reducing to ${reducedWeightKg} kg next time to hit all target reps.`,
        reasonCode: "missed_target_high_difficulty",
      };
    }

    return {
      action: "maintain",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: repBounds.min,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText:
        workingWeightKg > 0
          ? `Good effort. Keep ${workingWeightKg} kg and build toward ${targetSets} × ${repBounds.min} reps.`
          : `Good effort. Keep working toward ${targetSets} × ${repBounds.min} repetitions.`,
      reasonCode: "missed_target_reps_or_sets",
    };
  }

  // 4. COMPLETED TARGET REPS, BUT EFFORT WAS VERY HIGH (9-10/10)
  if (difficulty >= 9) {
    if (difficulty === 10 && workingWeightKg > 0) {
      return {
        action: "decrease_weight",
        recommendedWeightKg: reducedWeightKg,
        recommendedReps: repBounds.min,
        basedOnWeightKg: workingWeightKg,
        basedOnReps: avgReps,
        difficultyRating: difficulty,
        reportedDiscomfort: false,
        summaryText: `Maximum effort today. Consider ${reducedWeightKg} kg or holding ${workingWeightKg} kg until reps feel smoother.`,
        reasonCode: "max_effort_deload_suggestion",
      };
    }
    return {
      action: "maintain",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: avgReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText:
        workingWeightKg > 0
          ? `Hard-fought sets! Keep ${workingWeightKg} kg next time until that load feels more controlled.`
          : "Hard-fought sets! Keep the same repetition target next session.",
      reasonCode: "high_effort_consolidate",
    };
  }

  // 5. DIFFICULTY THRESHOLD BY CONFIGURABLE PACE
  const comfortableCeiling =
    rules.pace === "conservative" ? 5 : rules.pace === "aggressive" ? 7 : 6;

  if (difficulty > comfortableCeiling) {
    // e.g. 7-8/10 in balanced mode -> Maintain weight & aim for cleaner reps
    return {
      action: "maintain",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: avgReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText:
        workingWeightKg > 0
          ? `Good session. Keep ${workingWeightKg} kg and aim for cleaner repetitions.`
          : "Good session. Maintain your current reps and focus on smooth control.",
      reasonCode: "challenging_consolidate",
    };
  }

  // Conservative mode extra check: at 5/10 on first-ever session, consolidate once unless very easy (<= 4)
  if (
    rules.pace === "conservative" &&
    difficulty === 5 &&
    history.length === 0
  ) {
    return {
      action: "maintain",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: avgReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText:
        workingWeightKg > 0
          ? `Solid baseline! Repeat ${workingWeightKg} kg once more before moving up.`
          : "Solid baseline! Repeat this target once more before adding reps.",
      reasonCode: "conservative_baseline",
    };
  }

  // 6. COMFORTABLY COMPLETED ALL TARGET SETS & REPS (1..comfortableCeiling)
  // Bodyweight movements -> progress repetitions
  if (workingWeightKg <= 0) {
    const nextReps = Math.min(500, Math.max(avgReps, repBounds.max) + 2);
    return {
      action: "increase_reps",
      recommendedWeightKg: 0,
      recommendedReps: nextReps,
      basedOnWeightKg: 0,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText: `Great work! Consider aiming for ${nextReps} repetitions next time.`,
      reasonCode: "bodyweight_rep_progression",
    };
  }

  // Endurance goal or mid-range Hypertrophy double-progression (when below top of rep range & moderate 5-6)
  if (
    goalCategory === "endurance" &&
    minReps < Math.max(repBounds.max, 15) &&
    difficulty >= 4
  ) {
    const nextReps = Math.min(500, avgReps + 2);
    return {
      action: "increase_reps",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: nextReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText: `Great endurance work! Keep ${workingWeightKg} kg and aim for ${nextReps} reps next time.`,
      reasonCode: "endurance_rep_progression",
    };
  }

  if (
    goalCategory === "hypertrophy" &&
    repBounds.max > repBounds.min &&
    !hitTopOfRepRange &&
    difficulty >= 5
  ) {
    const nextReps = Math.min(repBounds.max, minReps + 1);
    return {
      action: "increase_reps",
      recommendedWeightKg: workingWeightKg,
      recommendedReps: nextReps,
      basedOnWeightKg: workingWeightKg,
      basedOnReps: avgReps,
      difficultyRating: difficulty,
      reportedDiscomfort: false,
      summaryText: `Nice work! Keep ${workingWeightKg} kg and push to ${nextReps} reps next session.`,
      reasonCode: "hypertrophy_double_progression_reps",
    };
  }

  // Anchor strictly to actual lifted workingWeightKg so ignored recommendations never snowball!
  const nextWeightKg = roundToGymIncrement(workingWeightKg + stepKg, 1.25);
  const nextTargetReps = repBounds.min;

  const previouslyIgnoredSameTarget =
    input.previousRecommendation &&
    input.previousRecommendation.decision === "ignored" &&
    Math.abs(input.previousRecommendation.recommendedWeightKg - nextWeightKg) < 0.1;

  return {
    action: "increase_weight",
    recommendedWeightKg: nextWeightKg,
    recommendedReps: nextTargetReps,
    basedOnWeightKg: workingWeightKg,
    basedOnReps: avgReps,
    difficultyRating: difficulty,
    reportedDiscomfort: false,
    summaryText: previouslyIgnoredSameTarget
      ? `Consistent work at ${workingWeightKg} kg! Whenever you're ready, consider ${nextWeightKg} kg.`
      : `Great work! Consider increasing to ${nextWeightKg} kg next time.`,
    reasonCode: "comfortable_target_achieved",
  };
}
