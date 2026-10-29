import { model, models, Schema, type InferSchemaType } from "mongoose";

const trainerSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    specialty: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    assignedMemberIds: [{ type: Schema.Types.ObjectId, ref: "Member" }],
  },
  { timestamps: true },
);

trainerSchema.index({ gymId: 1, name: 1 });

export type Trainer = InferSchemaType<typeof trainerSchema>;

const TrainerModel = models.Trainer ?? model("Trainer", trainerSchema);

export default TrainerModel;