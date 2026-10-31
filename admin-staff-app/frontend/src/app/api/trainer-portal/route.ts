import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { startOfGymDay } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import AttendanceModel from "gymos-admin-backend/models/attendance";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import TrainerModel from "gymos-admin-backend/models/trainer";
import TrainingSessionModel from "gymos-admin-backend/models/training-session";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";
import {
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
  parseMemberAuthBody,
} from "@/lib/member-auth";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";
import {
  getPlatformTokenFromRequest,
  PLATFORM_SESSION_COOKIE,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";
import { hasConflictingGymRef } from "@/lib/tenant-guard";

export const runtime = "nodejs";

const VALID_DAYS = new Set(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);

async function authenticateVerifiedTrainer(
  request: NextRequest,
  body?: Record<string, unknown> | null,
) {
  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session) {
    const [staffAttempt, platformAttempt] = await Promise.all([
      verifyStaffSessionToken(
        getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
      ),
      verifyPlatformSessionToken(
        getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
      ),
    ]);
    if (staffAttempt || platformAttempt) {
      return {
        response: memberApiResponse(
          request,
          { error: "Trainer account permissions are required." },
          403,
        ),
      };
    }
    return {
      response: memberApiResponse(request, { error: "Trainer authentication is required." }, 401),
    };
  }

  if (session.role !== "trainer") {
    return {
      response: memberApiResponse(
        request,
        { error: "Trainer permissions are required to access this portal." },
        403,
      ),
    };
  }

  if (!Types.ObjectId.isValid(session.trainerId) || !Types.ObjectId.isValid(session.gymId)) {
    return {
      response: memberApiResponse(request, { error: "Trainer authentication is required." }, 401),
    };
  }

  const gymId = new Types.ObjectId(session.gymId);
  const trainerId = new Types.ObjectId(session.trainerId);

  await connectToDatabase();
  const [gym, trainer] = await Promise.all([
    GymModel.findById(gymId).select("name slug timezone status"),
    TrainerModel.findOne({ _id: trainerId, gymId }),
  ]);

  if (!gym) {
    return {
      response: memberApiResponse(request, { error: "Configured gym was not found." }, 404),
    };
  }
  if (gym.status !== "active") {
    return {
      response: memberApiResponse(
        request,
        { error: "This gym workspace is currently suspended." },
        403,
      ),
    };
  }
  if (!trainer || trainer.status === "inactive") {
    return {
      response: memberApiResponse(request, { error: "Trainer account is unavailable." }, 403),
    };
  }

  if (hasConflictingGymRef(request, { id: gymId.toString(), slug: gym.slug }, body)) {
    return {
      response: memberApiResponse(
        request,
        { error: "Cross-gym access denied: requested gymId does not match your assigned gym." },
        403,
      ),
    };
  }

  const queryTrainerId = request.nextUrl.searchParams.get("trainerId")?.trim();
  const bodyTrainerId =
    body && typeof body.trainerId === "string" ? body.trainerId.trim() : "";
  if (
    (queryTrainerId && queryTrainerId !== trainer._id.toString()) ||
    (bodyTrainerId && bodyTrainerId !== trainer._id.toString())
  ) {
    return {
      response: memberApiResponse(
        request,
        { error: "Access denied: trainers may only access their own profile." },
        403,
      ),
    };
  }

  return { gymId, gym, trainer };
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  try {
    const auth = await authenticateVerifiedTrainer(request);
    if (auth.response) return auth.response;
    const { gymId, gym, trainer } = auth;

    const today = startOfGymDay(new Date(), gym.timezone);
    const assignedIds: Types.ObjectId[] = (trainer.assignedMemberIds ?? []).map(
      (id: unknown) => new Types.ObjectId(String(id)),
    );
    const assignedIdSet = new Set<string>(assignedIds.map((id: Types.ObjectId) => id.toString()));

    const requestedMemberId = request.nextUrl.searchParams.get("memberId")?.trim();
    if (requestedMemberId && !assignedIdSet.has(requestedMemberId)) {
      return memberApiResponse(
        request,
        { error: "Access denied: you are only authorized to view trainees assigned to you." },
        403,
      );
    }

    const [
      assignedMembers,
      memberships,
      payments,
      workoutPlans,
      activeAttendancesToday,
      recentMemberVisits,
      trainerVisits,
      sessions,
    ] = await Promise.all([
      assignedIds.length
        ? MemberModel.find({ gymId, _id: { $in: assignedIds } }).sort({ fullName: 1 }).lean()
        : Promise.resolve([]),
      assignedIds.length
        ? MembershipModel.find({ gymId, memberId: { $in: assignedIds } })
            .sort({ expiryDate: -1 })
            .lean()
        : Promise.resolve([]),
      assignedIds.length
        ? PaymentModel.find({ gymId, memberId: { $in: assignedIds } })
            .select("memberId status date")
            .sort({ date: -1 })
            .lean()
        : Promise.resolve([]),
      WorkoutPlanModel.find({ gymId }).sort({ title: 1 }).lean(),
      AttendanceModel.find({
        gymId,
        status: "checked-in",
        checkInTime: { $gte: today },
      })
        .select("memberId trainerId attendeeType checkInTime")
        .lean(),
      assignedIds.length
        ? AttendanceModel.find({ gymId, memberId: { $in: assignedIds } })
            .sort({ checkInTime: -1 })
            .limit(100)
            .select("memberId checkInTime")
            .lean()
        : Promise.resolve([]),
      AttendanceModel.find({ gymId, trainerId: trainer._id })
        .sort({ checkInTime: -1 })
        .limit(20)
        .lean(),
      TrainingSessionModel.find({ gymId, trainerId: trainer._id })
        .populate({
          path: "memberId",
          model: MemberModel,
          match: { gymId },
          select: "fullName phone",
        })
        .sort({ startsAt: 1 })
        .limit(60)
        .lean(),
    ]);

    const checkedInNow = activeAttendancesToday.some(
      (item) => item.trainerId && String(item.trainerId) === trainer._id.toString(),
    );
    const activeFloorMemberIds = new Set(
      activeAttendancesToday
        .filter((item) => item.memberId)
        .map((item) => String(item.memberId)),
    );

    const latestMembershipByMember = new Map<string, (typeof memberships)[number]>();
    for (const m of memberships) {
      const id = String(m.memberId);
      if (!latestMembershipByMember.has(id)) latestMembershipByMember.set(id, m);
    }

    const latestPaymentByMember = new Map<string, string>();
    for (const p of payments) {
      const id = String(p.memberId);
      if (!latestPaymentByMember.has(id)) latestPaymentByMember.set(id, p.status);
    }

    const lastVisitByMember = new Map<string, string>();
    for (const v of recentMemberVisits) {
      if (!v.memberId) continue;
      const id = String(v.memberId);
      if (!lastVisitByMember.has(id)) {
        lastVisitByMember.set(id, new Date(v.checkInTime).toISOString());
      }
    }

    const serializedWorkoutPlans = workoutPlans.map((plan) => {
      const exercises = (
        plan.exercises as Array<{
          exerciseName: string;
          sets: string;
          reps: string;
          restTime: string;
          targetMuscleGroup: string;
        }>
      ).map((ex, index) => ({
        id: index + 1,
        name: ex.exerciseName,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.restTime,
        muscle: ex.targetMuscleGroup,
      }));
      const memberIds = (plan.assignedMemberIds ?? []).map((id: unknown) => String(id));
      return {
        id: String(plan._id),
        title: plan.title,
        targetGoal: plan.targetGoal,
        exercises,
        assignedMemberIds: memberIds,
      };
    });

    const serializedSessions = sessions.map((item) => {
      const populatedMember = item.memberId as unknown as {
        _id?: Types.ObjectId;
        fullName?: string;
        phone?: string;
      } | null;
      return {
        id: String(item._id),
        memberId: populatedMember?._id ? populatedMember._id.toString() : "",
        memberName: populatedMember?.fullName ?? "Member",
        memberPhone: populatedMember?.phone ?? "",
        title: item.title,
        startsAt: new Date(item.startsAt).toISOString(),
        durationMinutes: item.durationMinutes,
        status: item.status as "scheduled" | "completed" | "cancelled",
        notes: item.notes ?? "",
      };
    });

    const now = new Date();
    const trainees = assignedMembers.map((member) => {
      const id = String(member._id);
      const membership = latestMembershipByMember.get(id);
      const latestPayStatus = latestPaymentByMember.get(id);
      const membershipStatus: "Active" | "Expired" | "Unpaid" =
        member.status !== "active" ||
        !membership ||
        membership.status !== "active" ||
        new Date(membership.expiryDate) < today
          ? "Expired"
          : (latestPayStatus ?? membership.paymentStatus) === "Paid"
            ? "Active"
            : "Unpaid";

      const assignedPlan = serializedWorkoutPlans.find((plan) =>
        plan.assignedMemberIds.includes(id),
      );
      const nextSession = serializedSessions.find(
        (s) =>
          s.memberId === id &&
          s.status === "scheduled" &&
          new Date(s.startsAt).getTime() >= now.getTime() - 60 * 60 * 1000,
      );

      return {
        id,
        name: member.fullName,
        phone: member.phone,
        email: member.email ?? "",
        membershipStatus,
        planName: membership?.planName ?? "No active plan",
        expiryDate: membership?.expiryDate
          ? new Date(membership.expiryDate).toISOString().slice(0, 10)
          : null,
        onFloorNow: activeFloorMemberIds.has(id),
        lastVisitAt: lastVisitByMember.get(id) ?? null,
        workoutPlan: assignedPlan
          ? {
              id: assignedPlan.id,
              title: assignedPlan.title,
              targetGoal: assignedPlan.targetGoal,
              exercises: assignedPlan.exercises,
            }
          : null,
        nextSession: nextSession
          ? {
              id: nextSession.id,
              title: nextSession.title,
              startsAt: nextSession.startsAt,
              durationMinutes: nextSession.durationMinutes,
            }
          : null,
      };
    });

    return memberApiResponse(request, {
      role: "trainer",
      trainer: {
        id: trainer._id.toString(),
        gymId: gymId.toString(),
        gymName: gym.name,
        gymSlug: gym.slug,
        name: trainer.name,
        specialty: trainer.specialty,
        phone: trainer.phone,
        email: trainer.email ?? "",
        status: trainer.status ?? "active",
        checkedInNow,
        availability: (
          (trainer.availability ?? []) as Array<{
            day: string;
            startTime: string;
            endTime: string;
          }>
        ).map((slot) => ({
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      },
      trainees,
      sessions: serializedSessions,
      workoutPlans: serializedWorkoutPlans.map(({ assignedMemberIds: _ids, ...plan }) => {
        void _ids;
        return plan;
      }),
      visits: trainerVisits.map((visit) => ({
        id: String(visit._id),
        checkInTime: new Date(visit.checkInTime).toISOString(),
        checkedOut: visit.status === "checked-out" || Boolean(visit.checkOutTime),
        source: visit.source ?? "Trainer self-scan",
      })),
    });
  } catch (error) {
    console.error("Failed to fetch trainer portal data:", error);
    return memberApiResponse(request, { error: "Unable to fetch trainer data at this time." }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  let parsedInput: Record<string, unknown> | undefined;
  const parsed = await parseMemberAuthBody(request);
  if (parsed.input) {
    parsedInput = parsed.input;
  }

  try {
    const auth = await authenticateVerifiedTrainer(request, parsedInput);
    if (auth.response) return auth.response;
    const { gymId, trainer } = auth;

    if (!parsedInput) {
      return memberApiResponse(request, { error: parsed.error }, 400);
    }
    const input = parsedInput;

    if (input.action === "create-session") {
      const memberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const startsAtRaw = typeof input.startsAt === "string" ? input.startsAt : "";
      const durationMinutes =
        typeof input.durationMinutes === "number" ? input.durationMinutes : 60;
      const notes = typeof input.notes === "string" ? input.notes.trim() : "";

      if (!Types.ObjectId.isValid(memberId)) {
        return memberApiResponse(request, { error: "Select a valid trainee." }, 400);
      }
      if (!title || title.length > 80) {
        return memberApiResponse(
          request,
          { error: "Session title is required (max 80 characters)." },
          400,
        );
      }
      if (!startsAtRaw || Number.isNaN(Date.parse(startsAtRaw))) {
        return memberApiResponse(request, { error: "Enter a valid session date and time." }, 400);
      }
      if (
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 15 ||
        durationMinutes > 240
      ) {
        return memberApiResponse(
          request,
          { error: "Duration must be between 15 and 240 minutes." },
          400,
        );
      }
      if (notes.length > 240) {
        return memberApiResponse(request, { error: "Notes must be 240 characters or fewer." }, 400);
      }

      const assignedSet = new Set(
        (trainer.assignedMemberIds ?? []).map((id: unknown) => String(id)),
      );
      if (!assignedSet.has(memberId)) {
        return memberApiResponse(
          request,
          { error: "You can only schedule sessions for members assigned to you." },
          403,
        );
      }

      const member = await MemberModel.findOne({ _id: memberId, gymId });
      if (!member) {
        return memberApiResponse(request, { error: "Trainee was not found." }, 404);
      }

      const created = await TrainingSessionModel.create({
        gymId,
        trainerId: trainer._id,
        memberId: member._id,
        title,
        startsAt: new Date(startsAtRaw),
        durationMinutes,
        status: "scheduled",
        ...(notes ? { notes } : {}),
      });

      return memberApiResponse(
        request,
        {
          session: {
            id: created._id.toString(),
            memberId: member._id.toString(),
            memberName: member.fullName,
            title: created.title,
            startsAt: created.startsAt.toISOString(),
            durationMinutes: created.durationMinutes,
            status: created.status,
            notes: created.notes ?? "",
          },
        },
        201,
      );
    }

    if (input.action === "update-session-status") {
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const nextStatus = typeof input.status === "string" ? input.status : "";
      if (
        !Types.ObjectId.isValid(sessionId) ||
        !["scheduled", "completed", "cancelled"].includes(nextStatus)
      ) {
        return memberApiResponse(request, { error: "Valid sessionId and status are required." }, 400);
      }

      const updated = await TrainingSessionModel.findOneAndUpdate(
        { _id: sessionId, gymId, trainerId: trainer._id },
        { $set: { status: nextStatus } },
        { new: true },
      );
      if (!updated) {
        const existsInSameGym = await TrainingSessionModel.exists({ _id: sessionId, gymId });
        if (existsInSameGym) {
          return memberApiResponse(
            request,
            { error: "Access denied: you can only modify your own coaching sessions." },
            403,
          );
        }
        return memberApiResponse(request, { error: "Session was not found." }, 404);
      }

      return memberApiResponse(request, {
        session: { id: updated._id.toString(), status: updated.status },
      });
    }

    if (input.action === "update-availability") {
      if (!Array.isArray(input.availability) || input.availability.length > 14) {
        return memberApiResponse(
          request,
          { error: "availability must be a list of up to 14 weekly shift slots." },
          400,
        );
      }
      const cleaned: Array<{ day: string; startTime: string; endTime: string }> = [];
      for (const raw of input.availability) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return memberApiResponse(request, { error: "Invalid availability slot." }, 400);
        }
        const slot = raw as Record<string, unknown>;
        const day = typeof slot.day === "string" ? slot.day.trim() : "";
        const startTime = typeof slot.startTime === "string" ? slot.startTime.trim() : "";
        const endTime = typeof slot.endTime === "string" ? slot.endTime.trim() : "";
        if (!VALID_DAYS.has(day) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
          return memberApiResponse(
            request,
            { error: "Each shift needs a valid day and HH:MM start/end time." },
            400,
          );
        }
        cleaned.push({ day, startTime, endTime });
      }

      trainer.set("availability", cleaned);
      await trainer.save();
      return memberApiResponse(request, { availability: cleaned });
    }

    if (input.action === "assign-workout") {
      const memberId = typeof input.memberId === "string" ? input.memberId.trim() : "";
      const workoutPlanId =
        typeof input.workoutPlanId === "string" ? input.workoutPlanId.trim() : "";
      if (!Types.ObjectId.isValid(memberId) || !Types.ObjectId.isValid(workoutPlanId)) {
        return memberApiResponse(
          request,
          { error: "Select a valid trainee and workout plan." },
          400,
        );
      }
      const assignedSet = new Set(
        (trainer.assignedMemberIds ?? []).map((id: unknown) => String(id)),
      );
      if (!assignedSet.has(memberId)) {
        return memberApiResponse(
          request,
          { error: "You can only update workout plans for your assigned trainees." },
          403,
        );
      }

      const [member, plan] = await Promise.all([
        MemberModel.findOne({ _id: memberId, gymId }),
        WorkoutPlanModel.findOne({ _id: workoutPlanId, gymId }),
      ]);
      if (!member || !plan) {
        return memberApiResponse(
          request,
          { error: "Trainee or workout plan was not found." },
          404,
        );
      }

      await Promise.all([
        WorkoutPlanModel.updateMany(
          { gymId, assignedMemberIds: member._id },
          { $pull: { assignedMemberIds: member._id } },
        ),
        MemberModel.updateOne(
          { _id: member._id, gymId },
          {
            $set: {
              pendingWorkoutPlanId: null,
              pendingWorkoutAssignedAt: null,
              pendingWorkoutAssignedBy: "",
            },
          },
        ),
      ]);
      await WorkoutPlanModel.updateOne(
        { _id: plan._id, gymId },
        { $addToSet: { assignedMemberIds: member._id } },
      );

      return memberApiResponse(request, {
        assignment: { memberId: member._id.toString(), workoutPlanId: plan._id.toString() },
      });
    }

    return memberApiResponse(request, { error: "Unsupported trainer action." }, 400);
  } catch (error) {
    console.error("Trainer portal update failed:", error);
    return memberApiResponse(request, { error: "Unable to save changes right now." }, 503);
  }
}
