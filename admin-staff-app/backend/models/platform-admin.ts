import { model, models, Schema, type InferSchemaType } from "mongoose";

export const PLATFORM_ROLES = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_auditor",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_PERMISSIONS = [
  "gyms:read",
  "gyms:write",
  "platform:metrics",
  "platform:config",
  "platform:audit",
  "platform:support",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/**
 * Platform-level administrator account.
 * Intentionally has NO `gymId`: platform administrators govern tenant lifecycle
 * and platform-wide health across gyms, separate from any gym's staff or data.
 */
const platformAdminSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: PLATFORM_ROLES,
      default: "platform_owner",
      required: true,
    },
    permissions: {
      type: [String],
      enum: PLATFORM_PERMISSIONS,
      default: [...PLATFORM_PERMISSIONS],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

platformAdminSchema.index({ email: 1 }, { unique: true });

export type PlatformAdmin = InferSchemaType<typeof platformAdminSchema>;

const PlatformAdminModel =
  models.PlatformAdmin ?? model("PlatformAdmin", platformAdminSchema);

export default PlatformAdminModel;
