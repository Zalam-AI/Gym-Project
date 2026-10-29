import { NextResponse } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import { resolveActiveGymId } from "@/lib/gym-context";
import { buildPhoneCandidates, normalizePhone } from "@/lib/member-auth";

export const runtime = "nodejs";

const allowedStatuses = ["active", "expired", "suspended"] as const;
const paymentMethods = ["Cash", "Card", "Instapay"] as const;
const paymentStatuses = ["Paid", "Pending"] as const;
type MemberStatus = (typeof allowedStatuses)[number];
type PaymentMethod = (typeof paymentMethods)[number];
type PaymentStatus = (typeof paymentStatuses)[number];

export async function GET(request: Request) {
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID." },
      { status: 500 },
    );
  }

  try {
    await connectToDatabase();
    const gymExists = await GymModel.exists({ _id: gymId });
    if (!gymExists) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const records = await MemberModel.find({ gymId }).sort({ createdAt: -1 });
    const memberIds = records.map((member) => member._id);
    const memberships = await MembershipModel.find({
      gymId,
      memberId: { $in: memberIds },
    }).sort({ expiryDate: -1 });
    const membershipsByMember = new Map<string, (typeof memberships)[number]>();
    for (const membership of memberships) {
      const memberId = membership.memberId.toString();
      if (!membershipsByMember.has(memberId)) {
        membershipsByMember.set(memberId, membership);
      }
    }

    const members = records.map((member) => {
      const membership = membershipsByMember.get(member._id.toString());
      const expiryDate = membership?.expiryDate ?? member.joinDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isExpired = member.status !== "active" || !membership || expiryDate < today;
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / 86_400_000,
      );

      return {
        id: member._id.toString(),
        name: member.fullName,
        phone: member.phone,
        email: member.email,
        plan: membership?.planName ?? "—",
        status: isExpired ? "Inactive" : daysUntilExpiry <= 7 ? "Expiring" : "Active",
        expiryDate: expiryDate.toISOString().slice(0, 10),
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch members from the database:", error);
    return NextResponse.json(
      { error: "Unable to fetch members at this time." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const gymId = await resolveActiveGymId(request);
  if (!gymId) {
    return NextResponse.json(
      { error: "GYMOS_GYM_ID must be set to a valid gym ID." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const phone = normalizePhone(rawPhone) || rawPhone;
  if (!fullName || !phone) {
    return NextResponse.json(
      { error: "fullName and phone are required." },
      { status: 400 },
    );
  }

  const email = typeof input.email === "string" && input.email.trim()
    ? input.email.trim().toLowerCase()
    : undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "email must be a valid email address." }, { status: 400 });
  }

  const statusValue = input.status ?? "active";
  if (
    typeof statusValue !== "string" ||
    !allowedStatuses.includes(statusValue as MemberStatus)
  ) {
    return NextResponse.json(
      { error: "status must be active, expired, or suspended." },
      { status: 400 },
    );
  }

  const plan = typeof input.plan === "string" ? input.plan.trim() : "";
  if (!plan) {
    return NextResponse.json({ error: "plan is required." }, { status: 400 });
  }

  const price = input.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { error: "price must be a non-negative number." },
      { status: 400 },
    );
  }

  const duration = input.duration;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 36) {
    return NextResponse.json(
      { error: "duration must be a whole number between 1 and 36 months." },
      { status: 400 },
    );
  }

  const paymentStatus = (input.paymentStatus ?? "Paid") as string;
  if (!paymentStatuses.includes(paymentStatus as PaymentStatus)) {
    return NextResponse.json(
      { error: "paymentStatus must be Paid or Pending." },
      { status: 400 },
    );
  }

  const paymentMethod = (input.paymentMethod ?? "Cash") as string;
  if (!paymentMethods.includes(paymentMethod as PaymentMethod)) {
    return NextResponse.json(
      { error: "paymentMethod must be Cash, Card, or Instapay." },
      { status: 400 },
    );
  }

  let joinDate: Date | undefined;
  const startDateValue = input.startDate ?? input.joinDate;
  if (startDateValue !== undefined) {
    if (typeof startDateValue !== "string" || Number.isNaN(Date.parse(startDateValue))) {
      return NextResponse.json(
        { error: "startDate must be a valid date string." },
        { status: 400 },
      );
    }
    joinDate = new Date(startDateValue);
  }

  try {
    await connectToDatabase();
    const gymExists = await GymModel.exists({ _id: gymId });
    if (!gymExists) {
      return NextResponse.json({ error: "Configured gym was not found." }, { status: 404 });
    }

    const phoneCandidates = buildPhoneCandidates(rawPhone);
    const duplicateConditions: Array<Record<string, unknown>> = [
      { phone: { $in: phoneCandidates.length ? phoneCandidates : [phone] } },
    ];
    if (email) {
      duplicateConditions.push({ email });
    }
    const existingMember = await MemberModel.exists({ gymId, $or: duplicateConditions });
    if (existingMember) {
      return NextResponse.json(
        { error: "A member with this phone number or email already exists in your gym." },
        { status: 409 },
      );
    }

    const membershipStart = joinDate ?? new Date();
    const expiryDate = new Date(membershipStart);
    expiryDate.setMonth(expiryDate.getMonth() + duration);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const memberStatus = expiryDate < today ? "expired" : statusValue;

    const member = await MemberModel.create({
      gymId,
      fullName,
      phone,
      ...(email ? { email } : {}),
      status: memberStatus,
      joinDate: membershipStart,
    });

    try {
      await MembershipModel.create({
        gymId,
        memberId: member._id,
        planName: plan,
        price,
        startDate: membershipStart,
        expiryDate,
        status: memberStatus === "expired" ? "expired" : "active",
        paymentStatus: paymentStatus as PaymentStatus,
      });

      if (price > 0) {
        await PaymentModel.create({
          gymId,
          memberId: member._id,
          amount: price,
          description: `${plan} (${duration} ${duration === 1 ? "month" : "months"})`,
          paymentMethod: paymentMethod as PaymentMethod,
          status: paymentStatus as PaymentStatus,
          date: new Date(),
        });
      }
    } catch (error) {
      await MembershipModel.deleteMany({ gymId, memberId: member._id });
      await MemberModel.deleteOne({ _id: member._id, gymId });
      throw error;
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Failed to create a member in the database:", error);
    return NextResponse.json(
      { error: "Unable to create member at this time." },
      { status: 503 },
    );
  }
}
