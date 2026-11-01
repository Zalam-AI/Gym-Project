import { model, models, Schema, type InferSchemaType } from "mongoose";

export const GYM_STATUSES = ["pending", "active", "suspended"] as const;
export type GymStatus = (typeof GYM_STATUSES)[number];

export const PLATFORM_PLAN_TIERS = ["trial", "starter", "growth", "enterprise"] as const;
export type PlatformPlanTier = (typeof PLATFORM_PLAN_TIERS)[number];

export const PLATFORM_BILLING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
] as const;
export type PlatformBillingStatus = (typeof PLATFORM_BILLING_STATUSES)[number];

export const PLATFORM_BILLING_CYCLES = ["monthly", "annual", "custom"] as const;
export type PlatformBillingCycle = (typeof PLATFORM_BILLING_CYCLES)[number];

export const PLATFORM_PAYMENT_STATUSES = [
  "trialing",
  "paid",
  "pending",
  "past_due",
  "grace_period",
  "expired",
  "waived",
] as const;
export type PlatformPaymentStatus = (typeof PLATFORM_PAYMENT_STATUSES)[number];

const gymLimitsOverrideSchema = new Schema(
  {
    maxMembers: { type: Number, min: 1, max: 1_000_000, default: null },
    maxStaff: { type: Number, min: 1, max: 10_000, default: null },
    maxTrainers: { type: Number, min: 1, max: 10_000, default: null },
  },
  { _id: false },
);

const gymBrandingSchema = new Schema(
  {
    accentColor: {
      type: String,
      trim: true,
      default: "#45b58b",
      match: /^#[0-9a-fA-F]{6}$/,
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: 140,
      default: "",
    },
    logoText: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 4,
      default: "",
    },
  },
  { _id: false },
);

const platformSubscriptionSchema = new Schema(
  {
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SaasPlan",
      default: null,
    },
    planCode: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 48,
      default: "",
    },
    planName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    planTier: {
      type: String,
      enum: PLATFORM_PLAN_TIERS,
      default: "trial",
      required: true,
    },
    billingStatus: {
      type: String,
      enum: PLATFORM_BILLING_STATUSES,
      default: "trialing",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: PLATFORM_PAYMENT_STATUSES,
      default: "trialing",
    },
    billingCycle: {
      type: String,
      enum: PLATFORM_BILLING_CYCLES,
      default: "monthly",
      required: true,
    },
    priceAmount: {
      type: Number,
      min: 0,
      max: 100_000_000,
      default: null,
    },
    startDate: { type: Date, default: null },
    expirationDate: { type: Date, default: null },
    renewalDate: { type: Date, default: null },
    gracePeriodDays: {
      type: Number,
      min: 0,
      max: 90,
      default: 7,
    },
    autoSuspendOnExpire: {
      type: Boolean,
      default: true,
    },
    limitsOverride: {
      type: gymLimitsOverrideSchema,
      default: () => ({ maxMembers: null, maxStaff: null, maxTrainers: null }),
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
  },
  { _id: false },
);

const gymSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 64,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      maxlength: 63,
      match: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    },
    customDomain: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      maxlength: 253,
      match: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    },
    branding: {
      type: gymBrandingSchema,
      default: () => ({ accentColor: "#45b58b", tagline: "", logoText: "" }),
    },
    platformSubscription: {
      type: platformSubscriptionSchema,
      default: () => ({
        planTier: "trial",
        billingStatus: "trialing",
        billingCycle: "monthly",
        notes: "",
      }),
    },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    status: {
      type: String,
      enum: GYM_STATUSES,
      default: "active",
      required: true,
    },
    statusNote: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    approvedAt: { type: Date },
    approvedByAdminId: { type: Schema.Types.ObjectId, ref: "PlatformAdmin" },
    capacity: {
      type: Number,
      min: 1,
      max: 5000,
      default: 100,
      required: true,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "Africa/Cairo",
      required: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 8,
      default: "EGP",
      required: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  },
  { timestamps: true },
);

export type Gym = InferSchemaType<typeof gymSchema>;

const GymModel = models.Gym ?? model("Gym", gymSchema);

export default GymModel;
