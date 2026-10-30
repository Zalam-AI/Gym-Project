import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { isValidTimezone } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { generateStaffInviteCode } from "gymos-admin-backend/lib/trainer-code";
import GymModel from "gymos-admin-backend/models/gym";
import StaffInviteModel from "gymos-admin-backend/models/staff-invite";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import { requireStaffContext } from "@/lib/gym-context";
import { normalizePhone } from "@/lib/member-auth";

export const runtime = "nodejs";

async function createUniqueStaffCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateStaffInviteCode();
    const exists = await StaffInviteModel.exists({ code: candidate });
    if (!exists) return candidate;
  }
  return generateStaffInviteCode();
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaffContext(request);
    if (auth.response) {
      return auth.response;
    }
    const { ctx } = auth;

    await connectToDatabase();
    const [teamDocs, inviteDocs] = await Promise.all([
      StaffUserModel.find({ gymId: ctx.gymId }).sort({ role: 1, createdAt: 1 }).lean(),
      StaffInviteModel.find({ gymId: ctx.gymId })
        .populate({
          path: "claimedByUserId",
          model: StaffUserModel,
          match: { gymId: ctx.gymId },
          select: "fullName email",
        })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

    return NextResponse.json({
      currentUser: {
        id: ctx.userId.toString(),
        name: ctx.userName,
        email: ctx.userEmail,
        role: ctx.role,
      },
      gym: {
        ...ctx.gym,
        qrPayload: `GYMOS-GYM:${ctx.gym.id}`,
      },
      team: teamDocs.map((member) => ({
        id: String(member._id),
        fullName: member.fullName,
        email: member.email,
        role: (member.role === "owner" ? "owner" : "staff") as "owner" | "staff",
        status: (member.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
        createdAt: member.createdAt ? new Date(member.createdAt).toISOString() : null,
      })),
      invites: inviteDocs.map((inv) => {
        const claimedBy = inv.claimedByUserId as unknown as {
          fullName?: string;
          email?: string;
        } | null;
        return {
          id: String(inv._id),
          code: inv.code,
          role: (inv.role === "owner" ? "owner" : "staff") as "owner" | "staff",
          presetName: inv.presetName ?? "",
          presetEmail: inv.presetEmail ?? "",
          status: inv.status as "unused" | "claimed" | "revoked",
          claimedByName: claimedBy?.fullName ?? "",
          claimedAt: inv.claimedAt ? new Date(inv.claimedAt).toISOString() : null,
          expiresAt: inv.expiresAt ? new Date(inv.expiresAt).toISOString() : null,
          createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString() : null,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to fetch gym settings:", error);
    return NextResponse.json(
      { error: "Unable to load gym settings right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let rawBody: unknown;
  let parsedBody: Record<string, unknown> | null = null;
  try {
    rawBody = await request.json();
    if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      parsedBody = rawBody as Record<string, unknown>;
    }
  } catch {
    rawBody = undefined;
  }

  const auth = await requireStaffContext(request, parsedBody);
  if (auth.response) {
    return auth.response;
  }
  const { ctx } = auth;

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only the gym owner can modify gym settings or manage staff access." },
      { status: 403 },
    );
  }

  if (rawBody === undefined) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!parsedBody) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = parsedBody;

  const action = typeof input.action === "string" ? input.action : "";

  try {
    await connectToDatabase();

    if (action === "update-gym") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const address = typeof input.address === "string" ? input.address.trim() : "";
      const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
      const phone = normalizePhone(rawPhone) || rawPhone;
      const capacity = input.capacity;
      const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";

      if (!name || name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { error: "Gym name must be between 2 and 100 characters." },
          { status: 400 },
        );
      }
      if (!address || address.length < 2 || address.length > 200) {
        return NextResponse.json(
          { error: "Address must be between 2 and 200 characters." },
          { status: 400 },
        );
      }
      if (!phone || phone.length < 6 || phone.length > 30) {
        return NextResponse.json(
          { error: "Enter a valid phone number." },
          { status: 400 },
        );
      }
      if (
        typeof capacity !== "number" ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 5000
      ) {
        return NextResponse.json(
          { error: "Floor capacity must be a whole number between 1 and 5000." },
          { status: 400 },
        );
      }
      if (!isValidTimezone(timezone)) {
        return NextResponse.json(
          { error: "Select a valid IANA timezone (e.g. Africa/Cairo)." },
          { status: 400 },
        );
      }

      const updated = await GymModel.findOneAndUpdate(
        { _id: ctx.gymId },
        { $set: { name, address, phone, capacity, timezone } },
        { new: true, runValidators: true },
      ).select("name slug address phone capacity timezone currency");

      if (!updated) {
        return NextResponse.json({ error: "Gym workspace was not found." }, { status: 404 });
      }

      return NextResponse.json({
        gym: {
          id: updated._id.toString(),
          name: updated.name,
          slug: updated.slug,
          address: updated.address,
          phone: updated.phone,
          capacity: updated.capacity,
          timezone: updated.timezone,
          currency: updated.currency,
          qrPayload: `GYMOS-GYM:${updated._id.toString()}`,
        },
      });
    }

    if (action === "generate-staff-invite") {
      const role = input.role === "owner" ? "owner" : "staff";
      const presetName = typeof input.presetName === "string" ? input.presetName.trim() : "";
      const presetEmail =
        typeof input.presetEmail === "string" && input.presetEmail.trim()
          ? input.presetEmail.trim().toLowerCase()
          : "";

      if (presetName.length > 100) {
        return NextResponse.json(
          { error: "Staff name note must be 100 characters or fewer." },
          { status: 400 },
        );
      }
      if (presetEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(presetEmail) || presetEmail.length > 254)) {
        return NextResponse.json(
          { error: "Enter a valid email address or leave optional email blank." },
          { status: 400 },
        );
      }

      const code = await createUniqueStaffCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const invite = await StaffInviteModel.create({
        gymId: ctx.gymId,
        code,
        role,
        ...(presetName ? { presetName } : {}),
        ...(presetEmail ? { presetEmail } : {}),
        status: "unused",
        createdByUserId: ctx.userId,
        expiresAt,
      });

      return NextResponse.json(
        {
          invite: {
            id: invite._id.toString(),
            code: invite.code,
            role: invite.role,
            presetName: invite.presetName ?? "",
            presetEmail: invite.presetEmail ?? "",
            status: invite.status,
            expiresAt: invite.expiresAt?.toISOString() ?? null,
          },
        },
        { status: 201 },
      );
    }

    if (action === "revoke-staff-invite") {
      const inviteId = typeof input.inviteId === "string" ? input.inviteId.trim() : "";
      if (!Types.ObjectId.isValid(inviteId)) {
        return NextResponse.json({ error: "Valid inviteId is required." }, { status: 400 });
      }
      const revoked = await StaffInviteModel.findOneAndUpdate(
        { _id: inviteId, gymId: ctx.gymId, status: "unused" },
        { $set: { status: "revoked" } },
        { new: true },
      );
      if (!revoked) {
        return NextResponse.json({ error: "Unused staff invite was not found." }, { status: 404 });
      }
      return NextResponse.json({ inviteId: revoked._id.toString(), status: "revoked" });
    }

    if (action === "update-staff-status") {
      const staffUserId = typeof input.staffUserId === "string" ? input.staffUserId.trim() : "";
      const nextStatus = input.status;
      if (
        !Types.ObjectId.isValid(staffUserId) ||
        (nextStatus !== "active" && nextStatus !== "inactive")
      ) {
        return NextResponse.json(
          { error: "Valid staffUserId and status (active or inactive) are required." },
          { status: 400 },
        );
      }
      if (staffUserId === ctx.userId.toString() && nextStatus === "inactive") {
        return NextResponse.json(
          { error: "You cannot deactivate your own owner account." },
          { status: 400 },
        );
      }

      const updated = await StaffUserModel.findOneAndUpdate(
        { _id: staffUserId, gymId: ctx.gymId },
        { $set: { status: nextStatus } },
        { new: true },
      ).select("fullName email role status");

      if (!updated) {
        return NextResponse.json({ error: "Staff member was not found." }, { status: 404 });
      }

      return NextResponse.json({
        staffMember: {
          id: updated._id.toString(),
          fullName: updated.fullName,
          email: updated.email,
          role: updated.role,
          status: updated.status,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported settings action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to update gym settings:", error);
    return NextResponse.json(
      { error: "Unable to save settings right now." },
      { status: 503 },
    );
  }
}
