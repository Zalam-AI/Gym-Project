import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { slugifyGymName } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import {
  ensureDefaultSaasPlans,
  type LeanSaasPlan,
} from "gymos-admin-backend/lib/saas-enforcement";
import GymModel from "gymos-admin-backend/models/gym";
import SaasPlanModel from "gymos-admin-backend/models/saas-plan";
import { recordPlatformAudit, requirePlatformAdmin } from "@/lib/platform-context";

export const runtime = "nodejs";

function parsePlanLimitInput(raw: unknown, maxAllowed: number): number | null {
  if (raw === null || raw === undefined || raw === "" || raw === 0 || raw === "0") {
    return null;
  }
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > maxAllowed) {
    return NaN;
  }
  return Math.floor(num);
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((item) => item.slice(0, 140));
}

function serializePlan(plan: LeanSaasPlan, assignedGymCount: number) {
  return {
    id: String(plan._id),
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice,
    currency: plan.currency || "EGP",
    defaultGracePeriodDays: plan.defaultGracePeriodDays ?? 7,
    features: plan.features ?? [],
    limits: {
      maxMembers: plan.limits?.maxMembers ?? null,
      maxStaff: plan.limits?.maxStaff ?? null,
      maxTrainers: plan.limits?.maxTrainers ?? null,
    },
    isActive: plan.isActive !== false,
    sortOrder: plan.sortOrder ?? 0,
    assignedGymCount,
    createdAt: plan.createdAt ? new Date(plan.createdAt).toISOString() : null,
    updatedAt: plan.updatedAt ? new Date(plan.updatedAt).toISOString() : null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request, "gyms:read");
    if (auth.response) return auth.response;

    await connectToDatabase();
    const [plans, gyms] = await Promise.all([
      ensureDefaultSaasPlans(),
      GymModel.find({})
        .select("platformSubscription")
        .lean<
          Array<{
            platformSubscription?: {
              planId?: Types.ObjectId | null;
              planCode?: string | null;
              planTier?: string | null;
            } | null;
          }>
        >(),
    ]);

    const countByCode = new Map<string, number>();
    const plansById = new Map(plans.map((p) => [String(p._id), p.code]));
    for (const gym of gyms) {
      const pid = gym.platformSubscription?.planId
        ? String(gym.platformSubscription.planId)
        : "";
      const code =
        (pid && plansById.get(pid)) ||
        gym.platformSubscription?.planCode?.trim().toLowerCase() ||
        gym.platformSubscription?.planTier?.trim().toLowerCase() ||
        "trial";
      countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
    }

    return NextResponse.json({
      plans: plans.map((plan) => serializePlan(plan, countByCode.get(plan.code) ?? 0)),
    });
  } catch (error) {
    console.error("Failed to list SaaS subscription plans:", error);
    return NextResponse.json(
      { error: "Unable to load SaaS plans right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request, "gyms:write");
  if (auth.response) return auth.response;
  const { ctx } = auth;

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

  try {
    await connectToDatabase();
    await ensureDefaultSaasPlans();

    if (action === "create-plan") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { error: "Plan name must be between 2 and 80 characters." },
          { status: 400 },
        );
      }

      const rawCode =
        typeof input.code === "string" && input.code.trim()
          ? input.code.trim().toLowerCase()
          : slugifyGymName(name).slice(0, 48);

      if (!rawCode || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawCode) || rawCode.length > 48) {
        return NextResponse.json(
          { error: "Plan code must use lowercase letters, numbers, and hyphens (max 48 chars)." },
          { status: 400 },
        );
      }

      const exists = await SaasPlanModel.exists({ code: rawCode });
      if (exists) {
        return NextResponse.json(
          { error: `A SaaS plan with code "${rawCode}" already exists.` },
          { status: 409 },
        );
      }

      const monthlyPrice = Number(input.monthlyPrice ?? 0);
      const annualPrice =
        input.annualPrice !== undefined && input.annualPrice !== ""
          ? Number(input.annualPrice)
          : monthlyPrice * 10;

      if (
        !Number.isFinite(monthlyPrice) ||
        monthlyPrice < 0 ||
        monthlyPrice > 10_000_000 ||
        !Number.isFinite(annualPrice) ||
        annualPrice < 0 ||
        annualPrice > 100_000_000
      ) {
        return NextResponse.json(
          { error: "Enter valid non-negative monthly and annual prices." },
          { status: 400 },
        );
      }

      const currency =
        typeof input.currency === "string" && input.currency.trim()
          ? input.currency.trim().toUpperCase().slice(0, 8)
          : "EGP";

      const defaultGracePeriodDays =
        input.defaultGracePeriodDays !== undefined
          ? Math.floor(Number(input.defaultGracePeriodDays))
          : 7;
      if (
        !Number.isFinite(defaultGracePeriodDays) ||
        defaultGracePeriodDays < 0 ||
        defaultGracePeriodDays > 90
      ) {
        return NextResponse.json(
          { error: "Default grace period must be between 0 and 90 days." },
          { status: 400 },
        );
      }

      const rawLimits =
        input.limits && typeof input.limits === "object" && !Array.isArray(input.limits)
          ? (input.limits as Record<string, unknown>)
          : {};
      const maxMembers = parsePlanLimitInput(
        rawLimits.maxMembers ?? input.maxMembers,
        1_000_000,
      );
      const maxStaff = parsePlanLimitInput(rawLimits.maxStaff ?? input.maxStaff, 10_000);
      const maxTrainers = parsePlanLimitInput(
        rawLimits.maxTrainers ?? input.maxTrainers,
        10_000,
      );

      if (Number.isNaN(maxMembers) || Number.isNaN(maxStaff) || Number.isNaN(maxTrainers)) {
        return NextResponse.json(
          {
            error:
              "Plan limits must be positive whole numbers or left blank for unlimited.",
          },
          { status: 400 },
        );
      }

      const description =
        typeof input.description === "string" ? input.description.trim().slice(0, 280) : "";
      const features = normalizeFeatures(input.features);
      const isActive = input.isActive !== false;
      const planCount = await SaasPlanModel.countDocuments({});

      const created = await SaasPlanModel.create({
        code: rawCode,
        name,
        description,
        monthlyPrice,
        annualPrice,
        currency,
        defaultGracePeriodDays,
        features,
        limits: { maxMembers, maxStaff, maxTrainers },
        isActive,
        sortOrder: planCount + 1,
      });

      await recordPlatformAudit(ctx, request, {
        action: "saas_plan.created",
        targetType: "saas_plan",
        targetId: created._id.toString(),
        targetLabel: created.name,
        summary: `Created SaaS subscription plan "${created.name}" (${created.code}, ${monthlyPrice} ${currency}/mo).`,
        metadata: {
          code: created.code,
          monthlyPrice,
          annualPrice,
          limits: { maxMembers, maxStaff, maxTrainers },
        },
      });

      return NextResponse.json(
        {
          plan: serializePlan(created.toObject() as unknown as LeanSaasPlan, 0),
        },
        { status: 201 },
      );
    }

    if (action === "update-plan") {
      const planId = typeof input.planId === "string" ? input.planId.trim() : "";
      if (!Types.ObjectId.isValid(planId)) {
        return NextResponse.json({ error: "Valid planId is required." }, { status: 400 });
      }

      const existing = await SaasPlanModel.findById(planId);
      if (!existing) {
        return NextResponse.json({ error: "SaaS plan was not found." }, { status: 404 });
      }

      const name =
        typeof input.name === "string" ? input.name.trim() : existing.name;
      if (!name || name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { error: "Plan name must be between 2 and 80 characters." },
          { status: 400 },
        );
      }

      const monthlyPrice =
        input.monthlyPrice !== undefined ? Number(input.monthlyPrice) : existing.monthlyPrice;
      const annualPrice =
        input.annualPrice !== undefined ? Number(input.annualPrice) : existing.annualPrice;

      if (
        !Number.isFinite(monthlyPrice) ||
        monthlyPrice < 0 ||
        monthlyPrice > 10_000_000 ||
        !Number.isFinite(annualPrice) ||
        annualPrice < 0 ||
        annualPrice > 100_000_000
      ) {
        return NextResponse.json(
          { error: "Enter valid non-negative monthly and annual prices." },
          { status: 400 },
        );
      }

      const defaultGracePeriodDays =
        input.defaultGracePeriodDays !== undefined
          ? Math.floor(Number(input.defaultGracePeriodDays))
          : existing.defaultGracePeriodDays;
      if (
        !Number.isFinite(defaultGracePeriodDays) ||
        defaultGracePeriodDays < 0 ||
        defaultGracePeriodDays > 90
      ) {
        return NextResponse.json(
          { error: "Default grace period must be between 0 and 90 days." },
          { status: 400 },
        );
      }

      const rawLimits =
        input.limits && typeof input.limits === "object" && !Array.isArray(input.limits)
          ? (input.limits as Record<string, unknown>)
          : null;

      const maxMembers =
        rawLimits || "maxMembers" in input
          ? parsePlanLimitInput(rawLimits?.maxMembers ?? input.maxMembers, 1_000_000)
          : (existing.limits?.maxMembers ?? null);
      const maxStaff =
        rawLimits || "maxStaff" in input
          ? parsePlanLimitInput(rawLimits?.maxStaff ?? input.maxStaff, 10_000)
          : (existing.limits?.maxStaff ?? null);
      const maxTrainers =
        rawLimits || "maxTrainers" in input
          ? parsePlanLimitInput(rawLimits?.maxTrainers ?? input.maxTrainers, 10_000)
          : (existing.limits?.maxTrainers ?? null);

      if (Number.isNaN(maxMembers) || Number.isNaN(maxStaff) || Number.isNaN(maxTrainers)) {
        return NextResponse.json(
          {
            error:
              "Plan limits must be positive whole numbers or left blank for unlimited.",
          },
          { status: 400 },
        );
      }

      existing.name = name;
      if (typeof input.description === "string") {
        existing.description = input.description.trim().slice(0, 280);
      }
      if (typeof input.currency === "string" && input.currency.trim()) {
        existing.currency = input.currency.trim().toUpperCase().slice(0, 8);
      }
      existing.monthlyPrice = monthlyPrice;
      existing.annualPrice = annualPrice;
      existing.defaultGracePeriodDays = defaultGracePeriodDays;
      if (Array.isArray(input.features)) {
        existing.features = normalizeFeatures(input.features);
      }
      existing.limits = { maxMembers, maxStaff, maxTrainers };
      if (typeof input.isActive === "boolean") {
        existing.isActive = input.isActive;
      }

      await existing.save();

      await recordPlatformAudit(ctx, request, {
        action: "saas_plan.updated",
        targetType: "saas_plan",
        targetId: existing._id.toString(),
        targetLabel: existing.name,
        summary: `Updated SaaS subscription plan "${existing.name}" (${monthlyPrice} ${existing.currency}/mo).`,
        metadata: {
          code: existing.code,
          monthlyPrice,
          annualPrice,
          isActive: existing.isActive,
          limits: { maxMembers, maxStaff, maxTrainers },
        },
      });

      return NextResponse.json({
        plan: serializePlan(existing.toObject() as unknown as LeanSaasPlan, 0),
      });
    }

    return NextResponse.json({ error: "Unsupported plan action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to manage SaaS plan:", error);
    return NextResponse.json(
      { error: "Unable to save SaaS plan right now." },
      { status: 503 },
    );
  }
}
