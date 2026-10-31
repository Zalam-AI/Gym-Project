import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import {
  upsertExerciseMediaCatalog,
  type CatalogExerciseMediaInput,
} from "gymos-admin-backend/lib/exercise-media-catalog";
import MemberModel from "gymos-admin-backend/models/member";
import WorkoutPlanModel from "gymos-admin-backend/models/workout-plan";
import { requireStaffContext } from "@/lib/gym-context";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const auth = await requireStaffContext(request);
  if (auth.response) return auth.response;
  const { gymId } = auth.ctx;

  try {
    await connectToDatabase();
    const [plans, pendingMembers] = await Promise.all([
      WorkoutPlanModel.find({ gymId })
        .populate({
          path: "assignedMemberIds",
          model: MemberModel,
          match: { gymId },
          select: "fullName",
        })
        .sort({ title: 1 })
        .lean(),
      MemberModel.find({ gymId, pendingWorkoutPlanId: { $ne: null } })
        .select("fullName pendingWorkoutPlanId pendingWorkoutAssignedAt pendingWorkoutAssignedBy")
        .lean<
          Array<{
            _id: Types.ObjectId;
            fullName: string;
            pendingWorkoutPlanId?: Types.ObjectId | null;
            pendingWorkoutAssignedAt?: Date | null;
            pendingWorkoutAssignedBy?: string;
          }>
        >(),
    ]);
    const workoutPlans = plans.map((plan) => {
      const serializedPlan = plan as unknown as Parameters<typeof serializePlan>[0];
      const assignedMembers = plan.assignedMemberIds as unknown as Array<{ _id: Types.ObjectId; fullName: string }>;
      return {
        ...serializePlan({ ...serializedPlan, assignedMemberIds: assignedMembers.map((member) => member._id) }),
        assignedMemberNames: assignedMembers.map((member) => member.fullName),
      };
    });
    const validPlanIdSet = new Set(workoutPlans.map((p) => p.id));
    const pendingAssignments = pendingMembers
      .filter((m) => m.pendingWorkoutPlanId && validPlanIdSet.has(String(m.pendingWorkoutPlanId)))
      .map((m) => ({
        memberId: m._id.toString(),
        memberName: m.fullName,
        workoutPlanId: String(m.pendingWorkoutPlanId),
        assignedAt: m.pendingWorkoutAssignedAt ? new Date(m.pendingWorkoutAssignedAt).toISOString() : null,
        assignedBy: m.pendingWorkoutAssignedBy ?? "",
      }));
    return NextResponse.json({ workoutPlans, pendingAssignments });
  } catch (error) {
    console.error("Failed to fetch workout plans:", error);
    return NextResponse.json({ error: "Unable to fetch workout plans at this time." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request);
  const auth = await requireStaffContext(request, parsed.input ?? null);
  if (auth.response) return auth.response;
  const { gymId, userName } = auth.ctx;

  if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.input;

  try {
    await connectToDatabase();

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

      const alreadyAssigned = (plan.assignedMemberIds as unknown[]).some(
        (id) => String(id) === String(member._id),
      );
      if (alreadyAssigned) {
        await MemberModel.updateOne(
          { _id: member._id, gymId },
          {
            $set: {
              pendingWorkoutPlanId: null,
              pendingWorkoutAssignedAt: null,
              pendingWorkoutAssignedBy: "",
            },
          },
        );
        return NextResponse.json({
          assignment: {
            workoutPlanId: plan._id.toString(),
            memberId: member._id.toString(),
            status: "active",
          },
        });
      }

      // Queue as a pending workout routine change so the member can verify & accept/decline in the Mobile App
      await MemberModel.updateOne(
        { _id: member._id, gymId },
        {
          $set: {
            pendingWorkoutPlanId: plan._id,
            pendingWorkoutAssignedAt: new Date(),
            pendingWorkoutAssignedBy: userName || "Gym Staff",
          },
        },
      );
      return NextResponse.json({
        assignment: {
          workoutPlanId: plan._id.toString(),
          memberId: member._id.toString(),
          status: "pending_member_confirmation",
        },
      });
    }

    if (input.action === "upsert-exercise-media") {
      const rawItems = Array.isArray(input.items)
        ? input.items
        : input.exerciseName
          ? [input]
          : [];
      if (rawItems.length < 1 || rawItems.length > 500) {
        return NextResponse.json(
          { error: "Provide between 1 and 500 exercise media items." },
          { status: 400 },
        );
      }
      const mapped: CatalogExerciseMediaInput[] = [];
      for (const item of rawItems) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const obj = item as Record<string, unknown>;
        const exerciseName =
          typeof obj.exerciseName === "string" ? obj.exerciseName.trim() : "";
        if (!exerciseName) continue;
        mapped.push({
          exerciseName,
          exerciseKey:
            typeof obj.exerciseKey === "string" ? obj.exerciseKey : undefined,
          aliases: Array.isArray(obj.aliases)
            ? obj.aliases.filter((a): a is string => typeof a === "string")
            : [],
          targetMuscleGroup:
            typeof obj.targetMuscleGroup === "string"
              ? obj.targetMuscleGroup
              : undefined,
          equipment:
            typeof obj.equipment === "string" ? obj.equipment : undefined,
          mediaType:
            typeof obj.mediaType === "string"
              ? (obj.mediaType as CatalogExerciseMediaInput["mediaType"])
              : "svg_2d",
          mediaSource:
            typeof obj.mediaSource === "string"
              ? (obj.mediaSource as CatalogExerciseMediaInput["mediaSource"])
              : undefined,
          mediaUrl: typeof obj.mediaUrl === "string" ? obj.mediaUrl : undefined,
          posterUrl:
            typeof obj.posterUrl === "string" ? obj.posterUrl : undefined,
          providerName:
            typeof obj.providerName === "string" ? obj.providerName : undefined,
          providerExerciseId:
            typeof obj.providerExerciseId === "string"
              ? obj.providerExerciseId
              : undefined,
          animationKey:
            typeof obj.animationKey === "string" ? obj.animationKey : undefined,
          formCue: typeof obj.formCue === "string" ? obj.formCue : undefined,
          license: typeof obj.license === "string" ? obj.license : undefined,
        });
      }
      const upsertedCount = await upsertExerciseMediaCatalog(mapped, gymId);
      return NextResponse.json({ ok: true, upsertedCount });
    }

    if (input.action !== "create") return NextResponse.json({ error: "action must be create, assign, or upsert-exercise-media." }, { status: 400 });
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