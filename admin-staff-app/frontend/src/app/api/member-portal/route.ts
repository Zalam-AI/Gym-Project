import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import PaymentModel from "gymos-admin-backend/models/payment";
import TrainerModel from "gymos-admin-backend/models/trainer";
import TrainingSessionModel from "gymos-admin-backend/models/training-session";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import { isAllowedMemberOrigin, memberApiOptions, memberApiResponse } from "@/lib/member-auth";

export const runtime = "nodejs";

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
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }
  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session) {
    return memberApiResponse(request, { error: "Member authentication is required." }, 401);
  }

  // If the signed-in mobile user is a trainer, report role cleanly so the app loads the trainer portal
  if (session.role === "trainer") {
    return memberApiResponse(request, { role: "trainer" });
  }

  if (!Types.ObjectId.isValid(session.memberId)) {
    return memberApiResponse(request, { error: "Member authentication is required." }, 401);
  }

  try {
    await connectToDatabase();
    const member = await MemberModel.findById(session.memberId);
    if (!member) {
      return memberApiResponse(request, { error: "Member account was not found." }, 404);
    }

    // Check if the member currently has a pending subscription request awaiting staff approval
    const pendingReqDoc = await MembershipRequestModel.findOne({
      memberId: member._id,
      status: "pending",
    }).sort({ createdAt: -1 });

    let pendingRequest: {
      id: string;
      gymId: string;
      gymName: string;
      planName: string;
      price: number;
      durationMonths: number;
      paymentMethod: "Cash" | "Card" | "Instapay";
      createdAt: string;
    } | null = null;

    if (pendingReqDoc) {
      const targetGym = await GymModel.findById(pendingReqDoc.gymId).select("name");
      pendingRequest = {
        id: pendingReqDoc._id.toString(),
        gymId: pendingReqDoc.gymId.toString(),
        gymName: targetGym?.name ?? "Gym",
        planName: pendingReqDoc.planName,
        price: pendingReqDoc.price,
        durationMonths: pendingReqDoc.durationMonths,
        paymentMethod: pendingReqDoc.paymentMethod as "Cash" | "Card" | "Instapay",
        createdAt: pendingReqDoc.createdAt.toISOString(),
      };
    }

    const memberGymId =
      member.gymId && Types.ObjectId.isValid(String(member.gymId))
        ? new Types.ObjectId(String(member.gymId))
        : null;

    const membershipDoc = memberGymId
      ? await MembershipModel.findOne({ gymId: memberGymId, memberId: member._id }).sort({
          expiryDate: -1,
        })
      : null;

    const gym = memberGymId ? await GymModel.findById(memberGymId).select("name slug") : null;

    // If the member isn't enrolled in any plan in a gym yet, do NOT assign a gym branch or tell them
    // their plan needs renewal — let them onboard by scanning a gym's QR code!
    if (!memberGymId || !gym || !membershipDoc) {
      return memberApiResponse(request, {
        role: "member",
        enrolledInGym: false,
        pendingRequest,
        member: {
          id: member._id.toString(),
          gymId: "",
          name: member.fullName,
          phone: member.phone,
          email: member.email,
          status: "NoPlan",
          planName: "No plan yet",
          startDate: null,
          expiryDate: null,
          paymentStatus: "None",
          gymQrPayload: "",
          enrolledInGym: false,
        },
        gymQrPayload: "",
        trainer: null,
        workoutPlan: null,
        upcomingSessions: [],
        visits: [],
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [latestPayment, workoutDoc, trainerDoc, visits, sessionDocs] = await Promise.all([
      PaymentModel.findOne({ gymId: memberGymId, memberId: member._id }).sort({ date: -1 }),
      WorkoutPlanModel.findOne({ gymId: memberGymId, assignedMemberIds: member._id }).sort({
        updatedAt: -1,
      }),
      TrainerModel.findOne({ gymId: memberGymId, assignedMemberIds: member._id }).sort({
        updatedAt: -1,
      }),
      AttendanceModel.find({ gymId: memberGymId, memberId: member._id })
        .sort({ checkInTime: -1 })
        .limit(20),
      TrainingSessionModel.find({
        gymId: memberGymId,
        memberId: member._id,
        status: "scheduled",
        startsAt: { $gte: today },
      })
        .populate({ path: "trainerId", model: TrainerModel, select: "name specialty" })
        .sort({ startsAt: 1 })
        .limit(10)
        .lean(),
    ]);

    const membership = membershipDoc as unknown as MembershipRecord;
    const membershipStatus =
      member.status !== "active" ||
      membership.status !== "active" ||
      membership.expiryDate < today
        ? "Expired"
        : (latestPayment?.status ?? membership.paymentStatus) === "Paid"
          ? "Active"
          : "Unpaid";

    const gymQrPayload = `GYMOS-GYM:${memberGymId.toString()}`;

    return memberApiResponse(request, {
      role: "member",
      enrolledInGym: true,
      pendingRequest,
      member: {
        id: member._id.toString(),
        gymId: memberGymId.toString(),
        gymName: gym.name,
        gymSlug: gym.slug,
        name: member.fullName,
        phone: member.phone,
        email: member.email,
        status: membershipStatus,
        planName: membership.planName,
        startDate: membership.startDate.toISOString().slice(0, 10),
        expiryDate: membership.expiryDate.toISOString().slice(0, 10),
        paymentStatus: latestPayment?.status ?? membership.paymentStatus ?? "Paid",
        gymQrPayload,
        enrolledInGym: true,
      },
      gymQrPayload,
      trainer: trainerDoc
        ? {
            id: trainerDoc._id.toString(),
            name: trainerDoc.name,
            specialty: trainerDoc.specialty,
            phone: trainerDoc.phone,
            availability: (
              (trainerDoc.availability ?? []) as Array<{
                day: string;
                startTime: string;
                endTime: string;
              }>
            ).map((slot) => ({
              day: slot.day,
              startTime: slot.startTime,
              endTime: slot.endTime,
            })),
          }
        : null,
      workoutPlan: workoutDoc
        ? {
            id: workoutDoc._id.toString(),
            title: workoutDoc.title,
            targetGoal: workoutDoc.targetGoal,
            exercises: (
              workoutDoc.exercises as Array<{
                exerciseName: string;
                sets: string;
                reps: string;
                restTime: string;
                targetMuscleGroup: string;
              }>
            ).map((exercise, index) => ({
              id: index + 1,
              name: exercise.exerciseName,
              sets: exercise.sets,
              reps: exercise.reps,
              rest: exercise.restTime,
              muscle: exercise.targetMuscleGroup,
            })),
          }
        : null,
      upcomingSessions: sessionDocs.map((item) => {
        const populatedTrainer = item.trainerId as unknown as {
          _id?: Types.ObjectId;
          name?: string;
          specialty?: string;
        } | null;
        return {
          id: String(item._id),
          title: item.title,
          startsAt: new Date(item.startsAt).toISOString(),
          durationMinutes: item.durationMinutes,
          notes: item.notes ?? "",
          trainerName: populatedTrainer?.name ?? trainerDoc?.name ?? "Coach",
        };
      }),
      visits: visits.map((visit) => ({
        id: visit._id.toString(),
        checkInTime: visit.checkInTime.toISOString(),
        checkedOut: visit.status === "checked-out" || Boolean(visit.checkOutTime),
        source: visit.source ?? "Front desk",
      })),
    });
  } catch (error) {
    console.error("Failed to fetch member portal data:", error);
    return memberApiResponse(request, { error: "Unable to fetch member data at this time." }, 503);
  }
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}
