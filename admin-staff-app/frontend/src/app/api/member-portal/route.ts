import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import TrainerModel from "gymos-admin-backend/models/trainer";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";
import { MEMBER_SESSION_COOKIE, verifyMemberSessionToken } from "@/lib/member-session";
import { getAllowedMemberOrigins, isAllowedMemberOrigin } from "@/lib/member-auth";

export const runtime = "nodejs";

function getActiveGymId() {
  const gymId = process.env.GYMOS_GYM_ID;
  return gymId && Types.ObjectId.isValid(gymId) ? new Types.ObjectId(gymId) : null;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  const origin = request.headers.get("origin");
  if (origin && getAllowedMemberOrigins().has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

type MembershipRecord = {
  _id: Types.ObjectId;
  memberId: Types.ObjectId;
  planName: string;
  status: string;
  startDate: Date;
  expiryDate: Date;
  paymentStatus?: string;
};

export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  const session = await verifyMemberSessionToken(request.cookies.get(MEMBER_SESSION_COOKIE)?.value);
  if (!session || !Types.ObjectId.isValid(session.memberId) || !Types.ObjectId.isValid(session.gymId)) {
    return jsonResponse(request, { error: "Member authentication is required." }, 401);
  }
  const gymId = new Types.ObjectId(session.gymId);

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return jsonResponse(request, { error: "Configured gym was not found." }, 404);
    }

    const member = await MemberModel.findOne({ _id: session.memberId, gymId });
    if (!member) return jsonResponse(request, { error: "Member account was not found." }, 404);

    const [membershipDoc, latestPayment, workoutDoc, trainerDoc, visits] = await Promise.all([
      MembershipModel.findOne({ gymId, memberId: member._id }).sort({ expiryDate: -1 }),
      PaymentModel.findOne({ gymId, memberId: member._id }).sort({ date: -1 }),
      WorkoutPlanModel.findOne({ gymId, assignedMemberIds: member._id }).sort({ updatedAt: -1 }),
      TrainerModel.findOne({ gymId, assignedMemberIds: member._id }).sort({ updatedAt: -1 }),
      AttendanceModel.find({ gymId, memberId: member._id }).sort({ checkInTime: -1 }).limit(20),
    ]);
    const membership = membershipDoc as unknown as MembershipRecord | null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const membershipStatus = member.status !== "active" || !membership || membership.status !== "active" || membership.expiryDate < today
      ? "Expired"
      : (latestPayment?.status ?? membership.paymentStatus) === "Paid"
        ? "Active"
        : "Unpaid";

    return jsonResponse(request, {
      member: {
        id: member._id.toString(),
        gymId: gymId.toString(),
        name: member.fullName,
        phone: member.phone,
        email: member.email,
        status: membershipStatus,
        planName: membership?.planName ?? "No active plan",
        startDate: membership?.startDate.toISOString().slice(0, 10) ?? null,
        expiryDate: membership?.expiryDate.toISOString().slice(0, 10) ?? null,
        paymentStatus: latestPayment?.status ?? membership?.paymentStatus ?? "Unpaid",
      },
      gymQrPayload: `GYMOS-GYM:${gymId.toString()}`,
      trainer: trainerDoc ? { id: trainerDoc._id.toString(), name: trainerDoc.name, specialty: trainerDoc.specialty } : null,
      workoutPlan: workoutDoc ? {
        id: workoutDoc._id.toString(),
        title: workoutDoc.title,
        targetGoal: workoutDoc.targetGoal,
          exercises: (workoutDoc.exercises as Array<{
            exerciseName: string;
            sets: string;
            reps: string;
            restTime: string;
            targetMuscleGroup: string;
          }>).map((exercise, index) => ({
          id: index + 1,
          name: exercise.exerciseName,
          sets: exercise.sets,
          reps: exercise.reps,
          rest: exercise.restTime,
          muscle: exercise.targetMuscleGroup,
        })),
      } : null,
      visits: visits.map((visit) => ({
        id: visit._id.toString(),
        checkInTime: visit.checkInTime.toISOString(),
        checkedOut: visit.status === "checked-out" || Boolean(visit.checkOutTime),
        source: visit.source ?? "Front desk",
      })),
    });
  } catch (error) {
    console.error("Failed to fetch member portal data:", error);
    return jsonResponse(request, { error: "Unable to fetch member data at this time." }, 503);
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  });
  if (origin && getAllowedMemberOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new NextResponse(null, { status: 204, headers });
}