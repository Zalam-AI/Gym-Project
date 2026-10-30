import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  try {
    const conn = await connectToDatabase();
    if (!conn.connection.db) {
      throw new Error("Database connection not ready.");
    }
    await conn.connection.db.admin().ping();
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
