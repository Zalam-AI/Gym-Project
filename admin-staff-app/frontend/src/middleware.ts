import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }
  if (pathname === "/api/attendance" && request.method === "OPTIONS") {
    return NextResponse.next();
  }
  const memberAppOrigin = request.headers.get("origin");
  if (
    pathname === "/api/member-portal" &&
    (request.method === "OPTIONS" || request.method === "GET") &&
    (process.env.GYMOS_MEMBER_APP_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001")
      .split(",").map((origin) => origin.trim()).includes(memberAppOrigin ?? "")
  ) {
    return NextResponse.next();
  }
  if (
    pathname === "/api/attendance" &&
    request.method === "POST" &&
    (process.env.GYMOS_MEMBER_APP_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001")
      .split(",").map((origin) => origin.trim()).includes(memberAppOrigin ?? "")
  ) {
    return NextResponse.next();
  }

  const session = await verifyStaffSessionToken(
    request.cookies.get(STAFF_SESSION_COOKIE)?.value,
  );
  if (pathname === "/login" || pathname === "/register") {
    if (!session) {
      return NextResponse.next();
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }
  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
