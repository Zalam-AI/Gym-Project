import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import MemberModel from "gymos-admin-backend/models/member";
import { createMemberSessionToken } from "@/lib/member-session";
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
  const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
  const normalizedPhone = identifier.replace(/[^\d+]/g, "");
  const normalizedEmail = identifier.toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  if (!identifier || !password) {
    return memberApiResponse(request, { error: "Phone or email and password are required." }, 400);
  }

  try {
    await connectToDatabase();
    const gym = await resolveMemberGym(input.gymCode);
    if (!gym) return memberApiResponse(request, { error: "Enter a valid gym code." }, 404);
    const member = await MemberModel.findOne({
      gymId: gym._id,
      $or: [{ phone: normalizedPhone }, { email: normalizedEmail }],
    }).select("+passwordHash");
    const validPassword = member?.passwordHash ? await bcrypt.compare(password, member.passwordHash) : false;
    if (!member || !validPassword) {
      return memberApiResponse(request, { error: "Invalid credentials." }, 401);
    }

    const token = await createMemberSessionToken(member._id.toString(), gym._id.toString());
    const response = memberApiResponse(request, {
      member: { id: member._id.toString(), name: member.fullName, email: member.email },
    });
    setMemberSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Member login failed:", error);
    return memberApiResponse(request, { error: "Unable to sign in at this time." }, 503);
  }
}