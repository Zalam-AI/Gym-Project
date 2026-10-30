import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  normalizeApiBaseUrl,
  readMobileJson,
  resolveMobileApiUrl,
} from "../src/lib/mobile-fetch";

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

async function hostedMobileRequest<T extends Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<{ status: number; headers: Headers; json: T }> {
  const url = resolveMobileApiUrl(path, API_BASE);
  const headers: Record<string, string> = {
    Origin: MOBILE_ORIGIN,
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
});
