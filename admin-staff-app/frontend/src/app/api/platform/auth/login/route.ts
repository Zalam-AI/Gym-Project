import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import {
  hashStaffPassword,
  verifyStaffPassword,
} from "gymos-admin-backend/lib/staff-password";
import PlatformAdminModel from "gymos-admin-backend/models/platform-admin";
import {
  createPlatformSessionToken,
  getPlatformCookieOptions,
  PLATFORM_SESSION_COOKIE,
  PLATFORM_SESSION_DURATION_SECONDS,
} from "@/lib/platform-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPreviewModeEnabled } from "@/lib/security";

export const runtime = "nodejs";

let dummyPlatformHashPromise: Promise<string> | null = null;
function getDummyPlatformHash(): Promise<string> {
  if (!dummyPlatformHashPromise) {
    dummyPlatformHashPromise = hashStaffPassword("gymos_platform_dummy_timing_equalizer");
  }
  return dummyPlatformHashPromise;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, {
    namespace: "platform-login",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
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
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const admin = await PlatformAdminModel.findOne({ email }).select("+passwordHash");
    const targetHash = admin ? admin.passwordHash : await getDummyPlatformHash();
    const validPassword = await verifyStaffPassword(password, targetHash);

    if (!admin || !validPassword) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (admin.status !== "active") {
      return NextResponse.json(
        { error: "This platform administrator account is inactive." },
        { status: 403 },
      );
    }

    const token = await createPlatformSessionToken(
      {
        sub: admin._id.toString(),
        email: admin.email,
        name: admin.fullName,
      },
      PLATFORM_SESSION_DURATION_SECONDS,
    );

    const response = NextResponse.json({
      admin: {
        id: admin._id.toString(),
        name: admin.fullName,
        email: admin.email,
        permissions: admin.permissions ?? [],
      },
      ...(isPreviewModeEnabled() ? { sessionToken: token } : {}),
    });
    response.cookies.set(
      PLATFORM_SESSION_COOKIE,
      token,
      getPlatformCookieOptions(request, PLATFORM_SESSION_DURATION_SECONDS),
    );
    return response;
  } catch (error) {
    console.error("Platform administrator sign-in failed:", error);
    return NextResponse.json({ error: "Unable to sign in at this time." }, { status: 503 });
  }
}
