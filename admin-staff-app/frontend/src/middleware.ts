import { NextRequest, NextResponse } from "next/server";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // In embedded preview iframes where browsers block third-party cookies on HTML navigations,
  // allow the client AppShell to verify Bearer/Cookie auth via /api/auth/session and redirect if needed.
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
