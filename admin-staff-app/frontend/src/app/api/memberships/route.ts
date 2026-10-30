import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipPlanModel from "gymos-admin-backend/models/membership-plan";
import PaymentModel from "gymos-admin-backend/models/payment";
import { requireStaffContext } from "@/lib/gym-context";

export const runtime = "nodejs";

const paymentStatuses = ["Paid", "Pending"] as const;
type PaymentStatus = (typeof paymentStatuses)[number];

function getUtcToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function durationInMonths(startDate: Date, expiryDate: Date) {
  let months = (expiryDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12;
  months += expiryDate.getUTCMonth() - startDate.getUTCMonth();
  if (expiryDate.getUTCDate() < startDate.getUTCDate()) months -= 1;
  return Math.max(1, months);
}

function serializePlan(plan: {
  _id: Types.ObjectId;
  name: string;
  price: number;
  durationMonths: number;
  benefits: string[];
  featured: boolean;
}) {
  return {
    id: plan._id.toString(),
    name: plan.name,
    price: plan.price,
    durationMonths: plan.durationMonths,
    durationLabel: `${plan.durationMonths} ${plan.durationMonths === 1 ? "month" : "months"}`,
    benefits: plan.benefits,
    featured: plan.featured,
  };
}

export async function GET(request: Request) {
  const auth = await requireStaffContext(request);
  if (auth.response) {
    return auth.response;
  }
  const { gymId } = auth.ctx;

  try {
    await connectToDatabase();

    const [plans, memberships] = await Promise.all([
      MembershipPlanModel.find({ gymId, active: true }).sort({ createdAt: 1 }),
      MembershipModel.find({ gymId })
        .populate({
          path: "memberId",
          model: MemberModel,
          match: { gymId },
          select: "fullName status",
        })
        .sort({ expiryDate: 1 })
        .lean(),
    ]);

    // Keep latest membership per member so expired memberships can also be renewed from the table!
    const latestByMember = new Map<string, (typeof memberships)[number]>();
    for (const membership of [...memberships].sort(
      (a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime(),
    )) {
      const member = membership.memberId as unknown as { _id: Types.ObjectId } | null;
      if (!member) continue;
      const memberId = member._id.toString();
      if (!latestByMember.has(memberId)) {
        latestByMember.set(memberId, membership);
      }
    }
    const visibleMemberships = [...latestByMember.values()].sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );

    const memberIds = visibleMemberships.map((membership) => (membership.memberId as unknown as { _id: Types.ObjectId })._id);
    const payments = memberIds.length
      ? await PaymentModel.find({ gymId, memberId: { $in: memberIds } }).sort({ date: -1 })
      : [];
    const paymentStatusByMember = new Map<string, PaymentStatus>();
    for (const payment of payments) {
      const memberId = payment.memberId.toString();
      if (!paymentStatusByMember.has(memberId)) {
        paymentStatusByMember.set(memberId, payment.status === "Paid" ? "Paid" : "Pending");
      }
    }

    const planByName = new Map(plans.map((plan) => [plan.name, serializePlan(plan)]));
    for (const membership of visibleMemberships) {
      const member = membership.memberId as unknown as { _id: Types.ObjectId; fullName: string; status: string } | null;
      if (!member || planByName.has(membership.planName)) continue;
      const durationMonths = durationInMonths(membership.startDate, membership.expiryDate);
      planByName.set(membership.planName, {
        id: `legacy-${membership.planName}`,
        name: membership.planName,
        price: membership.price,
        durationMonths,
        durationLabel: `${durationMonths} ${durationMonths === 1 ? "month" : "months"}`,
        benefits: [],
        featured: false,
      });
    }

    const subscriptions = visibleMemberships.flatMap((membership) => {
      const member = membership.memberId as unknown as { _id: Types.ObjectId; fullName: string; status: string } | null;
      const plan = planByName.get(membership.planName);
      if (!member || !plan) return [];
      return [
        {
          id: String(membership._id),
          memberId: member._id.toString(),
          memberName: member.fullName,
          planId: plan.id,
          startDate: membership.startDate.toISOString().slice(0, 10),
          expirationDate: membership.expiryDate.toISOString().slice(0, 10),
          paymentStatus: membership.paymentStatus ?? paymentStatusByMember.get(member._id.toString()) ?? "Pending",
        },
      ];
    });

    return NextResponse.json({ plans: [...planByName.values()], subscriptions });
  } catch (error) {
    console.error("Failed to fetch memberships from the database:", error);
    return NextResponse.json({ error: "Unable to fetch memberships at this time." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let rawBody: unknown;
  let parsedBody: Record<string, unknown> | null = null;
  try {
    rawBody = await request.json();
    if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      parsedBody = rawBody as Record<string, unknown>;
    }
  } catch {
    rawBody = undefined;
  }

  const auth = await requireStaffContext(request, parsedBody);
  if (auth.response) {
    return auth.response;
  }
  const { gymId } = auth.ctx;

  if (rawBody === undefined) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!parsedBody) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = parsedBody;

  try {
    await connectToDatabase();

    if (input.action === "plan") {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const price = input.price;
      const durationMonths = input.durationMonths;
      const benefits = Array.isArray(input.benefits)
        ? input.benefits
            .filter((benefit): benefit is string => typeof benefit === "string")
            .map((benefit) => benefit.trim())
            .filter(Boolean)
        : [];
      if (
        !name ||
        name.length > 60 ||
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0 ||
        typeof durationMonths !== "number" ||
        !Number.isInteger(durationMonths) ||
        durationMonths < 1 ||
        durationMonths > 36
      ) {
        return NextResponse.json(
          { error: "Provide a plan name, non-negative price, and duration from 1 to 36 months." },
          { status: 400 },
        );
      }

      const plan = await MembershipPlanModel.create({
        gymId,
        name,
        price,
        durationMonths,
        benefits: benefits.slice(0, 20).map((benefit) => benefit.slice(0, 100)),
        featured: input.featured === true,
        active: true,
      });
      return NextResponse.json({ plan: serializePlan(plan) }, { status: 201 });
    }

    const paymentStatus = input.paymentStatus ?? "Pending";
    if (typeof paymentStatus !== "string" || !paymentStatuses.includes(paymentStatus as PaymentStatus)) {
      return NextResponse.json({ error: "paymentStatus must be Paid or Pending." }, { status: 400 });
    }
    const startDate = input.startDate === undefined ? getUtcToday() : parseDate(input.startDate);
    if (!startDate) {
      return NextResponse.json({ error: "startDate must be a valid YYYY-MM-DD date." }, { status: 400 });
    }

    if (input.action === "renew") {
      if (typeof input.membershipId !== "string" || !Types.ObjectId.isValid(input.membershipId)) {
        return NextResponse.json({ error: "A valid membershipId is required." }, { status: 400 });
      }
      const membership = await MembershipModel.findOne({ _id: input.membershipId, gymId });
      if (!membership) return NextResponse.json({ error: "Membership was not found." }, { status: 404 });

      const savedPlan = await MembershipPlanModel.findOne({ gymId, name: membership.planName, active: true });
      const durationMonths = savedPlan?.durationMonths ?? durationInMonths(membership.startDate, membership.expiryDate);
      const renewalPrice = savedPlan?.price ?? membership.price;
      const expiryDate = addMonths(startDate, durationMonths);
      membership.startDate = startDate;
      membership.expiryDate = expiryDate;
      membership.price = renewalPrice;
      membership.status = "active";
      membership.paymentStatus = paymentStatus as PaymentStatus;
      await membership.save();
      await MemberModel.updateOne({ _id: membership.memberId, gymId }, { $set: { status: "active" } });

      if (renewalPrice > 0) {
        await PaymentModel.create({
          gymId,
          memberId: membership.memberId,
          amount: renewalPrice,
          description: `${membership.planName} renewal`,
          paymentMethod: "Cash",
          status: paymentStatus as PaymentStatus,
          date: new Date(),
        });
      }

      return NextResponse.json({
        membership: { id: membership._id.toString(), expiryDate: expiryDate.toISOString().slice(0, 10) },
      });
    }

    if (input.action === "create") {
      if (
        typeof input.memberId !== "string" ||
        !Types.ObjectId.isValid(input.memberId) ||
        typeof input.planId !== "string" ||
        !Types.ObjectId.isValid(input.planId)
      ) {
        return NextResponse.json({ error: "Valid memberId and planId are required." }, { status: 400 });
      }
      const [member, plan] = await Promise.all([
        MemberModel.findOne({ _id: input.memberId, gymId }),
        MembershipPlanModel.findOne({ _id: input.planId, gymId, active: true }),
      ]);
      if (!member || !plan) {
        return NextResponse.json({ error: "Member or active plan was not found." }, { status: 404 });
      }

      const expiryDate = addMonths(startDate, plan.durationMonths);
      const status = expiryDate < getUtcToday() ? "expired" : "active";
      const membership = await MembershipModel.create({
        gymId,
        memberId: member._id,
        planName: plan.name,
        price: plan.price,
        startDate,
        expiryDate,
        status,
        paymentStatus: paymentStatus as PaymentStatus,
      });
      await MemberModel.updateOne({ _id: member._id, gymId }, { $set: { status } });
      if (plan.price > 0) {
        await PaymentModel.create({
          gymId,
          memberId: member._id,
          amount: plan.price,
          description: plan.name,
          paymentMethod: "Cash",
          status: paymentStatus as PaymentStatus,
          date: new Date(),
        });
      }
      return NextResponse.json(
        { membership: { id: membership._id.toString(), expiryDate: expiryDate.toISOString().slice(0, 10) } },
        { status: 201 },
      );
    }

    return NextResponse.json({ error: "action must be plan, renew, or create." }, { status: 400 });
  } catch (error) {
    console.error("Failed to save membership data:", error);
    return NextResponse.json({ error: "Unable to save membership data at this time." }, { status: 503 });
  }
}
