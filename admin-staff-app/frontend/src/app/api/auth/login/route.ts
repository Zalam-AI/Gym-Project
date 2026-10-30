import { NextResponse } from "next/server";
import { subdomainifyGymName } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { hashStaffPassword, verifyStaffPassword } from "gymos-admin-backend/lib/staff-password";
import GymModel from "gymos-admin-backend/models/gym";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPreviewModeEnabled } from "@/lib/security";
import {
  createStaffSessionToken,
  getStaffCookieOptions,
  REMEMBERED_SESSION_DURATION_SECONDS,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_DURATION_SECONDS,
} from "@/lib/staff-session";
import { deriveGymInitials } from "@/lib/tenant-domain";
import { resolveGymFromRequestHost } from "@/lib/tenant-resolver";

export const runtime = "nodejs";

let dummyStaffHashPromise: Promise<string> | null = null;
function getDummyStaffHash(): Promise<string> {
  if (!dummyStaffHashPromise) {
    dummyStaffHashPromise = hashStaffPassword("gymos_dummy_timing_equalizer_password");
  }
  return dummyStaffHashPromise;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, {
    namespace: "staff-login",
    limit: 15,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const rememberMe = input.rememberMe === true;
  if (!email || !password || email.length > 254 || password.length > 256) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const tenant = await resolveGymFromRequestHost(request);
    if (tenant.mode === "not-found") {
      return NextResponse.json(
        { error: "No gym workspace is registered at this URL." },
        { status: 404 },
      );
    }
    if (tenant.mode === "tenant" && tenant.gym.status !== "active") {
      return NextResponse.json(
        {
          error:
            tenant.gym.status === "pending"
              ? "This gym workspace is awaiting platform administrator approval."
              : "This gym workspace is currently suspended.",
        },
        { status: 403 },
      );
    }

    const user = await StaffUserModel.findOne({ email }).select("+passwordHash");
    const targetHash = user ? user.passwordHash : await getDummyStaffHash();
    const validPassword = await verifyStaffPassword(password, targetHash);

    if (!user || !validPassword) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    if (user.status === "inactive") {
      return NextResponse.json(
        { error: "This staff account has been deactivated. Contact your gym owner." },
        { status: 403 },
      );
    }

    const gym = await GymModel.findById(user.gymId).select(
      "name slug subdomain customDomain branding status",
    );
    if (!gym) {
      return NextResponse.json({ error: "Assigned gym workspace was not found." }, { status: 404 });
    }
    if (gym.status !== "active") {
      return NextResponse.json(
        {
          error:
            gym.status === "pending"
              ? "This gym workspace is awaiting platform administrator approval."
              : "This gym workspace is currently suspended.",
        },
        { status: 403 },
      );
    }

    if (tenant.mode === "tenant" && gym._id.toString() !== tenant.gym._id.toString()) {
      return NextResponse.json(
        {
          error: `Access denied: your account does not belong to ${tenant.gym.name}. Sign in from your own gym workspace URL.`,
        },
        { status: 403 },
      );
    }

    user.lastLoginAt = new Date();
    await user.save();

    const role = user.role === "owner" ? "owner" : "staff";
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

    const duration = rememberMe
      ? REMEMBERED_SESSION_DURATION_SECONDS
      : STAFF_SESSION_DURATION_SECONDS;
    const token = await createStaffSessionToken(
      {
        sub: user._id.toString(),
        name: user.fullName,
        email: user.email,
        gymId: user.gymId.toString(),
        gymSlug: gym.slug,
        gymSubdomain: subdomain,
        role,
      },
      duration,
    );
    const response = NextResponse.json({
      user: { name: user.fullName, email: user.email, role },
      gym: {
        id: gym._id.toString(),
        name: gym.name,
        slug: gym.slug,
        subdomain,
        customDomain,
        branding: {
          accentColor:
            rawBranding?.accentColor && /^#[0-9a-fA-F]{6}$/.test(rawBranding.accentColor)
              ? rawBranding.accentColor
              : "#45b58b",
          tagline: rawBranding?.tagline?.trim() ?? "",
          logoText: deriveGymInitials(gym.name, rawBranding?.logoText),
        },
      },
      ...(isPreviewModeEnabled() ? { sessionToken: token } : {}),
    });
    response.cookies.set(
      STAFF_SESSION_COOKIE,
      token,
      getStaffCookieOptions(request, rememberMe ? duration : undefined),
    );
    return response;
  } catch (error) {
    console.error("Failed to sign in to GymOS:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GYMOS_SESSION_SECRET")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unable to sign in at this time." }, { status: 503 });
  }
}
