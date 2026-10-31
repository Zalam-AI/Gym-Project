import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import PlatformAdminModel, {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  type PlatformPermission,
  type PlatformRole,
} from "gymos-admin-backend/models/platform-admin";
import PlatformAuditLogModel, {
  type AuditTargetType,
} from "gymos-admin-backend/models/platform-audit-log";
import { getMemberTokenFromRequest, verifyMemberSessionToken } from "@/lib/member-session";
import {
  getPlatformTokenFromRequest,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import { getStaffTokenFromRequest, verifyStaffSessionToken } from "@/lib/staff-session";

export type ActivePlatformAdminContext = {
  adminId: Types.ObjectId;
  fullName: string;
  email: string;
  role: PlatformRole;
  permissions: PlatformPermission[];
};

const VALID_PERMISSION_SET = new Set<string>(PLATFORM_PERMISSIONS);
const VALID_ROLE_SET = new Set<string>(PLATFORM_ROLES);

export function hasPlatformPermission(
  ctx: ActivePlatformAdminContext,
  permission: PlatformPermission,
): boolean {
  return ctx.permissions.includes(permission);
}

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 80);
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 80);
  return "unknown";
}

export async function recordPlatformAudit(
  ctx: ActivePlatformAdminContext,
  request: Request,
  entry: {
    action: string;
    targetType: AuditTargetType;
    targetId?: string;
    targetLabel?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await PlatformAuditLogModel.create({
      actorAdminId: ctx.adminId,
      actorEmail: ctx.email,
      actorName: ctx.fullName,
      actorRole: ctx.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? "",
      targetLabel: entry.targetLabel ?? "",
      summary: entry.summary,
      metadata: entry.metadata ?? {},
      ipAddress: extractClientIp(request),
    });
  } catch (error) {
    console.error("Failed to record platform audit log:", error);
  }
}

/**
 * Verifies the platform-domain session token AND confirms in MongoDB that the
 * PlatformAdmin account remains active. Strictly separate from gym staff/member/trainer auth.
 */
export async function requirePlatformAdmin(
  request: Request,
  requiredPermission?: PlatformPermission,
): Promise<
  | { ctx: ActivePlatformAdminContext; response?: never }
  | { ctx?: never; response: NextResponse }
> {
  const token = getPlatformTokenFromRequest(request);
  const session = await verifyPlatformSessionToken(token);

  if (!session || !Types.ObjectId.isValid(session.sub)) {
    const [staffSession, mobileSession] = await Promise.all([
      verifyStaffSessionToken(getStaffTokenFromRequest(request)),
      verifyMemberSessionToken(getMemberTokenFromRequest(request)),
    ]);
    if (staffSession || mobileSession) {
      return {
        response: NextResponse.json(
          { error: "Platform administrator permissions are required." },
          { status: 403 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: "Platform authentication required." },
        { status: 401 },
      ),
    };
  }

  try {
    await connectToDatabase();
    const admin = await PlatformAdminModel.findOne({
      _id: new Types.ObjectId(session.sub),
      status: "active",
    }).select("fullName email role permissions status");

    if (!admin) {
      return {
        response: NextResponse.json(
          { error: "Platform authentication required." },
          { status: 401 },
        ),
      };
    }

    const permissions = (admin.permissions ?? []).filter(
      (p: unknown): p is PlatformPermission =>
        typeof p === "string" && VALID_PERMISSION_SET.has(p),
    );

    const role: PlatformRole =
      typeof admin.role === "string" && VALID_ROLE_SET.has(admin.role)
        ? (admin.role as PlatformRole)
        : "platform_admin";

    const ctx: ActivePlatformAdminContext = {
      adminId: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      role,
      permissions,
    };

    if (requiredPermission && !hasPlatformPermission(ctx, requiredPermission)) {
      return {
        response: NextResponse.json(
          { error: `Missing required platform permission: ${requiredPermission}.` },
          { status: 403 },
        ),
      };
    }

    return { ctx };
  } catch (error) {
    console.error("Failed to verify platform admin session against MongoDB:", error);
    return {
      response: NextResponse.json(
        { error: "Database temporarily unavailable. Please try again shortly." },
        { status: 503 },
      ),
    };
  }
}
