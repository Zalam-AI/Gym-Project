import { NextResponse } from "next/server";
import { getStaffCookieOptions, STAFF_SESSION_COOKIE } from "@/lib/staff-session";

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_SESSION_COOKIE, "", getStaffCookieOptions(request, 0));
  return response;
}
