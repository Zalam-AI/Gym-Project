import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import GymModel, {
  PLATFORM_BILLING_CYCLES,
  PLATFORM_BILLING_STATUSES,
  PLATFORM_PAYMENT_STATUSES,
  PLATFORM_PLAN_TIERS,
  type PlatformBillingCycle,
  type PlatformBillingStatus,
  type PlatformPaymentStatus,
  type PlatformPlanTier,
} from "../models/gym";
import MemberModel from "../models/member";
import SaasPlanModel from "../models/saas-plan";
import StaffUserModel from "../models/staff-user";
import TrainerModel from "../models/trainer";

export type PlanLimits = {
  maxMembers: number | null;
  maxStaff: number | null;
  maxTrainers: number | null;
};

export type DefaultSaasPlanSeed = {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  defaultGracePeriodDays: number;
  features: string[];
  limits: PlanLimits;
  sortOrder: number;
};

export const DEFAULT_SAAS_PLANS: readonly DefaultSaasPlanSeed[] = [
  {
    code: "trial",
    name: "Free Trial",
    description: "14-day evaluation workspace for newly onboarded clubs.",
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "EGP",
    defaultGracePeriodDays: 3,
    features: [
      "Isolated gym workspace & QR floor check-in",
      "Member directory & membership plans",
      "Mobile app workout player & progress tracking",
    ],
    limits: { maxMembers: 100, maxStaff: 5, maxTrainers: 5 },
    sortOrder: 1,
  },
  {
    code: "starter",
    name: "Starter Club",
    description: "Essential club management for single-floor neighborhood gyms.",
    monthlyPrice: 1800,
    annualPrice: 18000,
    currency: "EGP",
    defaultGracePeriodDays: 7,
    features: [
      "Up to 250 active & archived members",
      "Up to 8 staff accounts & 10 trainers",
      "QR check-in, mobile requests & revenue ledger",
      "Bilingual English & Arabic RTL interface",
    ],
    limits: { maxMembers: 250, maxStaff: 8, maxTrainers: 10 },
    sortOrder: 2,
  },
  {
    code: "growth",
    name: "Growth Pro",
    description: "Full-scale operations for high-traffic fitness & strength clubs.",
    monthlyPrice: 3800,
    annualPrice: 38000,
    currency: "EGP",
    defaultGracePeriodDays: 10,
    features: [
      "Up to 1,000 members & 25 staff accounts",
      "Up to 30 trainers with commission & session tracking",
      "Interactive mobile workout player, PRs & custom routines",
      "Custom club branding & priority platform support",
    ],
    limits: { maxMembers: 1000, maxStaff: 25, maxTrainers: 30 },
    sortOrder: 3,
  },
  {
    code: "enterprise",
    name: "Enterprise Unlimited",
    description: "Unlimited capacity, custom domain readiness & dedicated SLA.",
    monthlyPrice: 7500,
    annualPrice: 75000,
    currency: "EGP",
    defaultGracePeriodDays: 14,
    features: [
      "Unlimited members, staff accounts & trainers",
      "Custom domain & dedicated subdomain readiness",
      "Extended 14-day renewal grace period",
      "Dedicated onboarding & executive audit support",
    ],
    limits: { maxMembers: null, maxStaff: null, maxTrainers: null },
    sortOrder: 4,
  },
] as const;

const DEFAULT_PLANS_BY_CODE = new Map<string, DefaultSaasPlanSeed>(
  DEFAULT_SAAS_PLANS.map((plan) => [plan.code, plan]),
);

const VALID_PLAN_TIERS = new Set<string>(PLATFORM_PLAN_TIERS);
const VALID_BILLING_STATUSES = new Set<string>(PLATFORM_BILLING_STATUSES);
const VALID_BILLING_CYCLES = new Set<string>(PLATFORM_BILLING_CYCLES);
const VALID_PAYMENT_STATUSES = new Set<string>(PLATFORM_PAYMENT_STATUSES);

export type LeanSaasPlan = {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  defaultGracePeriodDays: number;
  features: string[];
  limits?: {
    maxMembers?: number | null;
    maxStaff?: number | null;
    maxTrainers?: number | null;
  } | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
};

let seededOncePromise: Promise<void> | null = null;

export async function ensureDefaultSaasPlans(): Promise<LeanSaasPlan[]> {
  const existingCount = await SaasPlanModel.countDocuments({});
  if (existingCount === 0) {
    if (!seededOncePromise) {
      seededOncePromise = (async () => {
        try {
          for (const seed of DEFAULT_SAAS_PLANS) {
            await SaasPlanModel.findOneAndUpdate(
              { code: seed.code },
              { $setOnInsert: seed },
              { upsert: true, new: true, runValidators: true },
            );
          }
        } finally {
          seededOncePromise = null;
        }
      })();
    }
    await seededOncePromise;
  }

  return SaasPlanModel.find({})
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean<LeanSaasPlan[]>();
}

export type RawPlatformSubscription = {
  planId?: Types.ObjectId | string | null;
  planCode?: string | null;
  planName?: string | null;
  planTier?: string | null;
  billingStatus?: string | null;
  paymentStatus?: string | null;
  billingCycle?: string | null;
  priceAmount?: number | null;
  startDate?: Date | string | null;
  expirationDate?: Date | string | null;
  renewalDate?: Date | string | null;
  gracePeriodDays?: number | null;
  autoSuspendOnExpire?: boolean | null;
  limitsOverride?: {
    maxMembers?: number | null;
    maxStaff?: number | null;
    maxTrainers?: number | null;
  } | null;
  notes?: string | null;
} | null | undefined;

export type SubscriptionLifecycleState =
  | "active"
  | "trialing"
  | "grace_period"
  | "expired"
  | "paused"
  | "canceled";

export type ComputedSubscriptionState = {
  planId: string | null;
  planCode: string;
  planName: string;
  planTier: PlatformPlanTier;
  billingStatus: PlatformBillingStatus;
  paymentStatus: PlatformPaymentStatus;
  billingCycle: PlatformBillingCycle;
  priceAmount: number;
  monthlyRecurringAmount: number;
  currency: string;
  startDate: Date | null;
  expirationDate: Date | null;
  renewalDate: Date | null;
  gracePeriodDays: number;
  graceEndsAt: Date | null;
  autoSuspendOnExpire: boolean;
  lifecycleState: SubscriptionLifecycleState;
  inGracePeriod: boolean;
  isExpired: boolean;
  accessAllowed: boolean;
  accessDeniedReason: string | null;
  limits: PlanLimits;
  notes: string;
};

function parseOptionalDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function normalizeLimit(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val) && val >= 1) {
    return Math.floor(val);
  }
  return null;
}

export function mapPlanCodeToLegacyTier(code: string, monthlyPrice = 0): PlatformPlanTier {
  const normalized = code.trim().toLowerCase();
  if (VALID_PLAN_TIERS.has(normalized)) {
    return normalized as PlatformPlanTier;
  }
  if (monthlyPrice <= 0) return "trial";
  if (monthlyPrice <= 2500) return "starter";
  if (monthlyPrice <= 5500) return "growth";
  return "enterprise";
}

export function computeSubscriptionState(
  raw: RawPlatformSubscription,
  options?: {
    plansByCode?: Map<string, LeanSaasPlan>;
    plansById?: Map<string, LeanSaasPlan>;
    gymStatus?: string;
    gymCurrency?: string;
    now?: Date;
  },
): ComputedSubscriptionState {
  const now = options?.now ?? new Date();
  const rawPlanId = raw?.planId ? String(raw.planId) : null;
  const matchedById =
    rawPlanId && options?.plansById ? options.plansById.get(rawPlanId) : undefined;

  const fallbackTier: PlatformPlanTier =
    raw?.planTier && VALID_PLAN_TIERS.has(raw.planTier)
      ? (raw.planTier as PlatformPlanTier)
      : "trial";

  const candidateCode = (
    matchedById?.code ||
    raw?.planCode?.trim().toLowerCase() ||
    fallbackTier
  ).toLowerCase();

  const matchedPlan =
    matchedById ??
    options?.plansByCode?.get(candidateCode) ??
    undefined;
  const seedFallback = DEFAULT_PLANS_BY_CODE.get(candidateCode) ?? DEFAULT_SAAS_PLANS[0];

  const planCode = matchedPlan?.code ?? candidateCode;
  const planName =
    raw?.planName?.trim() ||
    matchedPlan?.name ||
    seedFallback.name;
  const planTier = mapPlanCodeToLegacyTier(
    planCode,
    matchedPlan?.monthlyPrice ?? seedFallback.monthlyPrice,
  );

  const billingStatus: PlatformBillingStatus =
    raw?.billingStatus && VALID_BILLING_STATUSES.has(raw.billingStatus)
      ? (raw.billingStatus as PlatformBillingStatus)
      : planCode === "trial"
        ? "trialing"
        : "active";

  const billingCycle: PlatformBillingCycle =
    raw?.billingCycle && VALID_BILLING_CYCLES.has(raw.billingCycle)
      ? (raw.billingCycle as PlatformBillingCycle)
      : "monthly";

  const defaultPlanPrice =
    billingCycle === "annual"
      ? (matchedPlan?.annualPrice ?? seedFallback.annualPrice)
      : (matchedPlan?.monthlyPrice ?? seedFallback.monthlyPrice);

  const priceAmount =
    typeof raw?.priceAmount === "number" && Number.isFinite(raw.priceAmount) && raw.priceAmount >= 0
      ? raw.priceAmount
      : defaultPlanPrice;

  const currency =
    matchedPlan?.currency ||
    options?.gymCurrency?.trim().toUpperCase() ||
    seedFallback.currency ||
    "EGP";

  const startDate = parseOptionalDate(raw?.startDate);
  const expirationDate =
    parseOptionalDate(raw?.expirationDate) ?? parseOptionalDate(raw?.renewalDate);
  const gracePeriodDays =
    typeof raw?.gracePeriodDays === "number" &&
    Number.isFinite(raw.gracePeriodDays) &&
    raw.gracePeriodDays >= 0
      ? Math.min(90, Math.floor(raw.gracePeriodDays))
      : (matchedPlan?.defaultGracePeriodDays ?? seedFallback.defaultGracePeriodDays);

  const autoSuspendOnExpire = raw?.autoSuspendOnExpire !== false;

  let endOfExpiry: Date | null = null;
  let graceEndsAt: Date | null = null;
  if (expirationDate) {
    endOfExpiry = endOfUtcDay(expirationDate);
    graceEndsAt = new Date(endOfExpiry.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
  }

  const pastExpiryDate = endOfExpiry ? now.getTime() > endOfExpiry.getTime() : false;
  const pastGraceWindow = graceEndsAt ? now.getTime() > graceEndsAt.getTime() : false;

  const rawPaymentStatus: PlatformPaymentStatus =
    raw?.paymentStatus && VALID_PAYMENT_STATUSES.has(raw.paymentStatus)
      ? (raw.paymentStatus as PlatformPaymentStatus)
      : billingStatus === "active"
        ? "paid"
        : billingStatus === "past_due"
          ? "past_due"
          : "trialing";

  const isExpired =
    pastGraceWindow ||
    rawPaymentStatus === "expired" ||
    billingStatus === "canceled";
  const inGracePeriod = !isExpired && pastExpiryDate;

  let lifecycleState: SubscriptionLifecycleState = "active";
  if (billingStatus === "canceled") {
    lifecycleState = "canceled";
  } else if (billingStatus === "paused") {
    lifecycleState = "paused";
  } else if (isExpired) {
    lifecycleState = "expired";
  } else if (inGracePeriod) {
    lifecycleState = "grace_period";
  } else if (billingStatus === "trialing") {
    lifecycleState = "trialing";
  } else {
    lifecycleState = "active";
  }

  let effectivePaymentStatus: PlatformPaymentStatus = rawPaymentStatus;
  if (isExpired && rawPaymentStatus !== "waived") {
    effectivePaymentStatus = "expired";
  } else if (inGracePeriod && rawPaymentStatus !== "waived") {
    effectivePaymentStatus = "grace_period";
  }

  let accessAllowed = true;
  let accessDeniedReason: string | null = null;
  if (options?.gymStatus === "pending") {
    accessAllowed = false;
    accessDeniedReason = "This gym workspace is awaiting platform administrator approval.";
  } else if (options?.gymStatus === "suspended") {
    accessAllowed = false;
    accessDeniedReason = "This gym workspace is currently suspended.";
  } else if (billingStatus === "paused") {
    accessAllowed = false;
    accessDeniedReason = "This gym workspace subscription is currently paused by platform administration.";
  } else if (billingStatus === "canceled") {
    accessAllowed = false;
    accessDeniedReason = "This gym workspace subscription has been canceled.";
  } else if (isExpired && autoSuspendOnExpire && rawPaymentStatus !== "waived") {
    accessAllowed = false;
    accessDeniedReason =
      "This gym workspace subscription has expired past its grace period. Please contact platform administration to renew.";
  }

  const baseLimits: PlanLimits = {
    maxMembers: normalizeLimit(matchedPlan?.limits?.maxMembers ?? seedFallback.limits.maxMembers),
    maxStaff: normalizeLimit(matchedPlan?.limits?.maxStaff ?? seedFallback.limits.maxStaff),
    maxTrainers: normalizeLimit(
      matchedPlan?.limits?.maxTrainers ?? seedFallback.limits.maxTrainers,
    ),
  };

  const override = raw?.limitsOverride;
  const effectiveLimits: PlanLimits = {
    maxMembers:
      override?.maxMembers !== undefined && override?.maxMembers !== null
        ? normalizeLimit(override.maxMembers)
        : baseLimits.maxMembers,
    maxStaff:
      override?.maxStaff !== undefined && override?.maxStaff !== null
        ? normalizeLimit(override.maxStaff)
        : baseLimits.maxStaff,
    maxTrainers:
      override?.maxTrainers !== undefined && override?.maxTrainers !== null
        ? normalizeLimit(override.maxTrainers)
        : baseLimits.maxTrainers,
  };

  // Monthly Recurring Revenue (MRR) contribution for active/grace paid subscriptions on active gyms
  const gymIsActive = !options?.gymStatus || options.gymStatus === "active";
  const countsTowardMrr =
    gymIsActive &&
    accessAllowed &&
    (lifecycleState === "active" || lifecycleState === "grace_period") &&
    priceAmount > 0;

  let monthlyRecurringAmount = 0;
  if (countsTowardMrr) {
    monthlyRecurringAmount =
      billingCycle === "annual" ? Math.round((priceAmount / 12) * 100) / 100 : priceAmount;
  }

  return {
    planId: matchedPlan ? String(matchedPlan._id) : rawPlanId,
    planCode,
    planName,
    planTier,
    billingStatus,
    paymentStatus: effectivePaymentStatus,
    billingCycle,
    priceAmount,
    monthlyRecurringAmount,
    currency,
    startDate,
    expirationDate,
    renewalDate: expirationDate,
    gracePeriodDays,
    graceEndsAt,
    autoSuspendOnExpire,
    lifecycleState,
    inGracePeriod,
    isExpired,
    accessAllowed,
    accessDeniedReason,
    limits: effectiveLimits,
    notes: raw?.notes?.trim() ?? "",
  };
}

export async function enforceGymPlanLimit(
  gymId: Types.ObjectId,
  resource: "members" | "staff" | "trainers",
): Promise<
  | { allowed: true; current: number; limit: number | null; planName: string }
  | { allowed: false; current: number; limit: number; planName: string; error: string }
> {
  const [gym, plans, current] = await Promise.all([
    GymModel.findById(gymId)
      .select("status currency platformSubscription")
      .lean<{
        status?: string;
        currency?: string;
        platformSubscription?: RawPlatformSubscription;
      } | null>(),
    ensureDefaultSaasPlans(),
    resource === "members"
      ? MemberModel.countDocuments({ gymId })
      : resource === "staff"
        ? StaffUserModel.countDocuments({ gymId, status: "active" })
        : TrainerModel.countDocuments({ gymId }),
  ]);

  if (!gym) {
    return {
      allowed: false,
      current,
      limit: 0,
      planName: "Unknown",
      error: "Gym workspace was not found.",
    };
  }

  const plansByCode = new Map(plans.map((p) => [p.code, p]));
  const plansById = new Map(plans.map((p) => [String(p._id), p]));
  const sub = computeSubscriptionState(gym.platformSubscription, {
    plansByCode,
    plansById,
    gymStatus: gym.status,
    gymCurrency: gym.currency,
  });

  const limit =
    resource === "members"
      ? sub.limits.maxMembers
      : resource === "staff"
        ? sub.limits.maxStaff
        : sub.limits.maxTrainers;

  if (limit !== null && current >= limit) {
    const label =
      resource === "members"
        ? "members"
        : resource === "staff"
          ? "active staff accounts"
          : "trainers";
    return {
      allowed: false,
      current,
      limit,
      planName: sub.planName,
      error: `Plan limit reached: your "${sub.planName}" subscription allows up to ${limit} ${label} (currently ${current}). Please contact platform administration to upgrade your plan.`,
    };
  }

  return {
    allowed: true,
    current,
    limit,
    planName: sub.planName,
  };
}

export function generateSaasReceiptNumber(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `LC-${y}${m}${d}-${suffix}`;
}
