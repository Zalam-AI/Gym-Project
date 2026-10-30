import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.response) {
      return auth.response;
    }
    const { ctx } = auth;
    return NextResponse.json({
      admin: {
        id: ctx.adminId.toString(),
        name: ctx.fullName,
        email: ctx.email,
        role: ctx.role,
        permissions: ctx.permissions,
      },
    });
  } catch (error) {
    console.error("Failed to verify platform session:", error);
    return NextResponse.json(
      { error: "Unable to verify platform session right now." },
      { status: 503 },
    );
  }
}
