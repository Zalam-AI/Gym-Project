import { model, models, Schema, type InferSchemaType } from "mongoose";

const trainerInviteSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    trainerId: { type: Schema.Types.ObjectId, ref: "Trainer" },
    presetName: { type: String, trim: true, maxlength: 80 },
    presetSpecialty: { type: String, trim: true, maxlength: 100 },
    presetPhone: { type: String, trim: true, maxlength: 30 },
    status: {
      type: String,
      enum: ["unused", "claimed", "revoked"],
      default: "unused",
      required: true,
    },
    claimedByTrainerId: { type: Schema.Types.ObjectId, ref: "Trainer" },
    claimedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

trainerInviteSchema.index({ gymId: 1, status: 1, createdAt: -1 });

export type TrainerInvite = InferSchemaType<typeof trainerInviteSchema>;

const TrainerInviteModel =
  models.TrainerInvite ?? model("TrainerInvite", trainerInviteSchema);

export default TrainerInviteModel;
