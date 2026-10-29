import { NextResponse } from "next/server";
import { Types } from "mongoose";
import GymModel from "gymos-admin-backend/models/gym";
import { MEMBER_SESSION_COOKIE } from "@/lib/member-session";

export function getAllowedMemberOrigins() {
  const configured = process.env.GYMOS_MEMBER_APP_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    ...(configured ?? []),
  ]);
}

function isPreviewDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === "production" && process.env.GYMOS_ALLOW_PREVIEW_ORIGINS !== "1") {
    return false;
  }
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.endsWith(".e2b.app")
    );
  } catch {
    return false;
  }
}

export function isAllowedMemberOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    if (origin === new URL(request.url).origin) return true;
  } catch {
    // Ignore malformed request URL and check explicit allowlist.
  }
  return getAllowedMemberOrigins().has(origin) || isPreviewDevOrigin(origin);
}

export function memberApiResponse(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin");
  if (origin && (getAllowedMemberOrigins().has(origin) || isPreviewDevOrigin(origin))) {
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
    "Access-Control-Allow-Headers": "Content-Type, X-GymOS-Session",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
  });
  if (origin && (getAllowedMemberOrigins().has(origin) || isPreviewDevOrigin(origin))) {
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

export function normalizePhone(value: string): string {
  const cleaned = value.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) {
    return `+${cleaned.slice(1).replace(/\+/g, "")}`;
  }
  return cleaned.replace(/\+/g, "");
}

export function buildPhoneCandidates(rawPhone: string): string[] {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return [];
  const digits = normalized.replace(/\D/g, "");
  const candidates = new Set<string>([rawPhone.trim(), normalized, digits]);
  if (digits.startsWith("0") && digits.length === 11) {
    candidates.add(`+20${digits.slice(1)}`);
    candidates.add(`20${digits.slice(1)}`);
  } else if (digits.startsWith("20") && digits.length === 12) {
    candidates.add(`+${digits}`);
    candidates.add(`0${digits.slice(2)}`);
  }
  return [...candidates].filter(Boolean);
}

export async function resolveMemberGym(gymCode: unknown) {
  const code = typeof gymCode === "string" ? gymCode.trim() : "";
  if (code) {
    if (Types.ObjectId.isValid(code)) return GymModel.findById(code);
    return GymModel.findOne({ slug: code.toLowerCase() });
  }
  const configuredGymId = process.env.GYMOS_GYM_ID;
  if (configuredGymId && Types.ObjectId.isValid(configuredGymId)) {
    return GymModel.findById(configuredGymId);
  }
  return GymModel.findOne().sort({ createdAt: 1 });
}

function getMemberCookieOptions(request: Request | undefined, maxAge: number) {
  const isHttps =
    Boolean(request?.headers.get("x-forwarded-proto")?.includes("https")) ||
    Boolean(request?.headers.get("origin")?.startsWith("https://")) ||
    Boolean(request?.url.startsWith("https://"));

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    ...(isHttps ? { partitioned: true } : {}),
    path: "/",
    maxAge,
  };
}

export function setMemberSessionCookie(response: NextResponse, token: string, request?: Request) {
  response.cookies.set(MEMBER_SESSION_COOKIE, token, getMemberCookieOptions(request, 7 * 24 * 60 * 60));
}

export function clearMemberSessionCookie(response: NextResponse, request?: Request) {
  response.cookies.set(MEMBER_SESSION_COOKIE, "", getMemberCookieOptions(request, 0));
}
