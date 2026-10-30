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
  verifyStaffSessionToken,
} from "@/lib/staff-session";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !isTrustedRequestOrigin(request)) {
    return jsonWithCors(request, { error: "Origin is not allowed." }, 403);
  }

  if (pathname === "/api/health" && (request.method === "GET" || request.method === "HEAD")) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/register" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname.startsWith("/api/auth/member/") ||
    pathname === "/api/auth/trainer-code" ||
    pathname === "/api/platform/auth/login" ||
    pathname === "/api/platform/auth/logout"
  ) {
    return NextResponse.next();
  }

  // Platform-level routes require a dedicated platform_admin session token
  if (pathname.startsWith("/api/platform/")) {
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
    (request.method === "GET" || request.method === "OPTIONS")
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

  if (pathname === "/api/attendance" && request.method === "POST" && !staffSession) {
    const mobileSession = await verifyMemberSessionToken(
      getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
    );
    if (mobileSession) {
      return NextResponse.next();
    }
  }

  if (pathname === "/login" || pathname === "/register") {
    if (!staffSession) {
      return NextResponse.next();
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
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
