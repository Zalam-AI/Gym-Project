import { model, models, Schema, type InferSchemaType } from "mongoose";

const trainingSessionSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    trainerId: { type: Schema.Types.ObjectId, ref: "Trainer", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 240, default: 60 },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
      required: true,
    },
    notes: { type: String, trim: true, maxlength: 240 },
  },
  { timestamps: true },
);

trainingSessionSchema.index({ gymId: 1, trainerId: 1, startsAt: 1 });
trainingSessionSchema.index({ gymId: 1, memberId: 1, startsAt: 1 });

export type TrainingSession = InferSchemaType<typeof trainingSessionSchema>;

const TrainingSessionModel =
  models.TrainingSession ?? model("TrainingSession", trainingSessionSchema);

export default TrainingSessionModel;
