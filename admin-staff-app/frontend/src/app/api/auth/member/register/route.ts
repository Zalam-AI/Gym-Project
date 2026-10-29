import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import MemberModel from "gymos-admin-backend/models/member";
import { createMemberSessionToken, MEMBER_SESSION_DURATION_SECONDS } from "@/lib/member-session";
import {
  memberApiOptions,
  memberApiResponse,
  isAllowedMemberOrigin,
  parseMemberAuthBody,
  resolveMemberGym,
  setMemberSessionCookie,
} from "@/lib/member-auth";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function POST(request: Request) {
  if (!isAllowedMemberOrigin(request)) return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  const parsed = await parseMemberAuthBody(request);
  if (!parsed.input) return memberApiResponse(request, { error: parsed.error }, 400);
  const input = parsed.input;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.replace(/[^\d+]/g, "") : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!fullName || fullName.length > 100) {
    return memberApiResponse(request, { error: "Full name is required and must be 100 characters or fewer." }, 400);
  }
  if (phone.length < 8 || phone.length > 20 || (phone.slice(1).includes("+") || !/^\+?\d+$/.test(phone))) {
    return memberApiResponse(request, { error: "Enter a valid phone number." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return memberApiResponse(request, { error: "Enter a valid email address." }, 400);
  }
  if (password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
    return memberApiResponse(request, { error: "Password must be at least 10 characters and no more than 72 UTF-8 bytes." }, 400);
  }
  if (!process.env.GYMOS_SESSION_SECRET || process.env.GYMOS_SESSION_SECRET.length < 32) {
    return memberApiResponse(request, { error: "GYMOS_SESSION_SECRET must contain at least 32 characters." }, 500);
  }

  try {
    await connectToDatabase();
    const gym = await resolveMemberGym(input.gymCode);
    if (!gym) return memberApiResponse(request, { error: "Enter a valid gym code." }, 404);

    const existing = await MemberModel.exists({ gymId: gym._id, $or: [{ phone }, { email }] });
    if (existing) return memberApiResponse(request, { error: "Phone number or email is already registered." }, 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const member = await MemberModel.create({
      gymId: gym._id,
      fullName,
      phone,
      email,
      passwordHash,
      status: "active",
      joinDate: new Date(),
    });
    const token = await createMemberSessionToken(member._id.toString(), gym._id.toString());
    const response = memberApiResponse(request, {
      member: { id: member._id.toString(), name: member.fullName, email: member.email },
    }, 201);
    setMemberSessionCookie(response, token);
    return response;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return memberApiResponse(request, { error: "Phone number or email is already registered." }, 409);
    }
    console.error("Member registration failed:", error);
    return memberApiResponse(request, { error: "Unable to register at this time." }, 503);
  }
}