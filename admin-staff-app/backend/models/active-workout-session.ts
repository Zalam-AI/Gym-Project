import { model, models, Schema, type InferSchemaType } from "mongoose";
import { WORKOUT_SOURCE_TYPES } from "./workout-log";
import { PROGRESSION_ACTIONS, PROGRESSION_DECISIONS } from "./exercise-progression";

const activeSessionSetSchema = new Schema(
  {
    setNumber: { type: Number, required: true, min: 1, max: 30 },
    weightKg: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    reps: { type: Number, required: true, min: 0, max: 500, default: 10 },
    completed: { type: Boolean, required: true, default: false },
    completedAt: { type: Date, required: false, default: null },
  },
  { _id: false },
);

const activeSessionFeedbackSchema = new Schema(
  {
    difficultyRating: { type: Number, required: true, min: 1, max: 10 },
    reportedDiscomfort: { type: Boolean, required: false, default: false },
    action: { type: String, enum: PROGRESSION_ACTIONS, required: true },
    recommendedWeightKg: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    recommendedReps: { type: Number, required: true, min: 1, max: 500, default: 10 },
    summaryText: { type: String, trim: true, maxlength: 240, default: "" },
    reasonCode: { type: String, trim: true, maxlength: 80, default: "" },
    decision: { type: String, enum: PROGRESSION_DECISIONS, default: "pending" },
    appliedWeightKg: { type: Number, min: 0, max: 1000, default: null },
    appliedReps: { type: Number, min: 1, max: 500, default: null },
  },
  { _id: false },
);

const activeSessionExerciseSchema = new Schema(
  {
    exerciseName: { type: String, required: true, trim: true, maxlength: 80 },
    targetMuscleGroup: { type: String, required: true, trim: true, maxlength: 40 },
    restSeconds: { type: Number, required: true, min: 0, max: 600, default: 60 },
    usesDefaultRest: { type: Boolean, required: false, default: true },
    targetRepsLabel: { type: String, trim: true, maxlength: 20, default: "10" },
    notes: { type: String, trim: true, maxlength: 160, default: "" },
    feedback: {
      type: activeSessionFeedbackSchema,
      required: false,
      default: null,
    },
    sets: { type: [activeSessionSetSchema], default: [] },
  },
  { _id: false },
);

const activeWorkoutSessionSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      unique: true,
    },
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: false, default: null },
    clientSessionId: { type: String, required: true, trim: true, maxlength: 80 },
    sourceType: {
      type: String,
      enum: WORKOUT_SOURCE_TYPES,
      required: true,
    },
    routineId: { type: Schema.Types.ObjectId, required: false, default: null },
    routineTitle: { type: String, required: true, trim: true, maxlength: 80 },
    dayLabel: { type: String, trim: true, maxlength: 80, default: "" },
    targetGoal: { type: String, trim: true, maxlength: 80, default: "" },
    startedAt: { type: Date, required: true },
    pausedSeconds: { type: Number, required: true, min: 0, default: 0 },
    isPaused: { type: Boolean, required: true, default: false },
    lastPauseStartedAt: { type: Date, required: false, default: null },
    restTimerId: { type: String, trim: true, maxlength: 80, default: "" },
    restStartedAt: { type: Date, required: false, default: null },
    restEndsAt: { type: Date, required: false, default: null },
    restDurationSeconds: { type: Number, required: true, min: 0, max: 600, default: 0 },
    restPausedRemainingMs: {
      type: Number,
      required: false,
      min: 0,
      max: 600_000,
      default: null,
    },
    currentExerciseIndex: { type: Number, required: true, min: 0, max: 40, default: 0 },
    clientUpdatedAtMs: { type: Number, required: true, min: 0, default: 0 },
    exercises: { type: [activeSessionExerciseSchema], default: [] },
  },
  { timestamps: true },
);

export type ActiveWorkoutSessionDoc = InferSchemaType<typeof activeWorkoutSessionSchema>;

const ActiveWorkoutSessionModel =
  models.ActiveWorkoutSession ??
  model("ActiveWorkoutSession", activeWorkoutSessionSchema);

export default ActiveWorkoutSessionModel;
