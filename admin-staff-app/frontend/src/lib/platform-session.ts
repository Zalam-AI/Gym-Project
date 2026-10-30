export const PLATFORM_SESSION_COOKIE = "gymos_platform_session";
export const PLATFORM_SESSION_DURATION_SECONDS = 8 * 60 * 60;
export const PLATFORM_SESSION_HEADER = "x-gymos-platform-session";
const FALLBACK_SESSION_HEADER = "x-gymos-session";

const PLATFORM_SIGNING_DOMAIN = "platform";

export type PlatformSession = {
  typ: "platform_admin";
  sub: string;
  email: string;
  name: string;
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

export function getPlatformCookieOptions(request: Request, maxAge?: number) {
  const isHttps =
    Boolean(request.headers.get("x-forwarded-proto")?.includes("https")) ||
    Boolean(request.headers.get("origin")?.startsWith("https://")) ||
    request.url.startsWith("https://");

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/api/platform",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export async function createPlatformSessionToken(
  admin: { sub: string; email: string; name: string },
  durationSeconds = PLATFORM_SESSION_DURATION_SECONDS,
): Promise<string> {
  const payload: PlatformSession = {
    typ: "platform_admin",
    sub: admin.sub,
    email: admin.email,
    name: admin.name,
    exp: Math.floor(Date.now() / 1000) + durationSeconds,
  };
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSigningKey(getSessionSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${PLATFORM_SIGNING_DOMAIN}.${payloadPart}`),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export function getPlatformTokenFromRequest(
  request: Request,
  cookieToken?: string,
): string | undefined {
  const explicitHeader = request.headers.get(PLATFORM_SESSION_HEADER)?.trim();
  if (explicitHeader) {
    return explicitHeader;
  }
  const sharedHeader = request.headers.get(FALLBACK_SESSION_HEADER)?.trim();
  if (sharedHeader) {
    return sharedHeader;
  }
  if (cookieToken) return cookieToken;
  const rawCookie = request.headers.get("cookie");
  if (rawCookie) {
    for (const part of rawCookie.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === PLATFORM_SESSION_COOKIE) {
        return decodeURIComponent(rest.join("="));
      }
    }
  }
  return undefined;
}

export async function verifyPlatformSessionToken(
  token: string | undefined,
): Promise<PlatformSession | null> {
  if (!token) return null;
  try {
    const [payloadPart, signaturePart, ...extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra.length > 0) return null;

    const key = await getSigningKey(getSessionSecret());
    const expectedSig = encodeBase64Url(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${PLATFORM_SIGNING_DOMAIN}.${payloadPart}`),
        ),
      ),
    );
    if (!constantTimeEqual(expectedSig, signaturePart)) {
      return null;
    }

    const payload: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload || typeof payload !== "object") return null;
    const raw = payload as Record<string, unknown>;
    if (
      raw.typ !== "platform_admin" ||
      typeof raw.sub !== "string" ||
      typeof raw.email !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.exp !== "number" ||
      raw.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      typ: "platform_admin",
      sub: raw.sub,
      email: raw.email,
      name: raw.name,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
