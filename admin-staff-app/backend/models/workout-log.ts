import { model, models, Schema, type InferSchemaType } from "mongoose";
import { PROGRESSION_ACTIONS, PROGRESSION_DECISIONS } from "./exercise-progression";

export const WORKOUT_SOURCE_TYPES = [
  "gym_assigned",
  "member_routine",
  "free_workout",
] as const;
export type WorkoutSourceType = (typeof WORKOUT_SOURCE_TYPES)[number];

const loggedSetSchema = new Schema(
  {
    setNumber: { type: Number, required: true, min: 1, max: 30 },
    reps: { type: Number, required: true, min: 0, max: 500 },
    weightKg: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    completed: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const loggedExerciseRecommendationSchema = new Schema(
  {
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

const loggedExerciseSchema = new Schema(
  {
    exerciseName: { type: String, required: true, trim: true, maxlength: 80 },
    targetMuscleGroup: { type: String, required: true, trim: true, maxlength: 40 },
    targetSets: { type: Number, min: 1, max: 30, default: null },
    targetRepsLabel: { type: String, trim: true, maxlength: 20, default: "" },
    difficultyRating: { type: Number, min: 1, max: 10, default: null },
    reportedDiscomfort: { type: Boolean, default: false },
    recommendation: {
      type: loggedExerciseRecommendationSchema,
      required: false,
      default: null,
    },
    sets: { type: [loggedSetSchema], default: [] },
  },
  { _id: false },
);

const workoutLogSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: false, default: null },
    clientSessionId: {
      type: String,
      trim: true,
      maxlength: 80,
      required: false,
      default: null,
    },
    sourceType: {
      type: String,
      enum: WORKOUT_SOURCE_TYPES,
      required: true,
    },
    routineId: { type: Schema.Types.ObjectId, required: false, default: null },
    routineTitle: { type: String, required: true, trim: true, maxlength: 80 },
    targetGoal: { type: String, trim: true, maxlength: 80, default: "" },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true, default: Date.now },
    durationSeconds: { type: Number, required: true, min: 1, max: 43200 },
    totalSetsCompleted: { type: Number, required: true, min: 1, max: 600 },
    totalRepsCompleted: { type: Number, required: true, min: 0, max: 10000 },
    totalVolumeKg: { type: Number, required: true, min: 0, default: 0 },
    effortRating: { type: Number, min: 1, max: 5, default: null },
    sessionNotes: { type: String, trim: true, maxlength: 280, default: "" },
    exercises: { type: [loggedExerciseSchema], default: [] },
  },
  { timestamps: true },
);

workoutLogSchema.index({ memberId: 1, completedAt: -1 });
workoutLogSchema.index({ gymId: 1, memberId: 1, completedAt: -1 });
workoutLogSchema.index(
  { memberId: 1, clientSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientSessionId: { $type: "string" } },
  },
);

export type WorkoutLog = InferSchemaType<typeof workoutLogSchema>;

const WorkoutLogModel = models.WorkoutLog ?? model("WorkoutLog", workoutLogSchema);

export default WorkoutLogModel;
