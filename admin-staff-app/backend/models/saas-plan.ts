import { model, models, Schema, type InferSchemaType } from "mongoose";

const saasPlanLimitsSchema = new Schema(
  {
    maxMembers: { type: Number, min: 1, max: 1_000_000, default: null },
    maxStaff: { type: Number, min: 1, max: 10_000, default: null },
    maxTrainers: { type: Number, min: 1, max: 10_000, default: null },
  },
  { _id: false },
);

const saasPlanSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 48,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 280,
      default: "",
    },
    monthlyPrice: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000_000,
      default: 0,
    },
    annualPrice: {
      type: Number,
      required: true,
      min: 0,
      max: 100_000_000,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 8,
      default: "EGP",
    },
    defaultGracePeriodDays: {
      type: Number,
      required: true,
      min: 0,
      max: 90,
      default: 7,
    },
    features: {
      type: [String],
      default: [],
    },
    limits: {
      type: saasPlanLimitsSchema,
      default: () => ({ maxMembers: null, maxStaff: null, maxTrainers: null }),
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

saasPlanSchema.index({ sortOrder: 1, createdAt: 1 });

export type SaasPlan = InferSchemaType<typeof saasPlanSchema>;

const SaasPlanModel = models.SaasPlan ?? model("SaasPlan", saasPlanSchema);

export default SaasPlanModel;
