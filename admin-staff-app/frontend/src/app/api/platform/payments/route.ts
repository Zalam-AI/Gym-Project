import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import {
  computeSubscriptionState,
  ensureDefaultSaasPlans,
  generateSaasReceiptNumber,
  mapPlanCodeToLegacyTier,
  type RawPlatformSubscription,
} from "gymos-admin-backend/lib/saas-enforcement";
import GymModel from "gymos-admin-backend/models/gym";
import SaasPaymentModel, {
  SAAS_BILLING_CYCLES,
  SAAS_PAYMENT_METHODS,
  SAAS_PAYMENT_RECORD_STATUSES,
  type SaasBillingCycle,
  type SaasPaymentMethod,
  type SaasPaymentRecordStatus,
} from "gymos-admin-backend/models/saas-payment";
import { recordPlatformAudit, requirePlatformAdmin } from "@/lib/platform-context";

export const runtime = "nodejs";

const VALID_METHODS = new Set<string>(SAAS_PAYMENT_METHODS);
const VALID_STATUSES = new Set<string>(SAAS_PAYMENT_RECORD_STATUSES);
const VALID_CYCLES = new Set<string>(SAAS_BILLING_CYCLES);

type LeanPaymentDoc = {
  _id: Types.ObjectId;
  gymId: Types.ObjectId;
  planId?: Types.ObjectId | null;
  planCode?: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  receiptNumber: string;
  referenceNote?: string;
  recordedByName: string;
  recordedByEmail: string;
  createdAt?: Date;
};

export async function GET(request: Request) {
  try {
    const auth = await requirePlatformAdmin(request, "gyms:read");
    if (auth.response) return auth.response;

    await connectToDatabase();
    const url = new URL(request.url);
    const gymIdParam = url.searchParams.get("gymId")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitParam) ? Math.min(250, Math.max(1, Math.floor(limitParam))) : 100;

    const filter: Record<string, unknown> = {};
    if (gymIdParam) {
      if (!Types.ObjectId.isValid(gymIdParam)) {
        return NextResponse.json({ error: "Invalid gymId filter." }, { status: 400 });
      }
      filter.gymId = new Types.ObjectId(gymIdParam);
    }

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [payments, gyms, paidTotals, monthTotals] = await Promise.all([
      SaasPaymentModel.find(filter)
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(limit)
        .lean<LeanPaymentDoc[]>(),
      GymModel.find(filter.gymId ? { _id: filter.gymId } : {})
        .select("name slug")
        .lean<Array<{ _id: Types.ObjectId; name: string; slug: string }>>(),
      SaasPaymentModel.aggregate<{ total: number }>([
        { $match: { ...filter, paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      SaasPaymentModel.aggregate<{ total: number }>([
        {
          $match: {
            ...filter,
            paymentStatus: "paid",
            paidAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const gymMap = new Map(gyms.map((g) => [String(g._id), g]));

    return NextResponse.json({
      totals: {
        totalCollected: paidTotals[0]?.total ?? 0,
        collectedThisMonth: monthTotals[0]?.total ?? 0,
      },
      payments: payments.map((p) => {
        const gym = gymMap.get(String(p.gymId));
        return {
          id: String(p._id),
          gymId: String(p.gymId),
          gymName: gym?.name ?? "Gym Workspace",
          gymSlug: gym?.slug ?? "",
          planId: p.planId ? String(p.planId) : null,
          planCode: p.planCode ?? "",
          planName: p.planName,
          amount: p.amount,
          currency: p.currency || "EGP",
          billingCycle: p.billingCycle,
          paymentMethod: p.paymentMethod,
          paymentStatus: p.paymentStatus,
          paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
          periodStart: p.periodStart ? new Date(p.periodStart).toISOString() : null,
          periodEnd: p.periodEnd ? new Date(p.periodEnd).toISOString() : null,
          receiptNumber: p.receiptNumber,
          referenceNote: p.referenceNote ?? "",
          recordedByName: p.recordedByName,
          recordedByEmail: p.recordedByEmail,
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to list SaaS manual payments:", error);
    return NextResponse.json(
      { error: "Unable to load SaaS payment records right now." },
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

  const action = typeof input.action === "string" ? input.action : "record-payment";

  try {
    await connectToDatabase();

    if (action === "record-payment") {
      const gymId = typeof input.gymId === "string" ? input.gymId.trim() : "";
      if (!Types.ObjectId.isValid(gymId)) {
        return NextResponse.json({ error: "Valid gymId is required." }, { status: 400 });
      }

      const gym = await GymModel.findById(gymId).select(
        "name slug status currency platformSubscription",
      );
      if (!gym) {
        return NextResponse.json({ error: "Target gym was not found." }, { status: 404 });
      }

      const plans = await ensureDefaultSaasPlans();
      const plansByCode = new Map(plans.map((p) => [p.code, p]));
      const plansById = new Map(plans.map((p) => [String(p._id), p]));

      const currentSub = computeSubscriptionState(
        gym.platformSubscription as RawPlatformSubscription,
        {
          plansByCode,
          plansById,
          gymStatus: gym.status,
          gymCurrency: gym.currency,
        },
      );

      const requestedPlanId =
        typeof input.planId === "string" && Types.ObjectId.isValid(input.planId.trim())
          ? input.planId.trim()
          : "";
      const requestedPlanCode =
        typeof input.planCode === "string" && input.planCode.trim()
          ? input.planCode.trim().toLowerCase()
          : "";

      const selectedPlan =
        (requestedPlanId ? plansById.get(requestedPlanId) : undefined) ??
        (requestedPlanCode ? plansByCode.get(requestedPlanCode) : undefined) ??
        plansByCode.get(currentSub.planCode);

      const billingCycle: SaasBillingCycle =
        typeof input.billingCycle === "string" && VALID_CYCLES.has(input.billingCycle)
          ? (input.billingCycle as SaasBillingCycle)
          : currentSub.billingCycle;

      const defaultAmount = selectedPlan
        ? billingCycle === "annual"
          ? selectedPlan.annualPrice
          : selectedPlan.monthlyPrice
        : currentSub.priceAmount;

      const amount =
        input.amount !== undefined && input.amount !== ""
          ? Number(input.amount)
          : defaultAmount;

      if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
        return NextResponse.json(
          { error: "Enter a valid non-negative payment amount." },
          { status: 400 },
        );
      }

      const paymentMethod: SaasPaymentMethod =
        typeof input.paymentMethod === "string" && VALID_METHODS.has(input.paymentMethod)
          ? (input.paymentMethod as SaasPaymentMethod)
          : "Cash";

      const paymentStatus: SaasPaymentRecordStatus =
        typeof input.paymentStatus === "string" && VALID_STATUSES.has(input.paymentStatus)
          ? (input.paymentStatus as SaasPaymentRecordStatus)
          : "paid";

      const paidAt =
        typeof input.paidAt === "string" && input.paidAt.trim()
          ? new Date(input.paidAt.trim())
          : new Date();
      if (Number.isNaN(paidAt.getTime())) {
        return NextResponse.json({ error: "paidAt must be a valid date." }, { status: 400 });
      }

      const extendSubscription = input.extendSubscription !== false;
      const defaultMonths = billingCycle === "annual" ? 12 : 1;
      const extensionMonthsRaw =
        input.extensionMonths !== undefined ? Number(input.extensionMonths) : defaultMonths;
      const extensionMonths =
        Number.isFinite(extensionMonthsRaw) && extensionMonthsRaw >= 1 && extensionMonthsRaw <= 60
          ? Math.floor(extensionMonthsRaw)
          : defaultMonths;

      const now = new Date();
      const baseStart =
        currentSub.expirationDate && currentSub.expirationDate.getTime() > now.getTime()
          ? new Date(currentSub.expirationDate)
          : now;

      let periodStart: Date | null = null;
      let periodEnd: Date | null = null;

      if (extendSubscription && paymentStatus === "paid") {
        periodStart = baseStart;
        if (typeof input.newExpirationDate === "string" && input.newExpirationDate.trim()) {
          const explicitEnd = new Date(input.newExpirationDate.trim());
          if (Number.isNaN(explicitEnd.getTime())) {
            return NextResponse.json(
              { error: "newExpirationDate must be a valid ISO date." },
              { status: 400 },
            );
          }
          periodEnd = explicitEnd;
        } else {
          const computedEnd = new Date(baseStart);
          computedEnd.setUTCMonth(computedEnd.getUTCMonth() + extensionMonths);
          periodEnd = computedEnd;
        }
      }

      const currency =
        (typeof input.currency === "string" && input.currency.trim()
          ? input.currency.trim().toUpperCase().slice(0, 8)
          : "") ||
        selectedPlan?.currency ||
        gym.currency ||
        "EGP";

      const planCode = selectedPlan?.code ?? (requestedPlanCode || currentSub.planCode);
      const planName =
        (typeof input.planName === "string" && input.planName.trim()) ||
        selectedPlan?.name ||
        currentSub.planName;
      const receiptNumber =
        typeof input.receiptNumber === "string" && input.receiptNumber.trim()
          ? input.receiptNumber.trim().slice(0, 48)
          : generateSaasReceiptNumber(paidAt);
      const referenceNote =
        typeof input.referenceNote === "string"
          ? input.referenceNote.trim().slice(0, 500)
          : "";

      const paymentDoc = await SaasPaymentModel.create({
        gymId: gym._id,
        planId: selectedPlan?._id ?? null,
        planCode,
        planName,
        amount,
        currency,
        billingCycle,
        paymentMethod,
        paymentStatus,
        paidAt,
        periodStart,
        periodEnd,
        receiptNumber,
        referenceNote,
        recordedByAdminId: ctx.adminId,
        recordedByName: ctx.fullName,
        recordedByEmail: ctx.email,
      });

      const reactivateIfSuspended = input.reactivateIfSuspended === true;
      if (paymentStatus === "paid" && extendSubscription && periodEnd) {
        const legacyTier = mapPlanCodeToLegacyTier(planCode, selectedPlan?.monthlyPrice ?? amount);
        const setUpdate: Record<string, unknown> = {
          "platformSubscription.planId": selectedPlan?._id ?? null,
          "platformSubscription.planCode": planCode,
          "platformSubscription.planName": planName,
          "platformSubscription.planTier": legacyTier,
          "platformSubscription.billingStatus": "active",
          "platformSubscription.paymentStatus": "paid",
          "platformSubscription.billingCycle": billingCycle,
          "platformSubscription.priceAmount": amount,
          "platformSubscription.startDate": currentSub.startDate ?? now,
          "platformSubscription.expirationDate": periodEnd,
          "platformSubscription.renewalDate": periodEnd,
          "platformSubscription.gracePeriodDays":
            selectedPlan?.defaultGracePeriodDays ?? currentSub.gracePeriodDays,
        };
        if (reactivateIfSuspended && gym.status === "suspended") {
          setUpdate.status = "active";
          setUpdate.statusNote = "Reactivated upon manual SaaS subscription renewal.";
        }
        await GymModel.updateOne({ _id: gym._id }, { $set: setUpdate });
      } else if (paymentStatus === "pending") {
        await GymModel.updateOne(
          { _id: gym._id },
          { $set: { "platformSubscription.paymentStatus": "pending" } },
        );
      }

      await recordPlatformAudit(ctx, request, {
        action: "saas_payment.recorded",
        targetType: "saas_payment",
        targetId: paymentDoc._id.toString(),
        targetLabel: `${gym.name} (${receiptNumber})`,
        summary: `Recorded manual SaaS payment of ${amount} ${currency} via ${paymentMethod} for "${gym.name}" (${planName}, ${paymentStatus})${
          periodEnd ? ` — renewed through ${periodEnd.toISOString().slice(0, 10)}` : ""
        }.`,
        metadata: {
          gymId: gym._id.toString(),
          gymSlug: gym.slug,
          amount,
          currency,
          paymentMethod,
          paymentStatus,
          receiptNumber,
          periodEnd: periodEnd ? periodEnd.toISOString() : null,
        },
      });

      return NextResponse.json(
        {
          payment: {
            id: paymentDoc._id.toString(),
            gymId: gym._id.toString(),
            gymName: gym.name,
            planCode,
            planName,
            amount,
            currency,
            billingCycle,
            paymentMethod,
            paymentStatus,
            paidAt: paidAt.toISOString(),
            periodStart: periodStart ? periodStart.toISOString() : null,
            periodEnd: periodEnd ? periodEnd.toISOString() : null,
            receiptNumber,
            referenceNote,
          },
        },
        { status: 201 },
      );
    }

    if (action === "update-payment-status") {
      const paymentId = typeof input.paymentId === "string" ? input.paymentId.trim() : "";
      const paymentStatus =
        typeof input.paymentStatus === "string" ? input.paymentStatus.trim() : "";

      if (!Types.ObjectId.isValid(paymentId) || !VALID_STATUSES.has(paymentStatus)) {
        return NextResponse.json(
          { error: "Valid paymentId and paymentStatus (paid, pending, refunded, void) are required." },
          { status: 400 },
        );
      }

      const updated = await SaasPaymentModel.findOneAndUpdate(
        { _id: new Types.ObjectId(paymentId) },
        { $set: { paymentStatus } },
        { new: true },
      );
      if (!updated) {
        return NextResponse.json({ error: "Payment record was not found." }, { status: 404 });
      }

      await recordPlatformAudit(ctx, request, {
        action: "saas_payment.status_updated",
        targetType: "saas_payment",
        targetId: updated._id.toString(),
        targetLabel: updated.receiptNumber,
        summary: `Updated payment ${updated.receiptNumber} status to "${paymentStatus}".`,
        metadata: { paymentStatus },
      });

      return NextResponse.json({
        payment: {
          id: updated._id.toString(),
          receiptNumber: updated.receiptNumber,
          paymentStatus: updated.paymentStatus,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported payment action." }, { status: 400 });
  } catch (error) {
    console.error("Failed to record manual SaaS payment:", error);
    return NextResponse.json(
      { error: "Unable to record SaaS payment right now." },
      { status: 503 },
    );
  }
}
