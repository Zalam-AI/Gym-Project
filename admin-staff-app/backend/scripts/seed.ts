import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { resolve } from "node:path";
import { connectToDatabase } from "../lib/mongodb";
import { hashStaffPassword } from "../lib/staff-password";
import AttendanceModel from "../models/attendance";
import GymModel from "../models/gym";
import MemberModel from "../models/member";
import MembershipModel from "../models/membership";
import MembershipPlanModel from "../models/membership-plan";
import MembershipRequestModel from "../models/membership-request";
import PaymentModel from "../models/payment";
import StaffUserModel from "../models/staff-user";
import TrainerModel from "../models/trainer";
import TrainerInviteModel from "../models/trainer-invite";
import TrainingSessionModel from "../models/training-session";
import WorkoutPlanModel from "../models/workout-plan";

loadEnvConfig(resolve(process.cwd(), "../frontend"));

function daysFromToday(offsetDays: number, hourUtc = 9, minuteUtc = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
      hourUtc,
      minuteUtc,
      0,
      0,
    ),
  );
}

const samplePlans = [
  {
    name: "1 Month Regular",
    price: 1800,
    durationMonths: 1,
    featured: false,
    benefits: [
      "Full gym floor & cardio access",
      "Locker room & shower facilities",
      "Digital QR member pass",
    ],
  },
  {
    name: "3 Month Saver",
    price: 4500,
    durationMonths: 3,
    featured: true,
    benefits: [
      "Full gym floor & free weights",
      "2 group fitness classes / week",
      "1 InBody composition scan",
    ],
  },
  {
    name: "VIP Annual",
    price: 18000,
    durationMonths: 12,
    featured: false,
    benefits: [
      "Unlimited club access all year",
      "Personal trainer & custom workout plan",
      "Monthly InBody scans & recovery lounge",
    ],
  },
];

const defaultAvailability = [
  { day: "Sun", startTime: "10:00", endTime: "18:00" },
  { day: "Mon", startTime: "10:00", endTime: "18:00" },
  { day: "Tue", startTime: "10:00", endTime: "18:00" },
  { day: "Wed", startTime: "10:00", endTime: "18:00" },
  { day: "Thu", startTime: "10:00", endTime: "18:00" },
] as const;

async function seed() {
  await connectToDatabase();

  const configuredGymId =
    process.env.GYMOS_GYM_ID && Types.ObjectId.isValid(process.env.GYMOS_GYM_ID)
      ? new Types.ObjectId(process.env.GYMOS_GYM_ID)
      : undefined;

  const gym = await GymModel.findOneAndUpdate(
    { slug: "gymos-elite-new-cairo" },
    {
      $set: {
        name: "GymOS Elite - New Cairo",
        address: "New Cairo, Cairo, Egypt",
        phone: "+20225000000",
      },
      $setOnInsert: {
        slug: "gymos-elite-new-cairo",
        ...(configuredGymId ? { _id: configuredGymId } : {}),
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  // Seed default demo staff account (idempotent)
  const existingStaff = await StaffUserModel.findOne({ email: "admin@gymos.local" });
  if (!existingStaff) {
    const staffPasswordHash = await hashStaffPassword("GymOSAdmin123!");
    await StaffUserModel.create({
      gymId: gym._id,
      fullName: "Omar Khaled",
      email: "admin@gymos.local",
      passwordHash: staffPasswordHash,
    });
  } else if (String(existingStaff.gymId) !== String(gym._id)) {
    existingStaff.gymId = gym._id;
    await existingStaff.save();
  }

  // Seed membership plans
  for (const plan of samplePlans) {
    await MembershipPlanModel.findOneAndUpdate(
      { gymId: gym._id, name: plan.name },
      {
        $set: {
          price: plan.price,
          durationMonths: plan.durationMonths,
          featured: plan.featured,
          benefits: plan.benefits,
          active: true,
        },
        $setOnInsert: { gymId: gym._id, name: plan.name },
      },
      { upsert: true, runValidators: true },
    );
  }

  const demoMemberPasswordHash = await bcrypt.hash("MemberPass123!", 10);
  const demoTrainerPasswordHash = await bcrypt.hash("TrainerPass123!", 10);

  const sampleMembers = [
    {
      fullName: "Sam Rivera",
      phone: "+201001234567",
      email: "sam.rivera@example.com",
      hasPassword: true,
      status: "active" as const,
      joinDate: daysFromToday(-25),
      planName: "VIP Annual",
      price: 18000,
      startDate: daysFromToday(-25, 0, 0),
      expiryDate: daysFromToday(340, 0, 0),
      membershipPaymentStatus: "Paid" as const,
      paymentAmount: 18000,
      paymentMethod: "Card" as const,
      paymentStatus: "Paid" as const,
      paymentDescription: "VIP Annual membership",
      paymentDate: daysFromToday(-25, 10, 15),
    },
    {
      fullName: "Nour Hassan",
      phone: "+201001234570",
      email: "nour.hassan@example.com",
      hasPassword: false, // Front-desk registered member (ready to test account claiming!)
      status: "active" as const,
      joinDate: daysFromToday(-10),
      planName: "3 Month Saver",
      price: 4500,
      startDate: daysFromToday(-10, 0, 0),
      expiryDate: daysFromToday(80, 0, 0),
      membershipPaymentStatus: "Paid" as const,
      paymentAmount: 4500,
      paymentMethod: "Instapay" as const,
      paymentStatus: "Paid" as const,
      paymentDescription: "3 Month Saver membership",
      paymentDate: daysFromToday(-10, 14, 0),
    },
    {
      fullName: "Jordan Lee",
      phone: "+201001234568",
      email: "jordan.lee@example.com",
      hasPassword: true,
      status: "active" as const,
      joinDate: daysFromToday(-87),
      planName: "3 Month Saver",
      price: 4500,
      startDate: daysFromToday(-87, 0, 0),
      expiryDate: daysFromToday(3, 0, 0), // Expiring in 3 days!
      membershipPaymentStatus: "Pending" as const,
      paymentAmount: 2250,
      paymentMethod: "Cash" as const,
      paymentStatus: "Pending" as const,
      paymentDescription: "3 Month Saver balance",
      paymentDate: daysFromToday(-5, 11, 30),
    },
    {
      fullName: "Taylor Morgan",
      phone: "+201001234569",
      email: "taylor.morgan@example.com",
      hasPassword: true,
      status: "expired" as const,
      joinDate: daysFromToday(-35),
      planName: "1 Month Regular",
      price: 1800,
      startDate: daysFromToday(-35, 0, 0),
      expiryDate: daysFromToday(-4, 0, 0), // Expired 4 days ago!
      membershipPaymentStatus: "Pending" as const,
      paymentAmount: 1800,
      paymentMethod: "Cash" as const,
      paymentStatus: "Overdue" as const,
      paymentDescription: "1 Month Regular renewal due",
      paymentDate: daysFromToday(-4, 9, 0),
    },
  ];

  const memberIdsByPhone = new Map<string, string>();

  for (const sample of sampleMembers) {
    const existingMember = await MemberModel.findOne({
      gymId: gym._id,
      phone: sample.phone,
    }).select("+passwordHash");

    let memberId: string;
    if (!existingMember) {
      const created = await MemberModel.create({
        gymId: gym._id,
        fullName: sample.fullName,
        phone: sample.phone,
        email: sample.email,
        ...(sample.hasPassword ? { passwordHash: demoMemberPasswordHash } : {}),
        status: sample.status,
        joinDate: sample.joinDate,
      });
      memberId = created._id.toString();
    } else {
      existingMember.fullName = sample.fullName;
      existingMember.email = sample.email;
      existingMember.status = sample.status;
      if (sample.hasPassword && !existingMember.passwordHash) {
        existingMember.passwordHash = demoMemberPasswordHash;
      }
      await existingMember.save();
      memberId = existingMember._id.toString();
    }

    memberIdsByPhone.set(sample.phone, memberId);

    const existingMembership = await MembershipModel.findOne({
      gymId: gym._id,
      memberId,
    });
    if (!existingMembership) {
      await MembershipModel.create({
        gymId: gym._id,
        memberId,
        planName: sample.planName,
        price: sample.price,
        startDate: sample.startDate,
        expiryDate: sample.expiryDate,
        status: sample.status === "expired" ? "expired" : "active",
        paymentStatus: sample.membershipPaymentStatus,
      });
    }

    const existingPayment = await PaymentModel.findOne({
      gymId: gym._id,
      memberId,
    });
    if (!existingPayment) {
      await PaymentModel.create({
        gymId: gym._id,
        memberId,
        amount: sample.paymentAmount,
        description: sample.paymentDescription,
        paymentMethod: sample.paymentMethod,
        status: sample.paymentStatus,
        date: sample.paymentDate,
      });
    }
  }

  const samId = memberIdsByPhone.get("+201001234567")!;
  const nourId = memberIdsByPhone.get("+201001234570")!;
  const jordanId = memberIdsByPhone.get("+201001234568")!;

  // 1. Seed Karim Mansour — Active Mobile App Trainer (already has password & schedule)
  let karim = await TrainerModel.findOne({ gymId: gym._id, name: "Karim Mansour" }).select(
    "+passwordHash",
  );
  if (!karim) {
    karim = await TrainerModel.create({
      gymId: gym._id,
      name: "Karim Mansour",
      specialty: "Strength & Hypertrophy",
      phone: "+201015550101",
      email: "karim.mansour@example.com",
      passwordHash: demoTrainerPasswordHash,
      status: "active",
      availability: [...defaultAvailability],
      assignedMemberIds: [samId, jordanId],
    });
  } else {
    karim.specialty = "Strength & Hypertrophy";
    karim.phone = "+201015550101";
    karim.email = "karim.mansour@example.com";
    karim.status = "active";
    if (!karim.passwordHash) {
      karim.passwordHash = demoTrainerPasswordHash;
    }
    if (!karim.availability || karim.availability.length === 0) {
      karim.set("availability", [...defaultAvailability]);
    }
    const existingAssigned = new Set(
      (karim.assignedMemberIds ?? []).map((id: unknown) => String(id)),
    );
    for (const mId of [samId, jordanId]) {
      if (!existingAssigned.has(mId)) {
        karim.assignedMemberIds.push(mId as unknown as (typeof karim.assignedMemberIds)[number]);
      }
    }
    await karim.save();
  }

  // 2. Seed Maya Hassan — Unclaimed Directory Trainer with Invite Code TRN-MAYA-2026
  let maya = await TrainerModel.findOne({ gymId: gym._id, name: "Maya Hassan" }).select(
    "+passwordHash",
  );
  if (!maya) {
    maya = await TrainerModel.create({
      gymId: gym._id,
      name: "Maya Hassan",
      specialty: "Athletic Conditioning & Mobility",
      phone: "+201015550202",
      status: "active",
      inviteCode: "TRN-MAYA-2026",
      availability: [
        { day: "Sat", startTime: "09:00", endTime: "16:00" },
        { day: "Mon", startTime: "11:00", endTime: "19:00" },
        { day: "Wed", startTime: "11:00", endTime: "19:00" },
      ],
      assignedMemberIds: [nourId],
    });
  } else if (!maya.passwordHash && !maya.inviteCode) {
    maya.inviteCode = "TRN-MAYA-2026";
    if (!maya.availability || maya.availability.length === 0) {
      maya.set("availability", [
        { day: "Sat", startTime: "09:00", endTime: "16:00" },
        { day: "Mon", startTime: "11:00", endTime: "19:00" },
        { day: "Wed", startTime: "11:00", endTime: "19:00" },
      ]);
    }
    await maya.save();
  }

  // Seed Trainer Invite Codes (Maya's code + an open New Coach code TRN-COACH-2026)
  if (!maya.passwordHash) {
    await TrainerInviteModel.findOneAndUpdate(
      { code: "TRN-MAYA-2026" },
      {
        $setOnInsert: {
          gymId: gym._id,
          code: "TRN-MAYA-2026",
          trainerId: maya._id,
          presetName: "Maya Hassan",
          presetSpecialty: "Athletic Conditioning & Mobility",
          presetPhone: "+201015550202",
          status: "unused",
          expiresAt: daysFromToday(30),
        },
      },
      { upsert: true },
    );
  }

  await TrainerInviteModel.findOneAndUpdate(
    { code: "TRN-COACH-2026" },
    {
      $setOnInsert: {
        gymId: gym._id,
        code: "TRN-COACH-2026",
        presetSpecialty: "Personal Training & Fitness",
        status: "unused",
        expiresAt: daysFromToday(30),
      },
    },
    { upsert: true },
  );

  // Seed scheduled Coaching Sessions if none exist yet
  const existingSessionsCount = await TrainingSessionModel.countDocuments({ gymId: gym._id });
  if (existingSessionsCount === 0) {
    await TrainingSessionModel.insertMany([
      {
        gymId: gym._id,
        trainerId: karim._id,
        memberId: samId,
        title: "Upper Body Hypertrophy & Bench Progression",
        startsAt: daysFromToday(1, 16, 0),
        durationMinutes: 60,
        status: "scheduled",
        notes: "Focus on incline press tempo and weighted pull-ups.",
      },
      {
        gymId: gym._id,
        trainerId: karim._id,
        memberId: jordanId,
        title: "Deadlift Form & Posterior Chain",
        startsAt: daysFromToday(2, 18, 0),
        durationMinutes: 45,
        status: "scheduled",
        notes: "Review hip hinge mechanics and core bracing.",
      },
      {
        gymId: gym._id,
        trainerId: maya._id,
        memberId: nourId,
        title: "Kettlebell Conditioning & Mobility",
        startsAt: daysFromToday(1, 11, 30),
        durationMinutes: 60,
        status: "scheduled",
        notes: "Dynamic warm-up + metabolic conditioning.",
      },
    ]);
  }

  // Seed workout plans
  await WorkoutPlanModel.findOneAndUpdate(
    { gymId: gym._id, title: "3-Day Hypertrophy Split" },
    {
      $set: {
        targetGoal: "Build lean muscle",
        exercises: [
          {
            exerciseName: "Incline Dumbbell Bench Press",
            sets: "4",
            reps: "8-10",
            restTime: "90 sec",
            targetMuscleGroup: "Chest",
          },
          {
            exerciseName: "Weighted Pull-Ups",
            sets: "4",
            reps: "8",
            restTime: "90 sec",
            targetMuscleGroup: "Back",
          },
          {
            exerciseName: "Romanian Deadlift",
            sets: "3",
            reps: "10",
            restTime: "90 sec",
            targetMuscleGroup: "Legs",
          },
          {
            exerciseName: "Seated Lateral Raises",
            sets: "3",
            reps: "12-15",
            restTime: "60 sec",
            targetMuscleGroup: "Shoulders",
          },
          {
            exerciseName: "Hanging Leg Raises",
            sets: "3",
            reps: "12",
            restTime: "60 sec",
            targetMuscleGroup: "Core",
          },
        ],
      },
      $addToSet: {
        assignedMemberIds: { $each: [samId, jordanId] },
      },
      $setOnInsert: { gymId: gym._id, title: "3-Day Hypertrophy Split" },
    },
    { upsert: true, runValidators: true },
  );

  await WorkoutPlanModel.findOneAndUpdate(
    { gymId: gym._id, title: "Athletic Core & Conditioning" },
    {
      $set: {
        targetGoal: "Endurance & mobility",
        exercises: [
          {
            exerciseName: "Goblet Squat",
            sets: "3",
            reps: "12",
            restTime: "60 sec",
            targetMuscleGroup: "Legs",
          },
          {
            exerciseName: "Kettlebell Swings",
            sets: "4",
            reps: "15",
            restTime: "60 sec",
            targetMuscleGroup: "Full body",
          },
          {
            exerciseName: "Single-Arm Dumbbell Row",
            sets: "3",
            reps: "10",
            restTime: "60 sec",
            targetMuscleGroup: "Back",
          },
          {
            exerciseName: "Plank Shoulder Taps",
            sets: "3",
            reps: "45 sec",
            restTime: "45 sec",
            targetMuscleGroup: "Core",
          },
        ],
      },
      $addToSet: {
        assignedMemberIds: { $each: [nourId] },
      },
      $setOnInsert: { gymId: gym._id, title: "Athletic Core & Conditioning" },
    },
    { upsert: true, runValidators: true },
  );

  // Seed 7-day attendance history if none exists yet
  const existingAttendanceCount = await AttendanceModel.countDocuments({ gymId: gym._id });
  if (existingAttendanceCount === 0) {
    const historicalVisits = [
      { memberId: samId, checkInTime: daysFromToday(-6, 17, 30), source: "Member self-scan" as const, status: "checked-out" as const },
      { memberId: nourId, checkInTime: daysFromToday(-5, 8, 15), source: "Front desk" as const, status: "checked-out" as const },
      { memberId: jordanId, checkInTime: daysFromToday(-5, 18, 10), source: "Member self-scan" as const, status: "checked-out" as const },
      { memberId: samId, checkInTime: daysFromToday(-4, 17, 45), source: "Member self-scan" as const, status: "checked-out" as const },
      { memberId: nourId, checkInTime: daysFromToday(-3, 12, 20), source: "Front desk" as const, status: "checked-out" as const },
      { memberId: samId, checkInTime: daysFromToday(-3, 18, 30), source: "Member self-scan" as const, status: "checked-out" as const },
      { memberId: jordanId, checkInTime: daysFromToday(-2, 19, 0), source: "Front desk" as const, status: "checked-out" as const },
      { memberId: samId, checkInTime: daysFromToday(-1, 17, 15), source: "Member self-scan" as const, status: "checked-out" as const },
      { memberId: nourId, checkInTime: daysFromToday(-1, 18, 5), source: "Member self-scan" as const, status: "checked-out" as const },
      // Today's active visit (Nour is inside; Sam & Karim are ready to scan QR!)
      { memberId: nourId, checkInTime: daysFromToday(0, 8, 45), source: "Front desk" as const, status: "checked-in" as const },
    ];

    for (const visit of historicalVisits) {
      await AttendanceModel.create({
        gymId: gym._id,
        attendeeType: "member",
        memberId: visit.memberId,
        checkInTime: visit.checkInTime,
        ...(visit.status === "checked-out"
          ? { checkOutTime: new Date(visit.checkInTime.getTime() + 75 * 60 * 1000) }
          : {}),
        source: visit.source,
        status: visit.status,
      });
    }
  }

  // Seed an unaffiliated Mobile App Member (no gym & no plan yet — ready to scan QR & subscribe!)
  const existingUnaffiliated = await MemberModel.findOne({ email: "lina.adel@example.com" });
  if (!existingUnaffiliated) {
    const newMemberHash = await bcrypt.hash("MemberPass123!", 12);
    await MemberModel.create({
      fullName: "Lina Adel",
      phone: "+201009998887",
      email: "lina.adel@example.com",
      passwordHash: newMemberHash,
      status: "active",
      joinDate: new Date(),
    });
  }
  await MembershipRequestModel.deleteMany({ status: "declined" });

  console.info(`Seeded GymOS sample data for gym ${gym._id.toString()} (${gym.slug}).`);
  console.info(`GYMOS_GYM_ID=${gym._id.toString()}`);
  console.info("Demo Staff Login   : admin@gymos.local / GymOSAdmin123!");
  console.info("Demo Member Login  : sam.rivera@example.com / MemberPass123!");
  console.info("New Member (No Gym): lina.adel@example.com / MemberPass123!");
  console.info("Demo Trainer Login : karim.mansour@example.com / TrainerPass123!");
  console.info("Trainer Invite Code: TRN-COACH-2026 (new coach) | TRN-MAYA-2026 (Maya Hassan)");
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
