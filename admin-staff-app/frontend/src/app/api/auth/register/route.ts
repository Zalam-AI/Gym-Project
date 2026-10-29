import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { hashStaffPassword } from "gymos-admin-backend/lib/staff-password";
import GymModel from "gymos-admin-backend/models/gym";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import {
  createStaffSessionToken,
  getStaffCookieOptions,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_DURATION_SECONDS,
} from "@/lib/staff-session";

export const runtime = "nodejs";

function safeEqual(first: string, second: string): boolean {
  const firstBytes = new TextEncoder().encode(first);
  const secondBytes = new TextEncoder().encode(second);
  if (firstBytes.length !== secondBytes.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < firstBytes.length; index += 1) {
    difference |= firstBytes[index] ^ secondBytes[index];
  }
  return difference === 0;
}

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
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const inviteCode = typeof input.inviteCode === "string" ? input.inviteCode : "";
  const inviteSecret = process.env.GYMOS_STAFF_INVITE_CODE;

  if (!inviteSecret) {
    return NextResponse.json(
      { error: "Staff registration is not configured. Set GYMOS_STAFF_INVITE_CODE." },
      { status: 503 },
    );
  }
  if (!safeEqual(inviteCode, inviteSecret)) {
    return NextResponse.json({ error: "The staff invitation code is invalid." }, { status: 403 });
  }
  if (!fullName || fullName.length > 100) {
    return NextResponse.json({ error: "Name is required and must be 100 characters or fewer." }, { status: 400 });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 10 and 128 characters." },
      { status: 400 },
    );
  }
  if (!process.env.GYMOS_SESSION_SECRET || process.env.GYMOS_SESSION_SECRET.length < 32) {
    return NextResponse.json(
      { error: "GYMOS_SESSION_SECRET must contain at least 32 characters." },
      { status: 500 },
    );
  }

  const gymIdValue = process.env.GYMOS_GYM_ID;
  if (!gymIdValue || !Types.ObjectId.isValid(gymIdValue)) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID before registration." },
      { status: 500 },
    );
  }

  try {
    await connectToDatabase();
    const gym = await GymModel.findById(gymIdValue).select("_id");
    if (!gym) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const passwordHash = await hashStaffPassword(password);
    const user = await StaffUserModel.create({
      gymId: gym._id,
      fullName,
      email,
      passwordHash,
    });
    const token = await createStaffSessionToken(
      {
        sub: user._id.toString(),
        name: user.fullName,
        email: user.email,
        gymId: user.gymId.toString(),
      },
      STAFF_SESSION_DURATION_SECONDS,
    );

    const response = NextResponse.json(
      { user: { name: user.fullName, email: user.email }, sessionToken: token },
      { status: 201 },
    );
    response.cookies.set(STAFF_SESSION_COOKIE, token, getStaffCookieOptions(request));
    return response;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("Failed to register a GymOS staff account:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GYMOS_SESSION_SECRET")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unable to complete registration at this time." },
      { status: 503 },
    );
  }
}
