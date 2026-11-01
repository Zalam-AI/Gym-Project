import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase, runInTransactionOrFallback } from "gymos-admin-backend/lib/mongodb";
import { enforceGymPlanLimit } from "gymos-admin-backend/lib/saas-enforcement";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import PaymentModel from "gymos-admin-backend/models/payment";
import { requireStaffContext } from "@/lib/gym-context";

export const runtime = "nodejs";

function getUtcToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaffContext(request);
    if (auth.response) {
      return auth.response;
    }
    const { gymId } = auth.ctx;

    await connectToDatabase();
    const docs = await MembershipRequestModel.find({
      gymId,
      status: "pending",
    })
      .populate({
        path: "memberId",
        model: MemberModel,
        match: { $or: [{ gymId }, { gymId: { $exists: false } }, { gymId: null }] },
        select: "fullName phone email",
      })
      .sort({ createdAt: -1 })
      .lean();

    const requests = docs.flatMap((doc) => {
      const member = doc.memberId as unknown as {
        _id: Types.ObjectId;
        fullName: string;
        phone: string;
        email?: string;
      } | null;
      if (!member) return [];
      return [
        {
          id: String(doc._id),
          memberId: member._id.toString(),
          memberName: member.fullName,
          memberPhone: member.phone,
          memberEmail: member.email ?? "",
          planName: doc.planName,
          price: doc.price,
          durationMonths: doc.durationMonths,
          paymentMethod: doc.paymentMethod,
          createdAt: new Date(doc.createdAt).toISOString(),
        },
      ];
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Failed to fetch pending membership requests:", error);
    return NextResponse.json(
      { error: "Unable to load membership requests right now." },
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
  const { gymId, gym } = auth.ctx;

  if (rawBody === undefined) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!parsedBody) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = parsedBody;

  const action = typeof input.action === "string" ? input.action : "";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";

  if ((action !== "accept" && action !== "decline") || !Types.ObjectId.isValid(requestId)) {
    return NextResponse.json(
      { error: "Valid requestId and action (accept or decline) are required." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();

    if (action === "decline") {
      const declined = await MembershipRequestModel.findOneAndUpdate(
        { _id: requestId, gymId, status: "pending" },
        { $set: { status: "declined", respondedAt: new Date() } },
        { new: true },
      );
      if (!declined) {
        return NextResponse.json(
          { error: "Pending membership request was not found or was already handled." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, status: "declined" });
    }

    // Atomically lock the pending request first to prevent duplicate acceptance
    const reqDoc = await MembershipRequestModel.findOneAndUpdate(
      { _id: requestId, gymId, status: "pending" },
      { $set: { status: "accepted", respondedAt: new Date() } },
      { new: true },
    );

    if (!reqDoc) {
      return NextResponse.json(
        { error: "Pending membership request was not found or was already handled." },
        { status: 404 },
      );
    }

    const rollbackRequest = async () => {
      await MembershipRequestModel.updateOne(
        { _id: reqDoc._id },
        { $set: { status: "pending" }, $unset: { respondedAt: 1 } },
      ).catch(() => undefined);
    };

    const member = await MemberModel.findById(reqDoc.memberId);
    if (!member) {
      await rollbackRequest();
      return NextResponse.json({ error: "Member account was not found." }, { status: 404 });
    }

    // Enforce SaaS plan member limit when enrolling a new member into this gym
    if (!member.gymId || String(member.gymId) !== gymId.toString()) {
      const memberLimit = await enforceGymPlanLimit(gymId, "members");
      if (!memberLimit.allowed) {
        await rollbackRequest();
        return NextResponse.json({ error: memberLimit.error }, { status: 403 });
      }
    }

    // Prevent overwriting an active membership in a different gym tenant
    const todayUtc = getUtcToday();
    if (member.gymId && String(member.gymId) !== gymId.toString()) {
      const otherGymActiveMembership = await MembershipModel.findOne({
        gymId: member.gymId,
        memberId: member._id,
        status: "active",
        expiryDate: { $gte: todayUtc },
      });
      if (otherGymActiveMembership) {
        const otherGym = await GymModel.findById(member.gymId).select("name");
        await rollbackRequest();
        return NextResponse.json(
          {
            error: `This member already has an active plan at ${otherGym?.name ?? "another gym"}.`,
          },
          { status: 409 },
        );
      }
    }

    try {
      const acceptedMembership = await runInTransactionOrFallback(async (tx) => {
        const sessionOpt = tx ? { session: tx } : {};
        const wasAlreadyInGym = member.gymId && String(member.gymId) === gymId.toString();
        member.gymId = gymId;
        member.status = "active";
        if (!wasAlreadyInGym) {
          member.joinDate = new Date();
        }
        await member.save(sessionOpt);

        const existingMembership = await MembershipModel.findOne(
          { gymId, memberId: member._id },
          null,
          sessionOpt,
        ).sort({ expiryDate: -1 });

        let membershipDoc;
        if (existingMembership) {
          const baseStart =
            existingMembership.expiryDate > todayUtc ? existingMembership.expiryDate : todayUtc;
          existingMembership.planName = reqDoc.planName;
          existingMembership.price = reqDoc.price;
          existingMembership.startDate =
            existingMembership.expiryDate > todayUtc ? existingMembership.startDate : todayUtc;
          existingMembership.expiryDate = addMonths(baseStart, reqDoc.durationMonths);
          existingMembership.status = "active";
          existingMembership.paymentStatus = "Paid";
          await existingMembership.save(sessionOpt);
          membershipDoc = existingMembership;
        } else {
          const [created] = await MembershipModel.create(
            [
              {
                gymId,
                memberId: member._id,
                planName: reqDoc.planName,
                price: reqDoc.price,
                startDate: todayUtc,
                expiryDate: addMonths(todayUtc, reqDoc.durationMonths),
                status: "active",
                paymentStatus: "Paid",
              },
            ],
            sessionOpt,
          );
          membershipDoc = created;
        }

        await PaymentModel.create(
          [
            {
              gymId,
              memberId: member._id,
              amount: reqDoc.price,
              description: `${reqDoc.planName} (Mobile signup)`,
              paymentMethod: reqDoc.paymentMethod,
              status: "Paid",
              date: new Date(),
            },
          ],
          sessionOpt,
        );

        return membershipDoc;
      });

      return NextResponse.json({
        ok: true,
        status: "accepted",
        accepted: {
          requestId: reqDoc._id.toString(),
          memberId: member._id.toString(),
          memberName: member.fullName,
          gymName: gym.name,
          planName: acceptedMembership.planName,
          price: reqDoc.price,
          paymentMethod: reqDoc.paymentMethod,
          expiryDate: acceptedMembership.expiryDate.toISOString().slice(0, 10),
        },
      });
    } catch (err) {
      await rollbackRequest();
      throw err;
    }
  } catch (error) {
    console.error("Failed to process membership request:", error);
    return NextResponse.json(
      { error: "Unable to process this membership request right now." },
      { status: 503 },
    );
  }
}
