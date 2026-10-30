import { model, models, Schema, type InferSchemaType } from "mongoose";

export const SUPPORT_CATEGORIES = [
  "onboarding",
  "domain_routing",
  "account_access",
  "subscription",
  "incident",
  "general",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

const platformSupportItemSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", index: true },
    gymName: { type: String, trim: true, maxlength: 100, default: "" },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    category: {
      type: String,
      enum: SUPPORT_CATEGORIES,
      default: "general",
      required: true,
    },
    priority: {
      type: String,
      enum: SUPPORT_PRIORITIES,
      default: "normal",
      required: true,
    },
    status: {
      type: String,
      enum: SUPPORT_STATUSES,
      default: "open",
      required: true,
      index: true,
    },
    contactName: { type: String, trim: true, maxlength: 100, default: "" },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    notes: { type: String, trim: true, maxlength: 1200, default: "" },
    resolutionNotes: { type: String, trim: true, maxlength: 1200, default: "" },
    resolvedAt: { type: Date },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "PlatformAdmin", required: true },
    updatedByAdminId: { type: Schema.Types.ObjectId, ref: "PlatformAdmin" },
  },
  { timestamps: true },
);

platformSupportItemSchema.index({ status: 1, updatedAt: -1 });

export type PlatformSupportItem = InferSchemaType<typeof platformSupportItemSchema>;

const PlatformSupportItemModel =
  models.PlatformSupportItem ?? model("PlatformSupportItem", platformSupportItemSchema);

export default PlatformSupportItemModel;
