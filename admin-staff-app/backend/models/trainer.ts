import { model, models, Schema, type InferSchemaType } from "mongoose";

const availabilitySlotSchema = new Schema(
  {
    day: {
      type: String,
      enum: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
      required: true,
    },
    startTime: { type: String, required: true, trim: true, maxlength: 10 },
    endTime: { type: String, required: true, trim: true, maxlength: 10 },
  },
  { _id: false },
);

const trainerSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    specialty: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, select: false },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    inviteCode: { type: String, trim: true, uppercase: true, maxlength: 32 },
    availability: { type: [availabilitySlotSchema], default: [] },
    assignedMemberIds: [{ type: Schema.Types.ObjectId, ref: "Member" }],
  },
  { timestamps: true },
);

trainerSchema.index({ gymId: 1, name: 1 });
trainerSchema.index({ gymId: 1, phone: 1 });
trainerSchema.index({ inviteCode: 1 }, { sparse: true });

export type Trainer = InferSchemaType<typeof trainerSchema>;

const TrainerModel = models.Trainer ?? model("Trainer", trainerSchema);

export default TrainerModel;
