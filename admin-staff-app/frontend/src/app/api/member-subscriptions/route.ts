import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import MembershipModel from "gymos-admin-backend/models/membership";
import MembershipPlanModel from "gymos-admin-backend/models/membership-plan";
import MembershipRequestModel from "gymos-admin-backend/models/membership-request";
import {
  findGymFromQrOrCode,
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
import {
  getPlatformTokenFromRequest,
  PLATFORM_SESSION_COOKIE,
  verifyPlatformSessionToken,
} from "@/lib/platform-session";
import {
  getStaffTokenFromRequest,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionToken,
} from "@/lib/staff-session";
import { hasConflictingGymRef } from "@/lib/tenant-guard";

export const runtime = "nodejs";

const VALID_PAYMENT_METHODS = ["Cash", "Card", "Instapay"] as const;
type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

async function authenticateVerifiedMember(request: NextRequest) {
  const session = await verifyMemberSessionToken(
    getMemberTokenFromRequest(request, request.cookies.get(MEMBER_SESSION_COOKIE)?.value),
  );
  if (!session) {
    const [staffAttempt, platformAttempt] = await Promise.all([
      verifyStaffSessionToken(
        getStaffTokenFromRequest(request, request.cookies.get(STAFF_SESSION_COOKIE)?.value),
      ),
      verifyPlatformSessionToken(
        getPlatformTokenFromRequest(request, request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
      ),
    ]);
    if (staffAttempt || platformAttempt) {
      return {
        response: memberApiResponse(
          request,
          { error: "Member account permissions are required." },
          403,
        ),
      };
    }
    return {
      response: memberApiResponse(request, { error: "Member authentication is required." }, 401),
    };
  }

  if (session.role !== "member") {
    return {
      response: memberApiResponse(
        request,
        { error: "Only member accounts can access gym subscription plans." },
        403,
      ),
    };
  }

  if (!Types.ObjectId.isValid(session.memberId)) {
    return {
      response: memberApiResponse(request, { error: "Member authentication is required." }, 401),
    };
  }

  await connectToDatabase();
  const member = await MemberModel.findById(session.memberId);
  if (!member) {
    return {
      response: memberApiResponse(request, { error: "Member authentication is required." }, 401),
    };
  }
  if (member.status === "suspended") {
    return {
      response: memberApiResponse(
        request,
        { error: "Your member account is currently suspended." },
        403,
      ),
    };
  }
  if (session.gymId && (!member.gymId || String(member.gymId) !== session.gymId)) {
    return {
      response: memberApiResponse(
        request,
        { error: "Member gym relationship could not be verified." },
        403,
      ),
    };
  }

  return { member };
}

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

// Scan Gym QR Code -> Connect to Gym & Fetch Available Plans
export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  try {
    const auth = await authenticateVerifiedMember(request);
    if (auth.response) return auth.response;
    const { member } = auth;

    if (member.gymId && Types.ObjectId.isValid(String(member.gymId))) {
      const assignedGym = await GymModel.findById(member.gymId).select("slug status");
      if (assignedGym && assignedGym.status !== "active") {
        return memberApiResponse(
          request,
          { error: "This gym workspace is currently suspended." },
          403,
        );
      }
      if (
        assignedGym &&
        hasConflictingGymRef(request, {
          id: String(member.gymId),
          slug: assignedGym.slug,
        })
      ) {
        return memberApiResponse(
          request,
          {
            error:
              "Cross-gym access denied: members may only access their own gym's information.",
          },
          403,
        );
      }
    }

    const qr = request.nextUrl.searchParams.get("qr")?.trim() ?? "";
    if (!qr) {
      return memberApiResponse(
        request,
        { error: "Scan a valid GymOS reception QR code to connect to a gym." },
        400,
      );
    }

    const qrLookup = await findGymFromQrOrCode(qr);
    if (qrLookup.kind === "staff_invite") {
      return memberApiResponse(
        request,
        {
          error:
            "That is a Staff/Owner invite code for the web portal. Scan the Reception QR code or enter the gym code instead.",
        },
        400,
      );
    }
    if (qrLookup.kind === "trainer_invite") {
      return memberApiResponse(
        request,
        {
          error:
            "That is a Trainer invite code. Sign out and choose the Trainer tab on the sign-in screen to redeem it.",
        },
        400,
      );
    }
    if (qrLookup.kind === "not_found") {
      return memberApiResponse(
        request,
        { error: "Invalid QR code. Scan the Reception QR code displayed at the gym front desk." },
        404,
      );
    }

    const gym = qrLookup.gym;
    if (gym.status === "pending") {
      return memberApiResponse(
        request,
        {
          error:
            "This gym workspace is pending approval. Activate it in the Super Admin dashboard first.",
        },
        403,
      );
    }
    if (gym.status !== "active") {
      return memberApiResponse(
        request,
        { error: "This gym workspace is currently suspended." },
        403,
      );
    }

    // Tenant isolation: members already affiliated with a gym may only view their own gym's information
    if (member.gymId && String(member.gymId) !== gym._id.toString()) {
      return memberApiResponse(
        request,
        {
          error:
            "Cross-gym access denied: members may only access their own gym's information.",
        },
        403,
      );
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const [plans, activeMembership] = await Promise.all([
      MembershipPlanModel.find({ gymId: gym._id, active: true }).sort({
        price: 1,
        createdAt: 1,
      }),
      MembershipModel.findOne({
        gymId: gym._id,
        memberId: member._id,
        status: "active",
        expiryDate: { $gte: todayUtc },
      }).sort({ expiryDate: -1 }),
    ]);

    if (activeMembership && (!member.gymId || String(member.gymId) !== gym._id.toString())) {
      await MemberModel.updateOne(
        { _id: member._id },
        { $set: { gymId: gym._id, status: "active" } },
      );
    }

    return memberApiResponse(request, {
      alreadyEnrolled: Boolean(activeMembership),
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

  let parsedInput: Record<string, unknown> | undefined;
  const parsed = await parseMemberAuthBody(request);
  if (parsed.input) {
    parsedInput = parsed.input;
  }

  try {
    const auth = await authenticateVerifiedMember(request);
    if (auth.response) return auth.response;
    const { member } = auth;

    if (!parsedInput) {
      return memberApiResponse(request, { error: parsed.error }, 400);
    }
    const input = parsedInput;
    const action = typeof input.action === "string" ? input.action : "subscribe";

    if (member.gymId && Types.ObjectId.isValid(String(member.gymId))) {
      const assignedGym = await GymModel.findById(member.gymId).select("slug status");
      if (assignedGym && assignedGym.status !== "active") {
        return memberApiResponse(
          request,
          { error: "This gym workspace is currently suspended." },
          403,
        );
      }
      if (
        assignedGym &&
        hasConflictingGymRef(
          request,
          { id: String(member.gymId), slug: assignedGym.slug },
          input,
        )
      ) {
        return memberApiResponse(
          request,
          {
            error:
              "Cross-gym access denied: members may only access their own gym's information.",
          },
          403,
        );
      }
    }

    if (action === "cancel") {
      await MembershipRequestModel.updateMany(
        {
          memberId: member._id,
          ...(member.gymId ? { gymId: member.gymId } : {}),
          status: "pending",
        },
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

    if (member.gymId && String(member.gymId) !== gymId.toString()) {
      return memberApiResponse(
        request,
        {
          error:
            "Cross-gym access denied: your account is already registered with another gym.",
        },
        403,
      );
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const [gym, plan, existingActiveMembership] = await Promise.all([
      GymModel.findOne({ _id: gymId, status: "active" }).select("name"),
      MembershipPlanModel.findOne({ _id: planId, gymId, active: true }),
      MembershipModel.findOne({
        gymId,
        memberId: member._id,
        status: "active",
        expiryDate: { $gte: todayUtc },
        paymentStatus: "Paid",
      }).sort({ expiryDate: -1 }),
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

    // Prevent duplicate payment requests / double-charging if staff already accepted this member's plan
    if (existingActiveMembership) {
      if (!member.gymId || String(member.gymId) !== gym._id.toString()) {
        await MemberModel.updateOne(
          { _id: member._id },
          { $set: { gymId: gym._id, status: "active" } },
        );
      }
      await MembershipRequestModel.updateMany(
        { memberId: member._id, status: "pending" },
        { $set: { status: "declined", respondedAt: new Date() } },
      );
      return memberApiResponse(
        request,
        {
          alreadyEnrolled: true,
          pendingRequest: null,
          gymName: gym.name,
          planName: existingActiveMembership.planName,
        },
        200,
      );
    }

    // Idempotently return existing identical pending request instead of creating duplicates
    const existingIdenticalPending = await MembershipRequestModel.findOne({
      gymId: gym._id,
      memberId: member._id,
      planId: plan._id,
      paymentMethod: paymentMethod as PaymentMethod,
      status: "pending",
    }).sort({ createdAt: -1 });

    if (existingIdenticalPending) {
      return memberApiResponse(
        request,
        {
          idempotent: true,
          pendingRequest: {
            id: existingIdenticalPending._id.toString(),
            gymId: gym._id.toString(),
            gymName: gym.name,
            planName: existingIdenticalPending.planName,
            price: existingIdenticalPending.price,
            durationMonths: existingIdenticalPending.durationMonths,
            paymentMethod: existingIdenticalPending.paymentMethod,
            createdAt: existingIdenticalPending.createdAt.toISOString(),
          },
        },
        200,
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
