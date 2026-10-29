import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { verifyStaffPassword } from "gymos-admin-backend/lib/staff-password";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import {
  createStaffSessionToken,
  REMEMBERED_SESSION_DURATION_SECONDS,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_DURATION_SECONDS,
} from "@/lib/staff-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const user = await StaffUserModel.findOne({ email }).select("+passwordHash");
    const validPassword =
      user && (await verifyStaffPassword(password, user.passwordHash));
    if (!user || !validPassword) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const duration = rememberMe
      ? REMEMBERED_SESSION_DURATION_SECONDS
      : STAFF_SESSION_DURATION_SECONDS;
    const token = await createStaffSessionToken(
      {
        sub: user._id.toString(),
        name: user.fullName,
        email: user.email,
        gymId: user.gymId.toString(),
      },
      duration,
    );
    const response = NextResponse.json({ user: { name: user.fullName, email: user.email } });
    response.cookies.set(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: duration } : {}),
    });
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
