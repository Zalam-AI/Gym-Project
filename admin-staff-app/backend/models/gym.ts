import { model, models, Schema, type InferSchemaType } from "mongoose";

const gymSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type Gym = InferSchemaType<typeof gymSchema>;

const GymModel = models.Gym ?? model("Gym", gymSchema);

export default GymModel;
