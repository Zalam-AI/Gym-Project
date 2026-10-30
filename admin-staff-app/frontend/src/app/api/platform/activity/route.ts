import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import PlatformAuditLogModel from "gymos-admin-backend/models/platform-audit-log";
import PlatformSupportItemModel from "gymos-admin-backend/models/platform-support-item";
import { hasPlatformPermission, requirePlatformAdmin } from "@/lib/platform-context";

export const runtime = "nodejs";

type LeanAuditDoc = {
  _id: Types.ObjectId;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  summary: string;
  ipAddress?: string;
  createdAt?: Date;
};

type LeanGymEventDoc = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: string;
  createdAt?: Date;
};

type LeanSupportEventDoc = {
  _id: Types.ObjectId;
  subject: string;
  gymName?: string;
  priority: string;
  status: string;
  updatedAt?: Date;
};

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.response) return auth.response;
    const { ctx } = auth;

    if (
      !hasPlatformPermission(ctx, "platform:audit") &&
      !hasPlatformPermission(ctx, "platform:metrics")
    ) {
      return NextResponse.json(
        { error: "Missing required platform permission: platform:audit." },
        { status: 403 },
      );
    }

    await connectToDatabase();
    const [auditDocs, recentGyms, openUrgentSupport] = await Promise.all([
      PlatformAuditLogModel.find({}).sort({ createdAt: -1 }).limit(60).lean<LeanAuditDoc[]>(),
      GymModel.find({})
        .select("name slug status createdAt")
        .sort({ createdAt: -1 })
        .limit(12)
        .lean<LeanGymEventDoc[]>(),
      PlatformSupportItemModel.find({ status: { $ne: "resolved" } })
        .select("subject gymName priority status updatedAt")
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean<LeanSupportEventDoc[]>(),
    ]);

    return NextResponse.json({
      auditLogs: auditDocs.map((doc) => ({
        id: String(doc._id),
        actorName: doc.actorName,
        actorEmail: doc.actorEmail,
        actorRole: doc.actorRole,
        action: doc.action,
        targetType: doc.targetType,
        targetId: doc.targetId ?? "",
        targetLabel: doc.targetLabel ?? "",
        summary: doc.summary,
        ipAddress: doc.ipAddress ?? "",
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      })),
      systemEvents: [
        ...recentGyms.map((gym) => ({
          id: `gym-${String(gym._id)}`,
          kind: "gym_registration" as const,
          title: `${gym.name} (${gym.slug})`,
          status: gym.status,
          timestamp: gym.createdAt ? new Date(gym.createdAt).toISOString() : null,
        })),
        ...openUrgentSupport.map((item) => ({
          id: `support-${String(item._id)}`,
          kind: "support_case" as const,
          title: `${item.subject}${item.gymName ? ` · ${item.gymName}` : ""}`,
          status: `${item.priority}:${item.status}`,
          timestamp: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
        })),
      ].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? "")),
    });
  } catch (error) {
    console.error("Failed to fetch platform activity logs:", error);
    return NextResponse.json(
      { error: "Unable to load platform activity right now." },
      { status: 503 },
    );
  }
}
