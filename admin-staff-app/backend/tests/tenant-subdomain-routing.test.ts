import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

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

const TEST_MONGO_PORT = 27091;
const TEST_HTTP_PORT = 3291;
const SESSION_SECRET =
  process.env.GYMOS_SESSION_SECRET && process.env.GYMOS_SESSION_SECRET.length >= 32
    ? process.env.GYMOS_SESSION_SECRET
    : "gymos-subdomain-test-secret-key-32-chars-minimum-ok";

let mongodProc: ChildProcess | null = null;
let nextProc: ChildProcess | null = null;
let mongoDataDir = "";

type HttpResult = {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: Record<string, unknown> | null;
};

function sendHttp(options: {
  method?: string;
  path: string;
  host: string;
  proto?: "http" | "https";
  origin?: string;
  cookie?: string;
  sessionToken?: string;
  body?: Record<string, unknown>;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const proto = options.proto ?? "https";
    const headers: Record<string, string> = {
      Host: options.host,
      "X-Forwarded-Host": options.host,
      "X-Forwarded-Proto": proto,
    };
    if (options.origin) {
      headers.Origin = options.origin;
    } else if ((options.method ?? "GET") !== "GET" && (options.method ?? "GET") !== "HEAD") {
      headers.Origin = `${proto}://${options.host}`;
    }
    if (options.cookie) {
      headers.Cookie = options.cookie;
    }
    if (options.sessionToken) {
      headers["X-GymOS-Session"] = options.sessionToken;
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
        method: options.method ?? "GET",
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

    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

function extractSessionCookie(headers: http.IncomingHttpHeaders): {
  rawSetCookie: string;
  cookieHeader: string;
} {
  const setCookies = headers["set-cookie"] ?? [];
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  const sessionLine = list.find((item) => item.startsWith("gymos_staff_session=")) ?? "";
  assert.ok(sessionLine, "Expected gymos_staff_session Set-Cookie header");
  const cookiePair = sessionLine.split(";")[0] ?? "";
  return { rawSetCookie: sessionLine, cookieHeader: cookiePair };
}

async function waitForHealth(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await sendHttp({ path: "/api/health", host: "gymos.com" });
      if (res.status === 200) return;
    } catch {
      // Wait until server starts listening.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Timed out waiting for Next.js server health check.");
}

before(async () => {
  assert.ok(fs.existsSync(mongodBin), `Cached mongod binary missing at ${mongodBin}`);
  mongoDataDir = `/home/user/.cache/mongo-subdomain-${process.pid}`;
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

  nextProc = spawn(
    nextBin,
    ["start", "-H", "127.0.0.1", "-p", String(TEST_HTTP_PORT)],
    {
      cwd: frontendDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        MONGODB_URI: `mongodb://127.0.0.1:${TEST_MONGO_PORT}/gymos_subdomain_test`,
        GYMOS_SESSION_SECRET: SESSION_SECRET,
        GYMOS_BASE_DOMAIN: "gymos.com",
        GYMOS_STAFF_APP_ORIGINS: "https://gymos.com,https://app.gymos.com",
        GYMOS_MEMBER_APP_ORIGINS: "https://localhost,http://localhost",
      },
      detached: true,
      stdio: "ignore",
    },
  );

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

let ironCookie = "";
let powerCookie = "";

test("1. Onboarding Iron House & Power Zone on main portal creates distinct subdomains & host-only cookies", async () => {
  const ironReg = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    host: "gymos.com",
    body: {
      registrationType: "create-gym",
      fullName: "Karim Iron",
      email: "owner@ironhouse.eg",
      password: "IronPassword123!",
      gymName: "Iron House",
      gymAddress: "Maadi, Cairo",
      gymPhone: "+201001112233",
    },
  });
  assert.equal(ironReg.status, 201, ironReg.text);
  const ironGym = ironReg.json?.gym as Record<string, unknown>;
  assert.equal(ironGym.subdomain, "ironhouse");
  assert.equal(ironGym.slug, "iron-house");

  const ironSetCookie = extractSessionCookie(ironReg.headers);
  assert.ok(
    !/;\s*domain=/i.test(ironSetCookie.rawSetCookie),
    `Expected strictly host-only cookie without Domain attribute, got: ${ironSetCookie.rawSetCookie}`,
  );
  ironCookie = ironSetCookie.cookieHeader;

  const powerReg = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    host: "gymos.com",
    body: {
      registrationType: "create-gym",
      fullName: "Nour Power",
      email: "owner@powerzone.eg",
      password: "PowerPassword123!",
      gymName: "Power Zone",
      gymAddress: "Zayed, Giza",
      gymPhone: "+201009998877",
    },
  });
  assert.equal(powerReg.status, 201, powerReg.text);
  const powerGym = powerReg.json?.gym as Record<string, unknown>;
  assert.equal(powerGym.subdomain, "powerzone");
  powerCookie = extractSessionCookie(powerReg.headers).cookieHeader;
});

test("2. Subdomain identification & public branding resolution (/api/tenant)", async () => {
  for (const neutralHost of ["gymos.com", "www.gymos.com", "app.gymos.com", "gymos-web-api.onrender.com"]) {
    const res = await sendHttp({ path: "/api/tenant", host: neutralHost });
    assert.equal(res.status, 200, `Expected 200 for ${neutralHost}`);
    assert.equal(res.json?.mode, "neutral");
  }

  const ironTenant = await sendHttp({ path: "/api/tenant", host: "ironhouse.gymos.com" });
  assert.equal(ironTenant.status, 200);
  assert.equal(ironTenant.json?.mode, "tenant");
  assert.equal(ironTenant.json?.resolvedBy, "subdomain");
  const ironInfo = ironTenant.json?.gym as Record<string, unknown>;
  assert.equal(ironInfo.name, "Iron House");
  assert.equal(ironInfo.subdomain, "ironhouse");

  const powerTenant = await sendHttp({ path: "/api/tenant", host: "powerzone.gymos.com" });
  assert.equal(powerTenant.status, 200);
  assert.equal(powerTenant.json?.mode, "tenant");
  const powerInfo = powerTenant.json?.gym as Record<string, unknown>;
  assert.equal(powerInfo.name, "Power Zone");

  const unknownTenant = await sendHttp({ path: "/api/tenant", host: "unknownclub.gymos.com" });
  assert.equal(unknownTenant.status, 404);
  assert.equal(unknownTenant.json?.mode, "not-found");
});

test("3. Existing normal login flow works on neutral host while tenant URLs enforce gym membership", async () => {
  // Normal login on neutral host works for both gyms
  const neutralLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    host: "gymos.com",
    body: { email: "owner@ironhouse.eg", password: "IronPassword123!" },
  });
  assert.equal(neutralLogin.status, 200);

  // Iron House owner can sign in on ironhouse.gymos.com
  const ironSubLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    host: "ironhouse.gymos.com",
    body: { email: "owner@ironhouse.eg", password: "IronPassword123!" },
  });
  assert.equal(ironSubLogin.status, 200);

  // Iron House owner is BLOCKED (403) from signing in on powerzone.gymos.com
  const crossLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    host: "powerzone.gymos.com",
    body: { email: "owner@ironhouse.eg", password: "IronPassword123!" },
  });
  assert.equal(crossLogin.status, 403, crossLogin.text);

  // Login on unregistered subdomain returns 404
  const ghostLogin = await sendHttp({
    method: "POST",
    path: "/api/auth/login",
    host: "ghostgym.gymos.com",
    body: { email: "owner@ironhouse.eg", password: "IronPassword123!" },
  });
  assert.equal(ghostLogin.status, 404);
});

test("4. Prevents cross-gym access via URL/Host manipulation across API routes, HTML pages, and CSRF", async () => {
  // Iron House session works on ironhouse.gymos.com across existing flat routes
  const ironSessionOk = await sendHttp({
    path: "/api/auth/session",
    host: "ironhouse.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(ironSessionOk.status, 200);

  const ironMembersPage = await sendHttp({
    path: "/members",
    host: "ironhouse.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(ironMembersPage.status, 200);

  // Iron House session replayed against powerzone.gymos.com API -> 403 Forbidden!
  const crossMembersApi = await sendHttp({
    path: "/api/members",
    host: "powerzone.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(crossMembersApi.status, 403, crossMembersApi.text);

  const crossSessionApi = await sendHttp({
    path: "/api/auth/session",
    host: "powerzone.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(crossSessionApi.status, 403, crossSessionApi.text);

  // Iron House session replayed against powerzone.gymos.com HTML route -> redirected to /login (no dashboard leak, no loop!)
  const crossHtmlNav = await sendHttp({
    path: "/members",
    host: "powerzone.gymos.com",
    cookie: ironCookie,
  });
  assert.ok(
    crossHtmlNav.status === 307 || crossHtmlNav.status === 302,
    `Expected redirect on mismatched HTML navigation, got ${crossHtmlNav.status}`,
  );
  assert.ok(String(crossHtmlNav.headers.location).includes("/login"));

  // Visiting /login on powerzone.gymos.com with a mismatched Iron House cookie renders 200 (no redirect loop!)
  const crossLoginPage = await sendHttp({
    path: "/login",
    host: "powerzone.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(crossLoginPage.status, 200);

  // Cross-subdomain CSRF attempt (Origin: https://powerzone.gymos.com -> Host: ironhouse.gymos.com) -> 403
  const csrfAttempt = await sendHttp({
    method: "POST",
    path: "/api/members",
    host: "ironhouse.gymos.com",
    origin: "https://powerzone.gymos.com",
    cookie: ironCookie,
    body: { name: "CSRF Inject" },
  });
  assert.equal(csrfAttempt.status, 403);

  // Platform admin endpoints are blocked on tenant subdomains -> 403
  const platformOnSubdomain = await sendHttp({
    path: "/api/platform/gyms",
    host: "ironhouse.gymos.com",
    cookie: ironCookie,
  });
  assert.equal(platformOnSubdomain.status, 403);
});

test("5. Tenant URL registration rules: blocks create-gym on tenant URL and enforces invite-code gym match", async () => {
  // Cannot create a brand-new gym from ironhouse.gymos.com
  const blockedCreate = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    host: "ironhouse.gymos.com",
    body: {
      registrationType: "create-gym",
      fullName: "Sneaky Owner",
      email: "sneaky@othergym.eg",
      password: "SneakyPassword123!",
      gymName: "Sneaky Gym",
      gymAddress: "Cairo",
      gymPhone: "+201005554433",
    },
  });
  assert.equal(blockedCreate.status, 403);

  // Generate an Iron House staff invite code
  const inviteRes = await sendHttp({
    method: "POST",
    path: "/api/settings",
    host: "ironhouse.gymos.com",
    cookie: ironCookie,
    body: {
      action: "generate-staff-invite",
      role: "staff",
      presetName: "Sara Reception",
    },
  });
  assert.equal(inviteRes.status, 201, inviteRes.text);
  const inviteCode = String((inviteRes.json?.invite as Record<string, unknown>).code);

  // Claiming Iron House's invite code on powerzone.gymos.com is BLOCKED (403) and rolled back
  const crossJoin = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    host: "powerzone.gymos.com",
    body: {
      registrationType: "join-gym",
      fullName: "Sara Reception",
      email: "sara@ironhouse.eg",
      password: "SaraPassword123!",
      inviteCode,
    },
  });
  assert.equal(crossJoin.status, 403, crossJoin.text);

  // Claiming Iron House's invite code on ironhouse.gymos.com SUCCEEDS (201)
  const validJoin = await sendHttp({
    method: "POST",
    path: "/api/auth/register",
    host: "ironhouse.gymos.com",
    body: {
      registrationType: "join-gym",
      fullName: "Sara Reception",
      email: "sara@ironhouse.eg",
      password: "SaraPassword123!",
      inviteCode,
    },
  });
  assert.equal(validJoin.status, 201, validJoin.text);
});

test("6. Custom domain & branding configuration works and enforces uniqueness & isolation", async () => {
  // Configure custom branding + custom domain (portal.ironhouse.eg) for Iron House
  const saveIronDomain = await sendHttp({
    method: "POST",
    path: "/api/settings",
    host: "ironhouse.gymos.com",
    cookie: ironCookie,
    body: {
      action: "update-gym",
      name: "Iron House",
      address: "Maadi, Cairo",
      phone: "+201001112233",
      capacity: 140,
      timezone: "Africa/Cairo",
      subdomain: "ironhouse",
      customDomain: "portal.ironhouse.eg",
      branding: {
        accentColor: "#e11d48",
        logoText: "IH",
        tagline: "Elite Strength & Conditioning — Maadi",
      },
    },
  });
  assert.equal(saveIronDomain.status, 200, saveIronDomain.text);

  // Power Zone cannot hijack Iron House's subdomain or custom domain (409 Conflict)
  const hijackSubdomain = await sendHttp({
    method: "POST",
    path: "/api/settings",
    host: "powerzone.gymos.com",
    cookie: powerCookie,
    body: {
      action: "update-gym",
      name: "Power Zone",
      address: "Zayed, Giza",
      phone: "+201009998877",
      capacity: 120,
      timezone: "Africa/Cairo",
      subdomain: "ironhouse",
    },
  });
  assert.equal(hijackSubdomain.status, 409);

  const hijackCustomDomain = await sendHttp({
    method: "POST",
    path: "/api/settings",
    host: "powerzone.gymos.com",
    cookie: powerCookie,
    body: {
      action: "update-gym",
      name: "Power Zone",
      address: "Zayed, Giza",
      phone: "+201009998877",
      capacity: 120,
      timezone: "Africa/Cairo",
      customDomain: "portal.ironhouse.eg",
    },
  });
  assert.equal(hijackCustomDomain.status, 409);

  // GET /api/tenant on portal.ironhouse.eg resolves Iron House branding
  const customDomainTenant = await sendHttp({
    path: "/api/tenant",
    host: "portal.ironhouse.eg",
  });
  assert.equal(customDomainTenant.status, 200);
  assert.equal(customDomainTenant.json?.mode, "tenant");
  assert.equal(customDomainTenant.json?.resolvedBy, "custom-domain");
  const customGym = customDomainTenant.json?.gym as Record<string, unknown>;
  const customBranding = customGym.branding as Record<string, unknown>;
  assert.equal(customGym.name, "Iron House");
  assert.equal(customBranding.accentColor, "#e11d48");
  assert.equal(customBranding.logoText, "IH");
  assert.equal(customBranding.tagline, "Elite Strength & Conditioning — Maadi");

  // Iron House owner can sign in and access APIs on portal.ironhouse.eg
  const ironCustomSession = await sendHttp({
    path: "/api/auth/session",
    host: "portal.ironhouse.eg",
    cookie: ironCookie,
  });
  assert.equal(ironCustomSession.status, 200);

  // Power Zone owner is BLOCKED (403) on portal.ironhouse.eg
  const powerOnIronCustom = await sendHttp({
    path: "/api/auth/session",
    host: "portal.ironhouse.eg",
    cookie: powerCookie,
  });
  assert.equal(powerOnIronCustom.status, 403);
});
