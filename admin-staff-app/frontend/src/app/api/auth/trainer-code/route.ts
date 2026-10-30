import { NextRequest } from "next/server";
import { connectToDatabase } from "gymos-admin-backend/lib/mongodb";
import { normalizeTrainerInviteCode } from "gymos-admin-backend/lib/trainer-code";
import GymModel from "gymos-admin-backend/models/gym";
import TrainerModel from "gymos-admin-backend/models/trainer";
import TrainerInviteModel from "gymos-admin-backend/models/trainer-invite";
import {
  isAllowedMemberOrigin,
  memberApiOptions,
  memberApiResponse,
} from "@/lib/member-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return memberApiOptions(request);
}

export async function GET(request: NextRequest) {
  if (!isAllowedMemberOrigin(request)) {
    return memberApiResponse(request, { error: "Origin is not allowed." }, 403);
  }

  const rate = checkRateLimit(request, {
    namespace: "trainer-code-check",
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    const res = memberApiResponse(
      request,
      { valid: false, error: "Too many code checks. Please wait a few minutes and try again." },
      429,
    );
    res.headers.set("Retry-After", String(rate.retryAfterSeconds));
    return res;
  }

  const rawCode = request.nextUrl.searchParams.get("code") ?? "";
  const code = normalizeTrainerInviteCode(rawCode);
  if (!code || code.length < 6) {
    return memberApiResponse(request, { error: "Enter a trainer invite code." }, 400);
  }

  try {
    await connectToDatabase();

    const invite = await TrainerInviteModel.findOne({ code, status: "unused" });
    if (invite) {
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return memberApiResponse(
          request,
          { valid: false, error: "This trainer invite code has expired." },
          404,
        );
      }

      const [gym, linkedTrainer] = await Promise.all([
        GymModel.findOne({ _id: invite.gymId, status: "active" }).select("name slug"),
        invite.trainerId
          ? TrainerModel.findById(invite.trainerId).select("name specialty phone +passwordHash")
          : Promise.resolve(null),
      ]);

      if (!gym) {
        return memberApiResponse(request, { valid: false, error: "Gym was not found." }, 404);
      }
      if (linkedTrainer?.passwordHash) {
        return memberApiResponse(
          request,
          { valid: false, error: "This trainer account has already been activated." },
          409,
        );
      }

      return memberApiResponse(request, {
        valid: true,
        code,
        gymName: gym.name,
        gymSlug: gym.slug,
        presetName: linkedTrainer?.name ?? invite.presetName ?? "",
        presetSpecialty: linkedTrainer?.specialty ?? invite.presetSpecialty ?? "",
        presetPhone: linkedTrainer?.phone ?? invite.presetPhone ?? "",
      });
    }

    const trainer = await TrainerModel.findOne({ inviteCode: code }).select(
      "gymId name specialty phone +passwordHash",
    );
    if (!trainer) {
      return memberApiResponse(
        request,
        { valid: false, error: "Invalid or already-used trainer invite code." },
        404,
      );
    }
    if (trainer.passwordHash) {
      return memberApiResponse(
        request,
        { valid: false, error: "This trainer invite code has already been claimed." },
        409,
      );
    }

    const gym = await GymModel.findOne({
      _id: trainer.gymId,
      status: "active",
    }).select("name slug");
    if (!gym) {
      return memberApiResponse(request, { valid: false, error: "Gym was not found." }, 404);
    }

    return memberApiResponse(request, {
      valid: true,
      code,
      gymName: gym.name,
      gymSlug: gym.slug,
      presetName: trainer.name,
      presetSpecialty: trainer.specialty,
      presetPhone: trainer.phone,
    });
  } catch (error) {
    console.error("Failed to verify trainer invite code:", error);
    return memberApiResponse(
      request,
      { valid: false, error: "Unable to verify code right now." },
      503,
    );
  }
}
