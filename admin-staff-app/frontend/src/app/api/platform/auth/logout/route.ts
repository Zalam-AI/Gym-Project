import { NextResponse } from "next/server";
import {
  getPlatformCookieOptions,
  PLATFORM_SESSION_COOKIE,
} from "@/lib/platform-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLATFORM_SESSION_COOKIE, "", getPlatformCookieOptions(request, 0));
  return response;
}
