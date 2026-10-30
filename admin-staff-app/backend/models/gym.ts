import { model, models, Schema, type InferSchemaType } from "mongoose";

const gymSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 64,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      required: true,
    },
    capacity: {
      type: Number,
      min: 1,
      max: 5000,
      default: 100,
      required: true,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "Africa/Cairo",
      required: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 8,
      default: "EGP",
      required: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "StaffUser" },
  },
  { timestamps: true },
);

export type Gym = InferSchemaType<typeof gymSchema>;

const GymModel = models.Gym ?? model("Gym", gymSchema);

export default GymModel;
