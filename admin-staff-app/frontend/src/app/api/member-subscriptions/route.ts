import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipPlanModel from "gymos-admin-backend/models/membership-plan";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import {
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
  parseMemberAuthBody,
} from "@/lib/member-auth";
import {
  getMemberTokenFromRequest,
  MEMBER_SESSION_COOKIE,
  verifyMemberSessionToken,
} from "@/lib/member-session";

export const runtime = "nodejs";

const VALID_PAYMENT_METHODS = ["Cash", "Card", "Instapay"] as const;
type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

async function findGymFromQrPayload(rawQr: string) {
  const trimmed = rawQr.trim();
  if (!trimmed) return null;

  const prefix = "GYMOS-GYM:";
  if (trimmed.toUpperCase().startsWith(prefix)) {
    const idPart = trimmed.slice(prefix.length).trim();
    if (Types.ObjectId.isValid(idPart)) {
      const byId = await GymModel.findById(idPart);
      if (byId) return byId;
    }
    return GymModel.findOne({ slug: idPart.toLowerCase() });
  }

  if (Types.ObjectId.isValid(trimmed)) {
    const byId = await GymModel.findById(trimmed);
    if (byId) return byId;
  }

  return GymModel.findOne({ slug: trimmed.toLowerCase() });
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

// Scan Gym QR Code -> Connect to Gym & Fetch Available Plans
export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session || session.role !== "member" || !Types.ObjectId.isValid(session.memberId)) {
    return memberApiResponse(request, { error: "Member authentication is required." }, 401);
  }

  const qr = request.nextUrl.searchParams.get("qr")?.trim() ?? "";
  if (!qr) {
    return memberApiResponse(
      request,
      { error: "Scan a valid GymOS reception QR code to connect to a gym." },
      400,
    );
  }

  try {
    await connectToDatabase();
    const gym = await findGymFromQrPayload(qr);
    if (!gym) {
      return memberApiResponse(
        request,
        { error: "Invalid QR code. Scan the Reception QR code displayed at the gym front desk." },
        404,
      );
    }

    const plans = await MembershipPlanModel.find({ gymId: gym._id, active: true }).sort({
      price: 1,
      createdAt: 1,
    });

    return memberApiResponse(request, {
      gym: {
        id: gym._id.toString(),
        name: gym.name,
        slug: gym.slug,
        address: gym.address,
        phone: gym.phone,
      },
      plans: plans.map((plan) => ({
        id: plan._id.toString(),
        name: plan.name,
        price: plan.price,
        durationMonths: plan.durationMonths,
        durationLabel: `${plan.durationMonths} ${plan.durationMonths === 1 ? "month" : "months"}`,
        benefits: plan.benefits ?? [],
        featured: Boolean(plan.featured),
      })),
      paymentMethods: [...VALID_PAYMENT_METHODS],
    });
  } catch (error) {
    console.error("Failed to load gym plans from QR:", error);
    return memberApiResponse(
      request,
      { error: "Unable to load gym membership plans right now." },
      503,
    );
  }
}

// Submit or Cancel a Membership Subscription + Payment Method Request
export async function POST(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session || session.role !== "member" || !Types.ObjectId.isValid(session.memberId)) {
    return memberApiResponse(request, { error: "Member authentication is required." }, 401);
  }

  const parsed = await parseMemberAuthBody(request);
  if (!parsed.input) {
    return memberApiResponse(request, { error: parsed.error }, 400);
  }
  const input = parsed.input;
  const action = typeof input.action === "string" ? input.action : "subscribe";

  try {
    await connectToDatabase();
    const member = await MemberModel.findById(session.memberId);
    if (!member) {
      return memberApiResponse(request, { error: "Member account was not found." }, 404);
    }

    if (action === "cancel") {
      await MembershipRequestModel.updateMany(
        { memberId: member._id, status: "pending" },
        { $set: { status: "declined", respondedAt: new Date() } },
      );
      return memberApiResponse(request, { ok: true });
    }

    const gymIdRaw = typeof input.gymId === "string" ? input.gymId.trim() : "";
    const planIdRaw = typeof input.planId === "string" ? input.planId.trim() : "";
    const paymentMethod =
      typeof input.paymentMethod === "string" ? input.paymentMethod.trim() : "";

    if (!Types.ObjectId.isValid(gymIdRaw)) {
      return memberApiResponse(request, { error: "A valid gym is required." }, 400);
    }
    if (!Types.ObjectId.isValid(planIdRaw)) {
      return memberApiResponse(request, { error: "Please choose a membership plan." }, 400);
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
      return memberApiResponse(
        request,
        { error: "Choose a payment method (Cash, Card, or Instapay)." },
        400,
      );
    }

    const gymId = new Types.ObjectId(gymIdRaw);
    const planId = new Types.ObjectId(planIdRaw);

    const [gym, plan] = await Promise.all([
      GymModel.findById(gymId).select("name"),
      MembershipPlanModel.findOne({ _id: planId, gymId, active: true }),
    ]);

    if (!gym) {
      return memberApiResponse(request, { error: "Selected gym was not found." }, 404);
    }
    if (!plan) {
      return memberApiResponse(
        request,
        { error: "Selected membership plan is no longer available." },
        404,
      );
    }

    // Supersede any older pending requests from this member
    await MembershipRequestModel.updateMany(
      { memberId: member._id, status: "pending" },
      { $set: { status: "declined", respondedAt: new Date() } },
    );

    const created = await MembershipRequestModel.create({
      gymId: gym._id,
      memberId: member._id,
      planId: plan._id,
      planName: plan.name,
      price: plan.price,
      durationMonths: plan.durationMonths,
      paymentMethod: paymentMethod as PaymentMethod,
      status: "pending",
    });

    return memberApiResponse(
      request,
      {
        pendingRequest: {
          id: created._id.toString(),
          gymId: gym._id.toString(),
          gymName: gym.name,
          planName: created.planName,
          price: created.price,
          durationMonths: created.durationMonths,
          paymentMethod: created.paymentMethod,
          createdAt: created.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Failed to create membership subscription request:", error);
    return memberApiResponse(
      request,
      { error: "Unable to submit your subscription request right now." },
      503,
    );
  }
}
