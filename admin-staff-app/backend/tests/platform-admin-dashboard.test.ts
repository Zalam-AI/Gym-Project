import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { hashStaffPassword } from "../lib/staff-password";
import PlatformAdminModel, { PLATFORM_PERMISSIONS } from "../models/platform-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const frontendDir = path.join(repoRoot, "admin-staff-app/frontend");
loadEnvConfig(frontendDir);

const mongodBin =
  [
    "/home/user/.cache/mongo-bin/mongod-x64-debian-7.0.14",
    "/usr/bin/mongod",
    "/usr/local/bin/mongod",
  ].find((candidate) => fs.existsSync(candidate)) ?? "/usr/bin/mongod";
const nextBin = path.join(repoRoot, "node_modules/.bin/next");

const TEST_MONGO_PORT = 27092;
const TEST_HTTP_PORT = 3292;
const MONGO_URI = `mongodb://127.0.0.1:${TEST_MONGO_PORT}/gymos_platform_admin_test`;
const SESSION_SECRET =
  process.env.GYMOS_SESSION_SECRET && process.env.GYMOS_SESSION_SECRET.length >= 32
    ? process.env.GYMOS_SESSION_SECRET
    : "gymos-platform-test-secret-key-32-chars-minimum-ok";

let mongodProc: ChildProcess | null = null;
let nextProc: ChildProcess | null = null;
let mongoDataDir = "";

type HttpResult = {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: Record<string, unknown> | null;
};

let clientIpCounter = 10;
function nextIp(): string {
  const n = clientIpCounter++;
  return `10.188.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}

function sendHttp(options: {
  method?: string;
  path: string;
  host?: string;
  cookie?: string;
  body?: Record<string, unknown>;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const host = options.host ?? "gymos.com";
    const method = options.method ?? "GET";
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {
      Host: host,
      "X-Forwarded-Host": host,
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": nextIp(),
    };
    if (method !== "GET" && method !== "HEAD") {
      headers.Origin = `https://${host}`;
    }
    if (options.cookie) {
      headers.Cookie = options.cookie;
    }
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: TEST_HTTP_PORT,
        path: options.path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> | null = null;
          try {
            const parsed: unknown = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              json = parsed as Record<string, unknown>;
            }
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );

    req.setTimeout(15_000, () => {
      req.destroy(new Error(`HTTP timeout on ${method} ${options.path}`));
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function extractCookiePair(headers: http.IncomingHttpHeaders, cookieName: string): string {
  const raw = headers["set-cookie"] ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  const line = list.find((item) => item.startsWith(`${cookieName}=`)) ?? "";
  assert.ok(line, `Expected ${cookieName} in Set-Cookie`);
  return line.split(";")[0] ?? "";
}

async function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await sendHttp({ path: "/api/health" });
      if (res.status === 200) return;
    } catch {
      // Wait until ready
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error("Timed out waiting for Next.js test server.");
}

before(async () => {
  assert.ok(fs.existsSync(mongodBin), `Missing mongod binary at ${mongodBin}`);
  mongoDataDir = `/home/user/.cache/mongo-platform-${process.pid}`;
  fs.mkdirSync(mongoDataDir, { recursive: true });

  mongodProc = spawn(
    mongodBin,
    [
      "--dbpath",
      mongoDataDir,
      "--port",
      String(TEST_MONGO_PORT),
      "--bind_ip",
      "127.0.0.1",
      "--noauth",
      "--wiredTigerCacheSizeGB",
      "0.25",
    ],
    { stdio: "ignore" },
  );
  await new Promise((r) => setTimeout(r, 1400));

  // Bootstrap a Platform Owner and a read-only Platform Auditor in the isolated test DB
  const conn = await mongoose.connect(MONGO_URI);
  const passwordHash = await hashStaffPassword("PlatformOwnerPass123!");
  const PlatformModel = conn.models.PlatformAdmin ?? PlatformAdminModel;
  await PlatformModel.create([
    {
      fullName: "GymOS Platform Owner",
      email: "owner@platform.gymos.com",
      passwordHash,
      role: "platform_owner",
      permissions: [...PLATFORM_PERMISSIONS],
      status: "active",
    },
    {
      fullName: "GymOS Read Auditor",
      email: "auditor@platform.gymos.com",
      passwordHash,
      role: "platform_auditor",
      permissions: ["gyms:read", "platform:audit"],
      status: "active",
    },
  ]);
  await mongoose.disconnect();

  nextProc = spawn(nextBin, ["start", "-H", "127.0.0.1", "-p", String(TEST_HTTP_PORT)], {
    cwd: frontendDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: MONGO_URI,
      GYMOS_SESSION_SECRET: SESSION_SECRET,
      GYMOS_BASE_DOMAIN: "gymos.com",
      GYMOS_STAFF_APP_ORIGINS: "https://gymos.com,https://app.gymos.com",
      GYMOS_MEMBER_APP_ORIGINS: "https://localhost,http://localhost",
    },
    detached: true,
    stdio: "ignore",
  });

  await waitForHealth();
});

after(async () => {
  if (nextProc && nextProc.pid) {
    try {
      process.kill(-nextProc.pid, "SIGTERM");
    } catch {
      nextProc.kill("SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (mongodProc && !mongodProc.killed) {
    mongodProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
  }
  if (mongoDataDir) {
    fs.rmSync(mongoDataDir, { recursive: true, force: true });
  }
});

let platformOwnerCookie = "";
let platformAuditorCookie = "";
let gymOwnerCookie = "";
let gymStaffCookie = "";
let provisionedGymId = "";

test("1. Strict role separation: gym owners, gym staff, and unauthenticated users cannot access platform endpoints", async () => {
  // Register an ordinary gym owner + reception staff
  const gymOwnerReg = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    body: {
      registrationType: "create-gym",
      fullName: "Iron Owner",
      email: "owner@ironclub.eg",
      password: "GymOwnerPass123!",
      gymName: "Iron Club",
      gymAddress: "Maadi, Cairo",
      gymPhone: "+201001112222",
    },
  });
  assert.equal(gymOwnerReg.status, 201, gymOwnerReg.text);
  gymOwnerCookie = extractCookiePair(gymOwnerReg.headers, "gymos_staff_session");

  const staffInvRes = await sendHttp({
    method: "POST",
    path: "/api/settings",
    cookie: gymOwnerCookie,
    body: { action: "generate-staff-invite", role: "staff", presetName: "Desk Staff" },
  });
  assert.equal(staffInvRes.status, 201);
  const staffCode = String((staffInvRes.json?.invite as Record<string, unknown>).code);

  const staffReg = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    body: {
      registrationType: "join-gym",
      fullName: "Desk Staff",
      email: "staff@ironclub.eg",
      password: "GymStaffPass123!",
      inviteCode: staffCode,
    },
  });
  assert.equal(staffReg.status, 201);
  gymStaffCookie = extractCookiePair(staffReg.headers, "gymos_staff_session");

  // Unauthenticated -> 401 across all protected platform endpoints
  for (const endpoint of [
    "/api/platform/auth/session",
    "/api/platform/gyms",
    "/api/platform/config",
    "/api/platform/activity",
    "/api/platform/support",
  ]) {
    const unauth = await sendHttp({ path: endpoint });
    assert.equal(unauth.status, 401, `Expected 401 for unauthenticated ${endpoint}`);
  }

  // Gym Owner & Gym Staff -> 403 across all protected platform endpoints + redirected away from /platform
  for (const cookie of [gymOwnerCookie, gymStaffCookie]) {
    for (const endpoint of [
      "/api/platform/auth/session",
      "/api/platform/gyms",
      "/api/platform/config",
      "/api/platform/activity",
      "/api/platform/support",
    ]) {
      const denied = await sendHttp({ path: endpoint, cookie });
      assert.equal(denied.status, 403, `Expected 403 for gym staff/owner on ${endpoint}`);
    }
    const writeAttempt = await sendHttp({
      method: "POST",
      path: "/api/platform/gyms",
      cookie,
      body: { action: "create-gym", name: "Unauthorized Gym" },
    });
    assert.equal(writeAttempt.status, 403);

    const htmlPlatform = await sendHttp({ path: "/platform", cookie });
    assert.ok(htmlPlatform.status === 307 || htmlPlatform.status === 302);
    assert.ok(String(htmlPlatform.headers.location).includes("/platform/login"));
  }

  // Platform console & login are blocked (403) on individual gym subdomains
  const subdomainPlatformPage = await sendHttp({
    path: "/platform",
    host: "ironclub.gymos.com",
  });
  assert.equal(subdomainPlatformPage.status, 403);

  const subdomainPlatformLogin = await sendHttp({
    method: "POST",
    path: "/api/platform/auth/login",
    host: "ironclub.gymos.com",
    body: { email: "owner@platform.gymos.com", password: "PlatformOwnerPass123!" },
  });
  assert.equal(subdomainPlatformLogin.status, 403);
});

test("2. Platform Owner & Auditor authentication, HTML console access, and reverse tenant isolation", async () => {
  const ownerLogin = await sendHttp({
    method: "POST",
    path: "/api/platform/auth/login",
    body: { email: "owner@platform.gymos.com", password: "PlatformOwnerPass123!" },
  });
  assert.equal(ownerLogin.status, 200, ownerLogin.text);
  assert.equal((ownerLogin.json?.admin as Record<string, unknown>).role, "platform_owner");
  platformOwnerCookie = extractCookiePair(ownerLogin.headers, "gymos_platform_session");

  const auditorLogin = await sendHttp({
    method: "POST",
    path: "/api/platform/auth/login",
    body: { email: "auditor@platform.gymos.com", password: "PlatformOwnerPass123!" },
  });
  assert.equal(auditorLogin.status, 200);
  platformAuditorCookie = extractCookiePair(auditorLogin.headers, "gymos_platform_session");

  // Platform Owner can load /platform HTML page (200)
  const consoleHtml = await sendHttp({ path: "/platform", cookie: platformOwnerCookie });
  assert.equal(consoleHtml.status, 200);

  // Platform Owner CANNOT access individual gym staff operational endpoints (403)
  for (const gymEndpoint of ["/api/members", "/api/payments", "/api/settings"]) {
    const res = await sendHttp({ path: gymEndpoint, cookie: platformOwnerCookie });
    assert.equal(res.status, 403, `Expected 403 on ${gymEndpoint} for platform admin`);
  }

  // Platform Auditor has read-only access and is blocked (403) from mutations
  const auditorConfigWrite = await sendHttp({
    method: "PUT",
    path: "/api/platform/config",
    cookie: platformAuditorCookie,
    body: {
      selfServiceRegistration: "closed",
      defaultTrialDays: 7,
      defaultGymCapacity: 80,
      defaultTimezone: "Africa/Cairo",
      defaultCurrency: "EGP",
    },
  });
  assert.equal(auditorConfigWrite.status, 403);

  const auditorSupportWrite = await sendHttp({
    method: "POST",
    path: "/api/platform/support",
    cookie: platformAuditorCookie,
    body: { subject: "Auditor should not create tickets" },
  });
  assert.equal(auditorSupportWrite.status, 403);
});

test("3. Create & manage gym accounts, manual SaaS subscription status, and owner invite codes", async () => {
  // Provision a new gym + direct owner account from platform console
  const createRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "create-gym",
      name: "Atlas Barbell Club",
      address: "Heliopolis, Cairo",
      phone: "+201008887766",
      subdomain: "atlasbarbell",
      capacity: 180,
      timezone: "Africa/Cairo",
      status: "active",
      planTier: "starter",
      ownerName: "Tarek Atlas",
      ownerEmail: "tarek@atlasbarbell.eg",
      ownerPassword: "AtlasOwnerPass123!",
    },
  });
  assert.equal(createRes.status, 201, createRes.text);
  const createdGym = createRes.json?.gym as Record<string, unknown>;
  provisionedGymId = String(createdGym.id);
  assert.equal(createdGym.subdomain, "atlasbarbell");

  // Provisioned owner can sign in immediately on atlasbarbell.gymos.com
  const atlasOwnerLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    host: "atlasbarbell.gymos.com",
    body: { email: "tarek@atlasbarbell.eg", password: "AtlasOwnerPass123!" },
  });
  assert.equal(atlasOwnerLogin.status, 200);

  // Update gym profile & custom domain from platform console
  const editRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "update-gym",
      gymId: provisionedGymId,
      name: "Atlas Barbell Club - Heliopolis",
      address: "Korba, Heliopolis, Cairo",
      phone: "+201008887766",
      capacity: 220,
      timezone: "Africa/Cairo",
      subdomain: "atlasbarbell",
      customDomain: "staff.atlasbarbell.eg",
    },
  });
  assert.equal(editRes.status, 200, editRes.text);

  // Update manual SaaS subscription record (no fake external payment gateway)
  const subRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "update-subscription",
      gymId: provisionedGymId,
      planTier: "growth",
      billingStatus: "active",
      billingCycle: "annual",
      renewalDate: "2027-10-30",
      notes: "Annual agreement settled via manual bank wire",
    },
  });
  assert.equal(subRes.status, 200, subRes.text);

  // Issue one-time Owner Invite Code
  const invRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "issue-owner-invite",
      gymId: provisionedGymId,
      presetEmail: "coowner@atlasbarbell.eg",
    },
  });
  assert.equal(invRes.status, 201, invRes.text);
  assert.match(String((invRes.json?.invite as Record<string, unknown>).code), /^STF-/);
});

test("4. Platform configuration, gym approval workflow, suspension, and platform-wide statistics", async () => {
  // Switch self-service registration policy to approval_required
  const cfgSave = await sendHttp({
    method: "PUT",
    path: "/api/platform/config",
    cookie: platformOwnerCookie,
    body: {
      selfServiceRegistration: "approval_required",
      defaultTrialDays: 21,
      defaultGymCapacity: 120,
      defaultTimezone: "Africa/Cairo",
      defaultCurrency: "EGP",
      announcementBanner: {
        enabled: true,
        severity: "info",
        message: "GymOS Q4 platform maintenance scheduled Friday 03:00 UTC.",
      },
    },
  });
  assert.equal(cfgSave.status, 200, cfgSave.text);

  // Self-registering a new gym now enters "pending" status (202 Accepted, no active session yet)
  const pendingReg = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    body: {
      registrationType: "create-gym",
      fullName: "Youssef Zenith",
      email: "owner@zenithfit.eg",
      password: "ZenithOwnerPass123!",
      gymName: "Zenith Fitness",
      gymAddress: "Dokki, Giza",
      gymPhone: "+201004445566",
    },
  });
  assert.equal(pendingReg.status, 202, pendingReg.text);
  assert.equal(pendingReg.json?.pendingApproval, true);
  const pendingGymId = String((pendingReg.json?.gym as Record<string, unknown>).id);

  // Pending gym owner cannot sign in before platform approval (403)
  const blockedPendingLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner@zenithfit.eg", password: "ZenithOwnerPass123!" },
  });
  assert.equal(blockedPendingLogin.status, 403);

  // Verify platform-wide statistics reflect 2 active gyms + 1 pending gym
  const listBeforeApprove = await sendHttp({
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
  });
  assert.equal(listBeforeApprove.status, 200);
  const summaryBefore = listBeforeApprove.json?.summary as Record<string, unknown>;
  assert.equal(summaryBefore.totalGyms, 3);
  assert.equal(summaryBefore.activeGyms, 2);
  assert.equal(summaryBefore.pendingGyms, 1);

  // Platform Owner approves Zenith Fitness -> owner can now sign in!
  const approveRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: { action: "set-status", gymId: pendingGymId, status: "active" },
  });
  assert.equal(approveRes.status, 200);
  assert.ok((approveRes.json?.gym as Record<string, unknown>).approvedAt);

  const approvedLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner@zenithfit.eg", password: "ZenithOwnerPass123!" },
  });
  assert.equal(approvedLogin.status, 200);

  // Platform Owner suspends Zenith Fitness -> owner immediately blocked (403)
  const suspendRes = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "set-status",
      gymId: pendingGymId,
      status: "suspended",
      statusNote: "Contract verification pending",
    },
  });
  assert.equal(suspendRes.status, 200);

  const suspendedLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner@zenithfit.eg", password: "ZenithOwnerPass123!" },
  });
  assert.equal(suspendedLogin.status, 403);
});

test("5. Support management & immutable administrative audit log verification", async () => {
  // Update support directory
  const dirPatch = await sendHttp({
    method: "PATCH",
    path: "/api/platform/support",
    cookie: platformOwnerCookie,
    body: {
      action: "update-directory",
      supportEmail: "ops@gymos.com",
      supportPhone: "+20 2 2790 1111",
      supportHours: "24/7 Critical Incident Desk",
      operationsNotice: "Contact Ops for custom domain CNAME verification.",
    },
  });
  assert.equal(dirPatch.status, 200, dirPatch.text);

  // Create a gym-linked support case
  const createCase = await sendHttp({
    method: "POST",
    path: "/api/platform/support",
    cookie: platformOwnerCookie,
    body: {
      gymId: provisionedGymId,
      subject: "Verify staff.atlasbarbell.eg CNAME",
      category: "domain_routing",
      priority: "high",
      contactName: "Tarek Atlas",
      contactEmail: "tarek@atlasbarbell.eg",
      notes: "CNAME pointed to gymos-web-api.onrender.com",
    },
  });
  assert.equal(createCase.status, 201, createCase.text);
  const caseId = String((createCase.json?.item as Record<string, unknown>).id);

  // Resolve support case
  const resolveCase = await sendHttp({
    method: "PATCH",
    path: "/api/platform/support",
    cookie: platformOwnerCookie,
    body: {
      itemId: caseId,
      status: "resolved",
      resolutionNotes: "Custom domain verified and active.",
    },
  });
  assert.equal(resolveCase.status, 200);
  assert.equal((resolveCase.json?.item as Record<string, unknown>).status, "resolved");

  // Verify audit log recorded all privileged administrative actions
  const activityRes = await sendHttp({
    path: "/api/platform/activity",
    cookie: platformOwnerCookie,
  });
  assert.equal(activityRes.status, 200);
  const auditLogs = activityRes.json?.auditLogs as Array<Record<string, unknown>>;
  const recordedActions = new Set(auditLogs.map((entry) => String(entry.action)));

  for (const expectedAction of [
    "admin.login",
    "gym.created",
    "gym.updated",
    "gym.subscription_updated",
    "gym.owner_invite_issued",
    "platform.config_updated",
    "gym.approved",
    "gym.suspended",
    "support.directory_updated",
    "support.created",
    "support.updated",
  ]) {
    assert.ok(
      recordedActions.has(expectedAction),
      `Expected audit log to contain ${expectedAction}, got: ${[...recordedActions].join(", ")}`,
    );
  }
});

test("6. Leeloo Connect `/` Super Admin root, `/gym/<slug>` routing, SaaS Plans & Limit Enforcement, Manual Payments, and Expiration/Grace Enforcement", async () => {
  // 1. `/` serves Super Admin Dashboard ONLY for Platform Admins (Gym Owner is redirected to /platform/login)
  const rootUnauth = await sendHttp({ path: "/" });
  assert.ok(rootUnauth.status === 307 || rootUnauth.status === 302);
  assert.ok(String(rootUnauth.headers.location).includes("/platform/login"));

  const rootGymOwner = await sendHttp({ path: "/", cookie: gymOwnerCookie });
  assert.ok(rootGymOwner.status === 307 || rootGymOwner.status === 302);
  assert.ok(String(rootGymOwner.headers.location).includes("/platform/login"));

  const rootSuperAdmin = await sendHttp({ path: "/", cookie: platformOwnerCookie });
  assert.equal(rootSuperAdmin.status, 200);

  // 2. SaaS Plans & Pricing CRUD: create a custom plan with maxMembers = 1, maxStaff = 2
  const plansGet = await sendHttp({ path: "/api/platform/plans", cookie: platformOwnerCookie });
  assert.equal(plansGet.status, 200);
  assert.ok(Array.isArray(plansGet.json?.plans) && (plansGet.json?.plans as unknown[]).length >= 4);

  const customPlanRes = await sendHttp({
    method: "POST",
    path: "/api/platform/plans",
    cookie: platformOwnerCookie,
    body: {
      action: "create-plan",
      code: "micro-boutique",
      name: "Micro Boutique Studio",
      tier: "starter",
      monthlyPrice: 950,
      annualPrice: 9500,
      features: ["Up to 1 active member in test", "QR attendance"],
      limits: {
        maxMembers: 1,
        maxStaff: 2,
        maxTrainers: 1,
      },
    },
  });
  assert.equal(customPlanRes.status, 201, customPlanRes.text);

  // 3. Provision a new gym `/gym/powerfitness` on `micro-boutique` plan
  const createPower = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "create-gym",
      name: "Power Fitness",
      slug: "powerfitness",
      address: "Zamalek, Cairo",
      phone: "+201009998877",
      capacity: 60,
      timezone: "Africa/Cairo",
      status: "active",
      planCode: "micro-boutique",
      gracePeriodDays: 5,
      ownerName: "Nadia Power",
      ownerEmail: "nadia@powerfitness.eg",
      ownerPassword: "PowerOwnerPass123!",
    },
  });
  assert.equal(createPower.status, 201, createPower.text);
  const powerGym = createPower.json?.gym as Record<string, unknown>;
  const powerGymId = String(powerGym.id);
  assert.equal(powerGym.slug, "powerfitness");
  assert.equal(powerGym.workspacePath, "/gym/powerfitness");

  // Individual Gym Details view returns gym info, limits, staff, and `/gym/powerfitness` path
  const detailRes = await sendHttp({
    path: `/api/platform/gyms?gymId=${powerGymId}`,
    cookie: platformOwnerCookie,
  });
  assert.equal(detailRes.status, 200, detailRes.text);
  const detailObj = detailRes.json?.gym as Record<string, unknown>;
  assert.equal(detailObj.slug, "powerfitness");
  assert.equal(detailObj.workspacePath, "/gym/powerfitness");

  // 4. Sign in to `/gym/powerfitness` as Nadia Power and verify `/gym/powerfitness` workspace loads 200
  const powerLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    body: {
      email: "nadia@powerfitness.eg",
      password: "PowerOwnerPass123!",
      gymSlug: "powerfitness",
    },
  });
  assert.equal(powerLogin.status, 200, powerLogin.text);
  const powerCookie = extractCookiePair(powerLogin.headers, "gymos_staff_session");

  const powerWorkspaceHtml = await sendHttp({
    path: "/gym/powerfitness",
    cookie: powerCookie,
  });
  assert.equal(powerWorkspaceHtml.status, 200);

  // Visiting Iron Club's `/gym/iron-club/members` with Power Fitness cookie is blocked and redirected to `/gym/iron-club/login`
  const crossSlugHtml = await sendHttp({
    path: "/gym/iron-club/members",
    cookie: powerCookie,
  });
  assert.ok(crossSlugHtml.status === 307 || crossSlugHtml.status === 302);
  assert.ok(String(crossSlugHtml.headers.location).includes("/gym/iron-club/login"));

  // 5. Enforce Backend SaaS Plan Limit (`maxMembers: 1` on `micro-boutique`)
  const m1 = await sendHttp({
    method: "POST",
    path: "/api/members",
    cookie: powerCookie,
    body: {
      fullName: "First Allowed Member",
      phone: "01055550001",
      plan: "Monthly",
      price: 1200,
      duration: 1,
      paymentMethod: "Cash",
      paymentStatus: "Paid",
    },
  });
  assert.equal(m1.status, 201, m1.text);

  const m2Blocked = await sendHttp({
    method: "POST",
    path: "/api/members",
    cookie: powerCookie,
    body: {
      fullName: "Second Over-Limit Member",
      phone: "01055550002",
      plan: "Monthly",
      price: 1200,
      duration: 1,
      paymentMethod: "Cash",
      paymentStatus: "Paid",
    },
  });
  assert.equal(m2Blocked.status, 403, `Expected 403 plan limit block, got: ${m2Blocked.text}`);
  assert.match(String(m2Blocked.json?.error), /Plan limit reached/i);

  // 6. Expired subscription + elapsed grace period blocks gym access (403), then Manual Payment renews & restores access!
  const expireSub = await sendHttp({
    method: "POST",
    path: "/api/platform/gyms",
    cookie: platformOwnerCookie,
    body: {
      action: "update-subscription",
      gymId: powerGymId,
      planCode: "micro-boutique",
      billingStatus: "past_due",
      paymentStatus: "overdue",
      expirationDate: "2025-01-01",
      gracePeriodDays: 3,
      autoSuspendOnExpire: true,
    },
  });
  assert.equal(expireSub.status, 200, expireSub.text);

  const blockedWhenExpired = await sendHttp({
    path: "/api/dashboard",
    cookie: powerCookie,
  });
  assert.equal(blockedWhenExpired.status, 403);
  assert.match(String(blockedWhenExpired.json?.error), /expired/i);

  // Record a manual SaaS payment & upgrade/renew Power Fitness onto `growth` plan -> access immediately restored!
  const manualPay = await sendHttp({
    method: "POST",
    path: "/api/platform/payments",
    cookie: platformOwnerCookie,
    body: {
      gymId: powerGymId,
      planCode: "growth",
      amount: 3800,
      billingCycle: "monthly",
      paymentMethod: "Bank Transfer",
      paymentStatus: "paid",
      extendSubscription: true,
      periodEnd: "2027-12-31",
      referenceNote: "CIB Manual Transfer #77881",
    },
  });
  assert.equal(manualPay.status, 201, manualPay.text);

  const restoredDash = await sendHttp({
    path: "/api/dashboard",
    cookie: powerCookie,
  });
  assert.equal(restoredDash.status, 200, restoredDash.text);

  // Now on `growth` plan (maxMembers: 600), adding the 2nd member succeeds!
  const m2Allowed = await sendHttp({
    method: "POST",
    path: "/api/members",
    cookie: powerCookie,
    body: {
      fullName: "Second Upgraded Member",
      phone: "01055550002",
      plan: "Monthly",
      price: 1200,
      duration: 1,
      paymentMethod: "Cash",
      paymentStatus: "Paid",
    },
  });
  assert.equal(m2Allowed.status, 201, m2Allowed.text);
});
