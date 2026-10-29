import { model, models, Schema, type InferSchemaType } from "mongoose";

const staffUserSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

staffUserSchema.index({ email: 1 }, { unique: true });

export type StaffUser = InferSchemaType<typeof staffUserSchema>;

const StaffUserModel = models.StaffUser ?? model("StaffUser", staffUserSchema);

export default StaffUserModel;
