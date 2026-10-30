import { NextResponse } from "next/server";
import { isValidTimezone } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import PlatformConfigModel, {
  ANNOUNCEMENT_SEVERITIES,
  SELF_SERVICE_MODES,
  type AnnouncementSeverity,
  type SelfServiceMode,
} from "gymos-admin-backend/models/platform-config";
import {
  hasPlatformPermission,
  recordPlatformAudit,
  requirePlatformAdmin,
} from "@/lib/platform-context";

export const runtime = "nodejs";

const VALID_SELF_SERVICE = new Set<string>(SELF_SERVICE_MODES);
const VALID_SEVERITIES = new Set<string>(ANNOUNCEMENT_SEVERITIES);

type LeanPlatformConfig = {
  selfServiceRegistration?: string;
  defaultTrialDays?: number;
  defaultGymCapacity?: number;
  defaultTimezone?: string;
  defaultCurrency?: string;
  announcementBanner?: {
    enabled?: boolean;
    message?: string;
    severity?: string;
  };
  supportInfo?: {
    supportEmail?: string;
    supportPhone?: string;
    supportHours?: string;
    operationsNotice?: string;
  };
  updatedAt?: Date;
};

function serializeConfig(doc: LeanPlatformConfig | null) {
  return {
    selfServiceRegistration: (doc?.selfServiceRegistration &&
    VALID_SELF_SERVICE.has(doc.selfServiceRegistration)
      ? doc.selfServiceRegistration
      : "open") as SelfServiceMode,
    defaultTrialDays:
      typeof doc?.defaultTrialDays === "number" ? doc.defaultTrialDays : 14,
    defaultGymCapacity:
      typeof doc?.defaultGymCapacity === "number" ? doc.defaultGymCapacity : 100,
    defaultTimezone: doc?.defaultTimezone || "Africa/Cairo",
    defaultCurrency: doc?.defaultCurrency || "EGP",
    announcementBanner: {
      enabled: Boolean(doc?.announcementBanner?.enabled),
      message: doc?.announcementBanner?.message ?? "",
      severity: (doc?.announcementBanner?.severity &&
      VALID_SEVERITIES.has(doc.announcementBanner.severity)
        ? doc.announcementBanner.severity
        : "info") as AnnouncementSeverity,
    },
    supportInfo: {
      supportEmail: doc?.supportInfo?.supportEmail ?? "support@gymos.com",
      supportPhone: doc?.supportInfo?.supportPhone ?? "+20 2 2500 0000",
      supportHours: doc?.supportInfo?.supportHours ?? "Sun–Thu, 09:00–18:00 Africa/Cairo",
      operationsNotice:
        doc?.supportInfo?.operationsNotice ??
        "Custom domain TLS activation and SaaS plan renewals are coordinated directly by GymOS Platform Operations.",
    },
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.response) return auth.response;
    const { ctx } = auth;

    if (
      !hasPlatformPermission(ctx, "platform:config") &&
      !hasPlatformPermission(ctx, "gyms:read")
    ) {
      return NextResponse.json(
        { error: "Missing required platform permission to read configuration." },
        { status: 403 },
      );
    }

    await connectToDatabase();
    const doc = await PlatformConfigModel.findOne({ key: "global" }).lean<LeanPlatformConfig | null>();
    return NextResponse.json({
      config: serializeConfig(doc),
      canEdit: hasPlatformPermission(ctx, "platform:config"),
    });
  } catch (error) {
    console.error("Failed to fetch platform configuration:", error);
    return NextResponse.json(
      { error: "Unable to load platform configuration right now." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requirePlatformAdmin(request, "platform:config");
  if (auth.response) return auth.response;
  const { ctx } = auth;

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    input = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const selfServiceRegistration =
    typeof input.selfServiceRegistration === "string" ? input.selfServiceRegistration : "";
  const defaultTrialDays = input.defaultTrialDays;
  const defaultGymCapacity = input.defaultGymCapacity;
  const defaultTimezone =
    typeof input.defaultTimezone === "string" ? input.defaultTimezone.trim() : "";
  const defaultCurrency =
    typeof input.defaultCurrency === "string"
      ? input.defaultCurrency.trim().toUpperCase()
      : "";

  if (!VALID_SELF_SERVICE.has(selfServiceRegistration)) {
    return NextResponse.json(
      { error: "selfServiceRegistration must be open, approval_required, or closed." },
      { status: 400 },
    );
  }
  if (
    typeof defaultTrialDays !== "number" ||
    !Number.isInteger(defaultTrialDays) ||
    defaultTrialDays < 0 ||
    defaultTrialDays > 365
  ) {
    return NextResponse.json(
      { error: "defaultTrialDays must be an integer between 0 and 365." },
      { status: 400 },
    );
  }
  if (
    typeof defaultGymCapacity !== "number" ||
    !Number.isInteger(defaultGymCapacity) ||
    defaultGymCapacity < 1 ||
    defaultGymCapacity > 5000
  ) {
    return NextResponse.json(
      { error: "defaultGymCapacity must be an integer between 1 and 5000." },
      { status: 400 },
    );
  }
  if (!isValidTimezone(defaultTimezone)) {
    return NextResponse.json(
      { error: "defaultTimezone must be a valid IANA timezone (e.g. Africa/Cairo)." },
      { status: 400 },
    );
  }
  if (!defaultCurrency || !/^[A-Z]{3,8}$/.test(defaultCurrency)) {
    return NextResponse.json(
      { error: "defaultCurrency must be a valid 3–8 letter currency code (e.g. EGP)." },
      { status: 400 },
    );
  }

  const rawBanner =
    input.announcementBanner && typeof input.announcementBanner === "object"
      ? (input.announcementBanner as Record<string, unknown>)
      : {};
  const bannerEnabled = rawBanner.enabled === true;
  const bannerMessage =
    typeof rawBanner.message === "string" ? rawBanner.message.trim().slice(0, 280) : "";
  const bannerSeverity =
    typeof rawBanner.severity === "string" && VALID_SEVERITIES.has(rawBanner.severity)
      ? rawBanner.severity
      : "info";

  const setUpdate: Record<string, unknown> = {
    selfServiceRegistration,
    defaultTrialDays,
    defaultGymCapacity,
    defaultTimezone,
    defaultCurrency,
    announcementBanner: {
      enabled: bannerEnabled,
      message: bannerMessage,
      severity: bannerSeverity,
    },
    updatedByAdminId: ctx.adminId,
  };

  if (input.supportInfo && typeof input.supportInfo === "object" && !Array.isArray(input.supportInfo)) {
    const rawSupport = input.supportInfo as Record<string, unknown>;
    const supportEmail =
      typeof rawSupport.supportEmail === "string"
        ? rawSupport.supportEmail.trim().toLowerCase().slice(0, 254)
        : "support@gymos.com";
    const supportPhone =
      typeof rawSupport.supportPhone === "string"
        ? rawSupport.supportPhone.trim().slice(0, 40)
        : "";
    const supportHours =
      typeof rawSupport.supportHours === "string"
        ? rawSupport.supportHours.trim().slice(0, 120)
        : "";
    const operationsNotice =
      typeof rawSupport.operationsNotice === "string"
        ? rawSupport.operationsNotice.trim().slice(0, 400)
        : "";

    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      return NextResponse.json(
        { error: "Enter a valid support contact email address." },
        { status: 400 },
      );
    }

    setUpdate.supportInfo = {
      supportEmail,
      supportPhone,
      supportHours,
      operationsNotice,
    };
  }

  try {
    await connectToDatabase();
    const updated = await PlatformConfigModel.findOneAndUpdate(
      { key: "global" },
      {
        $set: setUpdate,
        $setOnInsert: { key: "global" },
      },
      { new: true, upsert: true, runValidators: true },
    ).lean<LeanPlatformConfig | null>();

    await recordPlatformAudit(ctx, request, {
      action: "platform.config_updated",
      targetType: "platform_config",
      targetId: "global",
      targetLabel: "Global Platform Configuration",
      summary: `Updated platform policy (registration: ${selfServiceRegistration}, trial: ${defaultTrialDays}d, default capacity: ${defaultGymCapacity}).`,
      metadata: {
        selfServiceRegistration,
        defaultTrialDays,
        defaultGymCapacity,
        defaultTimezone,
        defaultCurrency,
        bannerEnabled,
      },
    });

    return NextResponse.json({
      config: serializeConfig(updated),
    });
  } catch (error) {
    console.error("Failed to update platform configuration:", error);
    return NextResponse.json(
      { error: "Unable to save platform configuration right now." },
      { status: 503 },
    );
  }
}
