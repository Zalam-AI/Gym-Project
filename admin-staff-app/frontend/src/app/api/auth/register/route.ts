import { NextResponse } from "next/server";
import {
  DEFAULT_GYM_CAPACITY,
  DEFAULT_GYM_TIMEZONE,
  normalizeTimezone,
  slugifyGymName,
} from "gymos-admin-backend/lib/gym-time";
import { connectToDatabase, runInTransactionOrFallback } from "gymos-admin-backend/lib/mongodb";
import { hashStaffPassword } from "gymos-admin-backend/lib/staff-password";
import { normalizeStaffInviteCode } from "gymos-admin-backend/lib/trainer-code";
import GymModel from "gymos-admin-backend/models/gym";
import MembershipPlanModel from "gymos-admin-backend/models/membership-plan";
import StaffInviteModel from "gymos-admin-backend/models/staff-invite";
import StaffUserModel from "gymos-admin-backend/models/staff-user";
import { normalizePhone } from "@/lib/member-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPreviewModeEnabled } from "@/lib/security";
import {
  createStaffSessionToken,
  getStaffCookieOptions,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_DURATION_SECONDS,
} from "@/lib/staff-session";

export const runtime = "nodejs";

const starterPlans = [
  {
    name: "1 Month Regular",
    price: 1800,
    durationMonths: 1,
    featured: false,
    benefits: [
      "Full gym floor & cardio access",
      "Locker room & shower facilities",
      "Digital QR member pass",
    ],
  },
  {
    name: "3 Month Saver",
    price: 4500,
    durationMonths: 3,
    featured: true,
    benefits: [
      "Full gym floor & free weights",
      "2 group fitness classes / week",
      "1 InBody composition scan",
    ],
  },
  {
    name: "VIP Annual",
    price: 18000,
    durationMonths: 12,
    featured: false,
    benefits: [
      "Unlimited club access all year",
      "Personal trainer & custom workout plan",
      "Monthly InBody scans & recovery lounge",
    ],
  },
] as const;

async function generateUniqueGymSlug(gymName: string): Promise<string> {
  const base = slugifyGymName(gymName);
  const existingBase = await GymModel.exists({ slug: base });
  if (!existingBase) return base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base.slice(0, 56)}-${suffix}`;
    const taken = await GymModel.exists({ slug: candidate });
    if (!taken) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36).slice(-6)}`;
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, {
    namespace: "staff-register",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
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
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const rawInviteCode = typeof input.inviteCode === "string" ? input.inviteCode.trim() : "";
  const gymName = typeof input.gymName === "string" ? input.gymName.trim() : "";

  const registrationType: "create-gym" | "join-gym" =
    input.registrationType === "create-gym"
      ? "create-gym"
      : input.registrationType === "join-gym"
        ? "join-gym"
        : gymName && !rawInviteCode
          ? "create-gym"
          : "join-gym";

  if (!fullName || fullName.length > 100) {
    return NextResponse.json(
      { error: "Name is required and must be 100 characters or fewer." },
      { status: 400 },
    );
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 10 and 128 characters." },
      { status: 400 },
    );
  }
  if (!process.env.GYMOS_SESSION_SECRET || process.env.GYMOS_SESSION_SECRET.length < 32) {
    return NextResponse.json(
      { error: "GYMOS_SESSION_SECRET must contain at least 32 characters." },
      { status: 500 },
    );
  }

  try {
    await connectToDatabase();

    // ---------------------------------------------------------
    // MODE A: SELF-SERVICE SAAS GYM TENANT CREATION (OWNER)
    // ---------------------------------------------------------
    if (registrationType === "create-gym") {
      const gymAddress = typeof input.gymAddress === "string" ? input.gymAddress.trim() : "";
      const rawGymPhone = typeof input.gymPhone === "string" ? input.gymPhone.trim() : "";
      const gymPhone = normalizePhone(rawGymPhone) || rawGymPhone;
      const capacity =
        typeof input.capacity === "number" &&
        Number.isInteger(input.capacity) &&
        input.capacity >= 1 &&
        input.capacity <= 5000
          ? input.capacity
          : DEFAULT_GYM_CAPACITY;
      const timezone = normalizeTimezone(
        typeof input.timezone === "string" ? input.timezone : DEFAULT_GYM_TIMEZONE,
      );

      if (!gymName || gymName.length < 2 || gymName.length > 100) {
        return NextResponse.json(
          { error: "Gym name is required (2–100 characters)." },
          { status: 400 },
        );
      }
      if (!gymAddress || gymAddress.length < 2 || gymAddress.length > 200) {
        return NextResponse.json(
          { error: "Gym address or city is required (max 200 characters)." },
          { status: 400 },
        );
      }
      if (!gymPhone || gymPhone.length < 6 || gymPhone.length > 30) {
        return NextResponse.json(
          { error: "Enter a valid gym contact phone number." },
          { status: 400 },
        );
      }

      const emailTaken = await StaffUserModel.exists({ email });
      if (emailTaken) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 },
        );
      }

      const slug = await generateUniqueGymSlug(gymName);
      const passwordHash = await hashStaffPassword(password);

      const { createdGym, createdOwner } = await runInTransactionOrFallback(async (tx) => {
        const sessionOpt = tx ? { session: tx } : {};
        const [gymDoc] = await GymModel.create(
          [
            {
              name: gymName,
              slug,
              address: gymAddress,
              phone: gymPhone,
              status: "active",
              capacity,
              timezone,
              currency: "EGP",
            },
          ],
          sessionOpt,
        );

        try {
          const [ownerDoc] = await StaffUserModel.create(
            [
              {
                gymId: gymDoc._id,
                fullName,
                email,
                passwordHash,
                role: "owner",
                status: "active",
              },
            ],
            sessionOpt,
          );

          gymDoc.ownerUserId = ownerDoc._id;
          await gymDoc.save(sessionOpt);

          await MembershipPlanModel.insertMany(
            starterPlans.map((plan) => ({
              gymId: gymDoc._id,
              name: plan.name,
              price: plan.price,
              durationMonths: plan.durationMonths,
              featured: plan.featured,
              benefits: [...plan.benefits],
              active: true,
            })),
            sessionOpt,
          );

          return { createdGym: gymDoc, createdOwner: ownerDoc };
        } catch (err) {
          if (!tx) {
            await MembershipPlanModel.deleteMany({ gymId: gymDoc._id }).catch(() => undefined);
            await StaffUserModel.deleteMany({ gymId: gymDoc._id }).catch(() => undefined);
            await GymModel.deleteOne({ _id: gymDoc._id }).catch(() => undefined);
          }
          throw err;
        }
      });

      const token = await createStaffSessionToken(
        {
          sub: createdOwner._id.toString(),
          name: createdOwner.fullName,
          email: createdOwner.email,
          gymId: createdGym._id.toString(),
          role: "owner",
        },
        STAFF_SESSION_DURATION_SECONDS,
      );

      const response = NextResponse.json(
        {
          user: {
            name: createdOwner.fullName,
            email: createdOwner.email,
            role: "owner",
          },
          gym: {
            id: createdGym._id.toString(),
            name: createdGym.name,
            slug: createdGym.slug,
          },
          ...(isPreviewModeEnabled() ? { sessionToken: token } : {}),
        },
        { status: 201 },
      );
      response.cookies.set(STAFF_SESSION_COOKIE, token, getStaffCookieOptions(request));
      return response;
    }

    // ---------------------------------------------------------
    // MODE B: JOIN EXISTING GYM WITH PER-GYM STAFF INVITE CODE
    // ---------------------------------------------------------
    if (!rawInviteCode) {
      return NextResponse.json(
        { error: "Enter the staff invitation code from your gym owner, or switch to Create a new gym." },
        { status: 400 },
      );
    }

    const normalizedCode = normalizeStaffInviteCode(rawInviteCode);
    const now = new Date();

    // 1. Atomic claim on per-gym StaffInvite document
    const claimedInvite = await StaffInviteModel.findOneAndUpdate(
      {
        code: normalizedCode,
        status: "unused",
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      },
      { $set: { status: "claimed", claimedAt: now } },
      { new: true },
    );

    if (claimedInvite) {
      const rollbackInvite = async () => {
        await StaffInviteModel.updateOne(
          { _id: claimedInvite._id },
          { $set: { status: "unused" }, $unset: { claimedAt: 1, claimedByUserId: 1 } },
        ).catch(() => undefined);
      };

      if (claimedInvite.presetEmail && claimedInvite.presetEmail !== email) {
        await rollbackInvite();
        return NextResponse.json(
          { error: "This staff invite code was issued for a different email address." },
          { status: 403 },
        );
      }

      const gym = await GymModel.findOne({
        _id: claimedInvite.gymId,
        status: { $ne: "suspended" },
      }).select("name slug");

      if (!gym) {
        await rollbackInvite();
        return NextResponse.json(
          { error: "The gym workspace for this invite code is unavailable." },
          { status: 404 },
        );
      }

      try {
        const passwordHash = await hashStaffPassword(password);
        const role = claimedInvite.role === "owner" ? "owner" : "staff";
        const user = await StaffUserModel.create({
          gymId: gym._id,
          fullName,
          email,
          passwordHash,
          role,
          status: "active",
        });

        await StaffInviteModel.updateOne(
          { _id: claimedInvite._id },
          { $set: { claimedByUserId: user._id } },
        );

        const token = await createStaffSessionToken(
          {
            sub: user._id.toString(),
            name: user.fullName,
            email: user.email,
            gymId: user.gymId.toString(),
            role,
          },
          STAFF_SESSION_DURATION_SECONDS,
        );

        const response = NextResponse.json(
          {
            user: { name: user.fullName, email: user.email, role },
            gym: { id: gym._id.toString(), name: gym.name, slug: gym.slug },
            ...(isPreviewModeEnabled() ? { sessionToken: token } : {}),
          },
          { status: 201 },
        );
        response.cookies.set(STAFF_SESSION_COOKIE, token, getStaffCookieOptions(request));
        return response;
      } catch (err) {
        await rollbackInvite();
        throw err;
      }
    }

    return NextResponse.json(
      { error: "Invalid, expired, or already-used staff invitation code." },
      { status: 403 },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    console.error("Failed to register a GymOS staff account:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GYMOS_SESSION_SECRET")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unable to complete registration at this time." },
      { status: 503 },
    );
  }
}
