import bcrypt from "bcryptjs";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { normalizeTrainerInviteCode } from "gymos-admin-backend/lib/trainer-code";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import TrainerModel from "gymos-admin-backend/models/trainer";
import TrainerInviteModel from "gymos-admin-backend/models/trainer-invite";
import {
  createMemberSessionToken,
  createTrainerSessionToken,
} from "@/lib/member-session";
import {
  buildPhoneCandidates,
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
  normalizePhone,
  parseMemberAuthBody,
  resolveMemberGym,
  setMemberSessionCookie,
} from "@/lib/member-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const defaultTrainerAvailability = [
  { day: "Sun", startTime: "10:00", endTime: "18:00" },
  { day: "Mon", startTime: "10:00", endTime: "18:00" },
  { day: "Tue", startTime: "10:00", endTime: "18:00" },
  { day: "Wed", startTime: "10:00", endTime: "18:00" },
  { day: "Thu", startTime: "10:00", endTime: "18:00" },
] as const;

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function POST(request: Request) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const rate = checkRateLimit(request, {
    namespace: "mobile-register",
    limit: 15,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    const res = memberApiResponse(
      request,
      { error: "Too many registration attempts. Please wait a few minutes and try again." },
      429,
    );
    res.headers.set("Retry-After", String(rate.retryAfterSeconds));
    return res;
  }

  const parsed = await parseMemberAuthBody(request);
  if (!parsed.input) {
    return memberApiResponse(request, { error: parsed.error }, 400);
  }

  const input = parsed.input;
  const accountType = input.accountType === "trainer" ? "trainer" : "member";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const rawPhone = typeof input.phone === "string" ? input.phone : "";
  const phone = normalizePhone(rawPhone);
  const phoneCandidates = buildPhoneCandidates(rawPhone);
  const rawEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const email = rawEmail || undefined;
  const password = typeof input.password === "string" ? input.password : "";

  if (!fullName || fullName.length > 80) {
    return memberApiResponse(
      request,
      { error: "Full name is required and must be 80 characters or fewer." },
      400,
    );
  }
  if (
    phone.length < 8 ||
    phone.length > 20 ||
    phone.slice(1).includes("+") ||
    !/^\+?\d+$/.test(phone)
  ) {
    return memberApiResponse(request, { error: "Enter a valid phone number." }, 400);
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    return memberApiResponse(request, { error: "Enter a valid email address." }, 400);
  }
  if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
    return memberApiResponse(
      request,
      { error: "Password must be at least 6 characters." },
      400,
    );
  }
  if (!process.env.GYMOS_SESSION_SECRET || process.env.GYMOS_SESSION_SECRET.length < 32) {
    return memberApiResponse(
      request,
      { error: "GYMOS_SESSION_SECRET must contain at least 32 characters." },
      500,
    );
  }

  try {
    await connectToDatabase();

    // ---------------------------------------------------------
    // TRAINER REGISTRATION (Atomic Invite Code Claim)
    // ---------------------------------------------------------
    if (accountType === "trainer") {
      const rawTrainerCode = typeof input.trainerCode === "string" ? input.trainerCode : "";
      const trainerCode = normalizeTrainerInviteCode(rawTrainerCode);
      if (!trainerCode) {
        return memberApiResponse(
          request,
          {
            error:
              "A trainer invite code from the gym admin is required to register as a trainer.",
          },
          400,
        );
      }

      const now = new Date();
      const claimedInvite = await TrainerInviteModel.findOneAndUpdate(
        {
          code: trainerCode,
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

      const rollbackInvite = async () => {
        if (!claimedInvite) return;
        await TrainerInviteModel.updateOne(
          { _id: claimedInvite._id },
          { $set: { status: "unused" }, $unset: { claimedAt: 1, claimedByTrainerId: 1 } },
        ).catch(() => undefined);
      };

      let targetTrainer = claimedInvite?.trainerId
        ? await TrainerModel.findById(claimedInvite.trainerId).select("+passwordHash")
        : !claimedInvite
          ? await TrainerModel.findOne({ inviteCode: trainerCode }).select("+passwordHash")
          : null;

      if (!claimedInvite && !targetTrainer) {
        return memberApiResponse(
          request,
          {
            error:
              "Invalid, expired, or already-used trainer invite code. Ask your gym admin to generate a new code.",
          },
          404,
        );
      }

      if (targetTrainer?.passwordHash) {
        await rollbackInvite();
        return memberApiResponse(
          request,
          { error: "This trainer profile is already activated. Please sign in." },
          409,
        );
      }

      const gymId = claimedInvite ? claimedInvite.gymId : targetTrainer!.gymId;
      const gym = await GymModel.findOne({
        _id: gymId,
        status: { $ne: "suspended" },
      }).select("name slug");
      if (!gym) {
        await rollbackInvite();
        return memberApiResponse(
          request,
          { error: "Gym workspace for this invite code was not found or is unavailable." },
          404,
        );
      }

      const rawSpecialty = typeof input.specialty === "string" ? input.specialty.trim() : "";
      const specialty =
        rawSpecialty ||
        targetTrainer?.specialty ||
        claimedInvite?.presetSpecialty ||
        "Personal Training & Fitness";

      if (specialty.length > 100) {
        await rollbackInvite();
        return memberApiResponse(
          request,
          { error: "Specialty must be 100 characters or fewer." },
          400,
        );
      }

      const duplicateConditions: Array<Record<string, unknown>> = [
        { phone: { $in: phoneCandidates.length ? phoneCandidates : [phone] } },
      ];
      if (email) duplicateConditions.push({ email });

      const conflictingTrainer = await TrainerModel.findOne({
        gymId,
        ...(targetTrainer ? { _id: { $ne: targetTrainer._id } } : {}),
        $or: duplicateConditions,
      }).select("+passwordHash");

      if (conflictingTrainer?.passwordHash) {
        await rollbackInvite();
        return memberApiResponse(
          request,
          { error: "A trainer account already exists with this phone or email. Please sign in." },
          409,
        );
      }

      if (!targetTrainer && conflictingTrainer && !conflictingTrainer.passwordHash) {
        targetTrainer = conflictingTrainer;
      }

      try {
        const passwordHash = await bcrypt.hash(password, 12);
        let trainerDoc;

        if (targetTrainer) {
          targetTrainer.name = fullName;
          targetTrainer.phone = phone;
          targetTrainer.specialty = specialty;
          if (email) targetTrainer.email = email;
          targetTrainer.passwordHash = passwordHash;
          targetTrainer.status = "active";
          targetTrainer.inviteCode = undefined;
          if (!targetTrainer.availability || targetTrainer.availability.length === 0) {
            targetTrainer.set("availability", [...defaultTrainerAvailability]);
          }
          await targetTrainer.save();
          trainerDoc = targetTrainer;
        } else {
          trainerDoc = await TrainerModel.create({
            gymId,
            name: fullName,
            specialty,
            phone,
            ...(email ? { email } : {}),
            passwordHash,
            status: "active",
            availability: [...defaultTrainerAvailability],
            assignedMemberIds: [],
          });
        }

        if (claimedInvite) {
          await TrainerInviteModel.updateOne(
            { _id: claimedInvite._id },
            { $set: { claimedByTrainerId: trainerDoc._id } },
          );
        } else {
          await TrainerInviteModel.updateMany(
            { gymId, code: trainerCode, status: "unused" },
            {
              $set: {
                status: "claimed",
                claimedByTrainerId: trainerDoc._id,
                claimedAt: now,
              },
            },
          );
        }

        const token = await createTrainerSessionToken(
          trainerDoc._id.toString(),
          gym._id.toString(),
        );
        const response = memberApiResponse(
          request,
          {
            role: "trainer",
            sessionToken: token,
            trainer: {
              id: trainerDoc._id.toString(),
              name: trainerDoc.name,
              specialty: trainerDoc.specialty,
              email: trainerDoc.email,
              gymName: gym.name,
            },
          },
          201,
        );
        setMemberSessionCookie(response, token, request);
        return response;
      } catch (err) {
        await rollbackInvite();
        throw err;
      }
    }

    // ---------------------------------------------------------
    // QUICK NORMAL MEMBER REGISTRATION (+ Safe Multi-Tenant Claiming)
    // ---------------------------------------------------------
    const explicitGymCode =
      typeof input.gymCode === "string" && input.gymCode.trim() ? input.gymCode.trim() : "";
    const explicitGym = explicitGymCode ? await resolveMemberGym(explicitGymCode) : null;
    if (explicitGymCode && !explicitGym) {
      return memberApiResponse(request, { error: "Enter a valid gym code." }, 404);
    }

    const lookupOr: Array<Record<string, unknown>> = [
      { phone: { $in: phoneCandidates.length ? phoneCandidates : [phone] } },
    ];
    if (email) lookupOr.push({ email });

    const matches = await MemberModel.find({
      ...(explicitGym ? { gymId: explicitGym._id } : {}),
      $or: lookupOr,
    })
      .select("+passwordHash")
      .sort({ createdAt: -1 });

    if (matches.some((m) => Boolean(m.passwordHash))) {
      return memberApiResponse(
        request,
        { error: "An account already exists for this phone or email. Please sign in." },
        409,
      );
    }

    const distinctUnclaimedGymIds = new Set(
      matches.filter((m) => m.gymId).map((m) => String(m.gymId)),
    );
    if (!explicitGym && distinctUnclaimedGymIds.size > 1) {
      return memberApiResponse(
        request,
        {
          error:
            "Multiple gyms have a front-desk profile for this phone number. Ask your gym for its gym slug/code to claim the right profile.",
        },
        409,
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = matches[0];

    if (existing) {
      existing.passwordHash = passwordHash;
      if (email && !existing.email) {
        existing.email = email;
      }
      if (fullName) {
        existing.fullName = fullName;
      }
      await existing.save();

      const claimedGymId = existing.gymId ? existing.gymId.toString() : "";
      const token = await createMemberSessionToken(existing._id.toString(), claimedGymId);
      const response = memberApiResponse(
        request,
        {
          role: "member",
          sessionToken: token,
          member: { id: existing._id.toString(), name: existing.fullName, email: existing.email },
          claimed: true,
        },
        200,
      );
      setMemberSessionCookie(response, token, request);
      return response;
    }

    // Brand-new self-registered member: NOT attached to any gym or plan yet!
    const member = await MemberModel.create({
      ...(explicitGym ? { gymId: explicitGym._id } : {}),
      fullName,
      phone,
      ...(email ? { email } : {}),
      passwordHash,
      status: "active",
      joinDate: new Date(),
    });
    const initialGymId = member.gymId ? member.gymId.toString() : "";
    const token = await createMemberSessionToken(member._id.toString(), initialGymId);
    const response = memberApiResponse(
      request,
      {
        role: "member",
        sessionToken: token,
        member: { id: member._id.toString(), name: member.fullName, email: member.email },
        claimed: false,
      },
      201,
    );
    setMemberSessionCookie(response, token, request);
    return response;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return memberApiResponse(
        request,
        { error: "Phone number or email is already registered." },
        409,
      );
    }
    console.error("Mobile registration failed:", error);
    return memberApiResponse(request, { error: "Unable to register at this time." }, 503);
  }
}
