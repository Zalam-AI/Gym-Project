import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import PaymentModel from "gymos-admin-backend/models/payment";
import { resolveActiveGymId } from "@/lib/gym-context";

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
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID." },
      { status: 500 },
    );
  }

  try {
    await connectToDatabase();
    const docs = await MembershipRequestModel.find({
      gymId,
      status: "pending",
    })
      .populate({ path: "memberId", model: MemberModel, select: "fullName phone email" })
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
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID." },
      { status: 500 },
    );
  }

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
  const requestId = typeof input.requestId === "string" ? input.requestId : "";

  if ((action !== "accept" && action !== "decline") || !Types.ObjectId.isValid(requestId)) {
    return NextResponse.json(
      { error: "Valid requestId and action (accept or decline) are required." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const gym = await GymModel.findById(gymId).select("name slug");
    if (!gym) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const reqDoc = await MembershipRequestModel.findOne({
      _id: requestId,
      gymId,
      status: "pending",
    });

    if (!reqDoc) {
      return NextResponse.json(
        { error: "Pending membership request was not found or was already handled." },
        { status: 404 },
      );
    }

    if (action === "decline") {
      reqDoc.status = "declined";
      reqDoc.respondedAt = new Date();
      await reqDoc.save();
      return NextResponse.json({ ok: true, status: "declined" });
    }

    // ACCEPT: Activate member in this gym, create/extend Membership, and record Paid Payment!
    const member = await MemberModel.findById(reqDoc.memberId);
    if (!member) {
      return NextResponse.json({ error: "Member account was not found." }, { status: 404 });
    }

    const wasAlreadyInGym = member.gymId && String(member.gymId) === gymId.toString();
    member.gymId = gymId;
    member.status = "active";
    if (!wasAlreadyInGym) {
      member.joinDate = new Date();
    }
    await member.save();

    const todayUtc = getUtcToday();
    const existingMembership = await MembershipModel.findOne({
      gymId,
      memberId: member._id,
    }).sort({ expiryDate: -1 });

    let membership;
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
      await existingMembership.save();
      membership = existingMembership;
    } else {
      membership = await MembershipModel.create({
        gymId,
        memberId: member._id,
        planName: reqDoc.planName,
        price: reqDoc.price,
        startDate: todayUtc,
        expiryDate: addMonths(todayUtc, reqDoc.durationMonths),
        status: "active",
        paymentStatus: "Paid",
      });
    }

    await PaymentModel.create({
      gymId,
      memberId: member._id,
      amount: reqDoc.price,
      description: `${reqDoc.planName} (Mobile signup)`,
      paymentMethod: reqDoc.paymentMethod,
      status: "Paid",
      date: new Date(),
    });

    reqDoc.status = "accepted";
    reqDoc.respondedAt = new Date();
    await reqDoc.save();

    return NextResponse.json({
      ok: true,
      status: "accepted",
      accepted: {
        requestId: reqDoc._id.toString(),
        memberId: member._id.toString(),
        memberName: member.fullName,
        gymName: gym.name,
        planName: membership.planName,
        price: reqDoc.price,
        paymentMethod: reqDoc.paymentMethod,
        expiryDate: membership.expiryDate.toISOString().slice(0, 10),
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
