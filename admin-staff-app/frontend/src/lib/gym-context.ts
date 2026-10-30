import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { subdomainifyGymName } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import { getMemberTokenFromRequest, verifyMemberSessionToken } from "@/lib/member-session";
import {
  getPlatformTokenFromRequest,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import {
  getStaffTokenFromRequest,
  type StaffRole,
  verifyStaffSessionToken,
} from "@/lib/staff-session";
import { deriveGymInitials, doesGymMatchHost, parseTenantHost } from "@/lib/tenant-domain";
import { hasConflictingGymRef } from "@/lib/tenant-guard";

export type ActiveStaffContext = {
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  role: StaffRole;
  gymId: Types.ObjectId;
  gym: {
    id: string;
    name: string;
    slug: string;
    subdomain: string;
    customDomain: string;
    branding: {
      accentColor: string;
      tagline: string;
      logoText: string;
    };
    address: string;
    phone: string;
    capacity: number;
    timezone: string;
    currency: string;
  };
};

type StaffAuthResolution =
  | { status: "ok"; ctx: ActiveStaffContext }
  | { status: "forbidden"; error: string }
  | { status: "unauthenticated"; error: string };

async function evaluateStaffRequest(
  request: Request,
  body?: Record<string, unknown> | null,
): Promise<StaffAuthResolution> {
  const token = getStaffTokenFromRequest(request);
  const session = await verifyStaffSessionToken(token);

  if (
    !session ||
    !Types.ObjectId.isValid(session.sub) ||
    !Types.ObjectId.isValid(session.gymId)
  ) {
    const [mobileSession, platformSession] = await Promise.all([
      verifyMemberSessionToken(getMemberTokenFromRequest(request)),
      verifyPlatformSessionToken(getPlatformTokenFromRequest(request)),
    ]);
    if (mobileSession || platformSession) {
      return {
        status: "forbidden",
        error: "Gym staff permissions are required to access this resource.",
      };
    }
    return { status: "unauthenticated", error: "Authentication required." };
  }

  const userId = new Types.ObjectId(session.sub);
  const gymId = new Types.ObjectId(session.gymId);

  await connectToDatabase();
  const [user, gym] = await Promise.all([
    StaffUserModel.findOne({
      _id: userId,
      gymId,
      status: "active",
    }).select("fullName email role status"),
    GymModel.findById(gymId).select(
      "name slug subdomain customDomain branding address phone capacity timezone currency status",
    ),
  ]);

  if (!user || !gym) {
    return { status: "unauthenticated", error: "Authentication required." };
  }

  if (gym.status !== "active") {
    return {
      status: "forbidden",
      error:
        gym.status === "pending"
          ? "This gym workspace is awaiting platform administrator approval."
          : "This gym workspace is currently suspended.",
    };
  }

  const parsedHost = parseTenantHost(request);
  if (
    !doesGymMatchHost(
      {
        slug: gym.slug,
        subdomain: gym.subdomain ?? null,
        customDomain: gym.customDomain ?? null,
      },
      parsedHost,
    )
  ) {
    return {
      status: "forbidden",
      error:
        "Cross-gym access denied: your session belongs to another gym workspace and cannot access this gym URL.",
    };
  }

  const authorizedGym = { id: gym._id.toString(), slug: gym.slug };
  if (hasConflictingGymRef(request, authorizedGym, body)) {
    return {
      status: "forbidden",
      error: "Cross-gym access denied: requested gymId does not match your assigned gym.",
    };
  }

  const role: StaffRole = user.role === "owner" ? "owner" : "staff";
  const subdomain =
    typeof gym.subdomain === "string" && gym.subdomain.trim()
      ? gym.subdomain.trim().toLowerCase()
      : subdomainifyGymName(gym.name);
  const customDomain =
    typeof gym.customDomain === "string" && gym.customDomain.trim()
      ? gym.customDomain.trim().toLowerCase()
      : "";
  const rawBranding = gym.branding as
    | { accentColor?: string; tagline?: string; logoText?: string }
    | undefined;
  const accentColor =
    rawBranding?.accentColor && /^#[0-9a-fA-F]{6}$/.test(rawBranding.accentColor)
      ? rawBranding.accentColor
      : "#45b58b";

  return {
    status: "ok",
    ctx: {
      userId: user._id,
      userName: user.fullName,
      userEmail: user.email,
      role,
      gymId: gym._id,
      gym: {
        id: gym._id.toString(),
        name: gym.name,
        slug: gym.slug,
        subdomain,
        customDomain,
        branding: {
          accentColor,
          tagline: rawBranding?.tagline?.trim() ?? "",
          logoText: deriveGymInitials(gym.name, rawBranding?.logoText),
        },
        address: gym.address,
        phone: gym.phone,
        capacity: typeof gym.capacity === "number" && gym.capacity > 0 ? gym.capacity : 100,
        timezone: gym.timezone || "Africa/Cairo",
        currency: gym.currency || "EGP",
      },
    },
  };
}

/**
 * Verifies the staff session token, enforces active DB relationship with the assigned gym,
 * verifies tenant host/subdomain alignment, and rejects any conflicting client-supplied `gymId` with HTTP 403.
 */
export async function requireStaffContext(
  request: Request,
  body?: Record<string, unknown> | null,
): Promise<
  | { ctx: ActiveStaffContext; response?: never }
  | { ctx?: never; response: NextResponse }
> {
  const result = await evaluateStaffRequest(request, body);
  if (result.status === "ok") {
    return { ctx: result.ctx };
  }
  return {
    response: NextResponse.json(
      { error: result.error },
      { status: result.status === "forbidden" ? 403 : 401 },
    ),
  };
}

/**
 * Verifies the staff session token AND checks MongoDB that both the StaffUser and Gym
 * remain active and match the request's tenant host.
 */
export async function resolveStaffContext(request: Request): Promise<ActiveStaffContext | null> {
  const result = await evaluateStaffRequest(request);
  return result.status === "ok" ? result.ctx : null;
}

/**
 * Strictly resolves the authenticated staff user's authorized gymId.
 * Returns null if unauthenticated, deactivated, tampered, or if the gym is suspended.
 */
export async function resolveActiveGymId(request: Request): Promise<Types.ObjectId | null> {
  const context = await resolveStaffContext(request);
  return context ? context.gymId : null;
}
