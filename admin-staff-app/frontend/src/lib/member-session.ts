export const MEMBER_SESSION_COOKIE = "gymos_member_session";
export const MEMBER_SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
export const MEMBER_SESSION_HEADER = "x-gymos-session";

const MOBILE_SIGNING_DOMAIN = "mobile";

export type MemberAccountSession = {
  typ: "mobile";
  memberId: string;
  gymId: string;
  role: "member";
  exp: number;
};

export type TrainerAccountSession = {
  typ: "mobile";
  trainerId: string;
  gymId: string;
  role: "trainer";
  exp: number;
};

export type MemberSession = MemberAccountSession | TrainerAccountSession;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function getSessionSecret() {
  const secret =
    globalThis.process?.env?.["GYMOS_SESSION_SECRET"] || process.env.GYMOS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GYMOS_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

async function signSessionPayload(payload: MemberSession): Promise<string> {
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSigningKey(getSessionSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${MOBILE_SIGNING_DOMAIN}.${payloadPart}`),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function createMemberSessionToken(memberId: string, gymId: string) {
  return signSessionPayload({
    typ: "mobile",
    memberId,
    gymId,
    role: "member",
    exp: Math.floor(Date.now() / 1000) + MEMBER_SESSION_DURATION_SECONDS,
  });
}

export async function createTrainerSessionToken(trainerId: string, gymId: string) {
  return signSessionPayload({
    typ: "mobile",
    trainerId,
    gymId,
    role: "trainer",
    exp: Math.floor(Date.now() / 1000) + MEMBER_SESSION_DURATION_SECONDS,
  });
}

export function getMemberTokenFromRequest(
  request: Request,
  cookieToken?: string,
): string | undefined {
  const customHeader = request.headers.get(MEMBER_SESSION_HEADER)?.trim();
  if (customHeader) {
    return customHeader;
  }
  if (process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1") {
    try {
      const queryToken = new URL(request.url).searchParams.get("_gst")?.trim();
      if (queryToken) return queryToken;
    } catch {
      // Ignore malformed URL.
    }
  }
  if (cookieToken) return cookieToken;
  const rawCookie = request.headers.get("cookie");
  if (rawCookie) {
    for (const part of rawCookie.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === MEMBER_SESSION_COOKIE) {
        return decodeURIComponent(rest.join("="));
      }
    }
  }
  return undefined;
}

export async function verifyMemberSessionToken(
  token: string | undefined,
): Promise<MemberSession | null> {
  if (!token) return null;
  try {
    const [payloadPart, signaturePart, ...extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra.length > 0) return null;
    const key = await getSigningKey(getSessionSecret());
    const domainSig = encodeBase64Url(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${MOBILE_SIGNING_DOMAIN}.${payloadPart}`),
        ),
      ),
    );

    if (!constantTimeEqual(domainSig, signaturePart)) {
      return null;
    }

    const payload: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload || typeof payload !== "object") return null;
    const session = payload as Record<string, unknown>;
    if (session.typ !== "mobile") {
      return null;
    }
    if (
      typeof session.gymId !== "string" ||
      typeof session.exp !== "number" ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (session.role === "member" && typeof session.memberId === "string") {
      return {
        typ: "mobile",
        role: "member",
        memberId: session.memberId,
        gymId: session.gymId,
        exp: session.exp,
      };
    }

    if (session.role === "trainer" && typeof session.trainerId === "string") {
      return {
        typ: "mobile",
        role: "trainer",
        trainerId: session.trainerId,
        gymId: session.gymId,
        exp: session.exp,
      };
    }

    return null;
  } catch {
    return null;
  }
}
