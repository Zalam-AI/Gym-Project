import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";

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

function serializePlan(plan: {
  _id: Types.ObjectId;
  title: string;
  targetGoal: string;
  exercises: Array<{ exerciseName: string; sets: string; reps: string; restTime: string; targetMuscleGroup: string }>;
  assignedMemberIds: unknown[];
}) {
  return {
    id: plan._id.toString(),
    title: plan.title,
    targetGoal: plan.targetGoal,
    exercises: plan.exercises.map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sets: exercise.sets,
      reps: exercise.reps,
      restTime: exercise.restTime,
      targetMuscleGroup: exercise.targetMuscleGroup,
    })),
    assignedMemberIds: plan.assignedMemberIds.map((id) => String(id)),
  };
}

export async function GET() {
  const gymId = getActiveGymId();
  if (!gymId) return NextResponse.json({ error: "GYMOS_GYM_ID must be set to a valid gym ID." }, { status: 500 });

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }
    const plans = await WorkoutPlanModel.find({ gymId })
      .populate({ path: "assignedMemberIds", model: MemberModel, select: "fullName" })
      .sort({ title: 1 })
      .lean();
    const workoutPlans = plans.map((plan) => {
      const serializedPlan = plan as unknown as Parameters<typeof serializePlan>[0];
      const assignedMembers = plan.assignedMemberIds as unknown as Array<{ _id: Types.ObjectId; fullName: string }>;
      return {
        ...serializePlan({ ...serializedPlan, assignedMemberIds: assignedMembers.map((member) => member._id) }),
        assignedMemberNames: assignedMembers.map((member) => member.fullName),
      };
    });
    return NextResponse.json({ workoutPlans });
  } catch (error) {
    console.error("Failed to fetch workout plans:", error);
    return NextResponse.json({ error: "Unable to fetch workout plans at this time." }, { status: 503 });
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
      const workoutPlanId = typeof input.workoutPlanId === "string" ? input.workoutPlanId : "";
      const memberId = typeof input.memberId === "string" ? input.memberId : "";
      if (!Types.ObjectId.isValid(workoutPlanId) || !Types.ObjectId.isValid(memberId)) {
        return NextResponse.json({ error: "Valid workoutPlanId and memberId are required." }, { status: 400 });
      }
      const [plan, member] = await Promise.all([
        WorkoutPlanModel.findOne({ _id: workoutPlanId, gymId }),
        MemberModel.findOne({ _id: memberId, gymId }),
      ]);
      if (!plan || !member) return NextResponse.json({ error: "Workout plan or member was not found for this gym." }, { status: 404 });
      await WorkoutPlanModel.updateMany(
        { gymId, assignedMemberIds: member._id },
        { $pull: { assignedMemberIds: member._id } },
      );
      await WorkoutPlanModel.updateOne({ _id: plan._id, gymId }, { $addToSet: { assignedMemberIds: member._id } });
      return NextResponse.json({ assignment: { workoutPlanId: plan._id.toString(), memberId: member._id.toString() } });
    }

    if (input.action !== "create") return NextResponse.json({ error: "action must be create or assign." }, { status: 400 });
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const targetGoal = typeof input.targetGoal === "string" ? input.targetGoal.trim() : "";
    if (!title || !targetGoal || title.length > 80 || targetGoal.length > 80) {
      return NextResponse.json({ error: "title and targetGoal are required and must be 80 characters or fewer." }, { status: 400 });
    }
    if (!Array.isArray(input.exercises) || input.exercises.length < 1 || input.exercises.length > 40) {
      return NextResponse.json({ error: "exercises must contain between 1 and 40 exercise entries." }, { status: 400 });
    }
    const exercises: Array<{ exerciseName: string; sets: string; reps: string; restTime: string; targetMuscleGroup: string }> = [];
    for (const rawExercise of input.exercises) {
      if (!rawExercise || typeof rawExercise !== "object" || Array.isArray(rawExercise)) {
        return NextResponse.json({ error: "Each exercise must be an object." }, { status: 400 });
      }
      const exercise = rawExercise as Record<string, unknown>;
      const values = {
        exerciseName: typeof exercise.exerciseName === "string" ? exercise.exerciseName.trim() : "",
        sets: typeof exercise.sets === "string" ? exercise.sets.trim() : "",
        reps: typeof exercise.reps === "string" ? exercise.reps.trim() : "",
        restTime: typeof exercise.restTime === "string" ? exercise.restTime.trim() : "",
        targetMuscleGroup: typeof exercise.targetMuscleGroup === "string" ? exercise.targetMuscleGroup.trim() : "",
      };
      if (!values.exerciseName || !values.sets || !values.reps || !values.restTime || !values.targetMuscleGroup ||
        values.exerciseName.length > 80 || values.sets.length > 12 || values.reps.length > 16 ||
        values.restTime.length > 16 || values.targetMuscleGroup.length > 40) {
        return NextResponse.json({ error: "Each exercise needs a name, sets, reps, rest time, and target muscle group within the supported lengths." }, { status: 400 });
      }
      exercises.push(values);
    }

    const plan = await WorkoutPlanModel.create({ gymId, title, targetGoal, exercises, assignedMemberIds: [] });
    return NextResponse.json({ workoutPlan: serializePlan(plan) }, { status: 201 });
  } catch (error) {
    console.error("Failed to save workout plan:", error);
    return NextResponse.json({ error: "Unable to save workout plan at this time." }, { status: 503 });
  }
}