import { model, models, Schema, type InferSchemaType } from "mongoose";

const exerciseSchema = new Schema(
  {
    exerciseName: { type: String, required: true, trim: true, maxlength: 80 },
    sets: { type: String, required: true, trim: true, maxlength: 12 },
    reps: { type: String, required: true, trim: true, maxlength: 16 },
    restTime: { type: String, required: true, trim: true, maxlength: 16 },
    targetMuscleGroup: { type: String, required: true, trim: true, maxlength: 40 },
    day: { type: String, default: "", trim: true, maxlength: 12 },
    targetWeightKg: { type: Number, default: 0, min: 0, max: 1000 },
  },
  { _id: false },
);

const workoutPlanSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    targetGoal: { type: String, required: true, trim: true, maxlength: 80 },
    scheduledDays: { type: [String], default: [] },
    createdByRole: {
      type: String,
      enum: ["staff", "trainer"],
      default: "staff",
    },
    createdByTrainerId: {
      type: Schema.Types.ObjectId,
      ref: "Trainer",
      default: null,
    },
    createdByName: { type: String, default: "", trim: true, maxlength: 80 },
    exercises: { type: [exerciseSchema], default: [] },
    assignedMemberIds: [{ type: Schema.Types.ObjectId, ref: "Member" }],
  },
  { timestamps: true },
);

workoutPlanSchema.index({ gymId: 1, title: 1 });

export type WorkoutPlan = InferSchemaType<typeof workoutPlanSchema>;

const WorkoutPlanModel = models.WorkoutPlan ?? model("WorkoutPlan", workoutPlanSchema);

export default WorkoutPlanModel;