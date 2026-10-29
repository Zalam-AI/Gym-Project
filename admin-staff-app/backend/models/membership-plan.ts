import { model, models, Schema, type InferSchemaType } from "mongoose";

const membershipPlanSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 0 },
    durationMonths: { type: Number, required: true, min: 1, max: 36 },
    benefits: { type: [String], default: [] },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

membershipPlanSchema.index({ gymId: 1, active: 1, createdAt: 1 });

export type MembershipPlan = InferSchemaType<typeof membershipPlanSchema>;

const MembershipPlanModel = models.MembershipPlan ?? model("MembershipPlan", membershipPlanSchema);

export default MembershipPlanModel;