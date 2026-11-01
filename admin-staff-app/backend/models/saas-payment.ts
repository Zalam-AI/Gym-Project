import { model, models, Schema, type InferSchemaType } from "mongoose";

export const SAAS_PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "Instapay Manual",
  "Corporate Invoice",
  "Check",
  "Other",
] as const;
export type SaasPaymentMethod = (typeof SAAS_PAYMENT_METHODS)[number];

export const SAAS_PAYMENT_RECORD_STATUSES = [
  "paid",
  "pending",
  "refunded",
  "void",
] as const;
export type SaasPaymentRecordStatus = (typeof SAAS_PAYMENT_RECORD_STATUSES)[number];

export const SAAS_BILLING_CYCLES = ["monthly", "annual", "custom"] as const;
export type SaasBillingCycle = (typeof SAAS_BILLING_CYCLES)[number];

const saasPaymentSchema = new Schema(
  {
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
      index: true,
    },
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
      required: true,
      trim: true,
      maxlength: 80,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      max: 100_000_000,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 8,
      default: "EGP",
    },
    billingCycle: {
      type: String,
      enum: SAAS_BILLING_CYCLES,
      default: "monthly",
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: SAAS_PAYMENT_METHODS,
      default: "Cash",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: SAAS_PAYMENT_RECORD_STATUSES,
      default: "paid",
      required: true,
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    periodStart: {
      type: Date,
      default: null,
    },
    periodEnd: {
      type: Date,
      default: null,
    },
    receiptNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 48,
      index: true,
    },
    referenceNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    recordedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformAdmin",
      required: true,
    },
    recordedByName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    recordedByEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
  },
  { timestamps: true },
);

saasPaymentSchema.index({ gymId: 1, paidAt: -1 });
saasPaymentSchema.index({ paidAt: -1 });

export type SaasPayment = InferSchemaType<typeof saasPaymentSchema>;

const SaasPaymentModel = models.SaasPayment ?? model("SaasPayment", saasPaymentSchema);

export default SaasPaymentModel;
