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

const VALID_PLAN_DAYS = new Set(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);

function normalizeScheduledDays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const d = item.trim();
    if (VALID_PLAN_DAYS.has(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

function parsePlanExercises(rawExercises: unknown): {
  exercises?: Array<{
    exerciseName: string;
    sets: string;
    reps: string;
    restTime: string;
    targetMuscleGroup: string;
    day: string;
    targetWeightKg: number;
  }>;
  error?: string;
} {
  if (!Array.isArray(rawExercises) || rawExercises.length < 1 || rawExercises.length > 40) {
    return { error: "exercises must contain between 1 and 40 exercise entries." };
  }
  const exercises: Array<{
    exerciseName: string;
    sets: string;
    reps: string;
    restTime: string;
    targetMuscleGroup: string;
    day: string;
    targetWeightKg: number;
  }> = [];
  for (const rawExercise of rawExercises) {
    if (!rawExercise || typeof rawExercise !== "object" || Array.isArray(rawExercise)) {
      return { error: "Each exercise must be an object." };
    }
    const exercise = rawExercise as Record<string, unknown>;
    const rawDay = typeof exercise.day === "string" ? exercise.day.trim() : "";
    const rawWeight =
      typeof exercise.targetWeightKg === "number"
        ? exercise.targetWeightKg
        : typeof exercise.targetWeightKg === "string"
          ? Number.parseFloat(exercise.targetWeightKg)
          : 0;
    const targetWeightKg = Number.isFinite(rawWeight)
      ? Math.max(0, Math.min(1000, Math.round(rawWeight * 100) / 100))
      : 0;
    const values = {
      exerciseName:
        typeof exercise.exerciseName === "string" ? exercise.exerciseName.trim() : "",
      sets: typeof exercise.sets === "string" ? exercise.sets.trim() : String(exercise.sets ?? "").trim(),
      reps: typeof exercise.reps === "string" ? exercise.reps.trim() : String(exercise.reps ?? "").trim(),
      restTime:
        typeof exercise.restTime === "string" && exercise.restTime.trim()
          ? exercise.restTime.trim()
          : "60 sec",
      targetMuscleGroup:
        typeof exercise.targetMuscleGroup === "string" && exercise.targetMuscleGroup.trim()
          ? exercise.targetMuscleGroup.trim()
          : "Full body",
      day: VALID_PLAN_DAYS.has(rawDay) ? rawDay : "",
      targetWeightKg,
    };
    if (
      !values.exerciseName ||
      !values.sets ||
      !values.reps ||
      !values.restTime ||
      !values.targetMuscleGroup ||
      values.exerciseName.length > 80 ||
      values.sets.length > 12 ||
      values.reps.length > 16 ||
      values.restTime.length > 16 ||
      values.targetMuscleGroup.length > 40
    ) {
      return {
        error:
          "Each exercise needs a name, sets, reps, rest time, and target muscle group within the supported lengths.",
      };
    }
    exercises.push(values);
  }
  return { exercises };
}

function serializePlan(plan: {
  _id: Types.ObjectId;
  title: string;
  targetGoal: string;
  scheduledDays?: string[];
  createdByRole?: "staff" | "trainer";
  createdByTrainerId?: Types.ObjectId | null;
  createdByName?: string;
  exercises: Array<{
    exerciseName: string;
    sets: string;
    reps: string;
    restTime: string;
    targetMuscleGroup: string;
    day?: string;
    targetWeightKg?: number;
  }>;
  assignedMemberIds: unknown[];
}) {
  return {
    id: plan._id.toString(),
    title: plan.title,
    targetGoal: plan.targetGoal,
    scheduledDays: normalizeScheduledDays(plan.scheduledDays),
    createdByRole: plan.createdByRole === "trainer" ? "trainer" : "staff",
    createdByTrainerId: plan.createdByTrainerId ? String(plan.createdByTrainerId) : null,
    createdByName: plan.createdByName ?? "",
    exercises: plan.exercises.map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sets: exercise.sets,
      reps: exercise.reps,
      restTime: exercise.restTime,
      targetMuscleGroup: exercise.targetMuscleGroup,
      day: exercise.day ?? "",
      targetWeightKg: exercise.targetWeightKg ?? 0,
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

    if (input.action === "duplicate") {
      const workoutPlanId =
        typeof input.workoutPlanId === "string" ? input.workoutPlanId.trim() : "";
      if (!Types.ObjectId.isValid(workoutPlanId)) {
        return NextResponse.json({ error: "Valid workoutPlanId is required." }, { status: 400 });
      }
      const source = await WorkoutPlanModel.findOne({ _id: workoutPlanId, gymId });
      if (!source) {
        return NextResponse.json(
          { error: "Workout plan was not found for this gym." },
          { status: 404 },
        );
      }
      const customTitle =
        typeof input.title === "string" && input.title.trim()
          ? input.title.trim().slice(0, 80)
          : `${source.title} (Copy)`.slice(0, 80);
      const duplicated = await WorkoutPlanModel.create({
        gymId,
        title: customTitle,
        targetGoal: source.targetGoal,
        scheduledDays: normalizeScheduledDays(
          (source as unknown as { scheduledDays?: string[] }).scheduledDays,
        ),
        createdByRole: "staff",
        createdByTrainerId: null,
        createdByName: userName || "Gym Staff",
        exercises: (source.exercises as Array<Record<string, unknown>>).map((ex) => ({
          exerciseName: String(ex.exerciseName ?? ""),
          sets: String(ex.sets ?? "3"),
          reps: String(ex.reps ?? "10"),
          restTime: String(ex.restTime ?? "60 sec"),
          targetMuscleGroup: String(ex.targetMuscleGroup ?? "Full body"),
          day: typeof ex.day === "string" ? ex.day : "",
          targetWeightKg: typeof ex.targetWeightKg === "number" ? ex.targetWeightKg : 0,
        })),
        assignedMemberIds: [],
      });
      return NextResponse.json(
        { workoutPlan: serializePlan(duplicated as unknown as Parameters<typeof serializePlan>[0]) },
        { status: 201 },
      );
    }

    if (input.action === "delete") {
      const workoutPlanId =
        typeof input.workoutPlanId === "string" ? input.workoutPlanId.trim() : "";
      if (!Types.ObjectId.isValid(workoutPlanId)) {
        return NextResponse.json({ error: "Valid workoutPlanId is required." }, { status: 400 });
      }
      const deleted = await WorkoutPlanModel.findOneAndDelete({ _id: workoutPlanId, gymId });
      if (!deleted) {
        return NextResponse.json(
          { error: "Workout plan was not found for this gym." },
          { status: 404 },
        );
      }
      await MemberModel.updateMany(
        { gymId, pendingWorkoutPlanId: deleted._id },
        {
          $set: {
            pendingWorkoutPlanId: null,
            pendingWorkoutAssignedAt: null,
            pendingWorkoutAssignedBy: "",
          },
        },
      );
      return NextResponse.json({ ok: true, deletedId: deleted._id.toString() });
    }

    if (input.action === "update") {
      const workoutPlanId =
        typeof input.workoutPlanId === "string" ? input.workoutPlanId.trim() : "";
      if (!Types.ObjectId.isValid(workoutPlanId)) {
        return NextResponse.json({ error: "Valid workoutPlanId is required." }, { status: 400 });
      }
      const existing = await WorkoutPlanModel.findOne({ _id: workoutPlanId, gymId });
      if (!existing) {
        return NextResponse.json(
          { error: "Workout plan was not found for this gym." },
          { status: 404 },
        );
      }
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const targetGoal = typeof input.targetGoal === "string" ? input.targetGoal.trim() : "";
      if (!title || !targetGoal || title.length > 80 || targetGoal.length > 80) {
        return NextResponse.json(
          { error: "title and targetGoal are required and must be 80 characters or fewer." },
          { status: 400 },
        );
      }
      const parsedEx = parsePlanExercises(input.exercises);
      if (!parsedEx.exercises) {
        return NextResponse.json({ error: parsedEx.error }, { status: 400 });
      }
      existing.title = title;
      existing.targetGoal = targetGoal;
      existing.set("scheduledDays", normalizeScheduledDays(input.scheduledDays));
      existing.set("exercises", parsedEx.exercises);
      await existing.save();
      return NextResponse.json({
        workoutPlan: serializePlan(existing as unknown as Parameters<typeof serializePlan>[0]),
      });
    }

    if (input.action !== "create") {
      return NextResponse.json(
        { error: "action must be create, update, duplicate, delete, assign, or upsert-exercise-media." },
        { status: 400 },
      );
    }
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const targetGoal = typeof input.targetGoal === "string" ? input.targetGoal.trim() : "";
    if (!title || !targetGoal || title.length > 80 || targetGoal.length > 80) {
      return NextResponse.json({ error: "title and targetGoal are required and must be 80 characters or fewer." }, { status: 400 });
    }
    const parsedEx = parsePlanExercises(input.exercises);
    if (!parsedEx.exercises) {
      return NextResponse.json({ error: parsedEx.error }, { status: 400 });
    }

    const plan = await WorkoutPlanModel.create({
      gymId,
      title,
      targetGoal,
      scheduledDays: normalizeScheduledDays(input.scheduledDays),
      createdByRole: "staff",
      createdByTrainerId: null,
      createdByName: userName || "Gym Staff",
      exercises: parsedEx.exercises,
      assignedMemberIds: [],
    });
    return NextResponse.json(
      { workoutPlan: serializePlan(plan as unknown as Parameters<typeof serializePlan>[0]) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save workout plan:", error);
    return NextResponse.json({ error: "Unable to save workout plan at this time." }, { status: 503 });
  }
}