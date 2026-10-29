import bcrypt from "bcryptjs";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
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

export const runtime = "nodejs";

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

    // Check Trainer credentials first
    for (const trainer of trainers) {
      if (!trainer.passwordHash) continue;
      const validTrainerPassword = await bcrypt.compare(password, trainer.passwordHash);
      if (validTrainerPassword) {
        if (trainer.status === "inactive") {
          return memberApiResponse(
            request,
            { error: "This trainer account is currently inactive. Contact the gym admin." },
            403,
          );
        }
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
    }

    // Check Member credentials (supports both gym-enrolled and new unaffiliated members)
    for (const member of members) {
      if (!member.passwordHash) continue;
      const validMemberPassword = await bcrypt.compare(password, member.passwordHash);
      if (validMemberPassword) {
        const memberGymId = member.gymId ? member.gymId.toString() : "";
        const token = await createMemberSessionToken(member._id.toString(), memberGymId);
        const response = memberApiResponse(request, {
          role: "member",
          sessionToken: token,
          member: { id: member._id.toString(), name: member.fullName, email: member.email },
        });
        setMemberSessionCookie(response, token, request);
        return response;
      }
    }

    const unclaimedTrainer = trainers.find((t) => !t.passwordHash);
    const hasPasswordMember = members.some((m) => Boolean(m.passwordHash));
    if (unclaimedTrainer && !hasPasswordMember) {
      return memberApiResponse(
        request,
        {
          error:
            "Your trainer profile exists, but no password is set yet. Switch to Create Account → Trainer and use the invite code from your gym admin.",
        },
        401,
      );
    }

    const unclaimedMember = members.find((m) => !m.passwordHash);
    if (unclaimedMember && !hasPasswordMember) {
      return memberApiResponse(
        request,
        {
          error:
            "Your gym profile exists, but no password has been set yet. Switch to Create Account to activate your login.",
        },
        401,
      );
    }

    return memberApiResponse(request, { error: "Invalid credentials." }, 401);
  } catch (error) {
    console.error("Mobile login failed:", error);
    return memberApiResponse(request, { error: "Unable to sign in at this time." }, 503);
  }
}
