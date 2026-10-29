import { model, models, Schema, type InferSchemaType } from "mongoose";

const paymentSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, maxlength: 100 },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Instapay"],
      required: true,
    },
    status: { type: String, enum: ["Paid", "Partial", "Pending", "Overdue"], required: true },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

paymentSchema.index({ gymId: 1, memberId: 1, date: -1 });

export type Payment = InferSchemaType<typeof paymentSchema>;

const PaymentModel = models.Payment ?? model("Payment", paymentSchema);

export default PaymentModel;
