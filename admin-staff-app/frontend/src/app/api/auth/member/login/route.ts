import bcrypt from "bcryptjs";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import GymModel from "gymos-admin-backend/models/gym";
import MemberModel from "gymos-admin-backend/models/member";
import TrainerModel from "gymos-admin-backend/models/trainer";
import {
  createMemberSessionToken,
  createTrainerSessionToken,
} from "@/lib/member-session";
import {
  buildPhoneCandidates,
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
  parseMemberAuthBody,
  resolveMemberGym,
  setMemberSessionCookie,
} from "@/lib/member-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const DUMMY_BCRYPT_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8h0R5wB6s5c/4G6sT2f5m2uJ1e5S6a";

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function POST(request: Request) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const rate = checkRateLimit(request, {
    namespace: "mobile-login",
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    const res = memberApiResponse(
      request,
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
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
  const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
  const phoneCandidates = buildPhoneCandidates(identifier);
  const normalizedEmail = identifier.toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const preferredRole =
    input.accountType === "trainer"
      ? "trainer"
      : input.accountType === "member"
        ? "member"
        : undefined;

  if (!identifier || !password) {
    return memberApiResponse(request, { error: "Phone or email and password are required." }, 400);
  }

  try {
    await connectToDatabase();

    const explicitGymCode =
      typeof input.gymCode === "string" && input.gymCode.trim() ? input.gymCode.trim() : "";
    const explicitGym = explicitGymCode ? await resolveMemberGym(explicitGymCode) : null;
    if (explicitGymCode && !explicitGym) {
      return memberApiResponse(request, { error: "Enter a valid gym code." }, 404);
    }

    const orConditions: Array<Record<string, unknown>> = [{ email: normalizedEmail }];
    if (phoneCandidates.length > 0) {
      orConditions.push({ phone: { $in: phoneCandidates } });
    }

    const [trainers, members] = await Promise.all([
      preferredRole === "member"
        ? Promise.resolve([])
        : TrainerModel.find({
            ...(explicitGym ? { gymId: explicitGym._id } : {}),
            $or: orConditions,
          })
            .select("+passwordHash")
            .sort({ createdAt: -1 }),
      preferredRole === "trainer"
        ? Promise.resolve([])
        : MemberModel.find({
            ...(explicitGym ? { gymId: explicitGym._id } : {}),
            $or: orConditions,
          })
            .select("+passwordHash")
            .sort({ createdAt: -1 }),
    ]);

    let checkedAnyPassword = false;

    // Check Trainer credentials first
    const matchedTrainers = [];
    for (const trainer of trainers) {
      if (!trainer.passwordHash) continue;
      checkedAnyPassword = true;
      const validTrainerPassword = await bcrypt.compare(password, trainer.passwordHash);
      if (validTrainerPassword) {
        matchedTrainers.push(trainer);
      }
    }

    if (matchedTrainers.length > 0) {
      const activeTrainerEntries = [];
      for (const candidate of matchedTrainers) {
        if (candidate.status === "inactive") continue;
        const gym = await GymModel.findOne({
          _id: candidate.gymId,
          status: "active",
        }).select("_id");
        if (gym) {
          activeTrainerEntries.push(candidate);
        }
      }

      if (activeTrainerEntries.length === 0) {
        return memberApiResponse(
          request,
          {
            error:
              "This trainer account or gym workspace is currently inactive. Contact the gym admin.",
          },
          403,
        );
      }

      const distinctTrainerGyms = new Set(
        activeTrainerEntries.map((t) => String(t.gymId)),
      );
      if (!explicitGym && distinctTrainerGyms.size > 1) {
        return memberApiResponse(
          request,
          {
            error:
              "Multiple gym trainer profiles match this login. Enter your gym code/slug to select your gym.",
          },
          409,
        );
      }

      const trainer = activeTrainerEntries[0];
      const token = await createTrainerSessionToken(
        trainer._id.toString(),
        trainer.gymId.toString(),
      );
      const response = memberApiResponse(request, {
        role: "trainer",
        sessionToken: token,
        trainer: {
          id: trainer._id.toString(),
          name: trainer.name,
          specialty: trainer.specialty,
          email: trainer.email,
        },
      });
      setMemberSessionCookie(response, token, request);
      return response;
    }

    // Check Member credentials (supports both gym-enrolled and new unaffiliated members)
    const matchedMembers = [];
    for (const member of members) {
      if (!member.passwordHash) continue;
      checkedAnyPassword = true;
      const validMemberPassword = await bcrypt.compare(password, member.passwordHash);
      if (validMemberPassword) {
        matchedMembers.push(member);
      }
    }

    if (matchedMembers.length > 0) {
      const activeGymMembers = [];
      for (const candidate of matchedMembers) {
        if (candidate.gymId) {
          const activeGym = await GymModel.exists({
            _id: candidate.gymId,
            status: "active",
          });
          if (activeGym && candidate.status !== "suspended") {
            activeGymMembers.push(candidate);
          }
        }
      }

      const distinctMemberGyms = new Set(
        activeGymMembers.map((m) => String(m.gymId)),
      );
      if (!explicitGym && distinctMemberGyms.size > 1) {
        return memberApiResponse(
          request,
          {
            error:
              "Multiple gym memberships match this login. Enter your gym code/slug to select your gym.",
          },
          409,
        );
      }

      const chosenMember = activeGymMembers[0] ?? matchedMembers[0];
      if (chosenMember.status === "suspended") {
        return memberApiResponse(
          request,
          { error: "This member account is currently suspended. Contact your gym." },
          403,
        );
      }
      if (chosenMember.gymId) {
        const gymActive = await GymModel.exists({
          _id: chosenMember.gymId,
          status: "active",
        });
        if (!gymActive) {
          return memberApiResponse(
            request,
            { error: "This gym workspace is currently unavailable." },
            403,
          );
        }
      }

      const memberGymId = chosenMember.gymId ? chosenMember.gymId.toString() : "";
      const token = await createMemberSessionToken(chosenMember._id.toString(), memberGymId);
      const response = memberApiResponse(request, {
        role: "member",
        sessionToken: token,
        member: {
          id: chosenMember._id.toString(),
          name: chosenMember.fullName,
          email: chosenMember.email,
        },
      });
      setMemberSessionCookie(response, token, request);
      return response;
    }

    if (!checkedAnyPassword) {
      // Equalize response timing when identifier does not exist or has no password set
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    }

    return memberApiResponse(
      request,
      {
        error:
          "Invalid credentials. If your gym added you at reception without a password, tap Create an account to activate your login.",
      },
      401,
    );
  } catch (error) {
    console.error("Mobile login failed:", error);
    return memberApiResponse(request, { error: "Unable to sign in at this time." }, 503);
  }
}
