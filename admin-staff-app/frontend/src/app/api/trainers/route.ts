import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import TrainerModel from "gymos-admin-backend/models/trainer";

export const runtime = "nodejs";

function getActiveGymId() {
  const gymId = process.env.GYMOS_GYM_ID;
  return gymId && Types.ObjectId.isValid(gymId) ? new Types.ObjectId(gymId) : null;
}

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

export async function GET() {
  const gymId = getActiveGymId();
  if (!gymId) return NextResponse.json({ error: "GYMOS_GYM_ID must be set to a valid gym ID." }, { status: 500 });

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }
    const [records, members] = await Promise.all([
      TrainerModel.find({ gymId })
        .populate({ path: "assignedMemberIds", model: MemberModel, select: "fullName" })
        .sort({ name: 1 })
        .lean(),
      MemberModel.find({ gymId }).select("fullName").sort({ fullName: 1 }).lean(),
    ]);
    const trainers = records.map((record) => {
      const assignedMembers = record.assignedMemberIds as unknown as Array<{ _id: Types.ObjectId; fullName: string }>;
      return {
        id: String(record._id),
        name: record.name,
        specialty: record.specialty,
        phone: record.phone,
        assignedMemberIds: assignedMembers.map((member) => member._id.toString()),
        assignedMemberNames: assignedMembers.map((member) => member.fullName),
      };
    });
    return NextResponse.json({
      trainers,
      members: members.map((member) => ({ id: String(member._id), name: member.fullName })),
    });
  } catch (error) {
    console.error("Failed to fetch trainers:", error);
    return NextResponse.json({ error: "Unable to fetch trainers at this time." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const gymId = getActiveGymId();
  if (!gymId) return NextResponse.json({ error: "GYMOS_GYM_ID must be set to a valid gym ID." }, { status: 500 });
  const parsed = await parseBody(request);
  if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.input;

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    if (input.action === "assign") {
      const trainerId = typeof input.trainerId === "string" ? input.trainerId : "";
      const memberId = typeof input.memberId === "string" ? input.memberId : "";
      if (!Types.ObjectId.isValid(trainerId) || !Types.ObjectId.isValid(memberId)) {
        return NextResponse.json({ error: "Valid trainerId and memberId are required." }, { status: 400 });
      }
      const [trainer, member] = await Promise.all([
        TrainerModel.findOne({ _id: trainerId, gymId }),
        MemberModel.findOne({ _id: memberId, gymId }),
      ]);
      if (!trainer || !member) return NextResponse.json({ error: "Trainer or member was not found for this gym." }, { status: 404 });
      await TrainerModel.updateMany(
        { gymId, assignedMemberIds: member._id },
        { $pull: { assignedMemberIds: member._id } },
      );
      await TrainerModel.updateOne({ _id: trainer._id, gymId }, { $addToSet: { assignedMemberIds: member._id } });
      return NextResponse.json({ assignment: { trainerId: trainer._id.toString(), memberId: member._id.toString() } });
    }

    if (input.action !== "create") return NextResponse.json({ error: "action must be create or assign." }, { status: 400 });
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const specialty = typeof input.specialty === "string" ? input.specialty.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!name || !specialty || !phone || name.length > 80 || specialty.length > 100 || phone.length > 30) {
      return NextResponse.json({ error: "name, specialty, and phone are required and must be within their length limits." }, { status: 400 });
    }

    const trainer = await TrainerModel.create({ gymId, name, specialty, phone, assignedMemberIds: [] });
    return NextResponse.json({ trainer: { id: trainer._id.toString(), name, specialty, phone, assignedMemberIds: [], assignedMemberNames: [] } }, { status: 201 });
  } catch (error) {
    console.error("Failed to save trainer:", error);
    return NextResponse.json({ error: "Unable to save trainer at this time." }, { status: 503 });
  }
}