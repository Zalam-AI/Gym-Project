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
