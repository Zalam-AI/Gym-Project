import { NextResponse } from "next/server";
import { startOfGymDay } from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase, runInTransactionOrFallback } from "gymos-admin-backend/lib/mongodb";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import PaymentModel from "gymos-admin-backend/models/payment";
import { requireStaffContext } from "@/lib/gym-context";
import { buildPhoneCandidates, normalizePhone } from "@/lib/member-auth";

export const runtime = "nodejs";

const allowedStatuses = ["active", "expired", "suspended"] as const;
const paymentMethods = ["Cash", "Card", "Instapay"] as const;
const paymentStatuses = ["Paid", "Pending"] as const;
type MemberStatus = (typeof allowedStatuses)[number];
type PaymentMethod = (typeof paymentMethods)[number];
type PaymentStatus = (typeof paymentStatuses)[number];

export async function GET(request: Request) {
  try {
    const auth = await requireStaffContext(request);
    if (auth.response) {
      return auth.response;
    }
    const { gymId, gym } = auth.ctx;

    await connectToDatabase();
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

    const today = startOfGymDay(new Date(), gym.timezone);
    const members = records.map((member) => {
      const membership = membershipsByMember.get(member._id.toString());
      const expiryDate = membership?.expiryDate ?? member.joinDate;
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
  let body: unknown;
  let parsedBody: Record<string, unknown> | null = null;
  try {
    body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      parsedBody = body as Record<string, unknown>;
    }
  } catch {
    body = undefined;
  }

  const auth = await requireStaffContext(request, parsedBody);
  if (auth.response) {
    return auth.response;
  }
  const { gymId, gym } = auth.ctx;

  if (body === undefined) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!parsedBody) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const input = parsedBody;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const phone = normalizePhone(rawPhone) || rawPhone;
  if (!fullName || !phone) {
    return NextResponse.json(
      { error: "fullName and phone are required." },
      { status: 400 },
    );
  }

  const email =
    typeof input.email === "string" && input.email.trim()
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
    const today = startOfGymDay(new Date(), gym.timezone);
    const memberStatus = expiryDate < today ? "expired" : statusValue;

    const member = await runInTransactionOrFallback(async (tx) => {
      const sessionOpt = tx ? { session: tx } : {};
      const [createdMember] = await MemberModel.create(
        [
          {
            gymId,
            fullName,
            phone,
            ...(email ? { email } : {}),
            status: memberStatus,
            joinDate: membershipStart,
          },
        ],
        sessionOpt,
      );

      try {
        await MembershipModel.create(
          [
            {
              gymId,
              memberId: createdMember._id,
              planName: plan,
              price,
              startDate: membershipStart,
              expiryDate,
              status: memberStatus === "expired" ? "expired" : "active",
              paymentStatus: paymentStatus as PaymentStatus,
            },
          ],
          sessionOpt,
        );

        if (price > 0) {
          await PaymentModel.create(
            [
              {
                gymId,
                memberId: createdMember._id,
                amount: price,
                description: `${plan} (${duration} ${duration === 1 ? "month" : "months"})`,
                paymentMethod: paymentMethod as PaymentMethod,
                status: paymentStatus as PaymentStatus,
                date: new Date(),
              },
            ],
            sessionOpt,
          );
        }

        return createdMember;
      } catch (err) {
        if (!tx) {
          await PaymentModel.deleteMany({ gymId, memberId: createdMember._id }).catch(
            () => undefined,
          );
          await MembershipModel.deleteMany({ gymId, memberId: createdMember._id }).catch(
            () => undefined,
          );
          await MemberModel.deleteOne({ _id: createdMember._id, gymId }).catch(() => undefined);
        }
        throw err;
      }
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Failed to create a member in the database:", error);
    return NextResponse.json(
      { error: "Unable to create member at this time." },
      { status: 503 },
    );
  }
}
