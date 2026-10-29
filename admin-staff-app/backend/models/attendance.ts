import { model, models, Schema, type InferSchemaType } from "mongoose";

const attendanceSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    attendeeType: {
      type: String,
      enum: ["member", "trainer"],
      default: "member",
      required: true,
    },
    memberId: { type: Schema.Types.ObjectId, ref: "Member" },
    trainerId: { type: Schema.Types.ObjectId, ref: "Trainer" },
    checkInTime: { type: Date, required: true, default: Date.now },
    checkOutTime: { type: Date },
    source: {
      type: String,
      enum: ["Front desk", "Member self-scan", "Trainer self-scan"],
      default: "Front desk",
    },
    status: { type: String, enum: ["checked-in", "checked-out"], required: true },
  },
  { timestamps: true },
);

attendanceSchema.index({ gymId: 1, memberId: 1, checkInTime: -1 });
attendanceSchema.index({ gymId: 1, trainerId: 1, checkInTime: -1 });
attendanceSchema.index({ gymId: 1, status: 1, checkInTime: 1 });

export type Attendance = InferSchemaType<typeof attendanceSchema>;

const AttendanceModel = models.Attendance ?? model("Attendance", attendanceSchema);

export default AttendanceModel;
