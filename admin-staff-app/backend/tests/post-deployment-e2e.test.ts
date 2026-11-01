import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { loadEnvConfig } from "@next/env";

const FRONTEND_DIR = resolve(process.cwd(), "../frontend");
loadEnvConfig(FRONTEND_DIR);

const TEST_MONGO_PORT = 27018;
const TEST_APP_PORT = 3010;
const API_BASE = `http://127.0.0.1:${TEST_APP_PORT}`;
const MOBILE_ORIGIN = "https://localhost";
const MONGO_DATA_DIR = `/home/user/.cache/mongo-e2e-${process.pid}`;
const MONGO_URI = `mongodb://127.0.0.1:${TEST_MONGO_PORT}/gymos_post_deploy_e2e?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`;
const RUN_ID = randomBytes(3).toString("hex");

let mongoProc: ChildProcess | null = null;
let appProc: ChildProcess | null = null;
let ipCounter = 1;

function nextClientIp(): string {
  const n = ipCounter++;
  return `10.199.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}

function findMongodBinary(): string {
  const candidates = [
    "/home/user/.cache/mongo-bin/mongod-x64-debian-7.0.14",
    "/usr/bin/mongod",
    "/usr/local/bin/mongod",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "mongod binary not found for isolated E2E test harness. Expected /home/user/.cache/mongo-bin/mongod-x64-debian-7.0.14.",
  );
}

async function waitForPortReady(
  checkFn: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await checkFn()) return;
    } catch {
      // Retry until ready
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

async function startTestMongo(): Promise<void> {
  mkdirSync(MONGO_DATA_DIR, { recursive: true });
  const bin = findMongodBinary();
  mongoProc = spawn(
    bin,
    [
      "--port",
      String(TEST_MONGO_PORT),
      "--dbpath",
      MONGO_DATA_DIR,
      "--bind_ip",
      "127.0.0.1",
      "--noauth",
      "--wiredTigerCacheSizeGB",
      "0.25",
    ],
    { stdio: "ignore" },
  );

  await waitForPortReady(
    async () => {
      const net = await import("node:net");
      return await new Promise<boolean>((res) => {
        const sock = net.createConnection({ host: "127.0.0.1", port: TEST_MONGO_PORT });
        sock.once("connect", () => {
          sock.destroy();
          res(true);
        });
        sock.once("error", () => res(false));
      });
    },
    15_000,
    `ephemeral MongoDB on :${TEST_MONGO_PORT}`,
  );
}

async function stopTestMongo(): Promise<void> {
  if (!mongoProc) return;
  const proc = mongoProc;
  mongoProc = null;
  await new Promise<void>((res) => {
    proc.once("exit", () => res());
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Already exited
      }
      res();
    }, 5_000);
  });
}

async function startTestNextServer(): Promise<void> {
  const nextBin = resolve(process.cwd(), "../../node_modules/.bin/next");
  const sessionSecret =
    process.env.GYMOS_SESSION_SECRET && process.env.GYMOS_SESSION_SECRET.length >= 32
      ? process.env.GYMOS_SESSION_SECRET
      : "gymos-e2e-isolated-session-secret-minimum-32-chars!";

  appProc = spawn(nextBin, ["start", "-H", "127.0.0.1", "-p", String(TEST_APP_PORT)], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: MONGO_URI,
      GYMOS_SESSION_SECRET: sessionSecret,
      GYMOS_ALLOW_PREVIEW_ORIGINS: "0",
      GYMOS_STAFF_APP_ORIGINS: API_BASE,
      GYMOS_MEMBER_APP_ORIGINS: `${MOBILE_ORIGIN},capacitor://localhost,ionic://localhost`,
    },
    stdio: "pipe",
  });

  await waitForPortReady(
    async () => {
      const resp = await fetch(`${API_BASE}/api/health`);
      return resp.status === 200;
    },
    25_000,
    `Next.js production server on :${TEST_APP_PORT}`,
  );
}

async function stopTestNextServer(): Promise<void> {
  if (!appProc) return;
  const proc = appProc;
  appProc = null;
  await new Promise<void>((res) => {
    proc.once("exit", () => res());
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Already exited
      }
      res();
    }, 5_000);
  });
}

function extractCookiePair(setCookie: string | null, cookieName: string): string {
  if (!setCookie) return "";
  const match = new RegExp(`(${cookieName}=[^;]+)`).exec(setCookie);
  return match ? match[1] : "";
}

async function staffRequest<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
    redirect?: "follow" | "error" | "manual";
  } = {},
) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Origin: API_BASE,
    "X-Forwarded-For": nextClientIp(),
    ...(options.headers ?? {}),
  };
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    redirect: options.redirect ?? "manual",
  });
  const text = await response.text();
  let json = {} as T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    // HTML or empty body on page routes
  }
  return {
    status: response.status,
    headers: response.headers,
    setCookie: response.headers.get("set-cookie"),
    text,
    json,
  };
}

async function mobileRequest<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    token?: string;
    origin?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Origin: options.origin ?? MOBILE_ORIGIN,
    "X-Forwarded-For": nextClientIp(),
    ...(options.headers ?? {}),
  };
  if (options.token) {
    headers["X-GymOS-Session"] = options.token;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json = {} as T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    // Non-JSON error body
  }
  return {
    status: response.status,
    headers: response.headers,
    text,
    json,
  };
}

// Shared E2E state populated progressively across the 16 scenarios
const state = {
  ironHouse: {
    id: "",
    slug: "",
    qrPayload: "",
    ownerEmail: `admin.ironhouse.${RUN_ID}@gymos.test`,
    ownerPassword: "IronHousePassword123!",
    ownerCookie: "",
    staffInviteId: "",
    staffInviteCode: "",
    staffEmail: `desk.ironhouse.${RUN_ID}@gymos.test`,
    staffPassword: "IronDeskPassword123!",
    staffUserId: "",
    staffCookie: "",
    member1Id: "",
    member1Phone: "01011002201",
    member1Token: "",
    member2Id: "",
    member2Phone: "01011002202",
    member2Token: "",
    qrMemberToken: "",
    qrMemberId: "",
    trainerId: "",
    trainerCode: "",
    trainerEmail: `coach.tarek.${RUN_ID}@gymos.test`,
    trainerPhone: "01055001101",
    trainerToken: "",
    customPlanId: "",
    membershipIdToRenew: "",
    workoutPlanId: "",
    sessionId: "",
    activeCheckInId: "",
  },
  powerZone: {
    id: "",
    slug: "",
    qrPayload: "",
    ownerEmail: `admin.powerzone.${RUN_ID}@gymos.test`,
    ownerPassword: "PowerZonePassword123!",
    ownerCookie: "",
    member1Id: "",
    member1Phone: "01222003301",
    member1Token: "",
    member2Id: "",
    member2Phone: "01222003302",
    trainerId: "",
    standaloneInviteCode: "",
    revokedInviteCode: "",
    trainerEmail: `coach.dina.${RUN_ID}@gymos.test`,
    trainerPhone: "01266002201",
    trainerToken: "",
    customPlanId: "",
    membershipId: "",
    workoutPlanId: "",
  },
};

describe("GymOS Post-Deployment Multi-Gym End-to-End Verification Suite (Iron House & Power Zone)", () => {
  before(async () => {
    await startTestMongo();
    await startTestNextServer();
  });

  after(async () => {
    await stopTestNextServer();
    await stopTestMongo();
    rmSync(MONGO_DATA_DIR, { recursive: true, force: true });
  });

  it("1. Registers both independent gyms: Gym A (Iron House) and Gym B (Power Zone)", async () => {
    const regA = await staffRequest<{
      gym?: { id: string; name: string; slug: string };
      user?: { role: string; email: string };
    }>("/api/auth/register", {
      method: "POST",
      body: {
        registrationType: "create-gym",
        gymName: "Iron House",
        gymAddress: "District 5, New Cairo",
        gymPhone: "+201001112233",
        capacity: 120,
        timezone: "Africa/Cairo",
        fullName: "Hassan El-Masry",
        email: state.ironHouse.ownerEmail,
        password: state.ironHouse.ownerPassword,
      },
    });
    assert.equal(regA.status, 201, `Iron House registration failed: ${regA.text}`);
    assert.equal(regA.json.gym?.name, "Iron House");
    assert.equal(regA.json.gym?.slug, "iron-house");
    assert.equal(regA.json.user?.role, "owner");
    state.ironHouse.id = regA.json.gym!.id;
    state.ironHouse.slug = regA.json.gym!.slug;
    state.ironHouse.qrPayload = `GYMOS-GYM:${state.ironHouse.id}`;

    const regB = await staffRequest<{
      gym?: { id: string; name: string; slug: string };
      user?: { role: string; email: string };
    }>("/api/auth/register", {
      method: "POST",
      body: {
        registrationType: "create-gym",
        gymName: "Power Zone",
        gymAddress: "Sheikh Zayed, Giza",
        gymPhone: "+201223334455",
        capacity: 90,
        timezone: "Africa/Cairo",
        fullName: "Mona Mansour",
        email: state.powerZone.ownerEmail,
        password: state.powerZone.ownerPassword,
      },
    });
    assert.equal(regB.status, 201, `Power Zone registration failed: ${regB.text}`);
    assert.equal(regB.json.gym?.name, "Power Zone");
    assert.equal(regB.json.gym?.slug, "power-zone");
    assert.equal(regB.json.user?.role, "owner");
    state.powerZone.id = regB.json.gym!.id;
    state.powerZone.slug = regB.json.gym!.slug;
    state.powerZone.qrPayload = `GYMOS-GYM:${state.powerZone.id}`;

    assert.notEqual(state.ironHouse.id, state.powerZone.id);

    // Duplicate owner email must be rejected with 409
    const dup = await staffRequest("/api/auth/register", {
      method: "POST",
      body: {
        registrationType: "create-gym",
        gymName: "Iron House Duplicate",
        gymAddress: "Cairo",
        gymPhone: "+201009998877",
        fullName: "Dup Owner",
        email: state.ironHouse.ownerEmail,
        password: state.ironHouse.ownerPassword,
      },
    });
    assert.equal(dup.status, 409);
  });

  it("2. Logs in as administrator for Gym A (Iron House) and verifies session scope", async () => {
    const badLogin = await staffRequest("/api/auth/login", {
      method: "POST",
      body: { email: state.ironHouse.ownerEmail, password: "WrongPassword999!" },
    });
    assert.equal(badLogin.status, 401);

    const loginA = await staffRequest<{
      user?: { name: string; email: string; role: string };
      gym?: { id: string; name: string };
    }>("/api/auth/login", {
      method: "POST",
      body: { email: state.ironHouse.ownerEmail, password: state.ironHouse.ownerPassword },
    });
    assert.equal(loginA.status, 200);
    assert.equal(loginA.json.gym?.id, state.ironHouse.id);
    assert.equal(loginA.json.gym?.name, "Iron House");
    assert.ok(loginA.setCookie?.includes("HttpOnly"));
    state.ironHouse.ownerCookie = extractCookiePair(loginA.setCookie, "gymos_staff_session");
    assert.ok(state.ironHouse.ownerCookie.startsWith("gymos_staff_session="));

    const sessionA = await staffRequest<{ gym?: { id: string; name: string }; user?: { role: string } }>(
      "/api/auth/session",
      { cookie: state.ironHouse.ownerCookie },
    );
    assert.equal(sessionA.status, 200);
    assert.equal(sessionA.json.gym?.id, state.ironHouse.id);
    assert.equal(sessionA.json.gym?.name, "Iron House");
    assert.equal(sessionA.json.user?.role, "owner");
  });

  it("3. Logs in as administrator for Gym B (Power Zone) and verifies independent session scope", async () => {
    const loginB = await staffRequest<{
      user?: { name: string; email: string; role: string };
      gym?: { id: string; name: string };
    }>("/api/auth/login", {
      method: "POST",
      body: { email: state.powerZone.ownerEmail, password: state.powerZone.ownerPassword },
    });
    assert.equal(loginB.status, 200);
    assert.equal(loginB.json.gym?.id, state.powerZone.id);
    assert.equal(loginB.json.gym?.name, "Power Zone");
    state.powerZone.ownerCookie = extractCookiePair(loginB.setCookie, "gymos_staff_session");
    assert.ok(state.powerZone.ownerCookie.startsWith("gymos_staff_session="));
    assert.notEqual(state.ironHouse.ownerCookie, state.powerZone.ownerCookie);

    const sessionB = await staffRequest<{ gym?: { id: string; name: string }; user?: { role: string } }>(
      "/api/auth/session",
      { cookie: state.powerZone.ownerCookie },
    );
    assert.equal(sessionB.status, 200);
    assert.equal(sessionB.json.gym?.id, state.powerZone.id);
    assert.equal(sessionB.json.gym?.name, "Power Zone");
    assert.equal(sessionB.json.user?.role, "owner");
  });

  it("4. Creates members in both gyms and isolates member lists per gym", async () => {
    const createA1 = await staffRequest<{ member?: { _id?: string; id?: string } }>("/api/members", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        fullName: "Omar Hassan",
        phone: state.ironHouse.member1Phone,
        email: `omar.${RUN_ID}@ironhouse.test`,
        plan: "3 Month Saver",
        price: 4500,
        duration: 3,
        paymentMethod: "Cash",
        paymentStatus: "Paid",
      },
    });
    assert.equal(createA1.status, 201, `Create Omar failed: ${createA1.text}`);
    state.ironHouse.member1Id = createA1.json.member?.id ?? createA1.json.member?._id ?? "";
    assert.ok(state.ironHouse.member1Id);

    const createA2 = await staffRequest<{ member?: { _id?: string; id?: string } }>("/api/members", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        fullName: "Nour Adel",
        phone: state.ironHouse.member2Phone,
        email: `nour.${RUN_ID}@ironhouse.test`,
        plan: "1 Month Regular",
        price: 1800,
        duration: 1,
        paymentMethod: "Card",
        paymentStatus: "Paid",
      },
    });
    assert.equal(createA2.status, 201);
    state.ironHouse.member2Id = createA2.json.member?.id ?? createA2.json.member?._id ?? "";

    const createB1 = await staffRequest<{ member?: { _id?: string; id?: string } }>("/api/members", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        fullName: "Karim Zaki",
        phone: state.powerZone.member1Phone,
        email: `karim.${RUN_ID}@powerzone.test`,
        plan: "VIP Annual",
        price: 18000,
        duration: 12,
        paymentMethod: "Instapay",
        paymentStatus: "Paid",
      },
    });
    assert.equal(createB1.status, 201);
    state.powerZone.member1Id = createB1.json.member?.id ?? createB1.json.member?._id ?? "";

    const createB2 = await staffRequest<{ member?: { _id?: string; id?: string } }>("/api/members", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        fullName: "Salma Tarek",
        phone: state.powerZone.member2Phone,
        email: `salma.${RUN_ID}@powerzone.test`,
        plan: "1 Month Regular",
        price: 1800,
        duration: 1,
        paymentMethod: "Cash",
        paymentStatus: "Paid",
      },
    });
    assert.equal(createB2.status, 201);
    state.powerZone.member2Id = createB2.json.member?.id ?? createB2.json.member?._id ?? "";

    const listA = await staffRequest<{ members?: Array<{ id: string; name: string }> }>("/api/members", {
      cookie: state.ironHouse.ownerCookie,
    });
    assert.equal(listA.status, 200);
    assert.deepEqual(
      listA.json.members?.map((m) => m.name).sort(),
      ["Nour Adel", "Omar Hassan"],
    );

    const listB = await staffRequest<{ members?: Array<{ id: string; name: string }> }>("/api/members", {
      cookie: state.powerZone.ownerCookie,
    });
    assert.equal(listB.status, 200);
    assert.deepEqual(
      listB.json.members?.map((m) => m.name).sort(),
      ["Karim Zaki", "Salma Tarek"],
    );
  });

  it("5. Creates trainers and member assignments in both gyms", async () => {
    const trainerA = await staffRequest<{
      trainer?: { id: string; inviteCode: string; name: string };
    }>("/api/trainers", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "create",
        name: "Coach Tarek",
        specialty: "Powerlifting & Strength",
        phone: state.ironHouse.trainerPhone,
      },
    });
    assert.equal(trainerA.status, 201, `Create trainer A failed: ${trainerA.text}`);
    state.ironHouse.trainerId = trainerA.json.trainer!.id;
    state.ironHouse.trainerCode = trainerA.json.trainer!.inviteCode;
    assert.ok(state.ironHouse.trainerCode.startsWith("TRN-"));

    const assignA = await staffRequest("/api/trainers", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "assign",
        trainerId: state.ironHouse.trainerId,
        memberId: state.ironHouse.member1Id,
      },
    });
    assert.equal(assignA.status, 200);

    const trainerB = await staffRequest<{
      trainer?: { id: string; inviteCode: string; name: string };
    }>("/api/trainers", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        action: "create",
        name: "Coach Youssef",
        specialty: "HIIT & Conditioning",
        phone: "01266002299",
      },
    });
    assert.equal(trainerB.status, 201);
    state.powerZone.trainerId = trainerB.json.trainer!.id;

    const trainersListA = await staffRequest<{ trainers?: Array<{ name: string }> }>("/api/trainers", {
      cookie: state.ironHouse.ownerCookie,
    });
    assert.deepEqual(trainersListA.json.trainers?.map((t) => t.name), ["Coach Tarek"]);

    const trainersListB = await staffRequest<{ trainers?: Array<{ name: string }> }>("/api/trainers", {
      cookie: state.powerZone.ownerCookie,
    });
    assert.deepEqual(trainersListB.json.trainers?.map((t) => t.name), ["Coach Youssef"]);
  });

  it("6. Tests trainer registration codes (verification, signup, one-time consumption, and revocation)", async () => {
    // Verify Iron House's pre-generated code via mobile endpoint
    const checkA = await mobileRequest<{ valid?: boolean; gymName?: string; gymSlug?: string }>(
      `/api/auth/trainer-code?code=${encodeURIComponent(state.ironHouse.trainerCode)}`,
    );
    assert.equal(checkA.status, 200, `Trainer code check failed: ${checkA.text}`);
    assert.equal(checkA.json.valid, true);
    assert.equal(checkA.json.gymName, "Iron House");
    assert.equal(checkA.json.gymSlug, "iron-house");

    // Generate standalone & revocable codes in Power Zone
    const genStandalone = await staffRequest<{ invite?: { id: string; code: string } }>("/api/trainers", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        action: "generate-code",
        presetName: "Coach Dina",
        presetSpecialty: "Athletic Mobility",
      },
    });
    assert.equal(genStandalone.status, 201);
    state.powerZone.standaloneInviteCode = genStandalone.json.invite!.code;

    const genToRevoke = await staffRequest<{ invite?: { id: string; code: string } }>("/api/trainers", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: { action: "generate-code", presetName: "Temp Coach" },
    });
    assert.equal(genToRevoke.status, 201);
    state.powerZone.revokedInviteCode = genToRevoke.json.invite!.code;

    const revokeRes = await staffRequest("/api/trainers", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: { action: "revoke-code", inviteId: genToRevoke.json.invite!.id },
    });
    assert.equal(revokeRes.status, 200);

    // Revoked code must fail verification and signup
    const checkRevoked = await mobileRequest(
      `/api/auth/trainer-code?code=${encodeURIComponent(state.powerZone.revokedInviteCode)}`,
    );
    assert.equal(checkRevoked.status, 404);

    // Register Coach Tarek (Iron House) using invite code
    const regTrainerA = await mobileRequest<{
      sessionToken?: string;
      trainer?: { id: string; gymId: string; gymName: string };
    }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "trainer",
        trainerCode: state.ironHouse.trainerCode,
        fullName: "Coach Tarek",
        phone: state.ironHouse.trainerPhone,
        email: state.ironHouse.trainerEmail,
        specialty: "Powerlifting & Strength",
        password: "CoachPassword123!",
      },
    });
    assert.equal(regTrainerA.status, 201, `Trainer A signup failed: ${regTrainerA.text}`);
    state.ironHouse.trainerToken = regTrainerA.json.sessionToken!;
    assert.ok(state.ironHouse.trainerToken);
    const verifyTrainerAGym = await mobileRequest<{ trainer?: { gymId: string; gymName: string } }>(
      "/api/trainer-portal",
      { token: state.ironHouse.trainerToken },
    );
    assert.equal(verifyTrainerAGym.status, 200);
    assert.equal(verifyTrainerAGym.json.trainer?.gymId, state.ironHouse.id);
    assert.equal(verifyTrainerAGym.json.trainer?.gymName, "Iron House");

    // Reusing consumed code must fail
    const reuseAttempt = await mobileRequest("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "trainer",
        trainerCode: state.ironHouse.trainerCode,
        fullName: "Impersonator",
        phone: "01099887766",
        email: `imp.${RUN_ID}@test.com`,
        password: "CoachPassword123!",
      },
    });
    assert.ok(reuseAttempt.status === 404 || reuseAttempt.status === 409);

    // Register Coach Dina (Power Zone) using Power Zone's standalone invite code
    const regTrainerB = await mobileRequest<{
      sessionToken?: string;
      trainer?: { id: string; gymId: string; gymName: string };
    }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "trainer",
        trainerCode: state.powerZone.standaloneInviteCode,
        fullName: "Coach Dina",
        phone: state.powerZone.trainerPhone,
        email: state.powerZone.trainerEmail,
        password: "CoachPassword123!",
      },
    });
    assert.equal(regTrainerB.status, 201);
    state.powerZone.trainerToken = regTrainerB.json.sessionToken!;
    const verifyTrainerBGym = await mobileRequest<{ trainer?: { gymId: string; gymName: string } }>(
      "/api/trainer-portal",
      { token: state.powerZone.trainerToken },
    );
    assert.equal(verifyTrainerBGym.status, 200);
    assert.equal(verifyTrainerBGym.json.trainer?.gymId, state.powerZone.id);
    assert.equal(verifyTrainerBGym.json.trainer?.gymName, "Power Zone");

    // Assign Karim Zaki to Coach Dina in Power Zone
    const assignB = await staffRequest("/api/trainers", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        action: "assign",
        trainerId: regTrainerB.json.trainer!.id,
        memberId: state.powerZone.member1Id,
      },
    });
    assert.equal(assignB.status, 200);
  });

  it("7. Adds and manages attendance records (front-desk check-in/out & mobile QR self check-in)", async () => {
    // Claim Omar Hassan's front-desk member account on mobile (profile claiming returns HTTP 200 + claimed: true)
    const claimOmar = await mobileRequest<{ sessionToken?: string; claimed?: boolean }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "member",
        fullName: "Omar Hassan",
        phone: state.ironHouse.member1Phone,
        email: `omar.${RUN_ID}@ironhouse.test`,
        password: "MemberPassword123!",
      },
    });
    assert.equal(claimOmar.status, 200, `Omar mobile claim failed: ${claimOmar.text}`);
    assert.equal(claimOmar.json.claimed, true);
    state.ironHouse.member1Token = claimOmar.json.sessionToken!;

    // Claim Nour Adel's account as well
    const claimNour = await mobileRequest<{ sessionToken?: string; claimed?: boolean }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "member",
        fullName: "Nour Adel",
        phone: state.ironHouse.member2Phone,
        email: `nour.${RUN_ID}@ironhouse.test`,
        password: "MemberPassword123!",
      },
    });
    assert.equal(claimNour.status, 200);
    state.ironHouse.member2Token = claimNour.json.sessionToken!;

    // Claim Karim Zaki (Power Zone)
    const claimKarim = await mobileRequest<{ sessionToken?: string; claimed?: boolean }>("/api/auth/member/register", {
      method: "POST",
      body: {
        accountType: "member",
        fullName: "Karim Zaki",
        phone: state.powerZone.member1Phone,
        email: `karim.${RUN_ID}@powerzone.test`,
        password: "MemberPassword123!",
      },
    });
    assert.equal(claimKarim.status, 200);
    state.powerZone.member1Token = claimKarim.json.sessionToken!;

    // Front-desk check-in for Nour Adel (Iron House)
    const deskCheckInA = await staffRequest<{ checkIn?: { id: string }; occupancy?: number }>(
      "/api/attendance",
      {
        method: "POST",
        cookie: state.ironHouse.ownerCookie,
        body: { action: "checkin", memberId: state.ironHouse.member2Id },
      },
    );
    assert.equal(deskCheckInA.status, 201, `Front-desk check-in failed: ${deskCheckInA.text}`);
    state.ironHouse.activeCheckInId = deskCheckInA.json.checkIn!.id;
    assert.equal(deskCheckInA.json.occupancy, 1);

    // Duplicate active check-in rejected with 409
    const dupCheckIn = await staffRequest("/api/attendance", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "checkin", memberId: state.ironHouse.member2Id },
    });
    assert.equal(dupCheckIn.status, 409);

    // Mobile QR self check-in for Omar Hassan at Iron House
    const qrCheckInOmar = await mobileRequest<{ occupancy?: number }>("/api/attendance", {
      method: "POST",
      token: state.ironHouse.member1Token,
      body: {
        action: "checkin",
        source: "Member self-scan",
        gymQrPayload: state.ironHouse.qrPayload,
      },
    });
    assert.equal(qrCheckInOmar.status, 201, `Mobile QR check-in failed: ${qrCheckInOmar.text}`);
    assert.equal(qrCheckInOmar.json.occupancy, 2);

    // Mobile QR self check-in for Coach Tarek at Iron House
    const qrCheckInTrainer = await mobileRequest<{ occupancy?: number }>("/api/attendance", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "checkin",
        source: "Trainer self-scan",
        gymQrPayload: state.ironHouse.qrPayload,
      },
    });
    assert.equal(qrCheckInTrainer.status, 201);
    assert.equal(qrCheckInTrainer.json.occupancy, 3);

    // Cross-gym QR scan MUST fail: Omar (Iron House) scanning Power Zone's QR code
    const wrongGymScan = await mobileRequest("/api/attendance", {
      method: "POST",
      token: state.ironHouse.member1Token,
      body: {
        action: "checkin",
        source: "Member self-scan",
        gymQrPayload: state.powerZone.qrPayload,
      },
    });
    assert.equal(wrongGymScan.status, 403);

    // Mobile user cannot perform staff check-out
    const mobileCheckoutAttempt = await mobileRequest("/api/attendance", {
      method: "POST",
      token: state.ironHouse.member1Token,
      body: { action: "checkout", checkInId: state.ironHouse.activeCheckInId },
    });
    assert.equal(mobileCheckoutAttempt.status, 403);

    // Staff check-out succeeds
    const staffCheckout = await staffRequest<{ occupancy?: number }>("/api/attendance", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "checkout", checkInId: state.ironHouse.activeCheckInId },
    });
    assert.equal(staffCheckout.status, 200);
    assert.equal(staffCheckout.json.occupancy, 2);

    // Power Zone attendance remains completely empty until Power Zone records check-in
    const attB = await staffRequest<{ checkIns?: unknown[]; occupancy?: number }>("/api/attendance", {
      cookie: state.powerZone.ownerCookie,
    });
    assert.equal(attB.status, 200);
    assert.equal(attB.json.occupancy, 0);
  });

  it("8. Creates and manages membership plans, assignments, and renewals in both gyms", async () => {
    const planA = await staffRequest<{ plan?: { id: string; name: string } }>("/api/memberships", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "plan",
        name: "Iron Elite 6M",
        price: 8200,
        durationMonths: 6,
        featured: true,
        benefits: ["24/7 Iron House access", "Sauna & cold plunge"],
      },
    });
    assert.equal(planA.status, 201);
    state.ironHouse.customPlanId = planA.json.plan!.id;

    const planB = await staffRequest<{ plan?: { id: string; name: string } }>("/api/memberships", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: {
        action: "plan",
        name: "Power Pro 6M",
        price: 7900,
        durationMonths: 6,
        featured: true,
        benefits: ["Power Zone turf & sled track"],
      },
    });
    assert.equal(planB.status, 201);
    state.powerZone.customPlanId = planB.json.plan!.id;

    // Assign Iron Elite 6M to Nour Adel and then test renewal
    const createSubA = await staffRequest<{ membership?: { id: string } }>("/api/memberships", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "create",
        memberId: state.ironHouse.member2Id,
        planId: state.ironHouse.customPlanId,
        paymentStatus: "Paid",
      },
    });
    assert.equal(createSubA.status, 201);
    state.ironHouse.membershipIdToRenew = createSubA.json.membership!.id;

    const renewSubA = await staffRequest<{ membership?: { id: string; expiryDate: string } }>(
      "/api/memberships",
      {
        method: "POST",
        cookie: state.ironHouse.ownerCookie,
        body: {
          action: "renew",
          membershipId: state.ironHouse.membershipIdToRenew,
          paymentStatus: "Paid",
        },
      },
    );
    assert.equal(renewSubA.status, 200);

    // Fetch Power Zone memberships to store one ID for cross-tenant isolation tests
    const getB = await staffRequest<{
      plans?: Array<{ name: string }>;
      subscriptions?: Array<{ id: string }>;
    }>("/api/memberships", { cookie: state.powerZone.ownerCookie });
    assert.equal(getB.status, 200);
    assert.ok(getB.json.plans?.some((p) => p.name === "Power Pro 6M"));
    assert.ok(!getB.json.plans?.some((p) => p.name === "Iron Elite 6M"));
    state.powerZone.membershipId = getB.json.subscriptions?.[0]?.id ?? "";
    assert.ok(state.powerZone.membershipId);
  });

  it("9. Tests end-to-end subscription requests (QR lookup, subscribe, cancel, staff accept/decline, payments & token upgrade)", async () => {
    // Unaffiliated new mobile user signs up
    const newMember = await mobileRequest<{ sessionToken?: string; member?: { id: string } }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: "Yara Mostafa",
          phone: "01144556677",
          email: `yara.${RUN_ID}@mobile.test`,
          password: "MemberPassword123!",
        },
      },
    );
    assert.equal(newMember.status, 201);
    state.ironHouse.qrMemberToken = newMember.json.sessionToken!;
    state.ironHouse.qrMemberId = newMember.json.member!.id;

    // Discover Iron House plans via QR
    const discover = await mobileRequest<{
      gym?: { id: string; name: string };
      plans?: Array<{ id: string; name: string }>;
    }>(`/api/member-subscriptions?qr=${encodeURIComponent(state.ironHouse.qrPayload)}`, {
      token: state.ironHouse.qrMemberToken,
    });
    assert.equal(discover.status, 200);
    assert.equal(discover.json.gym?.id, state.ironHouse.id);
    assert.equal(discover.json.gym?.name, "Iron House");

    // Submit subscription request -> cancel -> re-submit
    const sub1 = await mobileRequest<{ pendingRequest?: { id: string } }>(
      "/api/member-subscriptions",
      {
        method: "POST",
        token: state.ironHouse.qrMemberToken,
        body: {
          action: "subscribe",
          gymId: discover.json.gym!.id,
          planId: state.ironHouse.customPlanId,
          paymentMethod: "Instapay",
        },
      },
    );
    assert.equal(sub1.status, 201, `Subscribe 1 failed: ${sub1.text}`);

    const cancel1 = await mobileRequest("/api/member-subscriptions", {
      method: "POST",
      token: state.ironHouse.qrMemberToken,
      body: { action: "cancel" },
    });
    assert.equal(cancel1.status, 200);

    const sub2 = await mobileRequest<{ pendingRequest?: { id: string } }>(
      "/api/member-subscriptions",
      {
        method: "POST",
        token: state.ironHouse.qrMemberToken,
        body: {
          action: "subscribe",
          gymId: discover.json.gym!.id,
          planId: state.ironHouse.customPlanId,
          paymentMethod: "Instapay",
        },
      },
    );
    assert.equal(sub2.status, 201);
    const supersededReqId = sub2.json.pendingRequest!.id;

    // Re-submitting supersedes the older pending request so only 1 pending request remains
    const sub3 = await mobileRequest<{ pendingRequest?: { id: string } }>(
      "/api/member-subscriptions",
      {
        method: "POST",
        token: state.ironHouse.qrMemberToken,
        body: {
          action: "subscribe",
          gymId: discover.json.gym!.id,
          planId: state.ironHouse.customPlanId,
          paymentMethod: "Cash",
        },
      },
    );
    assert.equal(sub3.status, 201);
    const pendingReqId = sub3.json.pendingRequest!.id;

    const ihPendingList = await staffRequest<{ requests?: Array<{ id: string }> }>(
      "/api/membership-requests",
      { cookie: state.ironHouse.ownerCookie },
    );
    assert.equal(ihPendingList.json.requests?.length, 1);
    assert.equal(ihPendingList.json.requests?.[0]?.id, pendingReqId);

    // Accepting the older superseded request must fail with 404
    const staleAccept = await staffRequest("/api/membership-requests", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "accept", requestId: supersededReqId },
    });
    assert.equal(staleAccept.status, 404);

    // Power Zone admin sees 0 pending requests and CANNOT accept Iron House's request
    const pzRequests = await staffRequest<{ requests?: unknown[] }>("/api/membership-requests", {
      cookie: state.powerZone.ownerCookie,
    });
    assert.equal(pzRequests.json.requests?.length, 0);

    const crossAccept = await staffRequest("/api/membership-requests", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: { action: "accept", requestId: pendingReqId },
    });
    assert.equal(crossAccept.status, 404);

    // Iron House admin accepts Yara's membership request
    const ihAccept = await staffRequest("/api/membership-requests", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "accept", requestId: pendingReqId },
    });
    assert.equal(ihAccept.status, 200);

    // Member portal automatically upgrades Yara's session token to Iron House
    const yaraPortal = await mobileRequest<{
      enrolledInGym?: boolean;
      sessionToken?: string;
      member?: { gymId: string; gymName: string; planName: string };
    }>("/api/member-portal", { token: state.ironHouse.qrMemberToken });
    assert.equal(yaraPortal.status, 200);
    assert.equal(yaraPortal.json.enrolledInGym, true);
    assert.equal(yaraPortal.json.member?.gymId, state.ironHouse.id);
    assert.equal(yaraPortal.json.member?.planName, "Iron Elite 6M");
    assert.ok(yaraPortal.json.sessionToken, "Expected upgraded gym-bound sessionToken");
    state.ironHouse.qrMemberToken = yaraPortal.json.sessionToken!;

    // Manual payment record logging & verification in Iron House
    const addPayment = await staffRequest("/api/payments", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        memberId: state.ironHouse.qrMemberId,
        amount: 350,
        description: "Personal locker add-on",
        paymentMethod: "Cash",
        status: "Paid",
      },
    });
    assert.equal(addPayment.status, 201);

    const ihPayments = await staffRequest<{
      transactions?: Array<{ memberName: string; amount: number }>;
    }>("/api/payments", { cookie: state.ironHouse.ownerCookie });
    assert.equal(ihPayments.status, 200);
    assert.ok(ihPayments.json.transactions?.some((t) => t.memberName === "Yara Mostafa"));

    // Test decline flow in Power Zone
    const declineCandidate = await mobileRequest<{ sessionToken?: string }>(
      "/api/auth/member/register",
      {
        method: "POST",
        body: {
          accountType: "member",
          fullName: "Hany Samir",
          phone: "01555667788",
          email: `hany.${RUN_ID}@mobile.test`,
          password: "MemberPassword123!",
        },
      },
    );
    const pzSub = await mobileRequest<{ pendingRequest?: { id: string } }>(
      "/api/member-subscriptions",
      {
        method: "POST",
        token: declineCandidate.json.sessionToken!,
        body: {
          action: "subscribe",
          gymId: state.powerZone.id,
          planId: state.powerZone.customPlanId,
          paymentMethod: "Cash",
        },
      },
    );
    assert.equal(pzSub.status, 201);
    const pzDecline = await staffRequest("/api/membership-requests", {
      method: "POST",
      cookie: state.powerZone.ownerCookie,
      body: { action: "decline", requestId: pzSub.json.pendingRequest!.id },
    });
    assert.equal(pzDecline.status, 200);
  });

  it("10. Enforces staff role permissions (owner vs staff) and immediate session revocation on deactivation", async () => {
    const genStaffInvite = await staffRequest<{ invite?: { id: string; code: string } }>(
      "/api/settings",
      {
        method: "POST",
        cookie: state.ironHouse.ownerCookie,
        body: {
          action: "generate-staff-invite",
          role: "staff",
          presetName: "Ali Reception",
          presetEmail: state.ironHouse.staffEmail,
        },
      },
    );
    assert.equal(genStaffInvite.status, 201);
    state.ironHouse.staffInviteCode = genStaffInvite.json.invite!.code;

    // Receptionist joins Iron House via staff invite code
    const joinStaff = await staffRequest<{ user?: { role: string }; gym?: { id: string } }>(
      "/api/auth/register",
      {
        method: "POST",
        body: {
          registrationType: "join-gym",
          inviteCode: state.ironHouse.staffInviteCode,
          fullName: "Ali Reception",
          email: state.ironHouse.staffEmail,
          password: state.ironHouse.staffPassword,
        },
      },
    );
    assert.equal(joinStaff.status, 201, `Staff join failed: ${joinStaff.text}`);
    assert.equal(joinStaff.json.user?.role, "staff");
    assert.equal(joinStaff.json.gym?.id, state.ironHouse.id);
    state.ironHouse.staffCookie = extractCookiePair(joinStaff.setCookie, "gymos_staff_session");

    // Staff role CAN read dashboard & members for Iron House
    const staffDash = await staffRequest("/api/dashboard", { cookie: state.ironHouse.staffCookie });
    assert.equal(staffDash.status, 200);
    const staffMembers = await staffRequest("/api/members", { cookie: state.ironHouse.staffCookie });
    assert.equal(staffMembers.status, 200);

    // Staff role CANNOT modify gym settings or generate staff invites (owner-only -> 403)
    const staffUpdateGym = await staffRequest("/api/settings", {
      method: "POST",
      cookie: state.ironHouse.staffCookie,
      body: {
        action: "update-gym",
        name: "Unauthorized Rename",
        address: "Cairo",
        phone: "+201001112233",
        capacity: 150,
        timezone: "Africa/Cairo",
      },
    });
    assert.equal(staffUpdateGym.status, 403);

    const staffGenInvite = await staffRequest("/api/settings", {
      method: "POST",
      cookie: state.ironHouse.staffCookie,
      body: { action: "generate-staff-invite", role: "owner" },
    });
    assert.equal(staffGenInvite.status, 403);

    // Staff role CANNOT access platform admin endpoints (403)
    const staffPlatformAttempt = await staffRequest("/api/platform/gyms", {
      cookie: state.ironHouse.staffCookie,
    });
    assert.equal(staffPlatformAttempt.status, 403);

    // Locate Ali's staff userId from settings team list
    const settingsRes = await staffRequest<{
      currentUser?: { id: string };
      team?: Array<{ id: string; email: string }>;
    }>("/api/settings", { cookie: state.ironHouse.ownerCookie });
    assert.equal(settingsRes.status, 200);
    const ownerId = settingsRes.json.currentUser!.id;
    state.ironHouse.staffUserId =
      settingsRes.json.team?.find((m) => m.email === state.ironHouse.staffEmail)?.id ?? "";
    assert.ok(state.ironHouse.staffUserId);

    // Owner cannot deactivate their own owner account (400)
    const selfDeactivate = await staffRequest("/api/settings", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "update-staff-status", staffUserId: ownerId, status: "inactive" },
    });
    assert.equal(selfDeactivate.status, 400);

    // Owner deactivates receptionist; receptionist's existing session cookie immediately loses access (401)
    const deactivateStaff = await staffRequest("/api/settings", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "update-staff-status",
        staffUserId: state.ironHouse.staffUserId,
        status: "inactive",
      },
    });
    assert.equal(deactivateStaff.status, 200);

    const revokedStaffAccess = await staffRequest("/api/members", {
      cookie: state.ironHouse.staffCookie,
    });
    assert.equal(revokedStaffAccess.status, 401);
  });

  it("11. Verifies mobile application login (email, local/international phone, role validation & header-only session)", async () => {
    // Member login by local Egyptian phone format
    const memberPhoneLogin = await mobileRequest<{
      sessionToken?: string;
      member?: { id: string; name: string };
    }>("/api/auth/member/login", {
      method: "POST",
      body: {
        accountType: "member",
        identifier: state.ironHouse.member1Phone,
        password: "MemberPassword123!",
      },
    });
    assert.equal(memberPhoneLogin.status, 200);
    assert.equal(memberPhoneLogin.json.member?.id, state.ironHouse.member1Id);
    assert.equal(memberPhoneLogin.headers.get("access-control-allow-origin"), MOBILE_ORIGIN);

    const verifyPortalGym = await mobileRequest<{ member?: { gymId: string } }>("/api/member-portal", {
      token: memberPhoneLogin.json.sessionToken,
    });
    assert.equal(verifyPortalGym.status, 200);
    assert.equal(verifyPortalGym.json.member?.gymId, state.ironHouse.id);

    // Member login with wrong accountType ("trainer") must fail with 401
    const roleMismatch = await mobileRequest("/api/auth/member/login", {
      method: "POST",
      body: {
        accountType: "trainer",
        identifier: state.ironHouse.member1Phone,
        password: "MemberPassword123!",
      },
    });
    assert.equal(roleMismatch.status, 401);

    // Trainer login by email in Power Zone
    const trainerLoginB = await mobileRequest<{
      sessionToken?: string;
      trainer?: { id: string; name: string };
    }>("/api/auth/member/login", {
      method: "POST",
      body: {
        accountType: "trainer",
        identifier: state.powerZone.trainerEmail,
        password: "CoachPassword123!",
      },
    });
    assert.equal(trainerLoginB.status, 200);
    assert.equal(trainerLoginB.json.trainer?.name, "Coach Dina");
    const verifyTrainerPortalB = await mobileRequest<{
      trainer?: { gymId: string; gymName: string };
    }>("/api/trainer-portal", { token: trainerLoginB.json.sessionToken });
    assert.equal(verifyTrainerPortalB.status, 200);
    assert.equal(verifyTrainerPortalB.json.trainer?.gymId, state.powerZone.id);
    assert.equal(verifyTrainerPortalB.json.trainer?.gymName, "Power Zone");

    // Mobile logout endpoint succeeds cleanly
    const mobileLogout = await mobileRequest("/api/auth/member/logout", {
      method: "POST",
      token: memberPhoneLogin.json.sessionToken,
    });
    assert.equal(mobileLogout.status, 200);
  });

  it("12. Verifies member-specific portal information (workout plan, coaching session, trainer & attendance)", async () => {
    // Iron House staff creates a workout template
    const createWorkoutA = await staffRequest<{ workoutPlan?: { id: string } }>("/api/workouts", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "create",
        title: "Iron House Strength Block A",
        targetGoal: "Maximal Strength",
        exercises: [
          {
            exerciseName: "Barbell Back Squat",
            sets: "5",
            reps: "5",
            restTime: "180s",
            targetMuscleGroup: "Quads & Glutes",
          },
          {
            exerciseName: "Bench Press",
            sets: "4",
            reps: "6",
            restTime: "150s",
            targetMuscleGroup: "Chest",
          },
        ],
      },
    });
    assert.equal(createWorkoutA.status, 201, `Workout create failed: ${createWorkoutA.text}`);
    // Read created workout ID via GET /api/workouts
    const workoutsListA = await staffRequest<{ workoutPlans?: Array<{ id: string; title: string }> }>(
      "/api/workouts",
      { cookie: state.ironHouse.ownerCookie },
    );
    state.ironHouse.workoutPlanId = workoutsListA.json.workoutPlans![0].id;

    // Coach Tarek assigns the workout & schedules a session for Omar Hassan via mobile Trainer Portal
    const assignWorkout = await mobileRequest("/api/trainer-portal", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "assign-workout",
        memberId: state.ironHouse.member1Id,
        workoutPlanId: state.ironHouse.workoutPlanId,
      },
    });
    assert.equal(assignWorkout.status, 200, `Assign workout failed: ${assignWorkout.text}`);

    const startsAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    const createSession = await mobileRequest<{ session?: { id: string } }>("/api/trainer-portal", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "create-session",
        memberId: state.ironHouse.member1Id,
        title: "Heavy Squat Coaching",
        startsAt,
        durationMinutes: 60,
        notes: "Bring knee sleeves",
      },
    });
    assert.equal(createSession.status, 201);
    state.ironHouse.sessionId = createSession.json.session!.id;

    // Omar fetches GET /api/member-portal -> sees his trainer, workout, session & visit
    const omarPortal = await mobileRequest<{
      member?: { id: string; gymName: string };
      trainer?: { name: string } | null;
      workoutPlan?: { title: string; exercises: unknown[] } | null;
      upcomingSessions?: Array<{ id: string; title: string }>;
      visits?: unknown[];
    }>("/api/member-portal", { token: state.ironHouse.member1Token });
    assert.equal(omarPortal.status, 200);
    assert.equal(omarPortal.json.member?.gymName, "Iron House");
    assert.equal(omarPortal.json.trainer?.name, "Coach Tarek");
    assert.equal(omarPortal.json.workoutPlan?.title, "Iron House Strength Block A");
    assert.equal(omarPortal.json.workoutPlan?.exercises.length, 2);
    assert.equal(omarPortal.json.upcomingSessions?.[0]?.title, "Heavy Squat Coaching");
    assert.ok((omarPortal.json.visits?.length ?? 0) >= 1);

    // Nour Adel (same gym, different member) must NOT see Omar's workout or session
    const nourPortal = await mobileRequest<{
      workoutPlan?: unknown;
      upcomingSessions?: unknown[];
    }>("/api/member-portal", { token: state.ironHouse.member2Token });
    assert.equal(nourPortal.status, 200);
    assert.equal(nourPortal.json.workoutPlan, null);
    assert.equal(nourPortal.json.upcomingSessions?.length, 0);
  });

  it("13. Verifies trainer-specific portal information, availability updates, and trainee boundaries", async () => {
    const trainerPortalA = await mobileRequest<{
      trainer?: { name: string; gymName: string; checkedInNow: boolean };
      trainees?: Array<{ id: string; name: string }>;
      sessions?: Array<{ id: string; status: string }>;
      visits?: unknown[];
    }>("/api/trainer-portal", { token: state.ironHouse.trainerToken });
    assert.equal(trainerPortalA.status, 200);
    assert.equal(trainerPortalA.json.trainer?.name, "Coach Tarek");
    assert.equal(trainerPortalA.json.trainer?.gymName, "Iron House");
    assert.equal(trainerPortalA.json.trainer?.checkedInNow, true);
    assert.deepEqual(
      trainerPortalA.json.trainees?.map((t) => t.name),
      ["Omar Hassan"],
    );

    // Unassigned member in SAME gym (Nour Adel) cannot be queried or scheduled by Coach Tarek
    const unassignedQuery = await mobileRequest(
      `/api/trainer-portal?memberId=${state.ironHouse.member2Id}`,
      { token: state.ironHouse.trainerToken },
    );
    assert.equal(unassignedQuery.status, 403);

    // Update session status & availability
    const completeSession = await mobileRequest("/api/trainer-portal", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "update-session-status",
        sessionId: state.ironHouse.sessionId,
        status: "completed",
      },
    });
    assert.equal(completeSession.status, 200);

    const updateAvail = await mobileRequest("/api/trainer-portal", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "update-availability",
        availability: [
          { day: "Sun", startTime: "09:00", endTime: "17:00" },
          { day: "Tue", startTime: "12:00", endTime: "20:00" },
        ],
      },
    });
    assert.equal(updateAvail.status, 200);

    // Power Zone trainer (Coach Dina) sees ONLY Power Zone trainee (Karim Zaki)
    const trainerPortalB = await mobileRequest<{
      trainer?: { gymName: string };
      trainees?: Array<{ name: string }>;
    }>("/api/trainer-portal", { token: state.powerZone.trainerToken });
    assert.equal(trainerPortalB.status, 200);
    assert.equal(trainerPortalB.json.trainer?.gymName, "Power Zone");
    assert.deepEqual(
      trainerPortalB.json.trainees?.map((t) => t.name),
      ["Karim Zaki"],
    );
  });

  it("14. Verifies strict cross-tenant isolation: neither Iron House nor Power Zone can read or mutate the other's data", async () => {
    // 1. Parameter tampering (?gymId, X-Gym-Id, body.gymId) must all return 403
    const queryTamper = await staffRequest(`/api/members?gymId=${state.powerZone.id}`, {
      cookie: state.ironHouse.ownerCookie,
    });
    assert.equal(queryTamper.status, 403);

    const headerTamper = await staffRequest("/api/dashboard", {
      cookie: state.ironHouse.ownerCookie,
      headers: { "X-Gym-Id": state.powerZone.id },
    });
    assert.equal(headerTamper.status, 403);

    const bodyTamper = await staffRequest("/api/members", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        gymId: state.powerZone.id,
        fullName: "Injected Member",
        phone: "01077778888",
        plan: "1 Month Regular",
        price: 1800,
        duration: 1,
      },
    });
    assert.equal(bodyTamper.status, 403);

    // 2. Cross-tenant record ID mutations (Iron House admin targeting Power Zone IDs -> 404)
    const crossRenew = await staffRequest("/api/memberships", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "renew",
        membershipId: state.powerZone.membershipId,
        paymentStatus: "Paid",
      },
    });
    assert.equal(crossRenew.status, 404);

    const crossAssignTrainer = await staffRequest("/api/trainers", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        action: "assign",
        trainerId: state.ironHouse.trainerId,
        memberId: state.powerZone.member1Id,
      },
    });
    assert.equal(crossAssignTrainer.status, 404);

    const crossPayment = await staffRequest("/api/payments", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        memberId: state.powerZone.member1Id,
        amount: 500,
        description: "Cross-tenant test",
        paymentMethod: "Cash",
        status: "Paid",
      },
    });
    assert.equal(crossPayment.status, 404);

    const crossCheckIn = await staffRequest("/api/attendance", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "checkin", memberId: state.powerZone.member1Id },
    });
    assert.equal(crossCheckIn.status, 404);

    // 3. Cross-tenant trainer action from mobile (Coach Tarek targeting Karim Zaki in Power Zone)
    const crossTrainerSession = await mobileRequest("/api/trainer-portal", {
      method: "POST",
      token: state.ironHouse.trainerToken,
      body: {
        action: "create-session",
        memberId: state.powerZone.member1Id,
        title: "Cross Gym Session",
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        durationMinutes: 60,
      },
    });
    assert.equal(crossTrainerSession.status, 403);

    // 4. Mobile member/trainer tokens rejected on staff endpoints with 403
    const mobileOnStaff = await mobileRequest("/api/members", {
      token: state.ironHouse.member1Token,
    });
    assert.equal(mobileOnStaff.status, 403);

    // 5. Forged HMAC token rejected with 401
    const forgedParts = state.ironHouse.member1Token.split(".");
    const tamperedSig = `${forgedParts[0]}.${forgedParts[1].slice(0, -2)}aa`;
    const forgedReq = await mobileRequest("/api/member-portal", { token: tamperedSig });
    assert.equal(forgedReq.status, 401);

    // 6. Verify dashboard metrics remain isolated between Iron House & Power Zone
    const dashA = await staffRequest<{ gym?: { id: string; name: string } }>("/api/dashboard", {
      cookie: state.ironHouse.ownerCookie,
    });
    const dashB = await staffRequest<{ gym?: { id: string; name: string } }>("/api/dashboard", {
      cookie: state.powerZone.ownerCookie,
    });
    assert.equal(dashA.json.gym?.name, "Iron House");
    assert.equal(dashB.json.gym?.name, "Power Zone");
  });

  it("15. Verifies `/` Super Admin root isolation and `/gym/<slug>` authenticated session persistence until explicit logout", async () => {
    const sInfo = await staffRequest<{ gym?: { name: string; slug?: string } }>(
      "/api/auth/session",
      { cookie: state.ironHouse.ownerCookie },
    );
    assert.equal(sInfo.status, 200);
    const ironSlug = sInfo.json.gym?.slug || "iron-house";
    const pInfo = await staffRequest<{ gym?: { slug?: string } }>("/api/auth/session", {
      cookie: state.powerZone.ownerCookie,
    });
    const powerSlug = pInfo.json.gym?.slug || "power-zone";

    // Unauthenticated session check returns 401
    const unauthSession = await staffRequest("/api/auth/session");
    assert.equal(unauthSession.status, 401);

    // Gym Admin visiting `/` (Super Admin Dashboard) MUST NOT gain Super Admin access
    const rootWithGymCookie = await staffRequest("/", {
      cookie: state.ironHouse.ownerCookie,
      redirect: "manual",
    });
    if (rootWithGymCookie.status === 307 || rootWithGymCookie.status === 302) {
      assert.ok(
        String(rootWithGymCookie.headers.get("location") ?? "").includes("/platform/login"),
      );
    }

    // Authenticated hard refreshes across every `/gym/<slug>/*` staff route stay 200 OK
    const protectedGymPages = [
      `/gym/${ironSlug}`,
      `/gym/${ironSlug}/members`,
      `/gym/${ironSlug}/trainers`,
      `/gym/${ironSlug}/memberships`,
      `/gym/${ironSlug}/payments`,
      `/gym/${ironSlug}/attendance`,
      `/gym/${ironSlug}/settings`,
    ];

    for (const page of protectedGymPages) {
      const res = await staffRequest(page, {
        cookie: state.ironHouse.ownerCookie,
        redirect: "manual",
      });
      assert.equal(res.status, 200, `Expected 200 on ${page} refresh, got ${res.status}`);
    }

    // Cross-gym API request with mismatched X-GymOS-Gym-Slug must return 403
    const crossSlugApi = await staffRequest("/api/members", {
      cookie: state.ironHouse.ownerCookie,
      headers: { "X-GymOS-Gym-Slug": powerSlug },
    });
    assert.equal(crossSlugApi.status, 403);

    // Authenticated user visiting /gym/<slug>/login redirects back to /gym/<slug>
    const loginWhileAuthed = await staffRequest(`/gym/${ironSlug}/login`, {
      cookie: state.ironHouse.ownerCookie,
      redirect: "manual",
    });
    assert.ok(loginWhileAuthed.status === 307 || loginWhileAuthed.status === 302);

    // Session endpoint survives repeated refreshes
    for (let i = 0; i < 3; i += 1) {
      const s = await staffRequest<{ gym?: { name: string } }>("/api/auth/session", {
        cookie: state.ironHouse.ownerCookie,
        headers: { "X-GymOS-Gym-Slug": ironSlug },
      });
      assert.equal(s.status, 200);
      assert.equal(s.json.gym?.name, "Iron House");
    }

    // Explicit logout clears cookie, and subsequent session refresh returns 401
    const tempLogin = await staffRequest("/api/auth/login", {
      method: "POST",
      body: { email: state.powerZone.ownerEmail, password: state.powerZone.ownerPassword },
    });
    const tempCookie = extractCookiePair(tempLogin.setCookie, "gymos_staff_session");
    const logoutRes = await staffRequest("/api/auth/logout", {
      method: "POST",
      cookie: tempCookie,
    });
    assert.equal(logoutRes.status, 200);
    assert.ok(logoutRes.setCookie?.includes("Max-Age=0"));
    const clearedCookie = extractCookiePair(logoutRes.setCookie, "gymos_staff_session");
    const postLogoutSession = await staffRequest("/api/auth/session", {
      cookie: clearedCookie,
    });
    assert.equal(postLogoutSession.status, 401);
  });

  it("16. Tests API failure handling, real MongoDB disconnection (503 graceful degradation), and self-healing reconnection", async () => {
    // Part A: Malformed JSON, invalid ObjectIds, and validation failures
    const badJson = await staffRequest("/api/members", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      rawBody: "{invalid-json",
    });
    assert.equal(badJson.status, 400);

    const badObjectId = await staffRequest("/api/payments", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        memberId: "not-a-valid-objectid",
        amount: 200,
        description: "Test",
        paymentMethod: "Cash",
        status: "Paid",
      },
    });
    assert.equal(badObjectId.status, 400);

    const untrustedOrigin = await mobileRequest("/api/auth/member/login", {
      method: "POST",
      origin: "https://evil-attacker.example",
      body: {
        accountType: "member",
        identifier: state.ironHouse.member1Phone,
        password: "MemberPassword123!",
      },
    });
    assert.equal(untrustedOrigin.status, 403);

    // Part B: Real Database Disconnection
    await stopTestMongo();

    const healthDown = await staffRequest<{ status?: string; database?: string }>("/api/health");
    const membersGetDown = await staffRequest<{ error?: string }>("/api/members", {
      cookie: state.ironHouse.ownerCookie,
    });
    const membersPostDown = await staffRequest<{ error?: string }>("/api/members", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: {
        fullName: "Offline Attempt",
        phone: "01033334444",
        plan: "1 Month Regular",
        price: 1800,
        duration: 1,
      },
    });
    const trainersPostDown = await staffRequest<{ error?: string }>("/api/trainers", {
      method: "POST",
      cookie: state.ironHouse.ownerCookie,
      body: { action: "create", name: "Offline Coach", specialty: "Strength", phone: "01033335555" },
    });
    const mobilePortalDown = await mobileRequest<{ error?: string }>("/api/member-portal", {
      token: state.ironHouse.member1Token,
    });

    // Part C: Self-Healing Reconnection without restarting Next.js
    await startTestMongo();

    const healthRecovered = await staffRequest<{ status?: string; database?: string }>("/api/health");
    const membersRecovered = await staffRequest<{ members?: Array<{ name: string }> }>("/api/members", {
      cookie: state.ironHouse.ownerCookie,
    });

    const outageReport = {
      healthDown: healthDown.status,
      membersGetDown: membersGetDown.status,
      membersPostDown: membersPostDown.status,
      trainersPostDown: trainersPostDown.status,
      mobilePortalDown: mobilePortalDown.status,
      healthRecovered: healthRecovered.status,
      membersRecovered: membersRecovered.status,
    };

    assert.equal(healthDown.status, 503, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(healthDown.json.status, "degraded");
    assert.equal(membersGetDown.status, 503, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(membersPostDown.status, 503, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(trainersPostDown.status, 503, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(mobilePortalDown.status, 503, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(healthRecovered.status, 200, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.equal(healthRecovered.json.status, "ok");
    assert.equal(membersRecovered.status, 200, `Outage statuses: ${JSON.stringify(outageReport)}`);
    assert.ok(membersRecovered.json.members?.some((m) => m.name === "Omar Hassan"));
  });
});
