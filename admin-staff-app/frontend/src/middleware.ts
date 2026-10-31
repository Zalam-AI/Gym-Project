import { NextRequest, NextResponse } from "next/server";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import {
  getPlatformTokenFromRequest,
  PLATFORM_SESSION_COOKIE,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import {
  getAllowedOriginsSet,
  isPreviewOriginUrl,
  isTrustedRequestOrigin,
} from "@/lib/security";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  type StaffSession,
  verifyStaffSessionToken,
} from "@/lib/staff-session";
import { doesGymMatchHost, type ParsedTenantHost, parseTenantHost } from "@/lib/tenant-domain";

function jsonWithCors(
  request: NextRequest,
  body: Record<string, unknown>,
  status: number,
): NextResponse {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  if (origin && (getAllowedOriginsSet().has(origin) || isPreviewOriginUrl(origin))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function isEdgeSessionCompatibleWithHost(
  session: StaffSession,
  parsedHost: ParsedTenantHost,
): boolean {
  if (parsedHost.kind === "neutral") return true;
  if (parsedHost.kind === "invalid-host") return false;
  if (parsedHost.kind === "subdomain" && session.gymSlug) {
    return doesGymMatchHost(
      {
        slug: session.gymSlug,
        subdomain: session.gymSubdomain,
      },
      parsedHost,
    );
  }
  // Custom domains and legacy tokens without gymSlug are verified authoritatively against MongoDB in gym-context.ts.
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parsedHost = parseTenantHost(request);

  if (pathname.startsWith("/api/") && !isTrustedRequestOrigin(request)) {
    return jsonWithCors(request, { error: "Origin is not allowed." }, 403);
  }

  if (
    (pathname === "/api/health" || pathname === "/api/tenant") &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/register" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname.startsWith("/api/auth/member/") ||
    pathname === "/api/auth/trainer-code"
  ) {
    return NextResponse.next();
  }

  if (pathname === "/api/platform/auth/login" || pathname === "/api/platform/auth/logout") {
    if (parsedHost.kind !== "neutral") {
      return jsonWithCors(
        request,
        { error: "Platform administration is restricted to the main platform portal." },
        403,
      );
    }
    return NextResponse.next();
  }

  // Platform Console HTML pages (/platform, /platform/login) are strictly separate from gym staff auth
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    if (parsedHost.kind !== "neutral") {
      return new NextResponse(
        "Platform administration is restricted to the main GymOS platform portal.",
        { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    const platformSession = await verifyPlatformSessionToken(
      getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
    );
    if (pathname === "/platform/login") {
      if (platformSession) {
        const consoleUrl = request.nextUrl.clone();
        consoleUrl.pathname = "/platform";
        consoleUrl.search = "";
        return NextResponse.redirect(consoleUrl);
      }
      return NextResponse.next();
    }
    if (platformSession) {
      return NextResponse.next();
    }
    if (process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1") {
      const hasStaffCookie = Boolean(request.cookies.get(STAFF_SESSION_COOKIE)?.value);
      if (!hasStaffCookie) {
        return NextResponse.next();
      }
    }
    const platLoginUrl = request.nextUrl.clone();
    platLoginUrl.pathname = "/platform/login";
    platLoginUrl.search = "";
    return NextResponse.redirect(platLoginUrl);
  }

  // Platform-level routes are restricted strictly to neutral platform hosts and require a platform_admin session
  if (pathname.startsWith("/api/platform/")) {
    if (parsedHost.kind !== "neutral") {
      return jsonWithCors(
        request,
        { error: "Platform administration is restricted to the main platform portal." },
        403,
      );
    }
    const platformSession = await verifyPlatformSessionToken(
      getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
    );
    if (platformSession) {
      return NextResponse.next();
    }
    const [staffAttempt, mobileAttempt] = await Promise.all([
      verifyStaffSessionToken(
        getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
      ),
      verifyMemberSessionToken(
        getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
      ),
    ]);
    if (staffAttempt || mobileAttempt) {
      return jsonWithCors(
        request,
        { error: "Platform administrator permissions are required." },
        403,
      );
    }
    return jsonWithCors(request, { error: "Platform authentication required." }, 401);
  }

  if (
    pathname === "/api/member-portal" &&
    (request.method === "GET" || request.method === "POST" || request.method === "OPTIONS")
  ) {
    return NextResponse.next();
  }
  if (
    pathname === "/api/member-subscriptions" &&
    (request.method === "GET" || request.method === "POST" || request.method === "OPTIONS")
  ) {
    return NextResponse.next();
  }
  if (
    pathname === "/api/trainer-portal" &&
    (request.method === "GET" || request.method === "POST" || request.method === "OPTIONS")
  ) {
    return NextResponse.next();
  }
  if (pathname === "/api/attendance" && request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const staffSession = await verifyStaffSessionToken(
    getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
  );
  const hostCompatible = staffSession
    ? isEdgeSessionCompatibleWithHost(staffSession, parsedHost)
    : false;

  if (pathname === "/api/attendance" && request.method === "POST" && !staffSession) {
    const mobileSession = await verifyMemberSessionToken(
      getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
    );
    if (mobileSession) {
      return NextResponse.next();
    }
  }

  if (pathname === "/login" || pathname === "/register") {
    if (!staffSession || !hostCompatible || parsedHost.kind === "custom-domain") {
      return NextResponse.next();
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (staffSession && !hostCompatible) {
    if (pathname.startsWith("/api/")) {
      return jsonWithCors(
        request,
        {
          error:
            "Cross-gym access denied: your session belongs to another gym workspace and cannot access this gym URL.",
        },
        403,
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (staffSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const [mobileAttempt, platformAttempt] = await Promise.all([
      verifyMemberSessionToken(
        getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
      ),
      verifyPlatformSessionToken(
        getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
      ),
    ]);
    if (mobileAttempt || platformAttempt) {
      return jsonWithCors(
        request,
        { error: "Gym staff permissions are required to access this endpoint." },
        403,
      );
    }
    return jsonWithCors(request, { error: "Authentication required." }, 401);
  }

  // In embedded preview iframes where browsers block third-party cookies on HTML navigations,
  // allow the client AppShell to verify session auth via /api/auth/session and redirect if needed.
  if (process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1") {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
