import { NextRequest, NextResponse } from "next/server";
import { requireStaffContext } from "@/lib/gym-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaffContext(request);
    if (auth.response) {
      return auth.response;
    }
    const { ctx } = auth;
    return NextResponse.json({
      user: {
        id: ctx.userId.toString(),
        name: ctx.userName,
        email: ctx.userEmail,
        role: ctx.role,
      },
      gym: ctx.gym,
    });
  } catch (error) {
    console.error("Failed to verify staff session:", error);
    return NextResponse.json({ error: "Unable to verify session right now." }, { status: 503 });
  }
}
