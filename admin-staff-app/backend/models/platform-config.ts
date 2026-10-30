import { model, models, Schema, type InferSchemaType } from "mongoose";

export const SELF_SERVICE_MODES = ["open", "approval_required", "closed"] as const;
export type SelfServiceMode = (typeof SELF_SERVICE_MODES)[number];

export const ANNOUNCEMENT_SEVERITIES = ["info", "warning", "maintenance"] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

const platformConfigSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      immutable: true,
    },
    selfServiceRegistration: {
      type: String,
      enum: SELF_SERVICE_MODES,
      default: "open",
      required: true,
    },
    defaultTrialDays: {
      type: Number,
      min: 0,
      max: 365,
      default: 14,
      required: true,
    },
    defaultGymCapacity: {
      type: Number,
      min: 1,
      max: 5000,
      default: 100,
      required: true,
    },
    defaultTimezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "Africa/Cairo",
      required: true,
    },
    defaultCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 8,
      default: "EGP",
      required: true,
    },
    announcementBanner: {
      enabled: { type: Boolean, default: false, required: true },
      message: { type: String, trim: true, maxlength: 280, default: "" },
      severity: {
        type: String,
        enum: ANNOUNCEMENT_SEVERITIES,
        default: "info",
        required: true,
      },
    },
    supportInfo: {
      supportEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: "support@gymos.com",
      },
      supportPhone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: "+20 2 2500 0000",
      },
      supportHours: {
        type: String,
        trim: true,
        maxlength: 120,
        default: "Sun–Thu, 09:00–18:00 Africa/Cairo",
      },
      operationsNotice: {
        type: String,
        trim: true,
        maxlength: 400,
        default:
          "Custom domain TLS activation and SaaS plan renewals are coordinated directly by GymOS Platform Operations.",
      },
    },
    updatedByAdminId: { type: Schema.Types.ObjectId, ref: "PlatformAdmin" },
  },
  { timestamps: true },
);

export type PlatformConfig = InferSchemaType<typeof platformConfigSchema>;

const PlatformConfigModel =
  models.PlatformConfig ?? model("PlatformConfig", platformConfigSchema);

export default PlatformConfigModel;
