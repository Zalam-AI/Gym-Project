import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import TrainerModel from "gymos-admin-backend/models/trainer";
import { resolveActiveGymId } from "@/lib/gym-context";
import { isAllowedMemberOrigin, memberApiOptions, memberApiResponse } from "@/lib/member-auth";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";

export const runtime = "nodejs";

type MembershipStatus = "Active" | "Expired" | "Unpaid";

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

function computePeakHours(recentCheckInDates: Date[]) {
  const buckets = [
    { label: "6–10 AM", minHour: 6, maxHour: 10, count: 0 },
    { label: "11 AM–3 PM", minHour: 11, maxHour: 15, count: 0 },
    { label: "5–9 PM", minHour: 17, maxHour: 21, count: 0 },
    { label: "9 PM–12 AM", minHour: 21, maxHour: 24, count: 0 },
  ];

  for (const date of recentCheckInDates) {
    const hour = date.getHours();
    for (const bucket of buckets) {
      if (hour >= bucket.minHour && hour < bucket.maxHour) {
        bucket.count += 1;
        break;
      }
    }
  }

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return buckets.map((bucket) => ({ label: bucket.label, value: 0, count: 0 }));
  }
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: Math.round((bucket.count / maxCount) * 100),
    count: bucket.count,
  }));
}

export async function GET(request: Request) {
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return memberApiResponse(request, { error: "GYMOS_GYM_ID must be set to a valid gym ID." }, 500);
  }

  try {
    await connectToDatabase();
    const gym = await GymModel.findById(gymId).select("name slug");
    if (!gym) {
      return memberApiResponse(request, { error: "Configured gym was not found." }, 404);
    }

    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [members, trainers] = await Promise.all([
      MemberModel.find({ gymId }).sort({ fullName: 1 }).lean(),
      TrainerModel.find({ gymId }).sort({ name: 1 }).lean(),
    ]);
    const memberIds = members.map((member) => member._id);
    const [records, occupancy, memberships, payments, recentHistory] = await Promise.all([
      AttendanceModel.find({ gymId, checkInTime: { $gte: today, $lt: tomorrow } })
        .populate({ path: "memberId", model: MemberModel, select: "fullName" })
        .populate({ path: "trainerId", model: TrainerModel, select: "name specialty" })
        .sort({ checkInTime: -1 })
        .lean(),
      AttendanceModel.countDocuments({ gymId, status: "checked-in" }),
      MembershipModel.find({ gymId, memberId: { $in: memberIds } }).sort({ expiryDate: -1 }).lean(),
      PaymentModel.find({ gymId, memberId: { $in: memberIds } }).sort({ date: -1 }).lean(),
      AttendanceModel.find({ gymId, checkInTime: { $gte: thirtyDaysAgo } }).select("checkInTime").lean(),
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
      const membership = membershipByMember.get(id) as unknown as
        | {
            status: string;
            expiryDate: Date;
            paymentStatus?: string;
          }
        | undefined;
      const membershipStatus = getMembershipStatus(
        member.status,
        membership ? { ...membership, expiryDate: new Date(membership.expiryDate) } : undefined,
        paymentStatusByMember.get(id),
      );
      memberStatusById.set(id, membershipStatus);
      const isoExpiry = membership?.expiryDate
        ? new Date(membership.expiryDate).toISOString().slice(0, 10)
        : "";
      return {
        id,
        personType: "member" as const,
        name: member.fullName,
        phone: member.phone,
        membershipStatus,
        expiryDate: isoExpiry,
        expirationDate: isoExpiry,
      };
    });

    const trainerOptions = trainers.map((trainer) => ({
      id: String(trainer._id),
      personType: "trainer" as const,
      name: trainer.name,
      phone: trainer.phone,
      specialty: trainer.specialty,
      membershipStatus: (trainer.status === "inactive" ? "Expired" : "Active") as MembershipStatus,
      expiryDate: "",
      expirationDate: "",
    }));

    type CheckInRow = {
      id: string;
      personType: "member" | "trainer";
      memberId: string;
      trainerId?: string;
      memberName: string;
      specialty?: string;
      time: string;
      checkInTime: string;
      membershipStatus: MembershipStatus;
      checkedOut: boolean;
      source: string;
    };

    const checkIns = records.flatMap<CheckInRow>((record) => {
      const trainer = record.trainerId as unknown as {
        _id: Types.ObjectId;
        name: string;
        specialty?: string;
      } | null;
      if (record.attendeeType === "trainer" || trainer) {
        if (!trainer) return [];
        const id = trainer._id.toString();
        return [
          {
            id: String(record._id),
            personType: "trainer" as const,
            memberId: id,
            trainerId: id,
            memberName: trainer.name,
            specialty: trainer.specialty ?? "Trainer",
            time: formatTime(new Date(record.checkInTime)),
            checkInTime: new Date(record.checkInTime).toISOString(),
            membershipStatus: "Active" as MembershipStatus,
            checkedOut: record.status === "checked-out" || Boolean(record.checkOutTime),
            source: record.source ?? "Trainer self-scan",
          },
        ];
      }

      const member = record.memberId as unknown as { _id: Types.ObjectId; fullName: string } | null;
      if (!member) return [];
      const id = member._id.toString();
      return [
        {
          id: String(record._id),
          personType: "member" as const,
          memberId: id,
          memberName: member.fullName,
          time: formatTime(new Date(record.checkInTime)),
          checkInTime: new Date(record.checkInTime).toISOString(),
          membershipStatus: memberStatusById.get(id) ?? "Expired",
          checkedOut: record.status === "checked-out" || Boolean(record.checkOutTime),
          source: record.source ?? "Front desk",
        },
      ];
    });

    const peakHours = computePeakHours(recentHistory.map((item) => new Date(item.checkInTime)));

    return memberApiResponse(request, {
      gymName: gym.name,
      gymSlug: gym.slug,
      gymQrPayload: `GYMOS-GYM:${gymId.toString()}`,
      checkIns,
      occupancy,
      capacity: 100,
      peakHours,
      members: memberOptions,
      trainers: trainerOptions,
    });
  } catch (error) {
    console.error("Failed to fetch attendance from the database:", error);
    return memberApiResponse(request, { error: "Unable to fetch attendance at this time." }, 503);
  }
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function POST(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const [staffSession, mobileSession] = await Promise.all([
    verifyStaffSessionToken(
      getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
    ),
    verifyMemberSessionToken(
      getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
    ),
  ]);

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return memberApiResponse(request, { error: "Request body must be a JSON object." }, 400);
    }
    input = body as Record<string, unknown>;
  } catch {
    return memberApiResponse(request, { error: "Request body must be valid JSON." }, 400);
  }

  const isSelfScanRequest =
    input.source === "Member self-scan" ||
    input.source === "Trainer self-scan" ||
    typeof input.gymQrPayload === "string" ||
    (!staffSession && Boolean(mobileSession));

  if (input.action === "checkout") {
    if (!staffSession) {
      return memberApiResponse(request, { error: "Only gym staff can check out attendees." }, 403);
    }
  } else if (isSelfScanRequest) {
    if (!mobileSession) {
      return memberApiResponse(request, { error: "App login is required to check in." }, 401);
    }
  } else if (!staffSession) {
    return memberApiResponse(request, { error: "Authentication required." }, 401);
  }

  try {
    await connectToDatabase();

    let gymId =
      isSelfScanRequest && mobileSession && Types.ObjectId.isValid(mobileSession.gymId)
        ? new Types.ObjectId(mobileSession.gymId)
        : await resolveActiveGymId(request);

    if (
      isSelfScanRequest &&
      mobileSession?.role === "member" &&
      !gymId &&
      Types.ObjectId.isValid(mobileSession.memberId)
    ) {
      const memberLookup = await MemberModel.findById(mobileSession.memberId).select("gymId");
      if (memberLookup?.gymId && Types.ObjectId.isValid(String(memberLookup.gymId))) {
        gymId = new Types.ObjectId(String(memberLookup.gymId));
      } else {
        return memberApiResponse(
          request,
          {
            error:
              "You do not have an active gym membership yet. Scan the gym QR code to subscribe to a plan first.",
          },
          403,
        );
      }
    }

    if (!gymId) {
      return memberApiResponse(request, { error: "GYMOS_GYM_ID must be set to a valid gym ID." }, 500);
    }

    const gym = await GymModel.findById(gymId).select("name slug");
    if (!gym) {
      return memberApiResponse(request, { error: "Configured gym was not found." }, 404);
    }

    if (input.action === "checkout") {
      if (typeof input.checkInId !== "string" || !Types.ObjectId.isValid(input.checkInId)) {
        return memberApiResponse(request, { error: "A valid checkInId is required." }, 400);
      }
      const attendance = await AttendanceModel.findOneAndUpdate(
        { _id: input.checkInId, gymId, status: "checked-in" },
        { $set: { status: "checked-out", checkOutTime: new Date() } },
        { new: true },
      );
      if (!attendance) {
        return memberApiResponse(request, { error: "Active check-in was not found." }, 404);
      }
      const occupancy = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
      return memberApiResponse(request, { checkInId: attendance._id.toString(), occupancy });
    }

    if (input.action !== "checkin") {
      return memberApiResponse(request, { error: "action must be checkin or checkout." }, 400);
    }

    if (isSelfScanRequest && mobileSession) {
      const scannedPayload = typeof input.gymQrPayload === "string" ? input.gymQrPayload.trim() : "";
      const expectedPayload = `GYMOS-GYM:${gymId.toString()}`;
      const matchesPayload =
        scannedPayload === expectedPayload ||
        scannedPayload.toLowerCase() === gym.slug.toLowerCase() ||
        scannedPayload === gymId.toString();
      if (!matchesPayload) {
        return memberApiResponse(request, { error: "This QR code does not belong to your gym." }, 403);
      }
    }

    const isTrainerCheckIn =
      (isSelfScanRequest && mobileSession?.role === "trainer") ||
      (!isSelfScanRequest &&
        (input.personType === "trainer" || typeof input.trainerId === "string"));

    // ---------------------------------------------------------
    // TRAINER CHECK-IN (Mobile QR self-scan OR Staff front-desk)
    // ---------------------------------------------------------
    if (isTrainerCheckIn) {
      const requestedTrainerId =
        typeof input.trainerId === "string"
          ? input.trainerId.trim()
          : typeof input.memberId === "string"
            ? input.memberId.trim()
            : "";

      if (
        isSelfScanRequest &&
        mobileSession?.role === "trainer" &&
        requestedTrainerId &&
        requestedTrainerId !== mobileSession.trainerId
      ) {
        return memberApiResponse(
          request,
          { error: "Trainer session does not match the requested account." },
          403,
        );
      }

      const trainerId =
        isSelfScanRequest && mobileSession?.role === "trainer"
          ? mobileSession.trainerId
          : requestedTrainerId;

      if (!trainerId || !Types.ObjectId.isValid(trainerId)) {
        return memberApiResponse(request, { error: "Valid trainerId is required." }, 400);
      }

      const trainer = await TrainerModel.findOne({ _id: trainerId, gymId });
      if (!trainer) {
        return memberApiResponse(request, { error: "Trainer was not found for this gym." }, 404);
      }
      if (trainer.status === "inactive") {
        return memberApiResponse(
          request,
          { error: "Trainer profile is inactive. Please contact gym management." },
          403,
        );
      }

      const occupancyBefore = await AttendanceModel.countDocuments({
        gymId,
        status: "checked-in",
      });
      if (occupancyBefore >= 100) {
        return memberApiResponse(
          request,
          { error: "The gym is currently at capacity. Please wait for a spot to open." },
          409,
        );
      }

      const today = startOfToday();
      const existingCheckIn = await AttendanceModel.exists({
        gymId,
        trainerId: trainer._id,
        status: "checked-in",
        checkInTime: { $gte: today },
      });
      if (existingCheckIn) {
        return memberApiResponse(request, { error: "Already checked in right now." }, 409);
      }

      const source = isSelfScanRequest ? "Trainer self-scan" : "Front desk";
      const attendance = await AttendanceModel.create({
        gymId,
        attendeeType: "trainer",
        trainerId: trainer._id,
        checkInTime: new Date(),
        status: "checked-in",
        source,
      });
      const occupancy = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
      return memberApiResponse(
        request,
        {
          checkIn: {
            id: attendance._id.toString(),
            personType: "trainer",
            memberId: trainer._id.toString(),
            trainerId: trainer._id.toString(),
            memberName: trainer.name,
            specialty: trainer.specialty,
            time: formatTime(attendance.checkInTime),
            checkInTime: attendance.checkInTime.toISOString(),
            membershipStatus: "Active",
            checkedOut: false,
            source,
          },
          occupancy,
        },
        201,
      );
    }

    // ---------------------------------------------------------
    // MEMBER CHECK-IN (Mobile QR self-scan OR Staff front-desk)
    // ---------------------------------------------------------
    const requestedMemberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
    if (
      isSelfScanRequest &&
      mobileSession?.role === "member" &&
      requestedMemberId &&
      requestedMemberId !== mobileSession.memberId
    ) {
      return memberApiResponse(
        request,
        { error: "Member session does not match the requested account." },
        403,
      );
    }
    const memberId =
      (isSelfScanRequest && mobileSession?.role === "member"
        ? mobileSession.memberId
        : requestedMemberId) || "";
    if (!memberId) {
      return memberApiResponse(request, { error: "memberId is required." }, 400);
    }

    const member = Types.ObjectId.isValid(memberId)
      ? await MemberModel.findOne({ _id: memberId, gymId })
      : typeof input.memberPhone === "string"
        ? await MemberModel.findOne({ gymId, phone: input.memberPhone.trim() })
        : null;
    if (!member) {
      return memberApiResponse(request, { error: "Member was not found for this gym." }, 404);
    }
    if (member.status !== "active") {
      return memberApiResponse(
        request,
        { error: "Membership is expired or inactive. Please contact the front desk." },
        403,
      );
    }

    const membership = await MembershipModel.findOne({ gymId, memberId: member._id }).sort({
      expiryDate: -1,
    });
    if (!membership || membership.status !== "active" || membership.expiryDate < startOfToday()) {
      return memberApiResponse(
        request,
        { error: "Membership is expired. Please renew before checking in." },
        403,
      );
    }

    const latestPayment = await PaymentModel.findOne({ gymId, memberId: member._id }).sort({
      date: -1,
    });
    const paymentStatus = latestPayment?.status ?? membership.paymentStatus;
    if (paymentStatus ? paymentStatus !== "Paid" : !latestPayment) {
      return memberApiResponse(
        request,
        { error: "Payment is unpaid or outstanding. Please contact the front desk." },
        402,
      );
    }

    const occupancyBefore = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
    if (occupancyBefore >= 100) {
      return memberApiResponse(
        request,
        { error: "The gym is currently at capacity. Please wait for a spot to open." },
        409,
      );
    }

    const today = startOfToday();
    const existingCheckIn = await AttendanceModel.exists({
      gymId,
      memberId: member._id,
      status: "checked-in",
      checkInTime: { $gte: today },
    });
    if (existingCheckIn) {
      return memberApiResponse(request, { error: "Already checked in right now." }, 409);
    }

    const source = isSelfScanRequest ? "Member self-scan" : "Front desk";
    const attendance = await AttendanceModel.create({
      gymId,
      attendeeType: "member",
      memberId: member._id,
      checkInTime: new Date(),
      status: "checked-in",
      source,
    });
    const occupancy = await AttendanceModel.countDocuments({ gymId, status: "checked-in" });
    return memberApiResponse(
      request,
      {
        checkIn: {
          id: attendance._id.toString(),
          personType: "member",
          memberId: member._id.toString(),
          memberName: member.fullName,
          time: formatTime(attendance.checkInTime),
          checkInTime: attendance.checkInTime.toISOString(),
          membershipStatus: "Active",
          checkedOut: false,
          source,
        },
        occupancy,
      },
      201,
    );
  } catch (error) {
    console.error("Failed to process attendance:", error);
    return memberApiResponse(request, { error: "Unable to process attendance at this time." }, 503);
  }
}
