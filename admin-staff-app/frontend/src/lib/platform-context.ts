import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import PlatformAdminModel, {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "gymos-admin-backend/models/platform-admin";
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
  permissions: PlatformPermission[];
};

const VALID_PERMISSION_SET = new Set<string>(PLATFORM_PERMISSIONS);

export function hasPlatformPermission(
  ctx: ActivePlatformAdminContext,
  permission: PlatformPermission,
): boolean {
  return ctx.permissions.includes(permission);
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

  await connectToDatabase();
  const admin = await PlatformAdminModel.findOne({
    _id: new Types.ObjectId(session.sub),
    status: "active",
  }).select("fullName email permissions status");

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

  const ctx: ActivePlatformAdminContext = {
    adminId: admin._id,
    fullName: admin.fullName,
    email: admin.email,
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
}
