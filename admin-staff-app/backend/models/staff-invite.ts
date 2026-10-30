import { model, models, Schema, type InferSchemaType } from "mongoose";

const staffInviteSchema = new Schema(
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
    role: {
      type: String,
      enum: ["owner", "staff"],
      default: "staff",
      required: true,
    },
    presetEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    presetName: { type: String, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["unused", "claimed", "revoked"],
      default: "unused",
      required: true,
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
    claimedByUserId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
    claimedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

staffInviteSchema.index({ gymId: 1, status: 1, createdAt: -1 });

export type StaffInvite = InferSchemaType<typeof staffInviteSchema>;

const StaffInviteModel =
  models.StaffInvite ?? model("StaffInvite", staffInviteSchema);

export default StaffInviteModel;
