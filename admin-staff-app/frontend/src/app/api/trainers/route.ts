import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { startOfGymDay } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { generateTrainerInviteCode } from "gymos-admin-backend/lib/trainer-code";
import MemberModel from "gymos-admin-backend/models/member";
import TrainerModel from "gymos-admin-backend/models/trainer";
import TrainerInviteModel from "gymos-admin-backend/models/trainer-invite";
import TrainingSessionModel from "gymos-admin-backend/models/training-session";
import { requireStaffContext } from "@/lib/gym-context";
import { normalizePhone } from "@/lib/member-auth";

export const runtime = "nodejs";

async function parseBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? { input: body as Record<string, unknown> }
      : { error: "Request body must be a JSON object." };
  } catch {
    return { error: "Request body must be valid JSON." };
  }
}

async function createUniqueTrainerCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateTrainerInviteCode();
    const exists = await TrainerInviteModel.exists({ code: candidate });
    if (!exists) return candidate;
  }
  return generateTrainerInviteCode();
}

export async function GET(request: Request) {
  const auth = await requireStaffContext(request);
  if (auth.response) {
    return auth.response;
  }
  const { gymId, gym } = auth.ctx;

  try {
    await connectToDatabase();

    const today = startOfGymDay(new Date(), gym.timezone);

    const [records, members, inviteRecords, sessionRecords] = await Promise.all([
      TrainerModel.find({ gymId })
        .select("+passwordHash")
        .populate({
          path: "assignedMemberIds",
          model: MemberModel,
          match: { gymId },
          select: "fullName",
        })
        .sort({ name: 1 })
        .lean(),
      MemberModel.find({ gymId }).select("fullName phone").sort({ fullName: 1 }).lean(),
      TrainerInviteModel.find({ gymId })
        .populate({ path: "trainerId", model: TrainerModel, match: { gymId }, select: "name" })
        .populate({
          path: "claimedByTrainerId",
          model: TrainerModel,
          match: { gymId },
          select: "name",
        })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      TrainingSessionModel.find({ gymId })
        .populate({
          path: "trainerId",
          model: TrainerModel,
          match: { gymId },
          select: "name specialty",
        })
        .populate({
          path: "memberId",
          model: MemberModel,
          match: { gymId },
          select: "fullName phone",
        })
        .sort({ startsAt: 1 })
        .limit(50)
        .lean(),
    ]);

    const upcomingByTrainer = new Map<string, number>();
    for (const s of sessionRecords) {
      if (s.status !== "scheduled" || new Date(s.startsAt) < today) continue;
      const tObj = s.trainerId as unknown as { _id?: Types.ObjectId } | null;
      const tId = tObj?._id ? tObj._id.toString() : String(s.trainerId);
      upcomingByTrainer.set(tId, (upcomingByTrainer.get(tId) ?? 0) + 1);
    }

    const trainers = records.map((record) => {
      const assignedMembers = record.assignedMemberIds as unknown as Array<{
        _id: Types.ObjectId;
        fullName: string;
      }>;
      const id = String(record._id);
      const hasAppAccount = Boolean(
        (record as unknown as { passwordHash?: string }).passwordHash,
      );
      return {
        id,
        name: record.name,
        specialty: record.specialty,
        phone: record.phone,
        email: record.email ?? "",
        status: record.status ?? "active",
        hasAppAccount,
        inviteCode: hasAppAccount ? "" : record.inviteCode ?? "",
        availability: (
          (record.availability ?? []) as Array<{
            day: string;
            startTime: string;
            endTime: string;
          }>
        ).map((slot) => ({
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
        upcomingSessionsCount: upcomingByTrainer.get(id) ?? 0,
        assignedMemberIds: assignedMembers.map((member) => member._id.toString()),
        assignedMemberNames: assignedMembers.map((member) => member.fullName),
      };
    });

    const invites = inviteRecords.map((invite) => {
      const target = invite.trainerId as unknown as { _id?: Types.ObjectId; name?: string } | null;
      const claimedBy = invite.claimedByTrainerId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
      } | null;
      return {
        id: String(invite._id),
        code: invite.code,
        status: invite.status as "unused" | "claimed" | "revoked",
        presetName: target?.name ?? invite.presetName ?? "",
        presetSpecialty: invite.presetSpecialty ?? "",
        presetPhone: invite.presetPhone ?? "",
        trainerId: target?._id ? target._id.toString() : "",
        claimedByName: claimedBy?.name ?? "",
        claimedAt: invite.claimedAt ? new Date(invite.claimedAt).toISOString() : null,
        createdAt: invite.createdAt ? new Date(invite.createdAt).toISOString() : null,
      };
    });

    const sessions = sessionRecords.map((item) => {
      const trainerObj = item.trainerId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
        specialty?: string;
      } | null;
      const memberObj = item.memberId as unknown as {
        _id?: Types.ObjectId;
        fullName?: string;
        phone?: string;
      } | null;
      return {
        id: String(item._id),
        trainerId: trainerObj?._id ? trainerObj._id.toString() : "",
        trainerName: trainerObj?.name ?? "Trainer",
        memberId: memberObj?._id ? memberObj._id.toString() : "",
        memberName: memberObj?.fullName ?? "Member",
        title: item.title,
        startsAt: new Date(item.startsAt).toISOString(),
        durationMinutes: item.durationMinutes,
        status: item.status as "scheduled" | "completed" | "cancelled",
        notes: item.notes ?? "",
      };
    });

    return NextResponse.json({
      trainers,
      members: members.map((member) => ({
        id: String(member._id),
        name: member.fullName,
        phone: member.phone,
      })),
      invites,
      sessions,
    });
  } catch (error) {
    console.error("Failed to fetch trainers:", error);
    return NextResponse.json(
      { error: "Unable to fetch trainers at this time." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request);
  const auth = await requireStaffContext(request, parsed.input ?? null);
  if (auth.response) {
    return auth.response;
  }
  const { gymId } = auth.ctx;

  if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.input;

  try {
    await connectToDatabase();

    if (input.action === "assign") {
      const trainerId = typeof input.trainerId === "string" ? input.trainerId : "";
      const memberId = typeof input.memberId === "string" ? input.memberId : "";
      if (!Types.ObjectId.isValid(trainerId) || !Types.ObjectId.isValid(memberId)) {
        return NextResponse.json(
          { error: "Valid trainerId and memberId are required." },
          { status: 400 },
        );
      }
      const [trainer, member] = await Promise.all([
        TrainerModel.findOne({ _id: trainerId, gymId }),
        MemberModel.findOne({ _id: memberId, gymId }),
      ]);
      if (!trainer || !member) {
        return NextResponse.json(
          { error: "Trainer or member was not found for this gym." },
          { status: 404 },
        );
      }
      await TrainerModel.updateMany(
        { gymId, assignedMemberIds: member._id },
        { $pull: { assignedMemberIds: member._id } },
      );
      await TrainerModel.updateOne(
        { _id: trainer._id, gymId },
        { $addToSet: { assignedMemberIds: member._id } },
      );
      return NextResponse.json({
        assignment: { trainerId: trainer._id.toString(), memberId: member._id.toString() },
      });
    }

    if (input.action === "unassign") {
      const memberId = typeof input.memberId === "string" ? input.memberId : "";
      if (!Types.ObjectId.isValid(memberId)) {
        return NextResponse.json({ error: "Valid memberId is required." }, { status: 400 });
      }
      const member = await MemberModel.findOne({ _id: memberId, gymId });
      if (!member) {
        return NextResponse.json(
          { error: "Member was not found for this gym." },
          { status: 404 },
        );
      }
      await TrainerModel.updateMany(
        { gymId, assignedMemberIds: member._id },
        { $pull: { assignedMemberIds: member._id } },
      );
      return NextResponse.json({
        assignment: { trainerId: null, memberId: member._id.toString() },
      });
    }

    if (input.action === "generate-code") {
      const linkedTrainerId =
        typeof input.trainerId === "string" && input.trainerId.trim()
          ? input.trainerId.trim()
          : "";
      const presetName = typeof input.presetName === "string" ? input.presetName.trim() : "";
      const presetSpecialty =
        typeof input.presetSpecialty === "string" ? input.presetSpecialty.trim() : "";
      const rawPresetPhone =
        typeof input.presetPhone === "string" ? input.presetPhone.trim() : "";
      const presetPhone = rawPresetPhone ? normalizePhone(rawPresetPhone) || rawPresetPhone : "";

      if (presetName.length > 80 || presetSpecialty.length > 100 || presetPhone.length > 30) {
        return NextResponse.json(
          { error: "Preset fields exceed supported length limits." },
          { status: 400 },
        );
      }

      const code = await createUniqueTrainerCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      if (linkedTrainerId) {
        if (!Types.ObjectId.isValid(linkedTrainerId)) {
          return NextResponse.json({ error: "Invalid trainerId." }, { status: 400 });
        }
        const trainer = await TrainerModel.findOne({ _id: linkedTrainerId, gymId }).select(
          "+passwordHash",
        );
        if (!trainer) {
          return NextResponse.json({ error: "Trainer was not found." }, { status: 404 });
        }
        if (trainer.passwordHash) {
          return NextResponse.json(
            { error: "This trainer has already linked their mobile app account." },
            { status: 409 },
          );
        }

        await TrainerInviteModel.updateMany(
          { gymId, trainerId: trainer._id, status: "unused" },
          { $set: { status: "revoked" } },
        );
        trainer.inviteCode = code;
        await trainer.save();

        const invite = await TrainerInviteModel.create({
          gymId,
          code,
          trainerId: trainer._id,
          presetName: trainer.name,
          presetSpecialty: trainer.specialty,
          presetPhone: trainer.phone,
          status: "unused",
          expiresAt,
        });

        return NextResponse.json(
          {
            invite: {
              id: invite._id.toString(),
              code: invite.code,
              status: invite.status,
              presetName: trainer.name,
              presetSpecialty: trainer.specialty,
            },
          },
          { status: 201 },
        );
      }

      const invite = await TrainerInviteModel.create({
        gymId,
        code,
        ...(presetName ? { presetName } : {}),
        ...(presetSpecialty ? { presetSpecialty } : {}),
        ...(presetPhone ? { presetPhone } : {}),
        status: "unused",
        expiresAt,
      });

      return NextResponse.json(
        {
          invite: {
            id: invite._id.toString(),
            code: invite.code,
            status: invite.status,
            presetName: invite.presetName ?? "",
            presetSpecialty: invite.presetSpecialty ?? "",
          },
        },
        { status: 201 },
      );
    }

    if (input.action === "revoke-code") {
      const inviteId = typeof input.inviteId === "string" ? input.inviteId.trim() : "";
      if (!Types.ObjectId.isValid(inviteId)) {
        return NextResponse.json({ error: "Valid inviteId is required." }, { status: 400 });
      }
      const invite = await TrainerInviteModel.findOneAndUpdate(
        { _id: inviteId, gymId, status: "unused" },
        { $set: { status: "revoked" } },
        { new: true },
      );
      if (!invite) {
        return NextResponse.json({ error: "Unused invite code was not found." }, { status: 404 });
      }
      if (invite.trainerId) {
        await TrainerModel.updateOne(
          { _id: invite.trainerId, gymId, inviteCode: invite.code },
          { $unset: { inviteCode: 1 } },
        );
      }
      return NextResponse.json({ inviteId: invite._id.toString(), status: "revoked" });
    }

    if (input.action === "schedule-session") {
      const trainerId = typeof input.trainerId === "string" ? input.trainerId.trim() : "";
      const memberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const startsAtRaw = typeof input.startsAt === "string" ? input.startsAt : "";
      const durationMinutes =
        typeof input.durationMinutes === "number" ? input.durationMinutes : 60;
      const notes = typeof input.notes === "string" ? input.notes.trim() : "";

      if (!Types.ObjectId.isValid(trainerId) || !Types.ObjectId.isValid(memberId)) {
        return NextResponse.json(
          { error: "Select a valid trainer and member." },
          { status: 400 },
        );
      }
      if (!title || title.length > 80) {
        return NextResponse.json(
          { error: "Session title is required (max 80 characters)." },
          { status: 400 },
        );
      }
      if (!startsAtRaw || Number.isNaN(Date.parse(startsAtRaw))) {
        return NextResponse.json(
          { error: "Enter a valid session date and time." },
          { status: 400 },
        );
      }
      if (
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 15 ||
        durationMinutes > 240
      ) {
        return NextResponse.json(
          { error: "Duration must be between 15 and 240 minutes." },
          { status: 400 },
        );
      }
      if (notes.length > 240) {
        return NextResponse.json(
          { error: "Notes must be 240 characters or fewer." },
          { status: 400 },
        );
      }

      const [trainer, member] = await Promise.all([
        TrainerModel.findOne({ _id: trainerId, gymId }),
        MemberModel.findOne({ _id: memberId, gymId }),
      ]);
      if (!trainer || !member) {
        return NextResponse.json(
          { error: "Trainer or member was not found for this gym." },
          { status: 404 },
        );
      }

      // Ensure the member is also linked to this trainer's roster
      await TrainerModel.updateMany(
        { gymId, assignedMemberIds: member._id, _id: { $ne: trainer._id } },
        { $pull: { assignedMemberIds: member._id } },
      );
      await TrainerModel.updateOne(
        { _id: trainer._id, gymId },
        { $addToSet: { assignedMemberIds: member._id } },
      );

      const session = await TrainingSessionModel.create({
        gymId,
        trainerId: trainer._id,
        memberId: member._id,
        title,
        startsAt: new Date(startsAtRaw),
        durationMinutes,
        status: "scheduled",
        ...(notes ? { notes } : {}),
      });

      return NextResponse.json(
        {
          session: {
            id: session._id.toString(),
            trainerId: trainer._id.toString(),
            trainerName: trainer.name,
            memberId: member._id.toString(),
            memberName: member.fullName,
            title: session.title,
            startsAt: session.startsAt.toISOString(),
            durationMinutes: session.durationMinutes,
            status: session.status,
            notes: session.notes ?? "",
          },
        },
        { status: 201 },
      );
    }

    if (input.action === "update-session-status") {
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const nextStatus = typeof input.status === "string" ? input.status : "";
      if (
        !Types.ObjectId.isValid(sessionId) ||
        !["scheduled", "completed", "cancelled"].includes(nextStatus)
      ) {
        return NextResponse.json(
          { error: "Valid sessionId and status are required." },
          { status: 400 },
        );
      }
      const updated = await TrainingSessionModel.findOneAndUpdate(
        { _id: sessionId, gymId },
        { $set: { status: nextStatus } },
        { new: true },
      );
      if (!updated) {
        return NextResponse.json({ error: "Session was not found." }, { status: 404 });
      }
      return NextResponse.json({
        session: { id: updated._id.toString(), status: updated.status },
      });
    }

    if (input.action !== "create") {
      return NextResponse.json(
        {
          error:
            "action must be create, assign, generate-code, revoke-code, schedule-session, or update-session-status.",
        },
        { status: 400 },
      );
    }

    const name = typeof input.name === "string" ? input.name.trim() : "";
    const specialty = typeof input.specialty === "string" ? input.specialty.trim() : "";
    const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
    const phone = normalizePhone(rawPhone) || rawPhone;
    if (
      !name ||
      !specialty ||
      !phone ||
      name.length > 80 ||
      specialty.length > 100 ||
      phone.length > 30
    ) {
      return NextResponse.json(
        { error: "name, specialty, and phone are required and must be within their length limits." },
        { status: 400 },
      );
    }

    const inviteCode = await createUniqueTrainerCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const trainer = await TrainerModel.create({
      gymId,
      name,
      specialty,
      phone,
      status: "active",
      inviteCode,
      availability: [
        { day: "Sun", startTime: "10:00", endTime: "18:00" },
        { day: "Mon", startTime: "10:00", endTime: "18:00" },
        { day: "Tue", startTime: "10:00", endTime: "18:00" },
        { day: "Wed", startTime: "10:00", endTime: "18:00" },
        { day: "Thu", startTime: "10:00", endTime: "18:00" },
      ],
      assignedMemberIds: [],
    });

    await TrainerInviteModel.create({
      gymId,
      code: inviteCode,
      trainerId: trainer._id,
      presetName: name,
      presetSpecialty: specialty,
      presetPhone: phone,
      status: "unused",
      expiresAt,
    });

    return NextResponse.json(
      {
        trainer: {
          id: trainer._id.toString(),
          name,
          specialty,
          phone,
          hasAppAccount: false,
          inviteCode,
          assignedMemberIds: [],
          assignedMemberNames: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save trainer:", error);
    return NextResponse.json({ error: "Unable to save trainer at this time." }, { status: 503 });
  }
}
