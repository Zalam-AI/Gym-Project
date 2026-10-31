import { model, models, Schema, type InferSchemaType } from "mongoose";

export const ROUTINE_WEEKDAYS = [
  "Sat",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
] as const;
export type RoutineWeekday = (typeof ROUTINE_WEEKDAYS)[number];

const routineSetPlanSchema = new Schema(
  {
    setNumber: { type: Number, required: true, min: 1, max: 20 },
    reps: { type: String, required: true, trim: true, maxlength: 20, default: "10" },
    targetWeightKg: { type: Number, min: 0, max: 1000, default: 0 },
  },
  { _id: false },
);

const memberRoutineExerciseSchema = new Schema(
  {
    exerciseName: { type: String, required: true, trim: true, maxlength: 80 },
    targetMuscleGroup: { type: String, required: true, trim: true, maxlength: 40 },
    sets: { type: Number, required: true, min: 1, max: 20, default: 3 },
    reps: { type: String, required: true, trim: true, maxlength: 20, default: "10" },
    restSeconds: { type: Number, required: true, min: 0, max: 600, default: 60 },
    targetWeightKg: { type: Number, min: 0, max: 1000, default: 0 },
    notes: { type: String, trim: true, maxlength: 160, default: "" },
    setPlans: { type: [routineSetPlanSchema], default: [] },
  },
  { _id: false },
);

const memberRoutineDaySchema = new Schema(
  {
    day: { type: String, enum: ROUTINE_WEEKDAYS, required: true },
    isRestDay: { type: Boolean, default: true },
    focusLabel: { type: String, trim: true, maxlength: 60, default: "" },
    exercises: { type: [memberRoutineExerciseSchema], default: [] },
  },
  { _id: false },
);

const memberRoutineSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: false, default: null },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    targetGoal: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      default: "General Fitness",
    },
    notes: { type: String, trim: true, maxlength: 240, default: "" },
    scheduledDays: {
      type: [String],
      enum: ROUTINE_WEEKDAYS,
      default: [],
    },
    daySchedule: {
      type: [memberRoutineDaySchema],
      default: [],
    },
    sourceGymPlanId: {
      type: Schema.Types.ObjectId,
      ref: "WorkoutPlan",
      default: null,
    },
    exercises: {
      type: [memberRoutineExerciseSchema],
      default: [],
    },
    isActive: { type: Boolean, default: false },
    lastPerformedAt: { type: Date, default: null },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

memberRoutineSchema.index({ memberId: 1, archived: 1, isActive: -1, updatedAt: -1 });
memberRoutineSchema.index({ gymId: 1, memberId: 1 });

export type MemberRoutine = InferSchemaType<typeof memberRoutineSchema>;

const MemberRoutineModel =
  models.MemberRoutine ?? model("MemberRoutine", memberRoutineSchema);

export default MemberRoutineModel;
