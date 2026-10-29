import { NextResponse } from "next/server";
import { Types } from "mongoose";
import GymModel from "gymos-admin-backend/models/gym";
import { MEMBER_SESSION_COOKIE } from "@/lib/member-session";

export function getAllowedMemberOrigins() {
  const configured = process.env.GYMOS_MEMBER_APP_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : ["http://localhost:3001", "http://127.0.0.1:3001"]);
}

export function isAllowedMemberOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || getAllowedMemberOrigins().has(origin);
}

export function memberApiResponse(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin");
  if (origin && getAllowedMemberOrigins().has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function memberApiOptions(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
  });
  if (origin && getAllowedMemberOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function parseMemberAuthBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? { input: body as Record<string, unknown> }
      : { error: "Request body must be a JSON object." };
  } catch {
    return { error: "Request body must be valid JSON." };
  }
}

export async function resolveMemberGym(gymCode: unknown) {
  const code = typeof gymCode === "string" ? gymCode.trim() : "";
  if (code) {
    if (Types.ObjectId.isValid(code)) return GymModel.findById(code);
    return GymModel.findOne({ slug: code.toLowerCase() });
  }
  const configuredGymId = process.env.GYMOS_GYM_ID;
  if (!configuredGymId || !Types.ObjectId.isValid(configuredGymId)) return null;
  return GymModel.findById(configuredGymId);
}

export function setMemberSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(MEMBER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearMemberSessionCookie(response: NextResponse) {
  response.cookies.set(MEMBER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}