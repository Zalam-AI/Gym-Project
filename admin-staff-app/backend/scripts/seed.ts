import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { connectToDatabase } from "../lib/mongodb";
import AttendanceModel from "../models/attendance";
import GymModel from "../models/gym";
import MemberModel from "../models/member";
import MembershipModel from "../models/membership";
import PaymentModel from "../models/payment";

loadEnvConfig(resolve(process.cwd(), "../frontend"));

const sampleMembers = [
  {
    fullName: "Sam Rivera",
    phone: "+201001234567",
    email: "sam.rivera@example.com",
    status: "active" as const,
    joinDate: new Date("2026-09-28T09:00:00.000Z"),
    planName: "VIP Annual",
    price: 18000,
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    expiryDate: new Date("2027-10-01T00:00:00.000Z"),
    paymentAmount: 18000,
  },
  {
    fullName: "Jordan Lee",
    phone: "+201001234568",
    email: "jordan.lee@example.com",
    status: "active" as const,
    joinDate: new Date("2026-08-15T09:00:00.000Z"),
    planName: "3 Month Saver",
    price: 4500,
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    expiryDate: new Date("2026-12-01T00:00:00.000Z"),
    paymentAmount: 2250,
  },
  {
    fullName: "Taylor Morgan",
    phone: "+201001234569",
    email: "taylor.morgan@example.com",
    status: "expired" as const,
    joinDate: new Date("2026-04-10T09:00:00.000Z"),
    planName: "1 Month Regular",
    price: 1800,
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    expiryDate: new Date("2026-10-01T00:00:00.000Z"),
    paymentAmount: 1800,
  },
];

async function seed() {
  await connectToDatabase();

  const gym = await GymModel.findOneAndUpdate(
    { slug: "gymos-elite-new-cairo" },
    {
      $set: {
        name: "GymOS Elite - New Cairo",
        address: "New Cairo, Cairo, Egypt",
        phone: "+20225000000",
      },
      $setOnInsert: { slug: "gymos-elite-new-cairo" },
    },
    { new: true, upsert: true, runValidators: true },
  );

  const memberIds = new Map<string, string>();

  for (const sample of sampleMembers) {
    const member = await MemberModel.findOneAndUpdate(
      { gymId: gym._id, phone: sample.phone },
      {
        $set: {
          fullName: sample.fullName,
          email: sample.email,
          status: sample.status,
          joinDate: sample.joinDate,
        },
        $setOnInsert: { gymId: gym._id, phone: sample.phone },
      },
      { new: true, upsert: true, runValidators: true },
    );

    memberIds.set(sample.phone, member._id.toString());

    await MembershipModel.updateOne(
      {
        gymId: gym._id,
        memberId: member._id,
        planName: sample.planName,
        startDate: sample.startDate,
      },
      {
        $setOnInsert: {
          gymId: gym._id,
          memberId: member._id,
          planName: sample.planName,
          price: sample.price,
          startDate: sample.startDate,
          expiryDate: sample.expiryDate,
          status: sample.status === "expired" ? "expired" : "active",
        },
      },
      { upsert: true, runValidators: true },
    );

    const paymentDate = new Date("2026-10-28T08:30:00.000Z");
    await PaymentModel.updateOne(
      { gymId: gym._id, memberId: member._id, date: paymentDate },
      {
        $setOnInsert: {
          gymId: gym._id,
          memberId: member._id,
          amount: sample.paymentAmount,
          paymentMethod: "Cash",
          status: sample.status === "active" ? "Paid" : "Overdue",
          date: paymentDate,
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  const attendanceRecords = [
    { phone: sampleMembers[0].phone, checkInTime: new Date("2026-10-28T08:31:00.000Z") },
    { phone: sampleMembers[1].phone, checkInTime: new Date("2026-10-28T09:12:00.000Z") },
  ];

  for (const record of attendanceRecords) {
    const memberId = memberIds.get(record.phone);
    if (!memberId) {
      throw new Error(`Seed member not found for ${record.phone}`);
    }

    await AttendanceModel.updateOne(
      { gymId: gym._id, memberId, checkInTime: record.checkInTime },
      {
        $setOnInsert: {
          gymId: gym._id,
          memberId,
          checkInTime: record.checkInTime,
          status: "checked-in",
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  console.info(`Seeded GymOS sample data for gym ${gym._id.toString()}.`);
  console.info("Set GYMOS_GYM_ID to this ID to scope the Members API.");
}

seed()
  .catch((error: unknown) => {
    console.error("GymOS database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });
