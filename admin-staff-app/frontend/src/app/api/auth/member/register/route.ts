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
  if (phone.length < 8 || phone.length > 20 || phone.slice(1).includes("+") || !/^\+?\d+$/.test(phone)) {
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
    // TRAINER REGISTRATION (Requires Admin-Generated Invite Code)
    // ---------------------------------------------------------
    if (accountType === "trainer") {
      const rawTrainerCode = typeof input.trainerCode === "string" ? input.trainerCode : "";
      const trainerCode = normalizeTrainerInviteCode(rawTrainerCode);
      if (!trainerCode) {
        return memberApiResponse(
          request,
          { error: "A trainer invite code from the gym admin is required to register as a trainer." },
          400,
        );
      }

      const invite = await TrainerInviteModel.findOne({ code: trainerCode });
      let targetTrainer = invite?.trainerId
        ? await TrainerModel.findById(invite.trainerId).select("+passwordHash")
        : await TrainerModel.findOne({ inviteCode: trainerCode }).select("+passwordHash");

      if (invite) {
        if (invite.status !== "unused") {
          return memberApiResponse(
            request,
            { error: "This trainer invite code has already been used or revoked." },
            400,
          );
        }
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          return memberApiResponse(
            request,
            { error: "This trainer invite code has expired. Ask your gym admin for a new code." },
            400,
          );
        }
      } else if (!targetTrainer) {
        return memberApiResponse(
          request,
          { error: "Invalid trainer invite code. Ask your gym admin to generate one on the website." },
          404,
        );
      }

      if (targetTrainer?.passwordHash) {
        return memberApiResponse(
          request,
          { error: "This trainer profile is already activated. Please sign in." },
          409,
        );
      }

      const gymId = invite ? invite.gymId : targetTrainer!.gymId;
      const gym = await GymModel.findById(gymId).select("name slug");
      if (!gym) {
        return memberApiResponse(request, { error: "Gym for this invite code was not found." }, 404);
      }

      const rawSpecialty = typeof input.specialty === "string" ? input.specialty.trim() : "";
      const specialty =
        rawSpecialty ||
        targetTrainer?.specialty ||
        invite?.presetSpecialty ||
        "Personal Training & Fitness";

      if (specialty.length > 100) {
        return memberApiResponse(
          request,
          { error: "Specialty must be 100 characters or fewer." },
          400,
        );
      }

      // Check for duplicate active trainer login in the same gym
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
        return memberApiResponse(
          request,
          { error: "A trainer account already exists with this phone or email. Please sign in." },
          409,
        );
      }

      // If no explicit trainerId was linked on the invite, check if an unclaimed directory trainer matches by phone/email
      if (!targetTrainer && conflictingTrainer && !conflictingTrainer.passwordHash) {
        targetTrainer = conflictingTrainer;
      }

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

      if (invite) {
        invite.status = "claimed";
        invite.claimedByTrainerId = trainerDoc._id;
        invite.claimedAt = new Date();
        await invite.save();
      } else {
        await TrainerInviteModel.updateMany(
          { gymId, code: trainerCode, status: "unused" },
          {
            $set: {
              status: "claimed",
              claimedByTrainerId: trainerDoc._id,
              claimedAt: new Date(),
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
    }

    // ---------------------------------------------------------
    // QUICK NORMAL MEMBER REGISTRATION (+ Front-Desk Claiming)
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

    const existing = await MemberModel.findOne({
      ...(explicitGym ? { gymId: explicitGym._id } : {}),
      $or: lookupOr,
    })
      .select("+passwordHash")
      .sort({ createdAt: -1 });

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing) {
      if (existing.passwordHash) {
        return memberApiResponse(
          request,
          { error: "An account already exists for this phone or email. Please sign in." },
          409,
        );
      }

      // Claim existing front-desk profile created by staff (preserves their gym & membership if any)
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
    // They connect by scanning a gym's QR code, picking a plan & payment method, and getting accepted by staff.
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
