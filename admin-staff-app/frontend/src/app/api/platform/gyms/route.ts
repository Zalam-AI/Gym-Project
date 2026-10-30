import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import TrainerModel from "gymos-admin-backend/models/trainer";
import { hasPlatformPermission, requirePlatformAdmin } from "@/lib/platform-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request, "gyms:read");
    if (auth.response) return auth.response;
    const { ctx } = auth;

    await connectToDatabase();
    const [gyms, staffCounts, memberCounts, trainerCounts] = await Promise.all([
      GymModel.find({}).sort({ createdAt: -1 }).lean(),
      StaffUserModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      MemberModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
        { $match: { gymId: { $ne: null } } },
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
      TrainerModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $group: { _id: "$gymId", count: { $sum: 1 } } },
      ]),
    ]);

    const staffByGym = new Map(staffCounts.map((item) => [String(item._id), item.count]));
    const membersByGym = new Map(
      memberCounts
        .filter((item): item is { _id: Types.ObjectId; count: number } => Boolean(item._id))
        .map((item) => [String(item._id), item.count]),
    );
    const trainersByGym = new Map(trainerCounts.map((item) => [String(item._id), item.count]));

    const serializedGyms = gyms.map((gym) => {
      const id = String(gym._id);
      return {
        id,
        name: gym.name,
        slug: gym.slug,
        address: gym.address,
        phone: gym.phone,
        status: gym.status as "active" | "suspended",
        capacity: gym.capacity,
        timezone: gym.timezone,
        currency: gym.currency,
        staffCount: staffByGym.get(id) ?? 0,
        memberCount: membersByGym.get(id) ?? 0,
        trainerCount: trainersByGym.get(id) ?? 0,
        createdAt: gym.createdAt ? new Date(gym.createdAt).toISOString() : null,
      };
    });

    const includeMetrics = hasPlatformPermission(ctx, "platform:metrics");

    return NextResponse.json({
      admin: {
        id: ctx.adminId.toString(),
        name: ctx.fullName,
        email: ctx.email,
        permissions: ctx.permissions,
      },
      ...(includeMetrics
        ? {
            summary: {
              totalGyms: serializedGyms.length,
              activeGyms: serializedGyms.filter((g) => g.status === "active").length,
              suspendedGyms: serializedGyms.filter((g) => g.status === "suspended").length,
              totalEnrolledMembers: serializedGyms.reduce((s, g) => s + g.memberCount, 0),
            },
          }
        : {}),
      gyms: serializedGyms,
    });
  } catch (error) {
    console.error("Failed to list platform gyms:", error);
    return NextResponse.json(
      { error: "Unable to load platform gym registry right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request, "gyms:write");
  if (auth.response) return auth.response;

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    input = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const action = typeof input.action === "string" ? input.action : "";
  if (action !== "set-status") {
    return NextResponse.json({ error: "Unsupported platform action." }, { status: 400 });
  }

  const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
  const status = input.status;
  if (!Types.ObjectId.isValid(gymId) || (status !== "active" && status !== "suspended")) {
    return NextResponse.json(
      { error: "Valid gymId and status (active or suspended) are required." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const updated = await GymModel.findOneAndUpdate(
      { _id: new Types.ObjectId(gymId) },
      { $set: { status } },
      { new: true },
    ).select("name slug status");

    if (!updated) {
      return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
    }

    return NextResponse.json({
      gym: {
        id: updated._id.toString(),
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("Failed to update platform gym status:", error);
    return NextResponse.json(
      { error: "Unable to update gym status right now." },
      { status: 503 },
    );
  }
}
