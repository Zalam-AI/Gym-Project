import { model, models, Schema, Types, type InferSchemaType } from "mongoose";

const memberSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: false },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    status: {
      type: String,
      enum: ["active", "expired", "suspended"],
      default: "active",
      required: true,
    },
    pendingWorkoutPlanId: {
      type: Schema.Types.ObjectId,
      ref: "WorkoutPlan",
      default: null,
    },
    pendingWorkoutAssignedAt: {
      type: Date,
      default: null,
    },
    pendingWorkoutAssignedBy: {
      type: String,
      trim: true,
      default: "",
    },
    activeRoutineMode: {
      type: String,
      enum: ["personal", "gym", "none"],
      default: "none",
    },
    selectedGymWorkoutPlanId: {
      type: Schema.Types.ObjectId,
      ref: "WorkoutPlan",
      default: null,
    },
    defaultRestSeconds: {
      type: Number,
      min: 15,
      max: 600,
      default: 60,
    },
    restVibrationEnabled: {
      type: Boolean,
      default: true,
    },
    restNotificationsEnabled: {
      type: Boolean,
      default: true,
    },
    progressionPace: {
      type: String,
      enum: ["conservative", "balanced", "aggressive"],
      default: "balanced",
    },
    preferredIncrementKg: {
      type: Number,
      min: 0,
      max: 10,
      default: 2.5,
    },
    joinDate: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

memberSchema.index({ gymId: 1, phone: 1 });
memberSchema.index({ gymId: 1, email: 1 }, { sparse: true });
memberSchema.index({ phone: 1 });
memberSchema.index({ gymId: 1, fullName: 1 });

export type Member = InferSchemaType<typeof memberSchema>;
export type MemberId = Types.ObjectId;

const MemberModel = models.Member ?? model("Member", memberSchema);

export default MemberModel;
