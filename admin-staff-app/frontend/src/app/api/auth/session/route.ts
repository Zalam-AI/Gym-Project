import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";

export async function GET(request: NextRequest) {
  const session = await verifyStaffSessionToken(
    request.cookies.get(STAFF_SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({
    user: { name: session.name, email: session.email },
  });
}
