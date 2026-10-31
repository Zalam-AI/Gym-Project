import { model, models, Schema, type InferSchemaType } from "mongoose";

export const EXERCISE_MEDIA_TYPES = [
  "svg_2d",
  "gif",
  "mp4",
  "webm",
  "image",
  "none",
] as const;
export type ExerciseMediaType = (typeof EXERCISE_MEDIA_TYPES)[number];

export const EXERCISE_MEDIA_SOURCES = [
  "builtin",
  "local_asset",
  "remote_url",
  "provider",
] as const;
export type ExerciseMediaSource = (typeof EXERCISE_MEDIA_SOURCES)[number];

const exerciseMediaSchema = new Schema(
  {
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: false,
      default: null,
    },
    exerciseKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    exerciseName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    aliases: {
      type: [String],
      default: [],
    },
    targetMuscleGroup: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "Full body",
    },
    equipment: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "Bodyweight",
    },
    mediaType: {
      type: String,
      enum: EXERCISE_MEDIA_TYPES,
      required: true,
      default: "svg_2d",
    },
    mediaSource: {
      type: String,
      enum: EXERCISE_MEDIA_SOURCES,
      required: true,
      default: "builtin",
    },
    mediaUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    posterUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    providerName: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "gymos-2d",
    },
    providerExerciseId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    animationKey: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    formCue: {
      type: String,
      trim: true,
      maxlength: 220,
      default: "",
    },
    license: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "GymOS First-Party Vector",
    },
    fileSizeBytes: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

exerciseMediaSchema.index({ gymId: 1, exerciseKey: 1 }, { unique: true });
exerciseMediaSchema.index({ aliases: 1 });

export type ExerciseMediaDoc = InferSchemaType<typeof exerciseMediaSchema>;

const ExerciseMediaModel =
  models.ExerciseMedia ?? model("ExerciseMedia", exerciseMediaSchema);

export default ExerciseMediaModel;
