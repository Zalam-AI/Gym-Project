import { model, models, Schema, type InferSchemaType } from "mongoose";

export const PROGRESSION_ACTIONS = [
  "increase_weight",
  "increase_reps",
  "maintain",
  "decrease_weight",
  "hold_discomfort",
  "review_configuration",
] as const;

export type ProgressionAction = (typeof PROGRESSION_ACTIONS)[number];

export const PROGRESSION_DECISIONS = [
  "pending",
  "accepted",
  "adjusted",
  "ignored",
] as const;

export type ProgressionDecision = (typeof PROGRESSION_DECISIONS)[number];

const exerciseProgressionSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: false,
      default: null,
    },
    exerciseKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    exerciseName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    targetMuscleGroup: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "Full body",
    },
    action: {
      type: String,
      enum: PROGRESSION_ACTIONS,
      required: true,
      default: "maintain",
    },
    basedOnWeightKg: {
      type: Number,
      min: 0,
      max: 1000,
      default: 0,
    },
    basedOnReps: {
      type: Number,
      min: 0,
      max: 500,
      default: 10,
    },
    basedOnDifficulty: {
      type: Number,
      min: 1,
      max: 10,
      default: null,
    },
    reportedDiscomfort: {
      type: Boolean,
      default: false,
    },
    recommendedWeightKg: {
      type: Number,
      min: 0,
      max: 1000,
      required: true,
      default: 0,
    },
    recommendedReps: {
      type: Number,
      min: 1,
      max: 500,
      required: true,
      default: 10,
    },
    summaryText: {
      type: String,
      trim: true,
      maxlength: 220,
      default: "",
    },
    reasonCode: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    decision: {
      type: String,
      enum: PROGRESSION_DECISIONS,
      required: true,
      default: "pending",
    },
    appliedWeightKg: {
      type: Number,
      min: 0,
      max: 1000,
      default: null,
    },
    appliedReps: {
      type: Number,
      min: 1,
      max: 500,
      default: null,
    },
  },
  { timestamps: true },
);

exerciseProgressionSchema.index({ memberId: 1, exerciseKey: 1 }, { unique: true });

export type ExerciseProgressionDoc = InferSchemaType<typeof exerciseProgressionSchema>;

const ExerciseProgressionModel =
  models.ExerciseProgression ??
  model("ExerciseProgression", exerciseProgressionSchema);

export default ExerciseProgressionModel;
