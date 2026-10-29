import { model, models, Schema, type InferSchemaType } from "mongoose";

const membershipRequestSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "MembershipPlan" },
    planName: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    durationMonths: { type: Number, required: true, min: 1, default: 1 },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Instapay"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      required: true,
    },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

membershipRequestSchema.index({ gymId: 1, status: 1, createdAt: -1 });
membershipRequestSchema.index({ memberId: 1, status: 1, createdAt: -1 });

export type MembershipRequest = InferSchemaType<typeof membershipRequestSchema>;

const MembershipRequestModel =
  models.MembershipRequest ?? model("MembershipRequest", membershipRequestSchema);

export default MembershipRequestModel;
