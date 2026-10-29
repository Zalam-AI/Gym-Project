export const STAFF_SESSION_COOKIE = "gymos_staff_session";
export const STAFF_SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const REMEMBERED_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

export type StaffSession = {
  sub: string;
  name: string;
  email: string;
  gymId: string;
  exp: number;
};

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
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

function getSessionSecret(): string {
  const secret = process.env.GYMOS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GYMOS_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function getStaffCookieOptions(request: Request, maxAge?: number) {
  const isHttps =
    Boolean(request.headers.get("x-forwarded-proto")?.includes("https")) ||
    Boolean(request.headers.get("origin")?.startsWith("https://")) ||
    request.url.startsWith("https://");

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    ...(isHttps ? { partitioned: true } : {}),
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export async function createStaffSessionToken(
  session: Omit<StaffSession, "exp">,
  durationSeconds: number,
): Promise<string> {
  const payload: StaffSession = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + durationSeconds,
  };
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSigningKey(getSessionSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export const STAFF_SESSION_HEADER = "x-gymos-session";

export function getStaffTokenFromRequest(
  request: Request,
  cookieToken?: string,
): string | undefined {
  const customHeader = request.headers.get(STAFF_SESSION_HEADER)?.trim();
  if (customHeader) {
    return customHeader;
  }
  try {
    const queryToken = new URL(request.url).searchParams.get("_gst")?.trim();
    if (queryToken) return queryToken;
  } catch {
    // Ignore malformed URL.
  }
  if (cookieToken) return cookieToken;
  const rawCookie = request.headers.get("cookie");
  if (rawCookie) {
    for (const part of rawCookie.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === STAFF_SESSION_COOKIE) {
        return decodeURIComponent(rest.join("="));
      }
    }
  }
  return undefined;
}

export async function verifyStaffSessionToken(
  token: string | undefined,
): Promise<StaffSession | null> {
  if (!token) {
    return null;
  }

  try {
    const [payloadPart, signaturePart, ...extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra.length > 0) {
      return null;
    }

    const key = await getSigningKey(getSessionSecret());
    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payloadPart),
    );
    const expectedSignaturePart = encodeBase64Url(new Uint8Array(expectedSignature));
    if (!constantTimeEqual(expectedSignaturePart, signaturePart)) {
      return null;
    }

    const payload: unknown = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadPart)),
    );
    if (
      !payload ||
      typeof payload !== "object" ||
      !("sub" in payload) ||
      !("name" in payload) ||
      !("email" in payload) ||
      !("gymId" in payload) ||
      !("exp" in payload)
    ) {
      return null;
    }

    const session = payload as StaffSession;
    if (
      typeof session.sub !== "string" ||
      typeof session.name !== "string" ||
      typeof session.email !== "string" ||
      typeof session.gymId !== "string" ||
      typeof session.exp !== "number" ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}
