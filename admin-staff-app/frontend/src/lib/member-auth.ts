import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { slugifyGymName } from "gymos-admin-backend/lib/gym-time";
import GymModel from "gymos-admin-backend/models/gym";
import { extractGymSlugFromPathname } from "@/lib/gym-routing";
import { MEMBER_SESSION_COOKIE } from "@/lib/member-session";
import { getAllowedOriginsSet, isPreviewModeEnabled, isPreviewOriginUrl } from "@/lib/security";
import { RESERVED_SUBDOMAINS } from "@/lib/tenant-domain";

export function getAllowedMemberOrigins() {
  return getAllowedOriginsSet();
}

export function isAllowedMemberOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  if (!origin) return true;
  try {
    if (origin === new URL(request.url).origin) return true;
  } catch {
    // Ignore malformed request URL and check explicit allowlist.
  }
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (origin === `${proto}://${forwardedHost}` || origin === `http://${forwardedHost}`) {
      return true;
    }
  }
  return getAllowedMemberOrigins().has(origin) || isPreviewOriginUrl(origin);
}

export function memberApiResponse(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  if (origin && (getAllowedMemberOrigins().has(origin) || isPreviewOriginUrl(origin))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function memberApiOptions(request: Request) {
  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-GymOS-Session",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
  });
  if (origin && (getAllowedMemberOrigins().has(origin) || isPreviewOriginUrl(origin))) {
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

function extractSubdomainCandidateFromHost(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/:\d+$/, "");
  if (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".onrender.com") ||
    host.endsWith(".e2b.app")
  ) {
    return null;
  }
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const candidate = parts[0];
  if (!candidate || RESERVED_SUBDOMAINS.has(candidate)) return null;
  return candidate;
}

export function extractGymIdentifierFromQrOrInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  const prefix = "GYMOS-GYM:";
  if (trimmed.toUpperCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const qrParam =
        parsed.searchParams.get("qr")?.trim() ||
        parsed.searchParams.get("gymSlug")?.trim() ||
        parsed.searchParams.get("gym")?.trim();
      if (qrParam) {
        return qrParam.toUpperCase().startsWith(prefix)
          ? qrParam.slice(prefix.length).trim()
          : qrParam;
      }
      const pathSlug = extractGymSlugFromPathname(parsed.pathname);
      if (pathSlug) return pathSlug;
      const hostSub = extractSubdomainCandidateFromHost(parsed.hostname);
      if (hostSub) return hostSub;
    } catch {
      // Fall through to plain-string matching.
    }
  }

  const normalizedSlashPath = trimmed.startsWith("gym/") ? `/${trimmed}` : trimmed;
  if (normalizedSlashPath.startsWith("/gym/")) {
    const pathSlug = extractGymSlugFromPathname(normalizedSlashPath.split("?")[0]);
    if (pathSlug) return pathSlug;
  }

  if (/^[a-z0-9-]+(\.[a-z0-9-]+){1,}$/i.test(trimmed) && !trimmed.includes(" ")) {
    const firstPart = trimmed.split(".")[0]?.toLowerCase() ?? "";
    if (firstPart && !RESERVED_SUBDOMAINS.has(firstPart)) {
      return firstPart;
    }
  }

  return trimmed;
}

export function matchesGymQrOrCode(
  rawInput: string,
  gym: { id: string; slug: string; subdomain?: string | null },
): boolean {
  const candidate = extractGymIdentifierFromQrOrInput(rawInput);
  if (!candidate) return false;
  if (candidate === gym.id) return true;
  const lower = candidate.toLowerCase();
  if (lower === gym.slug.toLowerCase()) return true;
  if (gym.subdomain && lower === gym.subdomain.trim().toLowerCase()) return true;
  return false;
}

export async function findGymFromQrOrCode(rawInput: string) {
  const trimmed = rawInput.trim();
  if (!trimmed) return { kind: "not_found" as const };

  if (/^(OWN|STF)-/i.test(trimmed)) {
    return { kind: "staff_invite" as const };
  }
  if (/^TRN-/i.test(trimmed)) {
    return { kind: "trainer_invite" as const };
  }

  const identifier = extractGymIdentifierFromQrOrInput(trimmed);
  if (!identifier) return { kind: "not_found" as const };

  if (Types.ObjectId.isValid(identifier)) {
    const byId = await GymModel.findById(identifier);
    if (byId) return { kind: "found" as const, gym: byId };
  }

  const lower = identifier.toLowerCase();
  const bySlugOrSubdomain = await GymModel.findOne({
    $or: [{ slug: lower }, { subdomain: lower }],
  });
  if (bySlugOrSubdomain) {
    return { kind: "found" as const, gym: bySlugOrSubdomain };
  }

  const slugified = slugifyGymName(identifier);
  if (slugified && slugified !== "gymos" && slugified !== lower) {
    const bySlugified = await GymModel.findOne({
      $or: [{ slug: slugified }, { subdomain: slugified.replace(/-/g, "") }],
    });
    if (bySlugified) {
      return { kind: "found" as const, gym: bySlugified };
    }
  }

  const escapedName = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byExactName = await GymModel.find({
    name: new RegExp(`^${escapedName}$`, "i"),
  }).limit(2);
  if (byExactName.length === 1) {
    return { kind: "found" as const, gym: byExactName[0] };
  }

  return { kind: "not_found" as const };
}

/**
 * Resolves an explicit gym code, subdomain, QR payload, or ObjectId. Never falls back to an arbitrary or global gym.
 */
export async function resolveMemberGym(gymCode: unknown) {
  const code = typeof gymCode === "string" ? gymCode.trim() : "";
  if (!code) {
    return null;
  }
  const lookup = await findGymFromQrOrCode(code);
  if (lookup.kind === "found" && lookup.gym.status === "active") {
    return lookup.gym;
  }
  return null;
}

function getMemberCookieOptions(request: Request | undefined, maxAge: number) {
  const isHttps =
    Boolean(request?.headers.get("x-forwarded-proto")?.includes("https")) ||
    Boolean(request?.headers.get("origin")?.startsWith("https://")) ||
    Boolean(request?.url.startsWith("https://"));

  const useCrossSitePreviewCookie = isHttps && isPreviewModeEnabled();

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (useCrossSitePreviewCookie ? "none" : "lax") as "none" | "lax",
    ...(useCrossSitePreviewCookie ? { partitioned: true } : {}),
    path: "/",
    maxAge,
  };
}

export function setMemberSessionCookie(response: NextResponse, token: string, request?: Request) {
  response.cookies.set(
    MEMBER_SESSION_COOKIE,
    token,
    getMemberCookieOptions(request, 7 * 24 * 60 * 60),
  );
}

export function clearMemberSessionCookie(response: NextResponse, request?: Request) {
  response.cookies.set(MEMBER_SESSION_COOKIE, "", getMemberCookieOptions(request, 0));
}
