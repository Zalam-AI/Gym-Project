import { model, models, Schema, type InferSchemaType } from "mongoose";

export const AUDIT_TARGET_TYPES = [
  "gym",
  "platform_config",
  "support",
  "session",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

const platformAuditLogSchema = new Schema(
  {
    actorAdminId: {
      type: Schema.Types.ObjectId,
      ref: "PlatformAdmin",
      required: true,
      index: true,
    },
    actorEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    actorName: { type: String, required: true, trim: true, maxlength: 100 },
    actorRole: { type: String, required: true, trim: true, maxlength: 40 },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetType: {
      type: String,
      enum: AUDIT_TARGET_TYPES,
      required: true,
    },
    targetId: { type: String, trim: true, maxlength: 80, default: "" },
    targetLabel: { type: String, trim: true, maxlength: 160, default: "" },
    summary: { type: String, required: true, trim: true, maxlength: 400 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

platformAuditLogSchema.index({ createdAt: -1 });

export type PlatformAuditLog = InferSchemaType<typeof platformAuditLogSchema>;

const PlatformAuditLogModel =
  models.PlatformAuditLog ?? model("PlatformAuditLog", platformAuditLogSchema);

export default PlatformAuditLogModel;
