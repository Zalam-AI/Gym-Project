import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";

export const runtime = "nodejs";

const paymentMethods = ["Cash", "Card", "Instapay"] as const;
const paymentStatuses = ["Paid", "Partial", "Pending", "Overdue"] as const;
type PaymentMethod = (typeof paymentMethods)[number];
type PaymentStatus = (typeof paymentStatuses)[number];

function getActiveGymId() {
  const gymId = process.env.GYMOS_GYM_ID;
  return gymId && Types.ObjectId.isValid(gymId) ? new Types.ObjectId(gymId) : null;
}

function startOfToday(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonth(date = new Date()) {
  const start = startOfToday(date);
  start.setDate(1);
  return start;
}

export async function GET() {
  const gymId = getActiveGymId();
  if (!gymId) return NextResponse.json({ error: "GYMOS_GYM_ID must be set to a valid gym ID." }, { status: 500 });

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const [payments, members] = await Promise.all([
      PaymentModel.find({ gymId })
        .populate({ path: "memberId", model: MemberModel, select: "fullName" })
        .sort({ date: -1 })
        .lean(),
      MemberModel.find({ gymId }).select("fullName").sort({ fullName: 1 }).lean(),
    ]);
    const today = startOfToday();
    const now = new Date();
    const monthStart = startOfMonth();
    const transactions = payments.flatMap((payment) => {
      const member = payment.memberId as unknown as { _id: Types.ObjectId; fullName: string } | null;
      if (!member) return [];
      return [{
        id: `PAY-${String(payment._id).slice(-8).toUpperCase()}`,
        memberId: member._id.toString(),
        memberName: member.fullName,
        dateTime: new Date(payment.date).toISOString(),
        description: payment.description || "Membership payment",
        amount: payment.amount,
        method: payment.paymentMethod,
        status: payment.status,
      }];
    });

    const collected = payments.filter((payment) => payment.status === "Paid" || payment.status === "Partial");
    const outstanding = payments.filter((payment) => payment.status === "Pending" || payment.status === "Overdue");
    return NextResponse.json({
      transactions,
      members: members.map((member) => ({ id: String(member._id), name: member.fullName })),
      summary: {
        today: collected
          .filter((payment) => new Date(payment.date) >= today && new Date(payment.date) <= now)
          .reduce((total, payment) => total + payment.amount, 0),
        month: collected
          .filter((payment) => new Date(payment.date) >= monthStart && new Date(payment.date) <= now)
          .reduce((total, payment) => total + payment.amount, 0),
        outstanding: outstanding.reduce((total, payment) => total + payment.amount, 0),
      },
    });
  } catch (error) {
    console.error("Failed to fetch payments from the database:", error);
    return NextResponse.json({ error: "Unable to fetch payment history at this time." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const gymId = getActiveGymId();
  if (!gymId) return NextResponse.json({ error: "GYMOS_GYM_ID must be set to a valid gym ID." }, { status: 500 });

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

  const memberId = typeof input.memberId === "string" ? input.memberId : "";
  const description = typeof input.description === "string" ? input.description.trim() : "Payment";
  const method = input.paymentMethod;
  const status = input.status;
  const amount = input.amount;
  if (!Types.ObjectId.isValid(memberId)) {
    return NextResponse.json({ error: "A valid memberId is required." }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number in EGP." }, { status: 400 });
  }
  if (typeof method !== "string" || !paymentMethods.includes(method as PaymentMethod)) {
    return NextResponse.json({ error: "paymentMethod must be Cash, Card, or Instapay." }, { status: 400 });
  }
  if (typeof status !== "string" || !paymentStatuses.includes(status as PaymentStatus)) {
    return NextResponse.json({ error: "status must be Paid, Partial, Pending, or Overdue." }, { status: 400 });
  }
  if (!description || description.length > 100) {
    return NextResponse.json({ error: "description must be 100 characters or fewer." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    if (!(await GymModel.exists({ _id: gymId }))) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }
    const member = await MemberModel.findOne({ _id: memberId, gymId });
    if (!member) return NextResponse.json({ error: "Member was not found for this gym." }, { status: 404 });

    const payment = await PaymentModel.create({
      gymId,
      memberId: member._id,
      amount,
      description,
      paymentMethod: method,
      status,
      date: new Date(),
    });
    const membership = await MembershipModel.findOne({ gymId, memberId: member._id }).sort({ expiryDate: -1 });
    if (membership) {
      membership.paymentStatus = status === "Paid" ? "Paid" : "Pending";
      await membership.save();
    }

    return NextResponse.json({
      transaction: {
        id: `PAY-${payment._id.toString().slice(-8).toUpperCase()}`,
        memberId: member._id.toString(),
        memberName: member.fullName,
        dateTime: payment.date.toISOString(),
        description: payment.description,
        amount: payment.amount,
        method: payment.paymentMethod,
        status: payment.status,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to record payment:", error);
    return NextResponse.json({ error: "Unable to record this payment at this time." }, { status: 503 });
  }
}