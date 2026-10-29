import { model, models, Schema, type InferSchemaType } from "mongoose";

const membershipSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    planName: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: { type: String, required: true },
    paymentStatus: { type: String, enum: ["Paid", "Pending"] },
  },
  { timestamps: true },
);

membershipSchema.index({ gymId: 1, memberId: 1 });
membershipSchema.index({ gymId: 1, expiryDate: 1 });

export type Membership = InferSchemaType<typeof membershipSchema>;

const MembershipModel = models.Membership ?? model("Membership", membershipSchema);

export default MembershipModel;
