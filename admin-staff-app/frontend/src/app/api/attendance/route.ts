import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import { MEMBER_SESSION_COOKIE, verifyMemberSessionToken } from "@/lib/member-session";

export const runtime = "nodejs";

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

type MembershipStatus = "Active" | "Expired" | "Unpaid";

function getActiveGymId() {
  const gymId = process.env.GYMOS_GYM_ID;
  return gymId && Types.ObjectId.isValid(gymId) ? new Types.ObjectId(gymId) : null;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function getMembershipStatus(
  memberStatus: string,
  membership: { status: string; expiryDate: Date; paymentStatus?: string } | undefined,
  latestPaymentStatus: string | undefined,
): MembershipStatus {
  if (
    memberStatus !== "active" ||
    !membership ||
    membership.status !== "active" ||
    membership.expiryDate < startOfToday()
  ) {
    return "Expired";
  }
  const paymentStatus = latestPaymentStatus ?? membership.paymentStatus;
  return paymentStatus === "Paid" ? "Active" : "Unpaid";
}

export async function GET(request: Request) {
  const gymId = getActiveGymId();
  if (!gymId) return jsonResponse(request, { error: "GYMOS_GYM_ID must be set to a valid gym ID." }, 500);

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return jsonResponse(request, { error: "Configured gym was not found." }, 404);
    }

    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const members = await MemberModel.find({ gymId }).sort({ fullName: 1 }).lean();
    const memberIds = members.map((member) => member._id);
    const [records, occupancy, memberships, payments] = await Promise.all([
      AttendanceModel.find({ gymId, checkInTime: { $gte: today, $lt: tomorrow } })
        .populate({ path: "memberId", model: MemberModel, select: "fullName" })
        .sort({ checkInTime: -1 })
        .lean(),
      AttendanceModel.countDocuments({ gymId, status: "checked-in" }),
      MembershipModel.find({ gymId, memberId: { $in: memberIds } }).sort({ expiryDate: -1 }).lean(),
      PaymentModel.find({ gymId, memberId: { $in: memberIds } }).sort({ date: -1 }).lean(),
    ]);

    const membershipByMember = new Map<string, (typeof memberships)[number]>();
    for (const membership of memberships) {
      const id = membership.memberId.toString();
      if (!membershipByMember.has(id)) membershipByMember.set(id, membership);
    }
    const paymentStatusByMember = new Map<string, string>();
    for (const payment of payments) {
      const id = payment.memberId.toString();
      if (!paymentStatusByMember.has(id)) paymentStatusByMember.set(id, payment.status);
    }
    const memberStatusById = new Map<string, MembershipStatus>();
    const memberOptions = members.map((member) => {
      const id = String(member._id);
      const membership = membershipByMember.get(id) as unknown as {
        status: string;
        expiryDate: Date;
        paymentStatus?: string;
      } | undefined;
      const membershipStatus = getMembershipStatus(
        member.status,
        membership ? { ...membership, expiryDate: new Date(membership.expiryDate) } : undefined,
        paymentStatusByMember.get(id),
      );
      memberStatusById.set(id, membershipStatus);
      return {
        id,
        name: member.fullName,
        phone: member.phone,
        membershipStatus,
        expiryDate: membership?.expiryDate ? new Date(membership.expiryDate).toISOString().slice(0, 10) : "",
      };
    });

    const checkIns = records.flatMap((record) => {
      const member = record.memberId as unknown as { _id: Types.ObjectId; fullName: string } | null;
      if (!member) return [];
      const id = member._id.toString();
      return [{
        id: String(record._id),
        memberId: id,
        memberName: member.fullName,
        time: formatTime(new Date(record.checkInTime)),
        checkInTime: new Date(record.checkInTime).toISOString(),
        membershipStatus: memberStatusById.get(id) ?? "Expired",
        checkedOut: record.status === "checked-out" || Boolean(record.checkOutTime),
        source: record.source ?? "Front desk",
      }];
    });

    return jsonResponse(request, { checkIns, occupancy, capacity: 100, members: memberOptions });
  } catch (error) {
    console.error("Failed to fetch attendance from the database:", error);
    return jsonResponse(request, { error: "Unable to fetch attendance at this time." }, 503);
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  const memberOrigins = new Set((process.env.GYMOS_MEMBER_APP_ORIGINS ?? "http://localhost:3001,http://127.0.0.1:3001").split(",").map((origin) => origin.trim()));
  const memberOrigin = requestOrigin !== null && memberOrigins.has(requestOrigin);
  const memberSession = memberOrigin
    ? await verifyMemberSessionToken(request.cookies.get(MEMBER_SESSION_COOKIE)?.value)
    : null;
  if (memberOrigin && !memberSession) {
    return jsonResponse(request, { error: "Member login is required to check in." }, 401);
  }
  const gymId = memberSession && Types.ObjectId.isValid(memberSession.gymId)
    ? new Types.ObjectId(memberSession.gymId)
    : getActiveGymId();
  if (!gymId) return jsonResponse(request, { error: "GYMOS_GYM_ID must be set to a valid gym ID." }, 500);

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(request, { error: "Request body must be a JSON object." }, 400);
    }
    input = body as Record<string, unknown>;
  } catch {
    return jsonResponse(request, { error: "Request body must be valid JSON." }, 400);
  }

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return jsonResponse(request, { error: "Configured gym was not found." }, 404);
    }

    if (input.action === "checkout") {
      if (memberSession) return jsonResponse(request, { error: "Only gym staff can check out members." }, 403);
      if (typeof input.checkInId !== "string" || !Types.ObjectId.isValid(input.checkInId)) {
        return jsonResponse(request, { error: "A valid checkInId is required." }, 400);
      }
      const attendance = await AttendanceModel.findOneAndUpdate(
        { _id: input.checkInId, gymId, status: "checked-in" },
        { $set: { status: "checked-out", checkOutTime: new Date() } },
        { new: true },
      );
      if (!attendance) return jsonResponse(request, { error: "Active check-in was not found." }, 404);
      const occupancy = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
      return jsonResponse(request, { checkInId: attendance._id.toString(), occupancy });
    }

    if (input.action !== "checkin") {
      return jsonResponse(request, { error: "action must be checkin or checkout." }, 400);
    }
    if (memberSession && input.gymQrPayload !== `GYMOS-GYM:${gymId.toString()}`) {
      return jsonResponse(request, { error: "This QR code does not belong to your gym." }, 403);
    }
    const requestedMemberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
    if (memberSession && requestedMemberId && requestedMemberId !== memberSession.memberId) {
      return jsonResponse(request, { error: "Member session does not match the requested account." }, 403);
    }
    const memberId = memberSession?.memberId ?? requestedMemberId;
    if (!memberId) {
      return jsonResponse(request, { error: "memberId is required." }, 400);
    }

    const member = Types.ObjectId.isValid(memberId)
      ? await MemberModel.findOne({ _id: memberId, gymId })
      : typeof input.memberPhone === "string"
        ? await MemberModel.findOne({ gymId, phone: input.memberPhone.trim() })
        : null;
    if (!member) return jsonResponse(request, { error: "Member was not found for this gym." }, 404);
    if (member.status !== "active") {
      return jsonResponse(request, { error: "Membership is expired or inactive. Please contact the front desk." }, 403);
    }

    const membership = await MembershipModel.findOne({ gymId, memberId: member._id }).sort({ expiryDate: -1 });
    if (!membership || membership.status !== "active" || membership.expiryDate < startOfToday()) {
      return jsonResponse(request, { error: "Membership is expired. Please renew before checking in." }, 403);
    }

    const latestPayment = await PaymentModel.findOne({ gymId, memberId: member._id }).sort({ date: -1 });
    const paymentStatus = latestPayment?.status ?? membership.paymentStatus;
    if (paymentStatus ? paymentStatus !== "Paid" : !latestPayment) {
      return jsonResponse(request, { error: "Payment is unpaid or outstanding. Please contact the front desk." }, 402);
    }

    const today = startOfToday();
    const existingCheckIn = await AttendanceModel.exists({
      gymId,
      memberId: member._id,
      status: "checked-in",
      checkInTime: { $gte: today },
    });
    if (existingCheckIn) return jsonResponse(request, { error: "You are already checked in today." }, 409);

    const source = memberSession ? "Member self-scan" : input.source === "Front desk" ? "Front desk" : "Member self-scan";
    const attendance = await AttendanceModel.create({
      gymId,
      memberId: member._id,
      checkInTime: new Date(),
      status: "checked-in",
      source,
    });
    const occupancy = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
    return jsonResponse(request, {
      checkIn: {
        id: attendance._id.toString(),
        memberId: member._id.toString(),
        memberName: member.fullName,
        time: formatTime(attendance.checkInTime),
        checkInTime: attendance.checkInTime.toISOString(),
        membershipStatus: "Active",
        checkedOut: false,
        source,
      },
      occupancy,
    }, 201);
  } catch (error) {
    console.error("Failed to process attendance:", error);
    return jsonResponse(request, { error: "Unable to process attendance at this time." }, 503);
  }
}