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

    const pendingPreview = await MembershipRequestModel.findOne({
      _id: requestId,
      gymId,
      status: "pending",
    });

    if (!pendingPreview) {
      return NextResponse.json(
        { error: "Pending membership request was not found or was already handled." },
        { status: 404 },
      );
    }

    const member = await MemberModel.findById(pendingPreview.memberId);
    if (!member) {
      return NextResponse.json({ error: "Member account was not found." }, { status: 404 });
    }

    // Enforce SaaS plan member limit BEFORE mutating request status so polling clients never see a half-accepted gap
    if (!member.gymId || String(member.gymId) !== gymId.toString()) {
      const memberLimit = await enforceGymPlanLimit(gymId, "members");
      if (!memberLimit.allowed) {
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
        return NextResponse.json(
          {
            error: `This member already has an active plan at ${otherGym?.name ?? "another gym"}.`,
          },
          { status: 409 },
        );
      }
    }

    const wasAlreadyInGym = Boolean(member.gymId && String(member.gymId) === gymId.toString());

    const txOutcome = await runInTransactionOrFallback(async (tx) => {
      const sessionOpt = tx ? { session: tx } : {};
      const now = new Date();

      // Atomically claim the pending request INSIDE the same transaction as Member + Membership + Payment
      const claimedReq = await MembershipRequestModel.findOneAndUpdate(
        { _id: requestId, gymId, status: "pending" },
        { $set: { status: "accepted", respondedAt: now } },
        { new: true, ...sessionOpt },
      );
      if (!claimedReq) {
        return null;
      }

      // Clean up any duplicate pending requests from this member so staff cannot accept/charge twice
      await MembershipRequestModel.updateMany(
        { memberId: member._id, _id: { $ne: claimedReq._id }, status: "pending" },
        { $set: { status: "declined", respondedAt: now } },
        sessionOpt,
      );

      // Use atomic findOneAndUpdate instead of mutating an outer Mongoose document across transaction retries
      await MemberModel.findOneAndUpdate(
        { _id: member._id },
        {
          $set: {
            gymId,
            status: "active",
            ...(!wasAlreadyInGym ? { joinDate: now } : {}),
          },
        },
        { new: true, ...sessionOpt },
      );

      const existingMembership = await MembershipModel.findOne(
        { gymId, memberId: member._id },
        null,
        sessionOpt,
      ).sort({ expiryDate: -1 });

      let membershipDoc;
      if (existingMembership) {
        const baseStart =
          existingMembership.expiryDate > todayUtc ? existingMembership.expiryDate : todayUtc;
        const nextStart =
          existingMembership.expiryDate > todayUtc ? existingMembership.startDate : todayUtc;
        membershipDoc = await MembershipModel.findOneAndUpdate(
          { _id: existingMembership._id },
          {
            $set: {
              planName: claimedReq.planName,
              price: claimedReq.price,
              startDate: nextStart,
              expiryDate: addMonths(baseStart, claimedReq.durationMonths),
              status: "active",
              paymentStatus: "Paid",
            },
          },
          { new: true, ...sessionOpt },
        );
      } else {
        const [created] = await MembershipModel.create(
          [
            {
              gymId,
              memberId: member._id,
              planName: claimedReq.planName,
              price: claimedReq.price,
              startDate: todayUtc,
              expiryDate: addMonths(todayUtc, claimedReq.durationMonths),
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
            amount: claimedReq.price,
            description: `${claimedReq.planName} (Mobile signup)`,
            paymentMethod: claimedReq.paymentMethod,
            status: "Paid",
            date: now,
          },
        ],
        sessionOpt,
      );

      return { reqDoc: claimedReq, membershipDoc: membershipDoc! };
    });

    if (!txOutcome) {
      return NextResponse.json(
        { error: "Pending membership request was not found or was already handled." },
        { status: 404 },
      );
    }

    const { reqDoc, acceptedMembership } = {
      reqDoc: txOutcome.reqDoc,
      acceptedMembership: txOutcome.membershipDoc,
    };

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
  } catch (error) {
    console.error("Failed to process membership request:", error);
    return NextResponse.json(
      { error: "Unable to process this membership request right now." },
      { status: 503 },
    );
  }
}
