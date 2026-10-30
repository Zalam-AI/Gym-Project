import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import PlatformConfigModel from "gymos-admin-backend/models/platform-config";
import PlatformSupportItemModel, {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from "gymos-admin-backend/models/platform-support-item";
import {
  hasPlatformPermission,
  recordPlatformAudit,
  requirePlatformAdmin,
} from "@/lib/platform-context";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set<string>(SUPPORT_CATEGORIES);
const VALID_PRIORITIES = new Set<string>(SUPPORT_PRIORITIES);
const VALID_STATUSES = new Set<string>(SUPPORT_STATUSES);

type LeanSupportDoc = {
  _id: Types.ObjectId;
  gymId?: Types.ObjectId | null;
  gymName?: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  resolutionNotes?: string;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type LeanConfigSupportDoc = {
  supportInfo?: {
    supportEmail?: string;
    supportPhone?: string;
    supportHours?: string;
    operationsNotice?: string;
  };
};

function serializeSupportItem(doc: LeanSupportDoc) {
  return {
    id: String(doc._id),
    gymId: doc.gymId ? String(doc.gymId) : null,
    gymName: doc.gymName ?? "",
    subject: doc.subject,
    category: (VALID_CATEGORIES.has(doc.category) ? doc.category : "general") as SupportCategory,
    priority: (VALID_PRIORITIES.has(doc.priority) ? doc.priority : "normal") as SupportPriority,
    status: (VALID_STATUSES.has(doc.status) ? doc.status : "open") as SupportStatus,
    contactName: doc.contactName ?? "",
    contactEmail: doc.contactEmail ?? "",
    notes: doc.notes ?? "",
    resolutionNotes: doc.resolutionNotes ?? "",
    resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.response) return auth.response;
    const { ctx } = auth;

    if (
      !hasPlatformPermission(ctx, "platform:support") &&
      !hasPlatformPermission(ctx, "gyms:read")
    ) {
      return NextResponse.json(
        { error: "Missing required platform permission: platform:support." },
        { status: 403 },
      );
    }

    await connectToDatabase();
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status")?.trim() ?? "";
    const query: Record<string, unknown> = {};
    if (statusFilter && VALID_STATUSES.has(statusFilter)) {
      query.status = statusFilter;
    }

    const [items, configDoc] = await Promise.all([
      PlatformSupportItemModel.find(query)
        .sort({ status: 1, updatedAt: -1 })
        .limit(80)
        .lean<LeanSupportDoc[]>(),
      PlatformConfigModel.findOne({ key: "global" })
        .select("supportInfo")
        .lean<LeanConfigSupportDoc | null>(),
    ]);

    return NextResponse.json({
      canManage: hasPlatformPermission(ctx, "platform:support"),
      supportInfo: {
        supportEmail: configDoc?.supportInfo?.supportEmail ?? "support@gymos.com",
        supportPhone: configDoc?.supportInfo?.supportPhone ?? "+20 2 2500 0000",
        supportHours:
          configDoc?.supportInfo?.supportHours ?? "Sun–Thu, 09:00–18:00 Africa/Cairo",
        operationsNotice:
          configDoc?.supportInfo?.operationsNotice ??
          "Custom domain TLS activation and SaaS plan renewals are coordinated directly by GymOS Platform Operations.",
      },
      items: items.map(serializeSupportItem),
    });
  } catch (error) {
    console.error("Failed to fetch platform support items:", error);
    return NextResponse.json(
      { error: "Unable to load support information right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request, "platform:support");
  if (auth.response) return auth.response;
  const { ctx } = auth;

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

  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const rawGymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
  const category =
    typeof input.category === "string" && VALID_CATEGORIES.has(input.category)
      ? input.category
      : "general";
  const priority =
    typeof input.priority === "string" && VALID_PRIORITIES.has(input.priority)
      ? input.priority
      : "normal";
  const contactName =
    typeof input.contactName === "string" ? input.contactName.trim().slice(0, 100) : "";
  const contactEmail =
    typeof input.contactEmail === "string"
      ? input.contactEmail.trim().toLowerCase().slice(0, 254)
      : "";
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 1200) : "";

  if (!subject || subject.length < 3 || subject.length > 160) {
    return NextResponse.json(
      { error: "Support subject must be between 3 and 160 characters." },
      { status: 400 },
    );
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json(
      { error: "Enter a valid contact email or leave blank." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();

    let resolvedGymId: Types.ObjectId | undefined;
    let resolvedGymName = "";
    if (rawGymId) {
      if (!Types.ObjectId.isValid(rawGymId)) {
        return NextResponse.json({ error: "Invalid gymId." }, { status: 400 });
      }
      const gym = await GymModel.findById(rawGymId).select("name").lean<{ _id: Types.ObjectId; name: string } | null>();
      if (!gym) {
        return NextResponse.json({ error: "Selected gym was not found." }, { status: 404 });
      }
      resolvedGymId = gym._id;
      resolvedGymName = gym.name;
    }

    const created = await PlatformSupportItemModel.create({
      ...(resolvedGymId ? { gymId: resolvedGymId, gymName: resolvedGymName } : {}),
      subject,
      category,
      priority,
      status: "open",
      contactName,
      contactEmail,
      notes,
      createdByAdminId: ctx.adminId,
      updatedByAdminId: ctx.adminId,
    });

    await recordPlatformAudit(ctx, request, {
      action: "support.created",
      targetType: "support",
      targetId: created._id.toString(),
      targetLabel: subject,
      summary: `Logged ${priority} support case "${subject}"${
        resolvedGymName ? ` for ${resolvedGymName}` : ""
      }.`,
      metadata: { category, priority, gymName: resolvedGymName || null },
    });

    const reloaded = await PlatformSupportItemModel.findById(created._id).lean<LeanSupportDoc | null>();
    return NextResponse.json(
      { item: reloaded ? serializeSupportItem(reloaded) : null },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create platform support item:", error);
    return NextResponse.json(
      { error: "Unable to create support case right now." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin(request, "platform:support");
  if (auth.response) return auth.response;
  const { ctx } = auth;

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

  try {
    await connectToDatabase();

    if (input.action === "update-directory") {
      const supportEmail =
        typeof input.supportEmail === "string"
          ? input.supportEmail.trim().toLowerCase().slice(0, 254)
          : "";
      const supportPhone =
        typeof input.supportPhone === "string" ? input.supportPhone.trim().slice(0, 40) : "";
      const supportHours =
        typeof input.supportHours === "string" ? input.supportHours.trim().slice(0, 120) : "";
      const operationsNotice =
        typeof input.operationsNotice === "string"
          ? input.operationsNotice.trim().slice(0, 400)
          : "";

      if (!supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
        return NextResponse.json(
          { error: "Valid platform support email is required." },
          { status: 400 },
        );
      }

      const updatedConfig = await PlatformConfigModel.findOneAndUpdate(
        { key: "global" },
        {
          $set: {
            supportInfo: {
              supportEmail,
              supportPhone,
              supportHours,
              operationsNotice,
            },
            updatedByAdminId: ctx.adminId,
          },
          $setOnInsert: { key: "global" },
        },
        { new: true, upsert: true, runValidators: true },
      ).lean<LeanConfigSupportDoc | null>();

      await recordPlatformAudit(ctx, request, {
        action: "support.directory_updated",
        targetType: "support",
        targetId: "global-directory",
        targetLabel: "Platform Support Directory",
        summary: `Updated platform support contact channels (${supportEmail}).`,
        metadata: { supportEmail, supportPhone, supportHours },
      });

      return NextResponse.json({
        supportInfo: updatedConfig?.supportInfo ?? {
          supportEmail,
          supportPhone,
          supportHours,
          operationsNotice,
        },
      });
    }

    const itemId = typeof input.itemId === "string" ? input.itemId.trim() : "";
    if (!Types.ObjectId.isValid(itemId)) {
      return NextResponse.json({ error: "Valid itemId is required." }, { status: 400 });
    }

    const updateSet: Record<string, unknown> = { updatedByAdminId: ctx.adminId };
    const unsetSet: Record<string, 1> = {};

    if ("status" in input && typeof input.status === "string") {
      if (!VALID_STATUSES.has(input.status)) {
        return NextResponse.json(
          { error: "status must be open, in_progress, or resolved." },
          { status: 400 },
        );
      }
      updateSet.status = input.status;
      if (input.status === "resolved") {
        updateSet.resolvedAt = new Date();
      } else {
        unsetSet.resolvedAt = 1;
      }
    }

    if ("priority" in input && typeof input.priority === "string") {
      if (!VALID_PRIORITIES.has(input.priority)) {
        return NextResponse.json(
          { error: "priority must be low, normal, high, or urgent." },
          { status: 400 },
        );
      }
      updateSet.priority = input.priority;
    }

    if ("notes" in input && typeof input.notes === "string") {
      updateSet.notes = input.notes.trim().slice(0, 1200);
    }
    if ("resolutionNotes" in input && typeof input.resolutionNotes === "string") {
      updateSet.resolutionNotes = input.resolutionNotes.trim().slice(0, 1200);
    }

    const updateQuery: Record<string, unknown> = { $set: updateSet };
    if (Object.keys(unsetSet).length > 0) {
      updateQuery.$unset = unsetSet;
    }

    const updated = await PlatformSupportItemModel.findOneAndUpdate(
      { _id: new Types.ObjectId(itemId) },
      updateQuery,
      { new: true, runValidators: true },
    ).lean<LeanSupportDoc | null>();

    if (!updated) {
      return NextResponse.json({ error: "Support case was not found." }, { status: 404 });
    }

    await recordPlatformAudit(ctx, request, {
      action: "support.updated",
      targetType: "support",
      targetId: String(updated._id),
      targetLabel: updated.subject,
      summary: `Updated support case "${updated.subject}" (status: ${updated.status}, priority: ${updated.priority}).`,
      metadata: { status: updated.status, priority: updated.priority },
    });

    return NextResponse.json({ item: serializeSupportItem(updated) });
  } catch (error) {
    console.error("Failed to update platform support item:", error);
    return NextResponse.json(
      { error: "Unable to update support case right now." },
      { status: 503 },
    );
  }
}
