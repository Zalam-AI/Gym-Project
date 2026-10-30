import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "../lib/mongodb";
import { hashStaffPassword } from "../lib/staff-password";
import AttendanceModel from "../models/attendance";
import GymModel from "../models/gym";
import MemberModel from "../models/member";
import MembershipModel from "../models/membership";
import MembershipPlanModel from "../models/membership-plan";
import MembershipRequestModel from "../models/membership-request";
import PaymentModel from "../models/payment";
import PlatformAdminModel from "../models/platform-admin";
import StaffInviteModel from "../models/staff-invite";
import StaffUserModel from "../models/staff-user";
import TrainerModel from "../models/trainer";
import TrainerInviteModel from "../models/trainer-invite";
import TrainingSessionModel from "../models/training-session";
import WorkoutPlanModel from "../models/workout-plan";

loadEnvConfig(resolve(process.cwd(), "../frontend"));

const API_BASE = process.env.GYMOS_TEST_API_URL ?? "http://127.0.0.1:3000";
const RUN_TAG = randomBytes(4).toString("hex");

let ipSeq = 1;
function nextTestIp(): string {
  const n = ipSeq++;
  return `10.244.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}

async function apiRequest(
  path: string,
  options: {
    method?: string;
    token?: string;
    platformToken?: string;
    body?: unknown;
    extraHeaders?: Record<string, string>;
  } = {},
) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Origin: API_BASE,
    "X-Forwarded-For": nextTestIp(),
    ...(options.extraHeaders ?? {}),
  };
  if (options.token) {
    headers["X-GymOS-Session"] = options.token;
  }
  if (options.platformToken) {
    headers["X-GymOS-Platform-Session"] = options.platformToken;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json };
}

function extractCookieToken(setCookieHeader: string | null, cookieName: string): string {
  if (!setCookieHeader) return "";
  const match = new RegExp(`${cookieName}=([^;]+)`).exec(setCookieHeader);
  return match ? decodeURIComponent(match[1]) : "";
}

async function loginAndExtractToken(
  path: string,
  body: Record<string, unknown>,
  cookieName: string,
): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE,
      "X-Forwarded-For": nextTestIp(),
    },
    body: JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  const json = (await response.json()) as { sessionToken?: string; error?: string };
  assert.ok(
    response.ok,
    `Expected login ${path} to succeed, got ${response.status}: ${json.error ?? ""}`,
  );
  const token = json.sessionToken || extractCookieToken(setCookie, cookieName);
  assert.ok(token, `Expected session token or ${cookieName} cookie from ${path}`);
  return token;
}

describe("GymOS Multi-Tenant Isolation & Authorization Suite", () => {
  const createdGymIds: Types.ObjectId[] = [];
  const createdMemberIds: Types.ObjectId[] = [];
  const createdPlatformAdminIds: Types.ObjectId[] = [];

  const secretSuffix = randomUUID().slice(0, 12);
  const staffPass = `StaffPass_${secretSuffix}!`;
  const mobilePass = `MobPass_${secretSuffix}!`;
  const platformPass = `PlatPass_${secretSuffix}!`;

  let gymAId = "";
  let gymASlug = "";
  let gymAOwnerToken = "";
  let gymAStaffToken = "";
  let gymAStaffUserId = "";

  let gymBId = "";
  let gymBSlug = "";
  let gymBOwnerToken = "";
  let gymBStaffUserId = "";
  let gymBStaffInviteId = "";
  let gymBPlanId = "";
  let gymBMemberId = "";
  let gymBMembershipId = "";
  let gymBCheckInId = "";
  let gymBTrainerId = "";
  let gymBTrainerInviteId = "";
  let gymBSessionId = "";
  let gymBWorkoutPlanId = "";
  let gymBPendingRequestId = "";

  let gymAMember1Id = "";
  let gymAMember1Token = "";
  let gymAMember2UnassignedId = "";
  let gymAWorkoutPlanId = "";
  let gymATrainer1Token = "";
  let gymATrainer2SessionId = "";

  let gymBMemberToken = "";
  let unEnrolledMemberToken = "";

  let platformFullToken = "";
  let platformReadOnlyToken = "";

  before(async () => {
    await connectToDatabase();

    // 1. Self-service create Gym A & Owner A
    const regA = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: API_BASE,
        "X-Forwarded-For": nextTestIp(),
      },
      body: JSON.stringify({
        registrationType: "create-gym",
        gymName: `Tenant Alpha ${RUN_TAG}`,
        gymAddress: "Maadi, Cairo",
        gymPhone: "+201110001111",
        capacity: 80,
        timezone: "Africa/Cairo",
        fullName: "Alpha Owner",
        email: `owner-a-${RUN_TAG}@example.test`,
        password: staffPass,
      }),
    });
    const regAJson = (await regA.json()) as {
      sessionToken?: string;
      gym: { id: string; slug: string };
    };
    assert.equal(regA.status, 201);
    gymAId = regAJson.gym.id;
    gymASlug = regAJson.gym.slug;
    createdGymIds.push(new Types.ObjectId(gymAId));
    gymAOwnerToken =
      regAJson.sessionToken ||
      extractCookieToken(regA.headers.get("set-cookie"), "gymos_staff_session");

    // Generate a non-owner staff invite in Gym A & claim it
    const invARes = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "generate-staff-invite", role: "staff", presetName: "Alpha Desk" },
    });
    assert.equal(invARes.status, 201);
    const inviteCodeA = (invARes.json.invite as { code: string }).code;

    const regStaffA = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: API_BASE,
        "X-Forwarded-For": nextTestIp(),
      },
      body: JSON.stringify({
        registrationType: "join-gym",
        inviteCode: inviteCodeA,
        fullName: "Alpha Receptionist",
        email: `staff-a-${RUN_TAG}@example.test`,
        password: staffPass,
      }),
    });
    assert.equal(regStaffA.status, 201);
    const regStaffAJson = (await regStaffA.json()) as { sessionToken?: string };
    gymAStaffToken =
      regStaffAJson.sessionToken ||
      extractCookieToken(regStaffA.headers.get("set-cookie"), "gymos_staff_session");
    const staffAUserDoc = await StaffUserModel.findOne({
      email: `staff-a-${RUN_TAG}@example.test`,
    });
    gymAStaffUserId = staffAUserDoc!._id.toString();

    // 2. Self-service create Gym B & Owner B
    const regB = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: API_BASE,
        "X-Forwarded-For": nextTestIp(),
      },
      body: JSON.stringify({
        registrationType: "create-gym",
        gymName: `Tenant Bravo ${RUN_TAG}`,
        gymAddress: "Zayed, Giza",
        gymPhone: "+201110002222",
        capacity: 60,
        timezone: "Africa/Cairo",
        fullName: "Bravo Owner",
        email: `owner-b-${RUN_TAG}@example.test`,
        password: staffPass,
      }),
    });
    const regBJson = (await regB.json()) as {
      sessionToken?: string;
      gym: { id: string; slug: string };
    };
    assert.equal(regB.status, 201);
    gymBId = regBJson.gym.id;
    gymBSlug = regBJson.gym.slug;
    createdGymIds.push(new Types.ObjectId(gymBId));
    gymBOwnerToken =
      regBJson.sessionToken ||
      extractCookieToken(regB.headers.get("set-cookie"), "gymos_staff_session");

    const ownerBDoc = await StaffUserModel.findOne({
      email: `owner-b-${RUN_TAG}@example.test`,
    });
    gymBStaffUserId = ownerBDoc!._id.toString();

    const invBRes = await apiRequest("/api/settings", {
      method: "POST",
      token: gymBOwnerToken,
      body: { action: "generate-staff-invite", role: "staff", presetName: "Bravo Desk" },
    });
    assert.equal(invBRes.status, 201);
    gymBStaffInviteId = (invBRes.json.invite as { id: string }).id;

    // 3. Populate Gym A entities (2 members, 2 trainers, workout plan, coaching session)
    const memberHash = await bcrypt.hash(mobilePass, 10);
    const trainerHash = await bcrypt.hash(mobilePass, 10);
    const gymAObjId = new Types.ObjectId(gymAId);
    const gymBObjId = new Types.ObjectId(gymBId);

    const memberA1 = await MemberModel.create({
      gymId: gymAObjId,
      fullName: `Alpha Member One ${RUN_TAG}`,
      phone: `+20121${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `member-a1-${RUN_TAG}@example.test`,
      passwordHash: memberHash,
      status: "active",
      joinDate: new Date(),
    });
    gymAMember1Id = memberA1._id.toString();
    createdMemberIds.push(memberA1._id);

    await MembershipModel.create({
      gymId: gymAObjId,
      memberId: memberA1._id,
      planName: "1 Month Regular",
      price: 1800,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 86_400_000),
      status: "active",
      paymentStatus: "Paid",
    });
    await PaymentModel.create({
      gymId: gymAObjId,
      memberId: memberA1._id,
      amount: 1800,
      description: "1 Month Regular",
      paymentMethod: "Cash",
      status: "Paid",
      date: new Date(),
    });

    const memberA2 = await MemberModel.create({
      gymId: gymAObjId,
      fullName: `Alpha Unassigned Two ${RUN_TAG}`,
      phone: `+20122${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `member-a2-${RUN_TAG}@example.test`,
      passwordHash: memberHash,
      status: "active",
      joinDate: new Date(),
    });
    gymAMember2UnassignedId = memberA2._id.toString();
    createdMemberIds.push(memberA2._id);

    const workoutA = await WorkoutPlanModel.create({
      gymId: gymAObjId,
      title: `Alpha Strength ${RUN_TAG}`,
      targetGoal: "Hypertrophy",
      exercises: [
        {
          exerciseName: "Squat",
          sets: "4",
          reps: "8",
          restTime: "90s",
          targetMuscleGroup: "Legs",
        },
      ],
      assignedMemberIds: [memberA1._id],
    });
    gymAWorkoutPlanId = workoutA._id.toString();

    const trainerA1 = await TrainerModel.create({
      gymId: gymAObjId,
      name: `Alpha Coach One ${RUN_TAG}`,
      specialty: "Strength",
      phone: `+20123${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `trainer-a1-${RUN_TAG}@example.test`,
      passwordHash: trainerHash,
      status: "active",
      assignedMemberIds: [memberA1._id],
    });

    const trainerA2 = await TrainerModel.create({
      gymId: gymAObjId,
      name: `Alpha Coach Two ${RUN_TAG}`,
      specialty: "Mobility",
      phone: `+20124${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `trainer-a2-${RUN_TAG}@example.test`,
      passwordHash: trainerHash,
      status: "active",
      assignedMemberIds: [memberA2._id],
    });

    const sessionA2 = await TrainingSessionModel.create({
      gymId: gymAObjId,
      trainerId: trainerA2._id,
      memberId: memberA2._id,
      title: "Coach Two Private Session",
      startsAt: new Date(Date.now() + 86_400_000),
      durationMinutes: 60,
      status: "scheduled",
    });
    gymATrainer2SessionId = sessionA2._id.toString();

    // 4. Populate Gym B entities (member, membership, plan, check-in, trainer, invite, workout, session, pending request)
    const gymBPlan = await MembershipPlanModel.findOne({ gymId: gymBObjId, active: true });
    gymBPlanId = gymBPlan!._id.toString();

    const memberB = await MemberModel.create({
      gymId: gymBObjId,
      fullName: `Bravo Secret Member ${RUN_TAG}`,
      phone: `+20125${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `member-b1-${RUN_TAG}@example.test`,
      passwordHash: memberHash,
      status: "active",
      joinDate: new Date(),
    });
    gymBMemberId = memberB._id.toString();
    createdMemberIds.push(memberB._id);

    const membershipB = await MembershipModel.create({
      gymId: gymBObjId,
      memberId: memberB._id,
      planName: gymBPlan!.name,
      price: gymBPlan!.price,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 86_400_000),
      status: "active",
      paymentStatus: "Paid",
    });
    gymBMembershipId = membershipB._id.toString();

    await PaymentModel.create({
      gymId: gymBObjId,
      memberId: memberB._id,
      amount: gymBPlan!.price,
      description: gymBPlan!.name,
      paymentMethod: "Card",
      status: "Paid",
      date: new Date(),
    });

    const checkInB = await AttendanceModel.create({
      gymId: gymBObjId,
      attendeeType: "member",
      memberId: memberB._id,
      checkInTime: new Date(),
      status: "checked-in",
      source: "Front desk",
    });
    gymBCheckInId = checkInB._id.toString();

    const trainerB = await TrainerModel.create({
      gymId: gymBObjId,
      name: `Bravo Coach ${RUN_TAG}`,
      specialty: "Conditioning",
      phone: `+20126${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `trainer-b1-${RUN_TAG}@example.test`,
      passwordHash: trainerHash,
      status: "active",
      assignedMemberIds: [memberB._id],
    });
    gymBTrainerId = trainerB._id.toString();

    const trainerInviteB = await TrainerInviteModel.create({
      gymId: gymBObjId,
      code: `TRN-BRV-${RUN_TAG.toUpperCase()}`,
      status: "unused",
    });
    gymBTrainerInviteId = trainerInviteB._id.toString();

    const workoutB = await WorkoutPlanModel.create({
      gymId: gymBObjId,
      title: `Bravo Conditioning ${RUN_TAG}`,
      targetGoal: "Endurance",
      exercises: [
        {
          exerciseName: "Rowing",
          sets: "5",
          reps: "500m",
          restTime: "60s",
          targetMuscleGroup: "Full body",
        },
      ],
      assignedMemberIds: [memberB._id],
    });
    gymBWorkoutPlanId = workoutB._id.toString();

    const sessionB = await TrainingSessionModel.create({
      gymId: gymBObjId,
      trainerId: trainerB._id,
      memberId: memberB._id,
      title: "Bravo Private Session",
      startsAt: new Date(Date.now() + 86_400_000),
      durationMinutes: 45,
      status: "scheduled",
    });
    gymBSessionId = sessionB._id.toString();

    // Un-enrolled mobile member for testing legitimate QR onboarding + pending request in Gym B
    const unEnrolled = await MemberModel.create({
      fullName: `New Mobile User ${RUN_TAG}`,
      phone: `+20127${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `new-user-${RUN_TAG}@example.test`,
      passwordHash: memberHash,
      status: "active",
      joinDate: new Date(),
    });
    createdMemberIds.push(unEnrolled._id);

    const pendingB = await MembershipRequestModel.create({
      gymId: gymBObjId,
      memberId: unEnrolled._id,
      planId: gymBPlan!._id,
      planName: gymBPlan!.name,
      price: gymBPlan!.price,
      durationMonths: gymBPlan!.durationMonths,
      paymentMethod: "Cash",
      status: "pending",
    });
    gymBPendingRequestId = pendingB._id.toString();

    // 5. Authenticate mobile accounts (Gym A Member 1, Gym A Trainer 1, Gym B Member, Un-enrolled Member)
    gymAMember1Token = await loginAndExtractToken(
      "/api/auth/member/login",
      {
        identifier: `member-a1-${RUN_TAG}@example.test`,
        password: mobilePass,
        accountType: "member",
      },
      "gymos_member_session",
    );

    gymATrainer1Token = await loginAndExtractToken(
      "/api/auth/member/login",
      {
        identifier: trainerA1.email,
        password: mobilePass,
        accountType: "trainer",
      },
      "gymos_member_session",
    );

    gymBMemberToken = await loginAndExtractToken(
      "/api/auth/member/login",
      {
        identifier: `member-b1-${RUN_TAG}@example.test`,
        password: mobilePass,
        accountType: "member",
      },
      "gymos_member_session",
    );

    unEnrolledMemberToken = await loginAndExtractToken(
      "/api/auth/member/login",
      {
        identifier: `new-user-${RUN_TAG}@example.test`,
        password: mobilePass,
        accountType: "member",
      },
      "gymos_member_session",
    );

    // 6. Seed two Platform Administrators (Full + Read-Only) with no gymId
    const platformHash = await hashStaffPassword(platformPass);
    const fullAdmin = await PlatformAdminModel.create({
      fullName: "Platform Super Admin",
      email: `plat-full-${RUN_TAG}@example.test`,
      passwordHash: platformHash,
      permissions: ["gyms:read", "gyms:write", "platform:metrics"],
      status: "active",
    });
    const readOnlyAdmin = await PlatformAdminModel.create({
      fullName: "Platform Read Auditor",
      email: `plat-audit-${RUN_TAG}@example.test`,
      passwordHash: platformHash,
      permissions: ["gyms:read"],
      status: "active",
    });
    createdPlatformAdminIds.push(fullAdmin._id, readOnlyAdmin._id);

    platformFullToken = await loginAndExtractToken(
      "/api/platform/auth/login",
      { email: fullAdmin.email, password: platformPass },
      "gymos_platform_session",
    );
    platformReadOnlyToken = await loginAndExtractToken(
      "/api/platform/auth/login",
      { email: readOnlyAdmin.email, password: platformPass },
      "gymos_platform_session",
    );
  });

  after(async () => {
    if (createdGymIds.length > 0) {
      await Promise.all([
        AttendanceModel.deleteMany({ gymId: { $in: createdGymIds } }),
        PaymentModel.deleteMany({ gymId: { $in: createdGymIds } }),
        MembershipModel.deleteMany({ gymId: { $in: createdGymIds } }),
        MembershipPlanModel.deleteMany({ gymId: { $in: createdGymIds } }),
        MembershipRequestModel.deleteMany({ gymId: { $in: createdGymIds } }),
        TrainingSessionModel.deleteMany({ gymId: { $in: createdGymIds } }),
        WorkoutPlanModel.deleteMany({ gymId: { $in: createdGymIds } }),
        TrainerInviteModel.deleteMany({ gymId: { $in: createdGymIds } }),
        TrainerModel.deleteMany({ gymId: { $in: createdGymIds } }),
        StaffInviteModel.deleteMany({ gymId: { $in: createdGymIds } }),
        StaffUserModel.deleteMany({ gymId: { $in: createdGymIds } }),
        MemberModel.deleteMany({ gymId: { $in: createdGymIds } }),
        GymModel.deleteMany({ _id: { $in: createdGymIds } }),
      ]);
    }
    if (createdMemberIds.length > 0) {
      await MembershipRequestModel.deleteMany({ memberId: { $in: createdMemberIds } });
      await MemberModel.deleteMany({ _id: { $in: createdMemberIds } });
    }
    if (createdPlatformAdminIds.length > 0) {
      await PlatformAdminModel.deleteMany({ _id: { $in: createdPlatformAdminIds } });
    }
    await mongoose.disconnect();
  });

  it("1. Rejects unauthenticated users across all protected staff, mobile, and platform endpoints", async () => {
    const protectedEndpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: "GET", path: "/api/dashboard" },
      { method: "GET", path: "/api/members" },
      { method: "POST", path: "/api/members", body: { fullName: "Anon", phone: "+201000000000" } },
      { method: "GET", path: "/api/memberships" },
      { method: "GET", path: "/api/membership-requests" },
      { method: "GET", path: "/api/payments" },
      { method: "GET", path: "/api/attendance" },
      { method: "POST", path: "/api/attendance", body: { action: "checkin", memberId: gymBMemberId } },
      { method: "GET", path: "/api/trainers" },
      { method: "GET", path: "/api/workouts" },
      { method: "GET", path: "/api/settings" },
      { method: "GET", path: "/api/auth/session" },
      { method: "GET", path: "/api/member-portal" },
      { method: "GET", path: `/api/member-subscriptions?qr=${gymBId}` },
      { method: "POST", path: "/api/member-subscriptions", body: { action: "cancel" } },
      { method: "GET", path: "/api/trainer-portal" },
      { method: "POST", path: "/api/trainer-portal", body: { action: "update-availability", availability: [] } },
      { method: "GET", path: "/api/platform/gyms" },
      {
        method: "POST",
        path: "/api/platform/gyms",
        body: { action: "set-status", gymId: gymBId, status: "suspended" },
      },
    ];

    for (const ep of protectedEndpoints) {
      const res = await apiRequest(ep.path, { method: ep.method, body: ep.body });
      assert.equal(
        res.status,
        401,
        `Expected 401 for unauthenticated ${ep.method} ${ep.path}, got ${res.status}`,
      );
    }
  });

  it("2. Prevents Gym A staff/owners from reading or mutating Gym B members and gym-owned records", async () => {
    assert.notEqual(gymAId, gymBId, "Gym A and Gym B must have unique identifiers");
    assert.notEqual(gymASlug, gymBSlug, "Gym A and Gym B must have unique slugs");

    // Read isolation across all staff endpoints
    const membersRes = await apiRequest("/api/members", { token: gymAOwnerToken });
    assert.equal(membersRes.status, 200);
    const memberIds = (membersRes.json.members as Array<{ id: string }>).map((m) => m.id);
    assert.ok(memberIds.includes(gymAMember1Id));
    assert.ok(!memberIds.includes(gymBMemberId), "Gym A staff must never see Gym B members");

    const paymentsRes = await apiRequest("/api/payments", { token: gymAOwnerToken });
    assert.equal(paymentsRes.status, 200);
    const paymentMemberIds = (
      paymentsRes.json.transactions as Array<{ memberId: string }>
    ).map((t) => t.memberId);
    assert.ok(!paymentMemberIds.includes(gymBMemberId));

    const attRes = await apiRequest("/api/attendance", { token: gymAOwnerToken });
    assert.equal(attRes.status, 200);
    const checkInIds = (attRes.json.checkIns as Array<{ id: string }>).map((c) => c.id);
    assert.ok(!checkInIds.includes(gymBCheckInId));

    const reqsRes = await apiRequest("/api/membership-requests", { token: gymAOwnerToken });
    assert.equal(reqsRes.status, 200);
    const reqIds = (reqsRes.json.requests as Array<{ id: string }>).map((r) => r.id);
    assert.ok(!reqIds.includes(gymBPendingRequestId));

    // Write / IDOR isolation: Gym A owner attempting to mutate Gym B entity IDs
    const renewB = await apiRequest("/api/memberships", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "renew", membershipId: gymBMembershipId, paymentStatus: "Paid" },
    });
    assert.equal(renewB.status, 404);

    const createMemSubB = await apiRequest("/api/memberships", {
      method: "POST",
      token: gymAOwnerToken,
      body: {
        action: "create",
        memberId: gymBMemberId,
        planId: gymBPlanId,
        paymentStatus: "Paid",
      },
    });
    assert.equal(createMemSubB.status, 404);

    const payB = await apiRequest("/api/payments", {
      method: "POST",
      token: gymAOwnerToken,
      body: {
        memberId: gymBMemberId,
        amount: 999,
        description: "Cross-gym injection",
        paymentMethod: "Cash",
        status: "Paid",
      },
    });
    assert.equal(payB.status, 404);

    const checkInMemberB = await apiRequest("/api/attendance", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "checkin", memberId: gymBMemberId },
    });
    assert.equal(checkInMemberB.status, 404);

    const checkOutB = await apiRequest("/api/attendance", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "checkout", checkInId: gymBCheckInId },
    });
    assert.equal(checkOutB.status, 404);

    const assignTrainerB = await apiRequest("/api/trainers", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "assign", trainerId: gymBTrainerId, memberId: gymBMemberId },
    });
    assert.equal(assignTrainerB.status, 404);

    const revokeInviteB = await apiRequest("/api/trainers", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "revoke-code", inviteId: gymBTrainerInviteId },
    });
    assert.equal(revokeInviteB.status, 404);

    const updateSessionB = await apiRequest("/api/trainers", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "update-session-status", sessionId: gymBSessionId, status: "cancelled" },
    });
    assert.equal(updateSessionB.status, 404);

    const assignWorkoutB = await apiRequest("/api/workouts", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "assign", workoutPlanId: gymBWorkoutPlanId, memberId: gymBMemberId },
    });
    assert.equal(assignWorkoutB.status, 404);

    const acceptPendingB = await apiRequest("/api/membership-requests", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "accept", requestId: gymBPendingRequestId },
    });
    assert.equal(acceptPendingB.status, 404);

    const deactivateStaffB = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "update-staff-status", staffUserId: gymBStaffUserId, status: "inactive" },
    });
    assert.equal(deactivateStaffB.status, 404);

    const revokeStaffInviteB = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "revoke-staff-invite", inviteId: gymBStaffInviteId },
    });
    assert.equal(revokeStaffInviteB.status, 404);

    // Intra-gym role restriction: non-owner staff cannot modify gym settings
    const nonOwnerSettings = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAStaffToken,
      body: { action: "generate-staff-invite", role: "staff" },
    });
    assert.equal(nonOwnerSettings.status, 403);
  });

  it("3. Prevents Gym A members from accessing Gym B information while preserving new-member QR onboarding", async () => {
    // Gym A member sees their own Gym A portal
    const ownPortal = await apiRequest("/api/member-portal", { token: gymAMember1Token });
    assert.equal(ownPortal.status, 200);
    assert.equal((ownPortal.json.member as { gymId: string }).gymId, gymAId);

    // Gym A member attempting to fetch Gym B plans/details via QR ID or slug
    const qrByIdRes = await apiRequest(
      `/api/member-subscriptions?qr=${encodeURIComponent(`GYMOS-GYM:${gymBId}`)}`,
      { token: gymAMember1Token },
    );
    assert.equal(qrByIdRes.status, 403);

    const qrBySlugRes = await apiRequest(
      `/api/member-subscriptions?qr=${encodeURIComponent(gymBSlug)}`,
      { token: gymAMember1Token },
    );
    assert.equal(qrBySlugRes.status, 403);

    // Gym A member attempting to submit a subscription request to Gym B
    const subBRes = await apiRequest("/api/member-subscriptions", {
      method: "POST",
      token: gymAMember1Token,
      body: {
        action: "subscribe",
        gymId: gymBId,
        planId: gymBPlanId,
        paymentMethod: "Cash",
      },
    });
    assert.equal(subBRes.status, 403);

    // Gym A member attempting to check in using Gym B's QR code
    const scanBRes = await apiRequest("/api/attendance", {
      method: "POST",
      token: gymAMember1Token,
      body: {
        action: "checkin",
        source: "Member self-scan",
        gymQrPayload: `GYMOS-GYM:${gymBId}`,
      },
    });
    assert.equal(scanBRes.status, 403);

    // Gym A member attempting to call staff-only endpoints
    for (const staffPath of ["/api/members", "/api/payments", "/api/dashboard", "/api/settings"]) {
      const res = await apiRequest(staffPath, { token: gymAMember1Token });
      assert.equal(res.status, 403, `Member must be rejected with 403 on ${staffPath}`);
    }

    // Preserve existing flow: un-enrolled mobile member CAN scan Gym B QR to view plans
    const onboardingPlans = await apiRequest(
      `/api/member-subscriptions?qr=${encodeURIComponent(`GYMOS-GYM:${gymBId}`)}`,
      { token: unEnrolledMemberToken },
    );
    assert.equal(onboardingPlans.status, 200);
    assert.equal((onboardingPlans.json.gym as { id: string }).id, gymBId);
  });

  it("4. Restricts trainers strictly to authorized trainees and sessions within their own gym", async () => {
    // Trainer cannot access staff-only endpoints
    for (const staffPath of [
      "/api/members",
      "/api/payments",
      "/api/dashboard",
      "/api/trainers",
      "/api/workouts",
      "/api/settings",
    ]) {
      const res = await apiRequest(staffPath, { token: gymATrainer1Token });
      assert.equal(res.status, 403, `Trainer must get 403 on ${staffPath}`);
    }

    // Trainer portal returns ONLY assigned trainee (Member A1), hiding unassigned Member A2 and Gym B Member
    const portalRes = await apiRequest("/api/trainer-portal", { token: gymATrainer1Token });
    assert.equal(portalRes.status, 200);
    const traineeIds = (portalRes.json.trainees as Array<{ id: string }>).map((t) => t.id);
    assert.deepEqual(traineeIds, [gymAMember1Id]);
    assert.ok(!traineeIds.includes(gymAMember2UnassignedId));
    assert.ok(!traineeIds.includes(gymBMemberId));

    // Querying unassigned trainee in same gym via ?memberId= is blocked (403)
    const unassignedQuery = await apiRequest(
      `/api/trainer-portal?memberId=${gymAMember2UnassignedId}`,
      { token: gymATrainer1Token },
    );
    assert.equal(unassignedQuery.status, 403);

    // Creating a session for an unassigned member in the same gym -> 403
    const sessionUnassigned = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "create-session",
        memberId: gymAMember2UnassignedId,
        title: "Unauthorized Intra-Gym Session",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 60,
      },
    });
    assert.equal(sessionUnassigned.status, 403);

    // Creating a session for a Gym B member -> 403
    const sessionCrossGym = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "create-session",
        memberId: gymBMemberId,
        title: "Cross-Gym Session",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 60,
      },
    });
    assert.equal(sessionCrossGym.status, 403);

    // Assigning workout to unassigned member in same gym -> 403
    const workoutUnassigned = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "assign-workout",
        memberId: gymAMember2UnassignedId,
        workoutPlanId: gymAWorkoutPlanId,
      },
    });
    assert.equal(workoutUnassigned.status, 403);

    // Assigning Gym B workout plan to assigned Gym A trainee -> 404 (not in Gym A)
    const workoutCrossGymPlan = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "assign-workout",
        memberId: gymAMember1Id,
        workoutPlanId: gymBWorkoutPlanId,
      },
    });
    assert.equal(workoutCrossGymPlan.status, 404);

    // Modifying another trainer's session in the SAME gym -> 403
    const otherCoachSession = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "update-session-status",
        sessionId: gymATrainer2SessionId,
        status: "cancelled",
      },
    });
    assert.equal(otherCoachSession.status, 403);

    // Modifying a Gym B session -> 404
    const crossGymSession = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "update-session-status",
        sessionId: gymBSessionId,
        status: "cancelled",
      },
    });
    assert.equal(crossGymSession.status, 404);

    // Trainer attempting staff-only attendance checkout or cross-gym QR check-in -> 403
    const trainerCheckout = await apiRequest("/api/attendance", {
      method: "POST",
      token: gymATrainer1Token,
      body: { action: "checkout", checkInId: gymBCheckInId },
    });
    assert.equal(trainerCheckout.status, 403);

    const trainerCrossScan = await apiRequest("/api/attendance", {
      method: "POST",
      token: gymATrainer1Token,
      body: {
        action: "checkin",
        source: "Trainer self-scan",
        gymQrPayload: `GYMOS-GYM:${gymBId}`,
      },
    });
    assert.equal(trainerCrossScan.status, 403);
  });

  it("5. Rejects gymId manipulation across query strings, headers, request bodies, and forged tokens", async () => {
    // Staff manipulating ?gymId= in query string
    for (const path of [
      `/api/members?gymId=${gymBId}`,
      `/api/dashboard?gymId=${gymBId}`,
      `/api/payments?gymId=${gymBId}`,
      `/api/attendance?gymId=${gymBId}`,
      `/api/memberships?gymId=${gymBId}`,
      `/api/trainers?gymId=${gymBId}`,
      `/api/workouts?gymId=${gymBId}`,
      `/api/settings?gymId=${gymBId}`,
      `/api/auth/session?gymId=${gymBId}`,
    ]) {
      const res = await apiRequest(path, { token: gymAOwnerToken });
      assert.equal(res.status, 403, `Expected 403 for tampered query ${path}`);
    }

    // Staff manipulating X-Gym-Id header
    const headerTamper = await apiRequest("/api/members", {
      token: gymAOwnerToken,
      extraHeaders: { "X-Gym-Id": gymBId },
    });
    assert.equal(headerTamper.status, 403);

    // Staff manipulating gymId in JSON request body
    const bodyTamperMember = await apiRequest("/api/members", {
      method: "POST",
      token: gymAOwnerToken,
      body: {
        gymId: gymBId,
        fullName: "Injected Into Gym B",
        phone: "+201299990000",
        plan: "1 Month Regular",
        price: 1800,
        duration: 1,
      },
    });
    assert.equal(bodyTamperMember.status, 403);

    const bodyTamperSettings = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAOwnerToken,
      body: {
        gymId: gymBId,
        action: "update-gym",
        name: "Hijacked Name",
        address: "Hijacked Address",
        phone: "+201110009999",
        capacity: 10,
        timezone: "Africa/Cairo",
      },
    });
    assert.equal(bodyTamperSettings.status, 403);

    // Member manipulating ?gymId= or ?memberId= on member-portal
    const memberQueryGymTamper = await apiRequest(`/api/member-portal?gymId=${gymBId}`, {
      token: gymAMember1Token,
    });
    assert.equal(memberQueryGymTamper.status, 403);

    const memberQueryMemberTamper = await apiRequest(
      `/api/member-portal?memberId=${gymBMemberId}`,
      { token: gymAMember1Token },
    );
    assert.equal(memberQueryMemberTamper.status, 403);

    // Trainer manipulating ?gymId= or body gymId on trainer-portal
    const trainerQueryTamper = await apiRequest(`/api/trainer-portal?gymId=${gymBId}`, {
      token: gymATrainer1Token,
    });
    assert.equal(trainerQueryTamper.status, 403);

    const trainerBodyTamper = await apiRequest("/api/trainer-portal", {
      method: "POST",
      token: gymATrainer1Token,
      body: { gymId: gymBId, action: "update-availability", availability: [] },
    });
    assert.equal(trainerBodyTamper.status, 403);

    // Tampering with base64url payload inside HMAC session token (swapping gymAId -> gymBId)
    const [payloadB64, sigB64] = gymAOwnerToken.split(".");
    const decodedJson = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    decodedJson.gymId = gymBId;
    const forgedPayloadB64 = Buffer.from(JSON.stringify(decodedJson), "utf8").toString(
      "base64url",
    );
    const forgedToken = `${forgedPayloadB64}.${sigB64}`;

    const forgedRes = await apiRequest("/api/members", { token: forgedToken });
    assert.equal(forgedRes.status, 401, "Tampered HMAC token payload must be rejected with 401");

    // Staff deactivation immediately revokes live DB relationship even with unmodified HMAC token
    const deactivateStaffA = await apiRequest("/api/settings", {
      method: "POST",
      token: gymAOwnerToken,
      body: { action: "update-staff-status", staffUserId: gymAStaffUserId, status: "inactive" },
    });
    assert.equal(deactivateStaffA.status, 200);

    const revokedStaffRes = await apiRequest("/api/members", { token: gymAStaffToken });
    assert.equal(revokedStaffRes.status, 401);
  });

  it("6. Enforces separate Platform Administrator permissions and tenant suspension lifecycle", async () => {
    // Gym Owners, Staff, Members, and Trainers cannot access platform endpoints (403)
    for (const nonPlatformToken of [gymAOwnerToken, gymAMember1Token, gymATrainer1Token]) {
      const res = await apiRequest("/api/platform/gyms", { token: nonPlatformToken });
      assert.equal(res.status, 403);
    }

    // Platform Admins do NOT get silent access to private gym-level member/payment routes (403)
    for (const tenantRoute of [
      "/api/members",
      "/api/payments",
      "/api/member-portal",
      "/api/trainer-portal",
    ]) {
      const res = await apiRequest(tenantRoute, { platformToken: platformFullToken });
      assert.equal(res.status, 403, `Platform token must be rejected from ${tenantRoute}`);
    }

    // Read-only platform auditor can list gyms (without summary metrics) and CANNOT mutate gym status
    const auditList = await apiRequest("/api/platform/gyms", {
      platformToken: platformReadOnlyToken,
    });
    assert.equal(auditList.status, 200);
    assert.equal(auditList.json.summary, undefined);

    const auditWrite = await apiRequest("/api/platform/gyms", {
      method: "POST",
      platformToken: platformReadOnlyToken,
      body: { action: "set-status", gymId: gymBId, status: "suspended" },
    });
    assert.equal(auditWrite.status, 403);

    // Full platform admin can view metrics + suspend Gym B
    const fullList = await apiRequest("/api/platform/gyms", {
      platformToken: platformFullToken,
    });
    assert.equal(fullList.status, 200);
    assert.ok(fullList.json.summary, "Expected platform summary metrics for full platform admin");

    const suspendB = await apiRequest("/api/platform/gyms", {
      method: "POST",
      platformToken: platformFullToken,
      body: { action: "set-status", gymId: gymBId, status: "suspended" },
    });
    assert.equal(suspendB.status, 200);

    // While Gym B is suspended, Gym B owner & Gym B member are blocked (403), while Gym A stays unaffected (200)
    const gymBOwnerBlocked = await apiRequest("/api/members", { token: gymBOwnerToken });
    assert.equal(gymBOwnerBlocked.status, 403);

    const gymBMemberBlocked = await apiRequest("/api/member-portal", { token: gymBMemberToken });
    assert.equal(gymBMemberBlocked.status, 403);

    const gymAUnaffected = await apiRequest("/api/members", { token: gymAOwnerToken });
    assert.equal(gymAUnaffected.status, 200);

    // Reactivating Gym B immediately restores access
    const reactivateB = await apiRequest("/api/platform/gyms", {
      method: "POST",
      platformToken: platformFullToken,
      body: { action: "set-status", gymId: gymBId, status: "active" },
    });
    assert.equal(reactivateB.status, 200);

    const gymBRestored = await apiRequest("/api/members", { token: gymBOwnerToken });
    assert.equal(gymBRestored.status, 200);
  });
});
