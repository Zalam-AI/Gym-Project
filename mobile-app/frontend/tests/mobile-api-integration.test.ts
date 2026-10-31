import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  normalizeApiBaseUrl,
  readMobileJson,
  resolveMobileApiUrl,
} from "../src/lib/mobile-fetch";
import {
  applyAdjustRestTimer,
  applyPauseRestTimer,
  applyResumeRestTimer,
  applySkipRestTimer,
  applyStartRestTimer,
  computeRestTimerSnapshot,
  DEFAULT_REST_SECONDS,
  getWebCountdownVibrationPattern,
  WEB_COMPLETION_VIBRATION_PATTERN,
} from "../src/lib/rest-timer";
import {
  describeDifficultyRating,
  evaluateExerciseProgression,
} from "../src/lib/workout-progression";
import {
  GYMOS_EXERCISE_LIBRARY,
  markExerciseMediaUrlFailed,
  registerExerciseMediaAdapter,
  resolveExerciseMedia,
  unregisterExerciseMediaAdapter,
} from "../src/lib/exercise-media";
import {
  evaluateMemberAchievements,
  isValidCompletedWorkoutLog,
} from "../src/lib/workout-achievements";

const API_BASE = (process.env.GYMOS_TEST_API_URL ?? "http://127.0.0.1:3000").replace(
  /\/+$/,
  "",
);
const MOBILE_ORIGIN = "http://localhost:3001";

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "out") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

let reqCounter = 0;

async function hostedMobileRequest<T extends Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: Record<string, unknown>;
    extraHeaders?: Record<string, string>;
  } = {},
): Promise<{ status: number; headers: Headers; json: T }> {
  reqCounter += 1;
  const url = resolveMobileApiUrl(path, API_BASE);
  const headers: Record<string, string> = {
    Origin: MOBILE_ORIGIN,
    "X-Forwarded-For": `10.88.${Math.floor((reqCounter / 5) % 240) + 1}.${(reqCounter % 240) + 1}`,
    ...(options.extraHeaders ?? {}),
  };
  if (options.token) {
    headers["X-GymOS-Session"] = options.token;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await readMobileJson<T>(response);
  return { status: response.status, headers: response.headers, json };
}

describe("GymOS Mobile Hosted Backend Integration Suite", () => {
  it("1. Removes hardcoded localhost API URLs and excludes private backend secrets from mobile source", () => {
    const mobileRoot = resolve(__dirname, "..");
    const filesToCheck = [
      join(mobileRoot, "next.config.ts"),
      ...collectFiles(join(mobileRoot, "src")),
    ];

    const forbiddenSecrets = [
      "GYMOS_SESSION_SECRET",
      "MONGODB_URI",
      "MONGODB_DNS_SERVERS",
      "GYMOS_PLATFORM_ADMIN_PASSWORD",
      "gymos-admin-backend",
    ];

    for (const file of filesToCheck) {
      const content = readFileSync(file, "utf8");
      assert.equal(
        /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(content),
        false,
        `Unexpected hardcoded localhost URL in ${file}`,
      );
      for (const secretKey of forbiddenSecrets) {
        assert.equal(
          content.includes(secretKey),
          false,
          `Private backend identifier "${secretKey}" must not appear in ${file}`,
        );
      }
      const rawFetchMatches = content.match(/(?<![a-zA-Z0-9_])fetch\(/g) ?? [];
      if (!file.endsWith("mobile-fetch.ts")) {
        assert.equal(
          rawFetchMatches.length,
          0,
          `All mobile API calls must use mobileFetch() in ${file}`,
        );
      }
    }
  });

  it("2. Resolves production NEXT_PUBLIC_API_BASE_URL cleanly while preserving relative dev fallback", () => {
    assert.equal(
      resolveMobileApiUrl("/api/member-portal", "https://gymos-web-api.onrender.com"),
      "https://gymos-web-api.onrender.com/api/member-portal",
    );
    assert.equal(
      resolveMobileApiUrl("api/trainer-portal", "https://gymos-web-api.onrender.com/"),
      "https://gymos-web-api.onrender.com/api/trainer-portal",
    );
    // Tolerates accidental trailing `/api` in configured base URL
    assert.equal(
      resolveMobileApiUrl("/api/attendance", "https://gymos-web-api.onrender.com/api/"),
      "https://gymos-web-api.onrender.com/api/attendance",
    );
    // Preserves relative path in local dev proxy mode when base URL is empty
    assert.equal(resolveMobileApiUrl("/api/member-portal", ""), "/api/member-portal");

    assert.throws(
      () => normalizeApiBaseUrl("gymos-web-api.onrender.com"),
      /must start with https:\/\/ or http:\/\//,
    );
  });

  it("3. Handles non-JSON 502/503 gateway pages, 401/429 responses, and structured API errors gracefully", async () => {
    const html503 = new Response("<!DOCTYPE html><html><body>Service Waking Up</body></html>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
    const parsed503 = await readMobileJson<{ error?: string }>(html503);
    assert.match(parsed503.error ?? "", /waking up|temporarily unavailable/i);

    const empty401 = new Response("", { status: 401 });
    const parsed401 = await readMobileJson<{ error?: string }>(empty401);
    assert.match(parsed401.error ?? "", /session has expired/i);

    const json400 = new Response(JSON.stringify({ error: "Enter a valid phone number." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    const parsed400 = await readMobileJson<{ error?: string }>(json400);
    assert.equal(parsed400.error, "Enter a valid phone number.");
  });

  it("4. Authenticates hosted mobile sessions via X-GymOS-Session (without cookies) and retrieves gym-scoped data", async () => {
    const login = await hostedMobileRequest<{
      role?: string;
      sessionToken?: string;
      error?: string;
    }>("/api/auth/member/login", {
      method: "POST",
      body: {
        identifier: "sam.rivera@example.com",
        password: "MemberPass123!",
      },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json.role, "member");
    assert.ok(login.json.sessionToken && login.json.sessionToken.length > 30);
    assert.equal(login.headers.get("access-control-allow-origin"), MOBILE_ORIGIN);

    const portal = await hostedMobileRequest<{
      role?: string;
      enrolledInGym?: boolean;
      member?: { gymSlug?: string; gymName?: string; planName?: string };
      workoutPlan?: { title?: string } | null;
    }>("/api/member-portal", { token: login.json.sessionToken });

    assert.equal(portal.status, 200);
    assert.equal(portal.json.enrolledInGym, true);
    assert.equal(portal.json.member?.gymSlug, "gymos-elite-new-cairo");
    assert.ok(portal.json.member?.gymName);
    assert.ok(portal.json.member?.planName);
    assert.ok(portal.json.workoutPlan?.title);
  });

  it("5. Completes member registration, QR gym discovery, subscription onboarding, and token upgrade", async () => {
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const reg = await hostedMobileRequest<{
      role?: string;
      sessionToken?: string;
      claimed?: boolean;
    }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "member",
        fullName: `Mobile Test Member ${suffix}`,
        phone: `+20119${suffix.slice(0, 7)}`,
        email: `mobile.member.${suffix}@example.com`,
        password: "MemberPass123!",
      },
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.json.sessionToken);

    // Unaffiliated member scans gym QR code to discover gym-specific plans
    const plansRes = await hostedMobileRequest<{
      gym?: { id: string; slug: string; name: string };
      plans?: Array<{ id: string; name: string }>;
    }>("/api/member-subscriptions?qr=GYMOS-GYM:gymos-elite-new-cairo", {
      token: reg.json.sessionToken,
    });
    assert.equal(plansRes.status, 200);
    assert.equal(plansRes.json.gym?.slug, "gymos-elite-new-cairo");
    assert.ok((plansRes.json.plans?.length ?? 0) > 0);

    // Submit subscription request
    const subRes = await hostedMobileRequest<{
      pendingRequest?: { id: string; gymId: string; planName: string };
    }>("/api/member-subscriptions", {
      method: "POST",
      token: reg.json.sessionToken,
      body: {
        action: "subscribe",
        gymId: plansRes.json.gym!.id,
        planId: plansRes.json.plans![0].id,
        paymentMethod: "Instapay",
      },
    });
    assert.equal(subRes.status, 201);
    assert.ok(subRes.json.pendingRequest?.id);

    // Staff accepts request on backend -> member portal upgrades mobile sessionToken with gymId
    const staffLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "admin@gymos.local", password: "GymOSAdmin123!" }),
    });
    const staffCookie = staffLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
    const acceptRes = await fetch(`${API_BASE}/api/membership-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: staffCookie,
      },
      body: JSON.stringify({
        requestId: subRes.json.pendingRequest!.id,
        action: "accept",
      }),
    });
    assert.equal(acceptRes.status, 200);

    const upgradedPortal = await hostedMobileRequest<{
      enrolledInGym?: boolean;
      sessionToken?: string;
      member?: { gymId?: string; status?: string };
    }>("/api/member-portal", { token: reg.json.sessionToken });
    assert.equal(upgradedPortal.status, 200);
    assert.equal(upgradedPortal.json.enrolledInGym, true);
    assert.ok(upgradedPortal.json.sessionToken, "Expected upgraded gym-bound sessionToken");
    assert.equal(upgradedPortal.json.member?.gymId, plansRes.json.gym!.id);
  });

  it("6. Verifies gym-issued trainer invite codes, completes trainer registration, and rejects invalid/reused codes", async () => {
    // Generate a fresh gym-issued trainer invite code via staff API
    const staffLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "admin@gymos.local", password: "GymOSAdmin123!" }),
    });
    const staffCookie = staffLogin.headers.get("set-cookie")?.split(";")[0] ?? "";

    const genInvite = await fetch(`${API_BASE}/api/trainers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: staffCookie,
      },
      body: JSON.stringify({
        action: "generate-code",
        presetName: "Hosted Coach Test",
        presetSpecialty: "Strength & Conditioning",
      }),
    });
    assert.equal(genInvite.status, 201);
    const genJson = (await genInvite.json()) as { invite?: { code: string } };
    const code = genJson.invite?.code ?? "";
    assert.ok(code.startsWith("TRN-"));

    // Verify invite code from mobile app
    const checkCode = await hostedMobileRequest<{
      valid?: boolean;
      gymSlug?: string;
      presetSpecialty?: string;
    }>(`/api/auth/trainer-code?code=${encodeURIComponent(code)}`);
    assert.equal(checkCode.status, 200);
    assert.equal(checkCode.json.valid, true);
    assert.equal(checkCode.json.gymSlug, "gymos-elite-new-cairo");

    // Register trainer with gym-issued code
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const trainerReg = await hostedMobileRequest<{
      role?: string;
      sessionToken?: string;
      trainer?: { id: string; gymName?: string };
    }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "trainer",
        trainerCode: code,
        fullName: "Hosted Coach Test",
        phone: `+20128${suffix.slice(0, 7)}`,
        email: `coach.${suffix}@example.com`,
        specialty: "Strength & Conditioning",
        password: "TrainerPass123!",
      },
    });
    assert.equal(trainerReg.status, 201);
    assert.equal(trainerReg.json.role, "trainer");
    assert.ok(trainerReg.json.sessionToken);

    // Reusing the claimed code must fail cleanly with a structured error
    const reused = await hostedMobileRequest<{ valid?: boolean; error?: string }>(
      `/api/auth/trainer-code?code=${encodeURIComponent(code)}`,
    );
    assert.equal(reused.status, 404);
    assert.ok(reused.json.error);

    // Trainer portal returns gym-specific data
    const trainerPortal = await hostedMobileRequest<{
      role?: string;
      trainer?: { gymSlug?: string; specialty?: string };
    }>("/api/trainer-portal", { token: trainerReg.json.sessionToken });
    assert.equal(trainerPortal.status, 200);
    assert.equal(trainerPortal.json.trainer?.gymSlug, "gymos-elite-new-cairo");
  });

  it("7. Manages member-owned personal routines strictly separate from gym-assigned plans and persists workout logs & PR analytics", async () => {
    const login = await hostedMobileRequest<{
      sessionToken?: string;
    }>("/api/auth/member/login", {
      method: "POST",
      body: {
        identifier: "sam.rivera@example.com",
        password: "MemberPass123!",
      },
    });
    assert.equal(login.status, 200);
    const memberToken = login.json.sessionToken!;

    // Capture Sam's gym-assigned workout plan before personal routine operations
    const portalBefore = await hostedMobileRequest<{
      workoutPlan?: { id: string; title: string; exercises: Array<{ name: string }> } | null;
    }>("/api/member-portal", { token: memberToken });
    assert.equal(portalBefore.status, 200);
    assert.ok(portalBefore.json.workoutPlan?.id);
    const gymPlanId = portalBefore.json.workoutPlan!.id;
    const gymPlanTitle = portalBefore.json.workoutPlan!.title;
    const gymPlanExerciseCount = portalBefore.json.workoutPlan!.exercises.length;

    // 1. Copy gym-assigned plan into MemberRoutine (strictly separate collection)
    const duplicated = await hostedMobileRequest<{
      routine?: {
        id: string;
        title: string;
        sourceGymPlanId: string | null;
        exercises: Array<{ name: string; sets: number; reps: string }>;
      };
    }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: {
        action: "duplicate-gym-plan",
        workoutPlanId: gymPlanId,
        title: "Sam Custom Hypertrophy Copy",
      },
    });
    assert.equal(duplicated.status, 201);
    assert.equal(duplicated.json.routine?.title, "Sam Custom Hypertrophy Copy");
    assert.equal(duplicated.json.routine?.sourceGymPlanId, gymPlanId);
    const copiedRoutineId = duplicated.json.routine!.id;

    // 2. Create a brand-new member-owned routine from scratch
    const created = await hostedMobileRequest<{
      routine?: { id: string; title: string; scheduledDays: string[] };
    }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: {
        action: "create-routine",
        title: "Upper Body Strength Split",
        targetGoal: "Strength & Hypertrophy",
        scheduledDays: ["Mon", "Thu"],
        exercises: [
          {
            exerciseName: "Barbell Bench Press",
            targetMuscleGroup: "Chest",
            sets: 3,
            reps: "8",
            restSeconds: 90,
            targetWeightKg: 80,
          },
          {
            exerciseName: "Barbell Bent-Over Row",
            targetMuscleGroup: "Back",
            sets: 3,
            reps: "10",
            restSeconds: 75,
            targetWeightKg: 70,
          },
        ],
      },
    });
    assert.equal(created.status, 201);
    const customRoutineId = created.json.routine!.id;
    assert.deepEqual(created.json.routine?.scheduledDays, ["Mon", "Thu"]);

    // 3. Edit the copied personal routine & verify the gym-assigned plan is untouched
    const updated = await hostedMobileRequest<{
      routine?: { id: string; title: string; exercises: Array<{ name: string }> };
    }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: {
        action: "update-routine",
        routineId: copiedRoutineId,
        title: "Sam Edited Personal Split",
        targetGoal: "Athletic Performance",
        scheduledDays: ["Sat"],
        exercises: [
          {
            exerciseName: "Trap Bar Deadlift",
            targetMuscleGroup: "Full body",
            sets: 4,
            reps: "5",
            restSeconds: 120,
            targetWeightKg: 120,
          },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.routine?.exercises.length, 1);

    const portalAfterEdit = await hostedMobileRequest<{
      workoutPlan?: { id: string; title: string; exercises: Array<{ name: string }> } | null;
    }>("/api/member-portal", { token: memberToken });
    assert.equal(portalAfterEdit.json.workoutPlan?.id, gymPlanId);
    assert.equal(portalAfterEdit.json.workoutPlan?.title, gymPlanTitle);
    assert.equal(portalAfterEdit.json.workoutPlan?.exercises.length, gymPlanExerciseCount);

    const prExerciseName = `Incline Barbell Press ${Date.now().toString().slice(-4)}`;
    const prKey = prExerciseName.toLowerCase();

    // 4. Log a completed workout session with weights & reps and verify server volume + PR detection
    const logged = await hostedMobileRequest<{
      log?: {
        id: string;
        sourceType: string;
        totalSetsCompleted: number;
        totalRepsCompleted: number;
        totalVolumeKg: number;
      };
      newPersonalRecords?: Array<{ exerciseName: string; weightKg: number; reps: number }>;
    }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: {
        action: "log-workout",
        sourceType: "member_routine",
        routineId: customRoutineId,
        routineTitle: "Upper Body Strength Split",
        targetGoal: "Strength & Hypertrophy",
        durationSeconds: 2700,
        effortRating: 4,
        sessionNotes: "Solid progressive overload session",
        exercises: [
          {
            exerciseName: prExerciseName,
            targetMuscleGroup: "Chest",
            sets: [
              { setNumber: 1, weightKg: 80, reps: 8, completed: true },
              { setNumber: 2, weightKg: 85, reps: 6, completed: true },
            ],
          },
        ],
      },
    });
    assert.equal(logged.status, 201);
    assert.equal(logged.json.log?.sourceType, "member_routine");
    assert.equal(logged.json.log?.totalSetsCompleted, 2);
    assert.equal(logged.json.log?.totalRepsCompleted, 14);
    assert.equal(logged.json.log?.totalVolumeKg, 80 * 8 + 85 * 6);
    assert.ok((logged.json.newPersonalRecords?.length ?? 0) >= 1);
    const createdLogId = logged.json.log!.id;

    // 5. Fetch GET /api/member-workouts and verify routines, logs, exerciseDefaults & progress analytics
    const overview = await hostedMobileRequest<{
      personalRoutines?: Array<{ id: string; lastPerformedAt: string | null }>;
      recentLogs?: Array<{ id: string }>;
      exerciseDefaults?: Record<string, { lastWeightKg: number; bestWeightKg: number }>;
      progress?: {
        totalWorkouts: number;
        currentStreakDays: number;
        totalVolumeKg: number;
        personalRecords: Array<{ exerciseName: string; maxWeightKg: number }>;
      };
    }>("/api/member-workouts", { token: memberToken });
    assert.equal(overview.status, 200);
    assert.ok(overview.json.personalRoutines?.some((r) => r.id === customRoutineId && r.lastPerformedAt));
    assert.ok(overview.json.recentLogs?.some((l) => l.id === createdLogId));
    assert.equal(overview.json.exerciseDefaults?.[prKey]?.bestWeightKg, 85);
    assert.ok((overview.json.progress?.totalWorkouts ?? 0) >= 1);
    assert.ok((overview.json.progress?.currentStreakDays ?? 0) >= 1);
    assert.ok(
      overview.json.progress?.personalRecords.some(
        (pr) => pr.exerciseName === prExerciseName && pr.maxWeightKg >= 85,
      ),
    );

    // 6. Clean up test routines & log
    const delLog = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: { action: "delete-log", logId: createdLogId },
    });
    assert.equal(delLog.status, 200);

    const delCopied = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: { action: "delete-routine", routineId: copiedRoutineId },
    });
    assert.equal(delCopied.status, 200);

    const delCustom = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: memberToken,
      body: { action: "delete-routine", routineId: customRoutineId },
    });
    assert.equal(delCustom.status, 200);
  });

  it("8. Enforces strict member ownership, role checks, and cross-gym isolation on /api/member-workouts", async () => {
    // Unauthenticated -> 401
    const unauth = await hostedMobileRequest<{ error?: string }>("/api/member-workouts");
    assert.equal(unauth.status, 401);

    // Member A creates a personal routine
    const loginA = await hostedMobileRequest<{ sessionToken?: string }>("/api/auth/member/login", {
      method: "POST",
      body: { identifier: "sam.rivera@example.com", password: "MemberPass123!" },
    });
    const tokenA = loginA.json.sessionToken!;

    const routineA = await hostedMobileRequest<{ routine?: { id: string } }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "create-routine",
        title: "Member A Private Routine",
        targetGoal: "General Fitness",
        exercises: [{ exerciseName: "Pull-Ups", targetMuscleGroup: "Back", sets: 3, reps: "8" }],
      },
    });
    assert.equal(routineA.status, 201);
    const routineAId = routineA.json.routine!.id;

    // Cross-gym manipulation via gymId in body -> 403
    const crossGym = await hostedMobileRequest<{ error?: string }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "create-routine",
        gymId: "000000000000000000000099",
        title: "Cross Gym Attempt",
        exercises: [{ exerciseName: "Push-Ups", targetMuscleGroup: "Chest", sets: 3, reps: "15" }],
      },
    });
    assert.equal(crossGym.status, 403);

    // Register fresh Member B and ensure Member B cannot see, update, log, or delete Member A's routine
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regB = await hostedMobileRequest<{ sessionToken?: string }>("/api/auth/member/register", {
      method: "POST",
      extraHeaders: { "X-Forwarded-For": `10.88.${Math.floor(Math.random() * 200)}.19` },
      body: {
        accountType: "member",
        fullName: `Isolated Member ${suffix}`,
        phone: `+20117${suffix.slice(0, 7)}`,
        email: `isolated.${suffix}@example.com`,
        password: "MemberPass123!",
      },
    });
    const tokenB = regB.json.sessionToken!;

    const listB = await hostedMobileRequest<{ personalRoutines?: Array<{ id: string }> }>(
      "/api/member-workouts",
      { token: tokenB },
    );
    assert.equal(listB.status, 200);
    assert.equal(
      listB.json.personalRoutines?.some((r) => r.id === routineAId),
      false,
      "Member B must never see Member A's personal routines",
    );

    const hijackEdit = await hostedMobileRequest<{ error?: string }>("/api/member-workouts", {
      method: "POST",
      token: tokenB,
      body: {
        action: "update-routine",
        routineId: routineAId,
        title: "Hijacked Title",
        exercises: [{ exerciseName: "Push-Ups", targetMuscleGroup: "Chest", sets: 3, reps: "10" }],
      },
    });
    assert.equal(hijackEdit.status, 404);

    const hijackLog = await hostedMobileRequest<{ error?: string }>("/api/member-workouts", {
      method: "POST",
      token: tokenB,
      body: {
        action: "log-workout",
        sourceType: "member_routine",
        routineId: routineAId,
        routineTitle: "Hijack Log",
        exercises: [
          {
            exerciseName: "Pull-Ups",
            targetMuscleGroup: "Back",
            sets: [{ setNumber: 1, weightKg: 0, reps: 10, completed: true }],
          },
        ],
      },
    });
    assert.equal(hijackLog.status, 403);

    const hijackDelete = await hostedMobileRequest<{ error?: string }>("/api/member-workouts", {
      method: "POST",
      token: tokenB,
      body: { action: "delete-routine", routineId: routineAId },
    });
    assert.equal(hijackDelete.status, 404);

    // Clean up Member A's routine
    await hostedMobileRequest("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "delete-routine", routineId: routineAId },
    });
  });

  it("9. Enforces centralized dark-by-default theme tokens, light/dark/system resolution, and zero hardcoded light colors across mobile components", async () => {
    const themeModule = await import("../src/lib/theme");
    assert.equal(themeModule.DEFAULT_THEME_PREFERENCE, "dark");
    assert.equal(themeModule.THEME_STORAGE_KEY, "gymos_mobile_theme_preference");
    assert.equal(themeModule.isValidThemePreference("dark"), true);
    assert.equal(themeModule.isValidThemePreference("light"), true);
    assert.equal(themeModule.isValidThemePreference("system"), true);
    assert.equal(themeModule.isValidThemePreference("neon"), false);

    assert.equal(themeModule.resolveThemeAppearance("dark", false), "dark");
    assert.equal(themeModule.resolveThemeAppearance("light", true), "light");
    assert.equal(themeModule.resolveThemeAppearance("system", true), "dark");
    assert.equal(themeModule.resolveThemeAppearance("system", false), "light");

    assert.ok(themeModule.THEME_TOKENS.dark.bgApp.startsWith("#"));
    assert.ok(themeModule.THEME_TOKENS.light.bgApp.startsWith("#"));
    assert.notEqual(
      themeModule.THEME_TOKENS.dark.bgApp,
      themeModule.THEME_TOKENS.light.bgApp,
    );
    assert.ok(themeModule.THEME_BOOTSTRAP_SCRIPT.includes("gymos_mobile_theme_preference"));

    const mobileSrcDir = resolve(__dirname, "..", "src");
    const globalsCss = readFileSync(
      join(mobileSrcDir, "app", "globals.css"),
      "utf8",
    );
    assert.ok(globalsCss.includes('html[data-theme="dark"]'));
    assert.ok(globalsCss.includes('html[data-theme="light"]'));
    assert.ok(globalsCss.includes("@theme inline"));

    const componentFiles = collectFiles(join(mobileSrcDir, "components"));
    assert.ok(componentFiles.length >= 5, "Expected mobile component files to exist");

    for (const filePath of componentFiles) {
      const content = readFileSync(filePath, "utf8");
      const rel = filePath.replace(`${mobileSrcDir}/`, "");
      assert.equal(
        /\bbg-white\b/.test(content),
        false,
        `Found hardcoded bg-white in ${rel}; use centralized semantic surface tokens`,
      );
      assert.equal(
        /\bbg-gradient-to-/.test(content),
        false,
        `Found gradient utility in ${rel}; avoid gradients per mobile design guidelines`,
      );
      assert.equal(
        /#[0-9a-fA-F]{3,8}\b/.test(content),
        false,
        `Found hardcoded hex color in ${rel}; use centralized theme tokens`,
      );
    }
  });

  it("10. Supports multi-day weekly splits, per-set targets, duplication, active switching, archiving, and non-destructive gym routine selection", async () => {
    const loginA = await hostedMobileRequest<{ sessionToken?: string }>("/api/auth/member/login", {
      method: "POST",
      body: { identifier: "sam.rivera@example.com", password: "MemberPass123!" },
    });
    assert.equal(loginA.status, 200);
    const tokenA = loginA.json.sessionToken!;

    // 1. Create a 4-day personal split (Sat/Sun/Tue/Wed training, Mon/Thu/Fri rest) with per-set targets
    const created = await hostedMobileRequest<{
      routine?: {
        id: string;
        title: string;
        isActive: boolean;
        archived: boolean;
        scheduledDays: string[];
        daySchedule: Array<{
          day: string;
          isRestDay: boolean;
          focusLabel: string;
          exercises: Array<{
            name: string;
            sets: number;
            setPlans: Array<{ setNumber: number; reps: string; targetWeightKg: number }>;
          }>;
        }>;
      };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "create-routine",
        title: "4-Day Progressive Split",
        targetGoal: "Strength & Hypertrophy",
        setAsActive: true,
        daySchedule: [
          {
            day: "Sat",
            isRestDay: false,
            focusLabel: "Chest & Triceps",
            exercises: [
              {
                exerciseName: "Barbell Bench Press",
                targetMuscleGroup: "Chest",
                sets: 3,
                reps: "12",
                restSeconds: 90,
                targetWeightKg: 60,
                notes: "Pause 1s on chest",
                setPlans: [
                  { setNumber: 1, reps: "12", targetWeightKg: 60 },
                  { setNumber: 2, reps: "10", targetWeightKg: 70 },
                  { setNumber: 3, reps: "8", targetWeightKg: 80 },
                ],
              },
              {
                exerciseName: "Cable Tricep Pushdown",
                targetMuscleGroup: "Triceps",
                sets: 3,
                reps: "12-15",
                restSeconds: 60,
                targetWeightKg: 25,
              },
            ],
          },
          {
            day: "Sun",
            isRestDay: false,
            focusLabel: "Back & Biceps",
            exercises: [
              {
                exerciseName: "Lat Pulldown",
                targetMuscleGroup: "Back",
                sets: 4,
                reps: "10-12",
                restSeconds: 75,
                targetWeightKg: 55,
              },
            ],
          },
          { day: "Mon", isRestDay: true, focusLabel: "Rest", exercises: [] },
          {
            day: "Tue",
            isRestDay: false,
            focusLabel: "Legs",
            exercises: [
              {
                exerciseName: "Barbell Back Squat",
                targetMuscleGroup: "Legs",
                sets: 4,
                reps: "6-8",
                restSeconds: 120,
                targetWeightKg: 100,
              },
            ],
          },
          {
            day: "Wed",
            isRestDay: false,
            focusLabel: "Shoulders",
            exercises: [
              {
                exerciseName: "Overhead Barbell Press",
                targetMuscleGroup: "Shoulders",
                sets: 3,
                reps: "8-10",
                restSeconds: 90,
                targetWeightKg: 45,
              },
            ],
          },
          { day: "Thu", isRestDay: true, focusLabel: "Rest", exercises: [] },
          { day: "Fri", isRestDay: true, focusLabel: "Rest", exercises: [] },
        ],
      },
    });
    assert.equal(created.status, 201);
    const r1 = created.json.routine!;
    assert.equal(r1.isActive, true);
    assert.deepEqual(r1.scheduledDays, ["Sat", "Sun", "Tue", "Wed"]);
    assert.equal(r1.daySchedule.length, 7);
    const satDay = r1.daySchedule.find((d) => d.day === "Sat")!;
    assert.equal(satDay.isRestDay, false);
    assert.equal(satDay.focusLabel, "Chest & Triceps");
    assert.equal(satDay.exercises[0].setPlans.length, 3);
    assert.equal(satDay.exercises[0].setPlans[2].targetWeightKg, 80);
    assert.equal(satDay.exercises[0].setPlans[2].reps, "8");
    const monDay = r1.daySchedule.find((d) => d.day === "Mon")!;
    assert.equal(monDay.isRestDay, true);

    // 2. Duplicate the personal routine and switch active routine to the copy
    const duplicated = await hostedMobileRequest<{
      routine?: { id: string; title: string; isActive: boolean; scheduledDays: string[] };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "duplicate-routine", routineId: r1.id },
    });
    assert.equal(duplicated.status, 201);
    const r2 = duplicated.json.routine!;
    assert.notEqual(r2.id, r1.id);
    assert.equal(r2.isActive, false);
    assert.deepEqual(r2.scheduledDays, ["Sat", "Sun", "Tue", "Wed"]);

    const switchActive = await hostedMobileRequest<{
      activeSelection?: { mode: string; personalRoutineId: string | null };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "set-active-routine", routineId: r2.id },
    });
    assert.equal(switchActive.status, 200);
    assert.equal(switchActive.json.activeSelection?.mode, "personal");
    assert.equal(switchActive.json.activeSelection?.personalRoutineId, r2.id);

    // 3. Reorder exercises on Saturday in r2 without affecting r1
    const reordered = await hostedMobileRequest<{
      routine?: {
        daySchedule: Array<{ day: string; exercises: Array<{ name: string }> }>;
      };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "update-routine",
        routineId: r2.id,
        title: "4-Day Progressive Split (Phase 2)",
        setAsActive: true,
        daySchedule: [
          {
            day: "Sat",
            isRestDay: false,
            focusLabel: "Triceps & Chest",
            exercises: [
              {
                exerciseName: "Cable Tricep Pushdown",
                targetMuscleGroup: "Triceps",
                sets: 3,
                reps: "12-15",
                restSeconds: 60,
                targetWeightKg: 27.5,
              },
              {
                exerciseName: "Barbell Bench Press",
                targetMuscleGroup: "Chest",
                sets: 3,
                reps: "8-10",
                restSeconds: 90,
                targetWeightKg: 75,
              },
            ],
          },
        ],
      },
    });
    assert.equal(reordered.status, 200);
    assert.equal(
      reordered.json.routine?.daySchedule.find((d) => d.day === "Sat")?.exercises[0]?.name,
      "Cable Tricep Pushdown",
    );

    // 4. Browse gym catalog routines and select one non-destructively (personal routines remain intact!)
    const beforeGymSelect = await hostedMobileRequest<{
      gymCatalogPlans?: Array<{ id: string; title: string }>;
      personalRoutines?: Array<{ id: string }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(beforeGymSelect.status, 200);
    assert.ok((beforeGymSelect.json.gymCatalogPlans?.length ?? 0) >= 1);
    const gymPlanId = beforeGymSelect.json.gymCatalogPlans![0].id;

    const selectGym = await hostedMobileRequest<{
      activeSelection?: { mode: string; gymPlanId: string | null };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "select-gym-routine", workoutPlanId: gymPlanId },
    });
    assert.equal(selectGym.status, 200);
    assert.equal(selectGym.json.activeSelection?.mode, "gym");
    assert.equal(selectGym.json.activeSelection?.gymPlanId, gymPlanId);

    const afterGymSelect = await hostedMobileRequest<{
      activeSelection?: { mode: string; gymPlanId: string | null };
      personalRoutines?: Array<{ id: string }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(afterGymSelect.json.activeSelection?.mode, "gym");
    assert.equal(
      afterGymSelect.json.personalRoutines?.some((r) => r.id === r1.id),
      true,
      "Selecting a gym routine must never delete or overwrite personal routines",
    );
    assert.equal(
      afterGymSelect.json.personalRoutines?.some((r) => r.id === r2.id),
      true,
    );

    // 5. Archive r2 and verify it moves to archivedRoutines, then restore it
    const archiveRes = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "archive-routine", routineId: r2.id },
    });
    assert.equal(archiveRes.status, 200);

    const afterArchive = await hostedMobileRequest<{
      personalRoutines?: Array<{ id: string }>;
      archivedRoutines?: Array<{ id: string }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(afterArchive.json.personalRoutines?.some((r) => r.id === r2.id), false);
    assert.equal(afterArchive.json.archivedRoutines?.some((r) => r.id === r2.id), true);

    const restoreRes = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "unarchive-routine", routineId: r2.id },
    });
    assert.equal(restoreRes.status, 200);

    // 6. Verify another member cannot duplicate, activate, or archive Member A's routine
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regB = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        extraHeaders: { "X-Forwarded-For": `10.99.${Math.floor(Math.random() * 200)}.11` },
        body: {
          accountType: "member",
          fullName: `Routine Guard ${suffix}`,
          phone: `+20118${suffix.slice(0, 7)}`,
          email: `routine.guard.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(regB.status, 201);
    const tokenB = regB.json.sessionToken!;

    for (const forbiddenAction of [
      "duplicate-routine",
      "set-active-routine",
      "archive-routine",
    ]) {
      const attempt = await hostedMobileRequest<{ error?: string }>("/api/member-workouts", {
        method: "POST",
        token: tokenB,
        body: { action: forbiddenAction, routineId: r1.id },
      });
      assert.equal(attempt.status, 404, `Expected 404 on cross-member ${forbiddenAction}`);
    }

    // 7. Reset selection & clean up both created routines
    await hostedMobileRequest("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "select-gym-routine", workoutPlanId: "" },
    });
    await hostedMobileRequest("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "delete-routine", routineId: r1.id },
    });
    await hostedMobileRequest("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "delete-routine", routineId: r2.id },
    });
  });

  it("11. Persists unfinished workout sessions across interruptions, remembers per-set smart defaults, and prevents duplicate set/log submissions", async () => {
    const loginA = await hostedMobileRequest<{ sessionToken?: string }>("/api/auth/member/login", {
      method: "POST",
      body: { identifier: "sam.rivera@example.com", password: "MemberPass123!" },
    });
    assert.equal(loginA.status, 200);
    const tokenA = loginA.json.sessionToken!;

    const uniqueExName = `Dumbbell Chest Press ${Date.now().toString().slice(-5)}`;
    const clientSessionId = `sess-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const startedAtIso = new Date(Date.now() - 600_000).toISOString();
    const restEndsAtIso = new Date(Date.now() + 75_000).toISOString();
    const updatedMs = Date.now();

    // 1. Sync an unfinished session (including duplicate setNumber=1 to verify deduplication)
    const syncRes = await hostedMobileRequest<{
      ok?: boolean;
      activeWorkoutSession?: {
        clientSessionId: string;
        currentExerciseIndex: number;
        restEndsAtIso: string | null;
        exercises: Array<{
          name: string;
          sets: Array<{ setNumber: number; weightKg: string; reps: string; completed: boolean }>;
        }>;
      } | null;
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "sync-active-session",
        clientSessionId,
        sourceType: "member_routine",
        routineId: null,
        routineTitle: "Interrupted Session Check",
        dayLabel: "Saturday · Chest",
        targetGoal: "Strength & Hypertrophy",
        startedAtIso,
        pausedSeconds: 0,
        isPaused: false,
        lastPauseStartedIso: null,
        restEndsAtIso,
        restDurationSeconds: 75,
        currentExerciseIndex: 0,
        clientUpdatedAtMs: updatedMs,
        exercises: [
          {
            name: uniqueExName,
            muscle: "Chest",
            restSeconds: 75,
            targetRepsLabel: "10",
            notes: "",
            sets: [
              { setNumber: 1, weightKg: 30, reps: 10, completed: true },
              // Duplicate setNumber 1 simulating a retried swipe/tap packet
              { setNumber: 1, weightKg: 32.5, reps: 10, completed: true },
              { setNumber: 2, weightKg: 35, reps: 8, completed: false },
            ],
          },
        ],
      },
    });
    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.json.ok, true);
    assert.equal(syncRes.json.activeWorkoutSession?.clientSessionId, clientSessionId);
    assert.equal(
      syncRes.json.activeWorkoutSession?.exercises[0]?.sets.length,
      2,
      "Duplicate setNumber entries must collapse cleanly to 2 sets",
    );
    assert.equal(
      syncRes.json.activeWorkoutSession?.exercises[0]?.sets[0]?.weightKg,
      "32.5",
    );

    // 2. Stale out-of-order network packet with older clientUpdatedAtMs must be ignored
    const staleSync = await hostedMobileRequest<{
      ok?: boolean;
      staleIgnored?: boolean;
      activeWorkoutSession?: {
        exercises: Array<{ sets: Array<{ weightKg: string }> }>;
      } | null;
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "sync-active-session",
        clientSessionId,
        sourceType: "member_routine",
        routineTitle: "Interrupted Session Check",
        startedAtIso,
        clientUpdatedAtMs: updatedMs - 5000,
        exercises: [
          {
            name: uniqueExName,
            muscle: "Chest",
            restSeconds: 75,
            sets: [{ setNumber: 1, weightKg: 10, reps: 5, completed: false }],
          },
        ],
      },
    });
    assert.equal(staleSync.status, 200);
    assert.equal(staleSync.json.staleIgnored, true);
    assert.equal(
      staleSync.json.activeWorkoutSession?.exercises[0]?.sets[0]?.weightKg,
      "32.5",
    );

    // 3. Reloading GET /api/member-workouts returns the unfinished session intact (and isolated from other members)
    const resumeFetch = await hostedMobileRequest<{
      activeWorkoutSession?: { clientSessionId: string; routineTitle: string } | null;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(resumeFetch.status, 200);
    assert.equal(resumeFetch.json.activeWorkoutSession?.clientSessionId, clientSessionId);

    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regB = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        extraHeaders: { "X-Forwarded-For": `10.77.${Math.floor(Math.random() * 200)}.23` },
        body: {
          accountType: "member",
          fullName: `Session Isolation ${suffix}`,
          phone: `+20119${suffix.slice(0, 7)}`,
          email: `session.iso.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(regB.status, 201);
    const otherFetch = await hostedMobileRequest<{
      activeWorkoutSession?: { clientSessionId: string } | null;
    }>("/api/member-workouts", { token: regB.json.sessionToken! });
    assert.equal(otherFetch.json.activeWorkoutSession, null);

    // 4. Finish workout with clientSessionId + duplicate setNumber; then submit IDENTICAL request again
    const finishPayload = {
      action: "log-workout",
      clientSessionId,
      sourceType: "member_routine",
      routineId: null,
      routineTitle: "Interrupted Session Check",
      targetGoal: "Strength & Hypertrophy",
      startedAt: startedAtIso,
      durationSeconds: 1800,
      effortRating: 5,
      exercises: [
        {
          exerciseName: uniqueExName,
          targetMuscleGroup: "Chest",
          sets: [
            { setNumber: 1, weightKg: 32.5, reps: 10, completed: true },
            { setNumber: 1, weightKg: 32.5, reps: 10, completed: true },
            { setNumber: 2, weightKg: 35, reps: 8, completed: true },
          ],
        },
      ],
    };

    const firstFinish = await hostedMobileRequest<{
      log?: { id: string; totalSetsCompleted: number; totalRepsCompleted: number };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: finishPayload,
    });
    assert.equal(firstFinish.status, 201);
    assert.equal(firstFinish.json.log?.totalSetsCompleted, 2);
    assert.equal(firstFinish.json.log?.totalRepsCompleted, 18);
    const savedLogId = firstFinish.json.log!.id;

    // Duplicate retry with same clientSessionId -> 200 deduplicated, same log ID, zero duplicate logs!
    const retryFinish = await hostedMobileRequest<{
      deduplicated?: boolean;
      log?: { id: string; totalSetsCompleted: number };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: finishPayload,
    });
    assert.equal(retryFinish.status, 200);
    assert.equal(retryFinish.json.deduplicated, true);
    assert.equal(retryFinish.json.log?.id, savedLogId);

    // 5. Verify unfinished draft is cleared & Smart Defaults remember exact lastSets + lastWeightKg + lastReps
    const afterFinish = await hostedMobileRequest<{
      activeWorkoutSession?: unknown;
      exerciseDefaults?: Record<
        string,
        {
          lastWeightKg: number;
          lastReps: number;
          lastSets: Array<{ setNumber: number; weightKg: number; reps: number }>;
        }
      >;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(afterFinish.json.activeWorkoutSession, null);
    const smart = afterFinish.json.exerciseDefaults?.[uniqueExName.toLowerCase()];
    assert.ok(smart, "Expected smart defaults to be populated from completed workout");
    assert.equal(smart.lastWeightKg, 35);
    assert.equal(smart.lastReps, 8);
    assert.equal(smart.lastSets.length, 2);
    assert.equal(smart.lastSets[0].weightKg, 32.5);
    assert.equal(smart.lastSets[0].reps, 10);
    assert.equal(smart.lastSets[1].weightKg, 35);
    assert.equal(smart.lastSets[1].reps, 8);

    // Clean up test log
    const delLog = await hostedMobileRequest<{ ok?: boolean }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "delete-log", logId: savedLogId },
    });
    assert.equal(delLog.status, 200);
  });

  it("12. Enforces 60s default rest timer, persists member rest/vibration/notification settings, and maintains timestamp accuracy across pause, resume, add-time, and background lock", async () => {
    // 1. Default rest configuration is strictly 60 seconds
    assert.equal(DEFAULT_REST_SECONDS, 60);

    // 2. Pure timestamp engine accuracy (never relies on a running JS interval)
    const t0 = 1_760_000_000_000;
    const started = applyStartRestTimer(DEFAULT_REST_SECONDS, t0);
    assert.ok(started.restTimerId.startsWith("rt-"));
    assert.equal(started.restDurationSeconds, 60);

    // Jump 25 seconds forward in wall-clock time (e.g. screen locked)
    const snapRunning = computeRestTimerSnapshot(started, t0 + 25_000);
    assert.equal(snapRunning.status, "running");
    assert.equal(snapRunning.remainingSeconds, 35);
    assert.equal(snapRunning.isFinalFive, false);

    // Pause at 35s remaining, then lock phone for 5 full minutes -> remains frozen at 35s
    const paused = applyPauseRestTimer(started, t0 + 25_000);
    assert.equal(paused.restEndsAtIso, null);
    assert.equal(paused.restPausedRemainingMs, 35_000);
    const snapPausedAfter5Min = computeRestTimerSnapshot(paused, t0 + 325_000);
    assert.equal(snapPausedAfter5Min.status, "paused");
    assert.equal(snapPausedAfter5Min.remainingSeconds, 35);

    // Add +30s while paused -> increases to 65s while staying paused
    const pausedExtended = applyAdjustRestTimer(paused, 30, t0 + 325_000);
    assert.equal(pausedExtended.restEndsAtIso, null);
    assert.equal(pausedExtended.restPausedRemainingMs, 65_000);

    // Resume at t0 + 325_000 -> runs from 65s
    const resumed = applyResumeRestTimer(pausedExtended, t0 + 325_000);
    assert.ok(resumed.restEndsAtIso);
    const snapFinalFive = computeRestTimerSnapshot(resumed, t0 + 386_200);
    assert.equal(snapFinalFive.status, "running");
    assert.equal(snapFinalFive.remainingSeconds, 4);
    assert.equal(snapFinalFive.isFinalFive, true);

    // Final 5 seconds progressive vibration escalation + stronger completion vibration
    const p5 = getWebCountdownVibrationPattern(5) as number;
    const p4 = getWebCountdownVibrationPattern(4) as number;
    const p3 = getWebCountdownVibrationPattern(3) as number;
    const p2 = getWebCountdownVibrationPattern(2) as number;
    const p1 = getWebCountdownVibrationPattern(1) as number[];
    assert.ok(p5 < p4 && p4 < p3 && p3 < p2, "Vibration pulse durations must escalate progressively from 5s to 2s");
    assert.ok(Array.isArray(p1) && p1.reduce((a, b) => a + b, 0) > p2);
    assert.ok(
      WEB_COMPLETION_VIBRATION_PATTERN.reduce((a, b) => a + b, 0) >
        p1.reduce((a, b) => a + b, 0) * 2,
      "Zero-second completion vibration must be distinctly stronger than final-second ticks",
    );

    // Returning from background AFTER rest elapsed marks status expired (0s) and never restarts
    const snapExpiredInBg = computeRestTimerSnapshot(resumed, t0 + 500_000);
    assert.equal(snapExpiredInBg.status, "expired");
    assert.equal(snapExpiredInBg.remainingSeconds, 0);
    const cleared = applySkipRestTimer();
    assert.equal(computeRestTimerSnapshot(cleared, t0 + 500_500).status, "idle");

    // 3. Backend persistence & per-member isolation of Rest Settings + Paused Rest Session
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regA = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Rest Prefs A ${suffix}`,
          phone: `+20116${suffix.slice(0, 7)}`,
          email: `rest.prefs.a.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(regA.status, 201);
    const tokenA = regA.json.sessionToken!;

    const initialGet = await hostedMobileRequest<{
      restSettings?: {
        defaultRestSeconds: number;
        vibrationEnabled: boolean;
        notificationsEnabled: boolean;
      };
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(initialGet.status, 200);
    assert.equal(initialGet.json.restSettings?.defaultRestSeconds, 60);
    assert.equal(initialGet.json.restSettings?.vibrationEnabled, true);
    assert.equal(initialGet.json.restSettings?.notificationsEnabled, true);

    // Reject invalid rest duration (< 15s)
    const invalidUpdate = await hostedMobileRequest<{ error?: string }>(
      "/api/member-workouts",
      {
        method: "POST",
        token: tokenA,
        body: { action: "update-rest-settings", defaultRestSeconds: 5 },
      },
    );
    assert.equal(invalidUpdate.status, 400);

    // Persist customized member settings (90s, vibration off, notifications on)
    const saveSettings = await hostedMobileRequest<{
      ok?: boolean;
      restSettings?: {
        defaultRestSeconds: number;
        vibrationEnabled: boolean;
        notificationsEnabled: boolean;
      };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "update-rest-settings",
        defaultRestSeconds: 90,
        vibrationEnabled: false,
        notificationsEnabled: true,
      },
    });
    assert.equal(saveSettings.status, 200);
    assert.equal(saveSettings.json.restSettings?.defaultRestSeconds, 90);
    assert.equal(saveSettings.json.restSettings?.vibrationEnabled, false);
    assert.equal(saveSettings.json.restSettings?.notificationsEnabled, true);

    // Sync a paused rest timer to ActiveWorkoutSession and verify reload recovery
    const syncPaused = await hostedMobileRequest<{
      ok?: boolean;
      activeWorkoutSession?: {
        restTimerId?: string;
        restEndsAtIso?: string | null;
        restPausedRemainingMs?: number | null;
      } | null;
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "sync-active-session",
        clientSessionId: `sess-rest-${suffix}`,
        sourceType: "member_routine",
        routineTitle: "Rest Timer Persistence Check",
        startedAtIso: new Date().toISOString(),
        restTimerId: "rt-persisted-check",
        restEndsAtIso: null,
        restDurationSeconds: 90,
        restPausedRemainingMs: 42_500,
        clientUpdatedAtMs: Date.now(),
        exercises: [
          {
            name: "Barbell Bench Press",
            muscle: "Chest",
            restSeconds: 90,
            sets: [{ setNumber: 1, weightKg: 60, reps: 10, completed: true }],
          },
        ],
      },
    });
    assert.equal(syncPaused.status, 200);
    assert.equal(syncPaused.json.activeWorkoutSession?.restTimerId, "rt-persisted-check");
    assert.equal(syncPaused.json.activeWorkoutSession?.restEndsAtIso, null);
    assert.equal(syncPaused.json.activeWorkoutSession?.restPausedRemainingMs, 42_500);

    const reloadA = await hostedMobileRequest<{
      restSettings?: { defaultRestSeconds: number; vibrationEnabled: boolean };
      activeWorkoutSession?: {
        restTimerId?: string;
        restPausedRemainingMs?: number | null;
      } | null;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(reloadA.json.restSettings?.defaultRestSeconds, 90);
    assert.equal(reloadA.json.restSettings?.vibrationEnabled, false);
    assert.equal(reloadA.json.activeWorkoutSession?.restPausedRemainingMs, 42_500);

    // Clean up draft
    await hostedMobileRequest("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: { action: "discard-active-session" },
    });
  });

  it("13. Evaluates intelligent workout progression & feedback rules, preserves saved routines, supports accept/adjust/ignore controls, and enforces member-isolated exercise history", async () => {
    // 1. Verify 1..10 difficulty scale bands
    assert.equal(describeDifficultyRating(1), "Extremely easy");
    assert.equal(describeDifficultyRating(2), "Extremely easy");
    assert.equal(describeDifficultyRating(4), "Easy");
    assert.equal(describeDifficultyRating(6), "Moderate");
    assert.equal(describeDifficultyRating(8), "Difficult");
    assert.equal(describeDifficultyRating(9), "Extremely difficult");
    assert.equal(describeDifficultyRating(10), "Maximum effort");

    // 2. Exact comfort progression example:
    // Previous: 10 kg × 10 reps × 3 sets -> Current: 10 kg × 10 reps × 3 sets -> Difficulty 6/10 -> Recommend 12.5 kg
    const comfortableEval = evaluateExerciseProgression({
      exerciseName: "Dumbbell Bench Press",
      muscle: "Chest",
      targetGoal: "Strength",
      targetSets: 3,
      targetRepsLabel: "10",
      completedSets: [
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
      ],
      difficultyRating: 6,
      reportedDiscomfort: false,
      recentHistory: [
        { weightKg: 10, reps: 10, setsCompleted: 3, difficultyRating: 6 },
      ],
      ruleSettings: { pace: "balanced", preferredIncrementKg: 2.5 },
    });
    assert.equal(comfortableEval.action, "increase_weight");
    assert.equal(comfortableEval.recommendedWeightKg, 12.5);
    assert.match(comfortableEval.summaryText, /12\.5 kg/);

    // 3. Do NOT increase simply because sets were completed if difficulty was high (8/10)
    const hardConsolidateEval = evaluateExerciseProgression({
      exerciseName: "Dumbbell Bench Press",
      muscle: "Chest",
      targetGoal: "Strength",
      targetSets: 3,
      targetRepsLabel: "10",
      completedSets: [
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
      ],
      difficultyRating: 8,
      reportedDiscomfort: false,
    });
    assert.equal(hardConsolidateEval.action, "maintain");
    assert.equal(hardConsolidateEval.recommendedWeightKg, 10);

    // 4. Struggling to hit target reps at high difficulty -> recommend reducing weight
    const missedRepsEval = evaluateExerciseProgression({
      exerciseName: "Dumbbell Bench Press",
      muscle: "Chest",
      targetGoal: "Strength",
      targetSets: 3,
      targetRepsLabel: "10",
      completedSets: [
        { weightKg: 10, reps: 9 },
        { weightKg: 10, reps: 7 },
        { weightKg: 10, reps: 6 },
      ],
      difficultyRating: 9,
      reportedDiscomfort: false,
    });
    assert.equal(missedRepsEval.action, "decrease_weight");
    assert.ok(missedRepsEval.recommendedWeightKg < 10);

    // 5. Never recommend increasing weight if discomfort or pain is reported (even at 3/10 easy!)
    const discomfortEval = evaluateExerciseProgression({
      exerciseName: "Dumbbell Bench Press",
      muscle: "Chest",
      targetGoal: "Strength",
      targetSets: 3,
      targetRepsLabel: "10",
      completedSets: [
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
        { weightKg: 10, reps: 10 },
      ],
      difficultyRating: 3,
      reportedDiscomfort: true,
    });
    assert.equal(discomfortEval.action, "hold_discomfort");
    assert.ok(
      discomfortEval.recommendedWeightKg <= 10,
      "Must never recommend increasing weight when discomfort is reported",
    );

    // 6. Consistent extreme difficulty (9-10 twice in a row) -> review exercise configuration
    const extremeStreakEval = evaluateExerciseProgression({
      exerciseName: "Dumbbell Bench Press",
      muscle: "Chest",
      targetGoal: "Strength",
      targetSets: 3,
      targetRepsLabel: "10",
      completedSets: [
        { weightKg: 20, reps: 10 },
        { weightKg: 20, reps: 10 },
        { weightKg: 20, reps: 10 },
      ],
      difficultyRating: 10,
      reportedDiscomfort: false,
      recentHistory: [
        { weightKg: 20, reps: 10, setsCompleted: 3, difficultyRating: 9 },
      ],
    });
    assert.equal(extremeStreakEval.action, "review_configuration");
    assert.ok(extremeStreakEval.recommendedWeightKg < 20);

    // 7. End-to-End Backend API: Saved-Routine Non-Mutation, Accept/Adjust/Ignore & Member Isolation
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regA = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Prog Member A ${suffix}`,
          phone: `+20117${suffix.slice(0, 7)}`,
          email: `prog.a.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    const regB = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Prog Member B ${suffix}`,
          phone: `+20118${suffix.slice(0, 7)}`,
          email: `prog.b.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(regA.status, 201);
    assert.equal(regB.status, 201);
    const tokenA = regA.json.sessionToken!;
    const tokenB = regB.json.sessionToken!;

    const exName = `Seated Overhead Press ${suffix}`;
    const exKey = exName.toLowerCase();

    // Member A creates a saved personal routine at 10 kg × 10 × 3
    const createRoutineRes = await hostedMobileRequest<{
      routine?: { id: string; exercises: Array<{ name: string; targetWeightKg: number }> };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "create-routine",
        title: `Upper Strength ${suffix}`,
        targetGoal: "Strength",
        exercises: [
          {
            name: exName,
            muscle: "Shoulders",
            sets: 3,
            reps: "10",
            restSeconds: 60,
            targetWeightKg: 10,
          },
        ],
      },
    });
    assert.equal(createRoutineRes.status, 201);
    const routineId = createRoutineRes.json.routine!.id;

    // Session 1: Logged WITHOUT difficultyRating -> must NOT generate any weight increase!
    const logNoFeedback = await hostedMobileRequest<{
      log?: { id: string };
      progressionRecommendations?: Array<{ recommendedWeightKg: number }>;
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "log-workout",
        clientSessionId: `sess-nofb-${suffix}`,
        sourceType: "member_routine",
        routineId,
        routineTitle: `Upper Strength ${suffix}`,
        targetGoal: "Strength",
        durationSeconds: 1500,
        exercises: [
          {
            exerciseName: exName,
            targetMuscleGroup: "Shoulders",
            targetSets: 3,
            targetRepsLabel: "10",
            sets: [
              { setNumber: 1, weightKg: 10, reps: 10, completed: true },
              { setNumber: 2, weightKg: 10, reps: 10, completed: true },
              { setNumber: 3, weightKg: 10, reps: 10, completed: true },
            ],
          },
        ],
      },
    });
    assert.equal(logNoFeedback.status, 201);
    assert.equal(
      logNoFeedback.json.progressionRecommendations?.length ?? 0,
      0,
      "Completing an exercise without feedback must never auto-generate a weight increase",
    );

    // Session 2: Logged WITH 10 kg × 10 × 3 at difficulty 6/10 -> recommends 12.5 kg (pending)
    const logWithFeedback = await hostedMobileRequest<{
      log?: { id: string };
      progressionRecommendations?: Array<{
        exerciseName: string;
        action: string;
        recommendedWeightKg: number;
        decision: string;
      }>;
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "log-workout",
        clientSessionId: `sess-withfb-${suffix}`,
        sourceType: "member_routine",
        routineId,
        routineTitle: `Upper Strength ${suffix}`,
        targetGoal: "Strength",
        durationSeconds: 1600,
        exercises: [
          {
            exerciseName: exName,
            targetMuscleGroup: "Shoulders",
            targetSets: 3,
            targetRepsLabel: "10",
            difficultyRating: 6,
            reportedDiscomfort: false,
            sets: [
              { setNumber: 1, weightKg: 10, reps: 10, completed: true },
              { setNumber: 2, weightKg: 10, reps: 10, completed: true },
              { setNumber: 3, weightKg: 10, reps: 10, completed: true },
            ],
          },
        ],
      },
    });
    assert.equal(logWithFeedback.status, 201);
    assert.equal(logWithFeedback.json.progressionRecommendations?.length, 1);
    assert.equal(logWithFeedback.json.progressionRecommendations?.[0]?.action, "increase_weight");
    assert.equal(logWithFeedback.json.progressionRecommendations?.[0]?.recommendedWeightKg, 12.5);
    assert.equal(logWithFeedback.json.progressionRecommendations?.[0]?.decision, "pending");

    // While pending: neither saved routine NOR smart defaults are silently modified!
    const beforeDecision = await hostedMobileRequest<{
      personalRoutines?: Array<{ id: string; exercises: Array<{ targetWeightKg: number }> }>;
      exerciseDefaults?: Record<string, { lastWeightKg: number }>;
      exerciseHistory?: Array<{
        exerciseKey: string;
        totalSessions: number;
        personalRecord: { maxWeightKg: number };
        sessions: Array<{ difficultyRating: number | null }>;
      }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(beforeDecision.json.personalRoutines?.[0]?.exercises[0]?.targetWeightKg, 10);
    assert.equal(beforeDecision.json.exerciseDefaults?.[exKey]?.lastWeightKg, 10);

    const histEntry = beforeDecision.json.exerciseHistory?.find((h) => h.exerciseKey === exKey);
    assert.ok(histEntry, "Expected member-scoped exercise history entry");
    assert.equal(histEntry.totalSessions, 2);
    assert.equal(histEntry.personalRecord.maxWeightKg, 10);
    assert.equal(histEntry.sessions[0]?.difficultyRating, 6);

    // Member A explicitly ACCEPTS recommendation -> smart default becomes 12.5 kg, saved routine stays 10 kg!
    const acceptRes = await hostedMobileRequest<{
      ok?: boolean;
      progression?: { decision: string; appliedWeightKg: number };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "respond-progression",
        exerciseName: exName,
        decision: "accepted",
      },
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.json.progression?.decision, "accepted");
    assert.equal(acceptRes.json.progression?.appliedWeightKg, 12.5);

    const afterAccept = await hostedMobileRequest<{
      personalRoutines?: Array<{ id: string; exercises: Array<{ targetWeightKg: number }> }>;
      exerciseDefaults?: Record<string, { lastWeightKg: number; lastPerformedWeightKg: number }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(
      afterAccept.json.personalRoutines?.[0]?.exercises[0]?.targetWeightKg,
      10,
      "Saved personal routine must NEVER be silently mutated by progression acceptance",
    );
    assert.equal(afterAccept.json.exerciseDefaults?.[exKey]?.lastWeightKg, 12.5);
    assert.equal(afterAccept.json.exerciseDefaults?.[exKey]?.lastPerformedWeightKg, 10);

    // Member A manually ADJUSTS target to 11.25 kg × 12 reps
    const adjustRes = await hostedMobileRequest<{
      progression?: { decision: string; appliedWeightKg: number; appliedReps: number };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "respond-progression",
        exerciseName: exName,
        decision: "adjusted",
        customWeightKg: 11.25,
        customReps: 12,
      },
    });
    assert.equal(adjustRes.status, 200);
    assert.equal(adjustRes.json.progression?.appliedWeightKg, 11.25);
    assert.equal(adjustRes.json.progression?.appliedReps, 12);

    const afterAdjust = await hostedMobileRequest<{
      exerciseDefaults?: Record<string, { lastWeightKg: number; lastReps: number }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(afterAdjust.json.exerciseDefaults?.[exKey]?.lastWeightKg, 11.25);
    assert.equal(afterAdjust.json.exerciseDefaults?.[exKey]?.lastReps, 12);

    // Member A IGNORES recommendation -> smart default falls back to actual last lifted weight (10 kg)
    const ignoreRes = await hostedMobileRequest<{
      progression?: { decision: string; appliedWeightKg: number | null };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "respond-progression",
        exerciseName: exName,
        decision: "ignored",
      },
    });
    assert.equal(ignoreRes.status, 200);
    assert.equal(ignoreRes.json.progression?.decision, "ignored");

    const afterIgnore = await hostedMobileRequest<{
      exerciseDefaults?: Record<string, { lastWeightKg: number }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(afterIgnore.json.exerciseDefaults?.[exKey]?.lastWeightKg, 10);

    // Configurable Progression Rule Settings persistence
    const saveRuleRes = await hostedMobileRequest<{
      progressionSettings?: { pace: string; preferredIncrementKg: number };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "update-progression-settings",
        pace: "conservative",
        preferredIncrementKg: 1.25,
      },
    });
    assert.equal(saveRuleRes.status, 200);
    assert.equal(saveRuleRes.json.progressionSettings?.pace, "conservative");
    assert.equal(saveRuleRes.json.progressionSettings?.preferredIncrementKg, 1.25);

    // Strict Member Isolation: Member B cannot see Member A's exercise history or modify Member A's progression
    const memberBView = await hostedMobileRequest<{
      exerciseHistory?: Array<{ exerciseKey: string }>;
      exerciseDefaults?: Record<string, unknown>;
    }>("/api/member-workouts", { token: tokenB });
    assert.equal(memberBView.status, 200);
    assert.equal(
      memberBView.json.exerciseHistory?.some((h) => h.exerciseKey === exKey),
      false,
      "Member B must never see Member A's exercise history",
    );
    assert.equal(memberBView.json.exerciseDefaults?.[exKey], undefined);

    const crossMemberAttack = await hostedMobileRequest<{ error?: string }>(
      "/api/member-workouts",
      {
        method: "POST",
        token: tokenB,
        body: {
          action: "respond-progression",
          exerciseName: exName,
          decision: "accepted",
        },
      },
    );
    assert.equal(crossMemberAttack.status, 404);
  });

  it("14. Resolves decoupled exercise demonstrations across 2D rigs, GIF/MP4 catalogs, provider adapters, failure fallbacks, and gym-scoped catalogs", async () => {
    assert.ok(
      GYMOS_EXERCISE_LIBRARY.length >= 25,
      "Expected comprehensive first-party exercise demonstration library",
    );

    // Core requested exercises resolve to accurate first-party 2D animation rigs
    for (const [name, expectedRig] of [
      ["Barbell Bench Press", "bench_press"],
      ["Barbell Back Squat", "squat"],
      ["Romanian Deadlift", "deadlift"],
      ["Lat Pulldown", "lat_pulldown"],
      ["Dumbbell Shoulder Press", "shoulder_press"],
      ["Dumbbell Bicep Curl", "bicep_curl"],
    ] as const) {
      const resolved = resolveExerciseMedia(name, "");
      assert.equal(resolved.mediaType, "svg_2d");
      assert.equal(resolved.animationKey, expectedRig);
      assert.ok(resolved.formCue.length > 10);
    }

    // Completely unknown exercise without media resolves cleanly to placeholder ("none")
    const missingDemo = resolveExerciseMedia("Zottman Neck Isometric X99", "Neck");
    assert.equal(missingDemo.mediaType, "none");
    assert.equal(missingDemo.animationKey, null);

    // Failed remote GIF/MP4 degrades cleanly to 2D rig or placeholder without crashing
    const brokenGifUrl = "https://cdn.gymos.invalid/demos/bench-broken.gif";
    const beforeFail = resolveExerciseMedia("Barbell Bench Press", "Chest", {
      "barbell bench press": {
        exerciseKey: "barbell bench press",
        exerciseName: "Barbell Bench Press",
        mediaType: "gif",
        mediaSource: "remote_url",
        mediaUrl: brokenGifUrl,
        animationKey: "bench_press",
      },
    });
    assert.equal(beforeFail.mediaType, "gif");
    assert.equal(beforeFail.mediaUrl, brokenGifUrl);

    markExerciseMediaUrlFailed(brokenGifUrl);
    const afterFail = resolveExerciseMedia("Barbell Bench Press", "Chest", {
      "barbell bench press": {
        exerciseKey: "barbell bench press",
        exerciseName: "Barbell Bench Press",
        mediaType: "gif",
        mediaSource: "remote_url",
        mediaUrl: brokenGifUrl,
        animationKey: "bench_press",
      },
    });
    assert.equal(afterFail.mediaType, "svg_2d");
    assert.equal(afterFail.animationKey, "bench_press");

    // Pluggable external provider adapter registration & cleanup
    registerExerciseMediaAdapter({
      id: "licensed-mp4-test-provider",
      resolve: (key) =>
        key === "pendulum squat"
          ? {
              mediaType: "mp4",
              mediaSource: "provider",
              mediaUrl: "/media/exercises/pendulum-squat.mp4",
              providerName: "licensed-mp4-test-provider",
              animationKey: "squat",
            }
          : null,
    });
    const viaAdapter = resolveExerciseMedia("Pendulum Squat", "Legs");
    assert.equal(viaAdapter.mediaType, "mp4");
    assert.equal(viaAdapter.providerName, "licensed-mp4-test-provider");
    unregisterExerciseMediaAdapter("licensed-mp4-test-provider");

    // Staff upserts gym-scoped exercise media catalog & enrolled member receives it
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const staffLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        "X-Forwarded-For": `10.99.${(reqCounter % 240) + 1}.${((reqCounter * 7) % 240) + 1}`,
      },
      body: JSON.stringify({ email: "admin@gymos.local", password: "GymOSAdmin123!" }),
    });
    const staffCookie = staffLogin.headers.get("set-cookie")?.split(";")[0] ?? "";

    const customExerciseName = `Cable Chest Press ${suffix}`;
    const upsertMedia = await fetch(`${API_BASE}/api/workouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: staffCookie,
      },
      body: JSON.stringify({
        action: "upsert-exercise-media",
        items: [
          {
            exerciseName: customExerciseName,
            targetMuscleGroup: "Chest",
            equipment: "Cable Machine",
            mediaType: "mp4",
            mediaSource: "local_asset",
            mediaUrl: "/media/exercises/cable-chest-press.mp4",
            animationKey: "bench_press",
            formCue: "Drive handles together smoothly without rounding shoulders.",
            license: "Gym-Owned Studio Capture",
          },
        ],
      }),
    });
    assert.equal(upsertMedia.status, 200);

    // Enroll Member A into this gym, keep Member B unenrolled -> verify scoping
    const regEnrolled = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Media Member ${suffix}`,
          phone: `+20116${suffix.slice(0, 7)}`,
          email: `media.a.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    const regUnenrolled = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Unenrolled Media ${suffix}`,
          phone: `+20115${suffix.slice(0, 7)}`,
          email: `media.b.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(regEnrolled.status, 201);
    assert.equal(regUnenrolled.status, 201);

    const plansRes = await hostedMobileRequest<{
      gym?: { id: string };
      plans?: Array<{ id: string }>;
    }>("/api/member-subscriptions?qr=GYMOS-GYM:gymos-elite-new-cairo", {
      token: regEnrolled.json.sessionToken,
    });
    const subRes = await hostedMobileRequest<{ pendingRequest?: { id: string } }>(
      "/api/member-subscriptions",
      {
        method: "POST",
        token: regEnrolled.json.sessionToken,
        body: {
          action: "subscribe",
          gymId: plansRes.json.gym!.id,
          planId: plansRes.json.plans![0].id,
          paymentMethod: "Cash",
        },
      },
    );
    await fetch(`${API_BASE}/api/membership-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: staffCookie,
      },
      body: JSON.stringify({
        requestId: subRes.json.pendingRequest!.id,
        action: "accept",
      }),
    });
    const upgraded = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/member-portal",
      { token: regEnrolled.json.sessionToken },
    );
    const enrolledToken = upgraded.json.sessionToken!;

    const enrolledWorkouts = await hostedMobileRequest<{
      exerciseMediaCatalog?: Record<string, { mediaType: string; mediaUrl: string }>;
    }>("/api/member-workouts", { token: enrolledToken });
    assert.equal(enrolledWorkouts.status, 200);
    assert.equal(
      enrolledWorkouts.json.exerciseMediaCatalog?.[customExerciseName.toLowerCase()]
        ?.mediaType,
      "mp4",
    );

    const unenrolledWorkouts = await hostedMobileRequest<{
      exerciseMediaCatalog?: Record<string, unknown>;
    }>("/api/member-workouts", { token: regUnenrolled.json.sessionToken });
    assert.equal(unenrolledWorkouts.status, 200);
    assert.equal(
      unenrolledWorkouts.json.exerciseMediaCatalog?.[customExerciseName.toLowerCase()],
      undefined,
      "Unenrolled / other-gym member must not receive private gym media overrides",
    );
  });

  it("15. Computes real-data progress, valid-history milestones, and 3-dimension exercise PRs while rejecting incomplete data", async () => {
    // Pure unit checks for incomplete workout filtering + 7-day streak + 4-week consistency
    assert.equal(
      isValidCompletedWorkoutLog({
        completedAt: new Date().toISOString(),
        exercises: [
          {
            exerciseName: "Barbell Bench Press",
            sets: [{ reps: 0, weightKg: 60, completed: true }],
          },
        ],
      }),
      false,
      "0-rep sets must never count toward achievements or streaks",
    );

    const syntheticLogs = [
      // 7 consecutive days + 3 additional weeks to hit 4 consecutive weeks & 10 workouts
      ...[0, 1, 2, 3, 4, 5, 6, 13, 20, 27].map((daysAgo, idx) => ({
        completedAt: new Date(Date.now() - daysAgo * 86_400_000),
        exercises: [
          {
            exerciseName: "Barbell Back Squat",
            targetMuscleGroup: "Legs",
            sets: [
              {
                reps: idx === 0 ? 12 : 8,
                weightKg: idx === 1 ? 110 : 100,
                completed: true,
              },
            ],
          },
        ],
      })),
    ];
    const evalSummary = evaluateMemberAchievements(syntheticLogs);
    const byId = Object.fromEntries(evalSummary.milestones.map((m) => [m.id, m]));
    assert.equal(byId.first_workout.unlocked, true);
    assert.equal(byId.first_pr.unlocked, true);
    assert.equal(byId.workouts_10.unlocked, true);
    assert.equal(byId.streak_7_days.unlocked, true);
    assert.equal(byId.consistent_4_weeks.unlocked, true);
    assert.equal(byId.workouts_50.unlocked, false);

    const squatRec = evalSummary.exerciseRecords.find(
      (r) => r.exerciseKey === "barbell back squat",
    );
    assert.ok(squatRec);
    assert.equal(squatRec!.heaviestWeight.weightKg, 110);
    assert.equal(squatRec!.highestRepsAtWeight.reps, 12);
    // Best single-set performance: 100 kg × 12 = 1200 kg > 110 kg × 8 = 880 kg
    assert.equal(squatRec!.bestPerformance.volumeKg, 1200);

    // Live API test: freshly registered member has 0 unlocked achievements until valid workout logged
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const reg = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `Achieve Member ${suffix}`,
          phone: `+20114${suffix.slice(0, 7)}`,
          email: `achieve.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    assert.equal(reg.status, 201);
    const token = reg.json.sessionToken!;

    const initialGet = await hostedMobileRequest<{
      achievements?: { unlockedCount: number; totalCount: number };
      progress?: { totalWorkouts: number; workoutsThisMonth: number };
    }>("/api/member-workouts", { token });
    assert.equal(initialGet.status, 200);
    assert.equal(initialGet.json.achievements?.unlockedCount, 0);
    assert.equal(initialGet.json.achievements?.totalCount, 6);
    assert.equal(initialGet.json.progress?.totalWorkouts, 0);
    assert.equal(initialGet.json.progress?.workoutsThisMonth, 0);

    // Log first valid workout -> unlocks first_workout + first_pr and returns newlyUnlockedAchievements
    const firstLog = await hostedMobileRequest<{
      newlyUnlockedAchievements?: Array<{ id: string }>;
      newPersonalRecords?: Array<{ exerciseName: string; weightKg: number; reps: number }>;
    }>("/api/member-workouts", {
      method: "POST",
      token,
      body: {
        action: "log-workout",
        clientSessionId: `sess-ach-1-${suffix}`,
        sourceType: "free_workout",
        routineTitle: "Free Workout",
        durationSeconds: 1800,
        exercises: [
          {
            exerciseName: "Barbell Bench Press",
            targetMuscleGroup: "Chest",
            sets: [
              { setNumber: 1, weightKg: 70, reps: 8, completed: true },
              { setNumber: 2, weightKg: 60, reps: 12, completed: true },
            ],
          },
        ],
      },
    });
    assert.equal(firstLog.status, 201);
    const unlockedIds = (firstLog.json.newlyUnlockedAchievements ?? []).map((m) => m.id);
    assert.ok(unlockedIds.includes("first_workout"));
    assert.ok(unlockedIds.includes("first_pr"));

    const afterFirst = await hostedMobileRequest<{
      achievements?: {
        unlockedCount: number;
        exerciseRecords: Array<{
          exerciseKey: string;
          heaviestWeight: { weightKg: number; reps: number };
          highestRepsAtWeight: { weightKg: number; reps: number };
          bestPerformance: { volumeKg: number };
        }>;
      };
      progress?: {
        totalWorkouts: number;
        workoutsThisMonth: number;
        totalPersonalRecords: number;
      };
    }>("/api/member-workouts", { token });
    assert.equal(afterFirst.json.achievements?.unlockedCount, 2);
    assert.equal(afterFirst.json.progress?.totalWorkouts, 1);
    assert.equal(afterFirst.json.progress?.workoutsThisMonth, 1);
    assert.equal(afterFirst.json.progress?.totalPersonalRecords, 1);
    const benchRec = afterFirst.json.achievements?.exerciseRecords.find(
      (r) => r.exerciseKey === "barbell bench press",
    );
    assert.equal(benchRec?.heaviestWeight.weightKg, 70);
    assert.equal(benchRec?.highestRepsAtWeight.reps, 12);
    assert.equal(benchRec?.bestPerformance.volumeKg, 720); // 60 * 12 = 720 > 70 * 8 = 560
  });

  it("16. Supports Free Workout Mode (empty start, dynamic exercises, history logging, and non-destructive save-as-routine)", async () => {
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const regA = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `FreeWk Member A ${suffix}`,
          phone: `+20113${suffix.slice(0, 7)}`,
          email: `freewk.a.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    const regB = await hostedMobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: `FreeWk Member B ${suffix}`,
          phone: `+20112${suffix.slice(0, 7)}`,
          email: `freewk.b.${suffix}@example.com`,
          password: "MemberPass123!",
        },
      },
    );
    const tokenA = regA.json.sessionToken!;
    const tokenB = regB.json.sessionToken!;

    // Member A creates an ACTIVE personal routine first
    const baseRoutineRes = await hostedMobileRequest<{
      routine?: { id: string; isActive: boolean };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "create-routine",
        title: `Primary Split ${suffix}`,
        targetGoal: "Hypertrophy",
        setAsActive: true,
        exercises: [
          {
            name: "Barbell Back Squat",
            muscle: "Legs",
            sets: 3,
            reps: "8",
            restSeconds: 90,
            targetWeightKg: 80,
          },
        ],
      },
    });
    assert.equal(baseRoutineRes.status, 201);
    const primaryRoutineId = baseRoutineRes.json.routine!.id;

    // 1. Start Free Workout draft with 0 initial exercises
    const freeSessionId = `free-sess-${suffix}`;
    const emptyDraftRes = await hostedMobileRequest<{
      ok?: boolean;
      activeWorkoutSession?: { sourceType: string; exercises: unknown[] };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "sync-active-session",
        clientSessionId: freeSessionId,
        sourceType: "free_workout",
        routineId: null,
        routineTitle: "Free Workout",
        dayLabel: "Free Workout",
        targetGoal: "General Fitness",
        startedAtIso: new Date().toISOString(),
        pausedSeconds: 0,
        isPaused: false,
        currentExerciseIndex: 0,
        clientUpdatedAtMs: Date.now(),
        exercises: [],
      },
    });
    assert.equal(emptyDraftRes.status, 200);
    assert.equal(emptyDraftRes.json.activeWorkoutSession?.sourceType, "free_workout");
    assert.equal(emptyDraftRes.json.activeWorkoutSession?.exercises.length, 0);

    // 2. Dynamically add exercises + log Free Workout WITH saveAsRoutine: true
    const logFreeRes = await hostedMobileRequest<{
      log?: { id: string; sourceType: string; routineTitle: string };
      savedRoutine?: { id: string; title: string; isActive: boolean };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "log-workout",
        clientSessionId: freeSessionId,
        sourceType: "free_workout",
        routineId: null,
        routineTitle: "Free Workout",
        targetGoal: "General Fitness",
        durationSeconds: 2100,
        saveAsRoutine: true,
        saveRoutineTitle: `Saved Upper Pump ${suffix}`,
        exercises: [
          {
            exerciseName: "Lat Pulldown",
            targetMuscleGroup: "Back",
            targetSets: 3,
            targetRepsLabel: "10",
            difficultyRating: 7,
            sets: [
              { setNumber: 1, weightKg: 55, reps: 10, completed: true },
              { setNumber: 2, weightKg: 55, reps: 10, completed: true },
            ],
          },
          {
            exerciseName: "Dumbbell Bicep Curl",
            targetMuscleGroup: "Arms",
            targetSets: 2,
            targetRepsLabel: "12",
            sets: [{ setNumber: 1, weightKg: 14, reps: 12, completed: true }],
          },
        ],
      },
    });
    assert.equal(logFreeRes.status, 201);
    assert.equal(logFreeRes.json.log?.sourceType, "free_workout");
    assert.equal(logFreeRes.json.savedRoutine?.title, `Saved Upper Pump ${suffix}`);
    assert.equal(
      logFreeRes.json.savedRoutine?.isActive,
      false,
      "Saving a free workout as a routine must NEVER overwrite the active routine",
    );

    // Verify Member A's active routine is STILL Primary Split!
    const checkActive = await hostedMobileRequest<{
      activeSelection?: { mode: string; personalRoutineId: string | null };
      personalRoutines?: Array<{ id: string; isActive: boolean }>;
    }>("/api/member-workouts", { token: tokenA });
    assert.equal(checkActive.json.activeSelection?.mode, "personal");
    assert.equal(checkActive.json.activeSelection?.personalRoutineId, primaryRoutineId);

    // 3. Also test saving a completed Free Workout from history via action: "save-log-as-routine"
    const saveFromHistory = await hostedMobileRequest<{
      routine?: { id: string; title: string; isActive: boolean };
    }>("/api/member-workouts", {
      method: "POST",
      token: tokenA,
      body: {
        action: "save-log-as-routine",
        logId: logFreeRes.json.log!.id,
        title: `History Routine ${suffix}`,
      },
    });
    assert.equal(saveFromHistory.status, 201);
    assert.equal(saveFromHistory.json.routine?.title, `History Routine ${suffix}`);
    assert.equal(saveFromHistory.json.routine?.isActive, false);

    // 4. Cross-member isolation: Member B cannot save Member A's workout log as a routine
    const crossSaveAttempt = await hostedMobileRequest<{ error?: string }>(
      "/api/member-workouts",
      {
        method: "POST",
        token: tokenB,
        body: {
          action: "save-log-as-routine",
          logId: logFreeRes.json.log!.id,
          title: "Stolen Routine",
        },
      },
    );
    assert.equal(crossSaveAttempt.status, 404);
  });
});
