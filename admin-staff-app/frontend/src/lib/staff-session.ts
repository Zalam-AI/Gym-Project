export const STAFF_SESSION_COOKIE = "gymos_staff_session";
export const STAFF_SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const REMEMBERED_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const STAFF_SESSION_HEADER = "x-gymos-session";

const STAFF_SIGNING_DOMAIN = "staff";

export type StaffRole = "owner" | "staff";

export type StaffSession = {
  typ: "staff";
  sub: string;
  name: string;
  email: string;
  gymId: string;
  role: StaffRole;
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

  const useCrossSitePreviewCookie =
    isHttps && process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1";

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (useCrossSitePreviewCookie ? "none" : "lax") as "none" | "lax",
    ...(useCrossSitePreviewCookie ? { partitioned: true } : {}),
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export async function createStaffSessionToken(
  session: {
    sub: string;
    name: string;
    email: string;
    gymId: string;
    role?: StaffRole;
  },
  durationSeconds: number,
): Promise<string> {
  const payload: StaffSession = {
    typ: "staff",
    sub: session.sub,
    name: session.name,
    email: session.email,
    gymId: session.gymId,
    role: session.role === "owner" ? "owner" : "staff",
    exp: Math.floor(Date.now() / 1000) + durationSeconds,
  };
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSigningKey(getSessionSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${STAFF_SIGNING_DOMAIN}.${payloadPart}`),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export function getStaffTokenFromRequest(
  request: Request,
  cookieToken?: string,
): string | undefined {
  const customHeader = request.headers.get(STAFF_SESSION_HEADER)?.trim();
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
    const domainSig = encodeBase64Url(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${STAFF_SIGNING_DOMAIN}.${payloadPart}`),
        ),
      ),
    );

    if (!constantTimeEqual(domainSig, signaturePart)) {
      return null;
    }

    const payload: unknown = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadPart)),
    );
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const raw = payload as Record<string, unknown>;
    if (raw.typ !== "staff") {
      return null;
    }
    if ("role" in raw && raw.role !== "owner" && raw.role !== "staff") {
      return null;
    }
    if (
      typeof raw.sub !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.email !== "string" ||
      typeof raw.gymId !== "string" ||
      typeof raw.exp !== "number" ||
      raw.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      typ: "staff",
      sub: raw.sub,
      name: raw.name,
      email: raw.email,
      gymId: raw.gymId,
      role: raw.role === "owner" ? "owner" : "staff",
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
