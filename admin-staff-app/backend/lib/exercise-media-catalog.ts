import { Types } from "mongoose";
import ExerciseMediaModel, {
  EXERCISE_MEDIA_SOURCES,
  EXERCISE_MEDIA_TYPES,
  type ExerciseMediaSource,
  type ExerciseMediaType,
} from "../models/exercise-media";

export type CatalogExerciseMediaInput = {
  exerciseName: string;
  exerciseKey?: string;
  aliases?: string[];
  targetMuscleGroup?: string;
  equipment?: string;
  mediaType: ExerciseMediaType;
  mediaSource?: ExerciseMediaSource;
  mediaUrl?: string;
  posterUrl?: string;
  providerName?: string;
  providerExerciseId?: string;
  animationKey?: string;
  formCue?: string;
  license?: string;
  fileSizeBytes?: number;
};

export function normalizeExerciseMediaKey(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/**
 * Bulk-upserts exercise demonstration references (global or per-gym) without
 * modifying WorkoutLog, ActiveWorkoutSession, MemberRoutine, or WorkoutPlan.
 * Makes importing hundreds of GIF/MP4/provider assets a single idempotent call.
 */
export async function upsertExerciseMediaCatalog(
  items: CatalogExerciseMediaInput[],
  gymId: Types.ObjectId | null = null,
): Promise<number> {
  const validTypes = new Set<string>(EXERCISE_MEDIA_TYPES);
  const validSources = new Set<string>(EXERCISE_MEDIA_SOURCES);

  const ops = items
    .map((item) => {
      const exerciseName = (item.exerciseName || "").trim().slice(0, 80);
      const exerciseKey = normalizeExerciseMediaKey(item.exerciseKey || exerciseName);
      if (!exerciseName || !exerciseKey) return null;

      const mediaType: ExerciseMediaType = validTypes.has(item.mediaType)
        ? item.mediaType
        : "svg_2d";
      const mediaSource: ExerciseMediaSource =
        item.mediaSource && validSources.has(item.mediaSource)
          ? item.mediaSource
          : item.mediaUrl
            ? item.mediaUrl.startsWith("/")
              ? "local_asset"
              : "remote_url"
            : "builtin";

      const aliases = Array.from(
        new Set(
          (item.aliases ?? [])
            .map((a) => normalizeExerciseMediaKey(a))
            .filter((a) => Boolean(a) && a !== exerciseKey),
        ),
      );

      return {
        updateOne: {
          filter: { gymId, exerciseKey },
          update: {
            $set: {
              gymId,
              exerciseKey,
              exerciseName,
              aliases,
              targetMuscleGroup: (item.targetMuscleGroup || "Full body").trim().slice(0, 40),
              equipment: (item.equipment || "Bodyweight").trim().slice(0, 40),
              mediaType,
              mediaSource,
              mediaUrl: (item.mediaUrl || "").trim().slice(0, 500),
              posterUrl: (item.posterUrl || "").trim().slice(0, 500),
              providerName: (item.providerName || "gymos-2d").trim().slice(0, 60),
              providerExerciseId: (item.providerExerciseId || "").trim().slice(0, 120),
              animationKey: (item.animationKey || "").trim().slice(0, 60),
              formCue: (item.formCue || "").trim().slice(0, 220),
              license: (item.license || "GymOS First-Party Vector").trim().slice(0, 120),
              fileSizeBytes: Math.max(0, Math.round(Number(item.fileSizeBytes) || 0)),
            },
          },
          upsert: true,
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  if (ops.length === 0) return 0;
  await ExerciseMediaModel.bulkWrite(ops, { ordered: false });
  return ops.length;
}
