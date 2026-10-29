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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function getSigningKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

function getSessionSecret(): string {
  const secret = process.env.GYMOS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GYMOS_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
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
  const key = await getSigningKey(getSessionSecret(), ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
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

    const key = await getSigningKey(getSessionSecret(), ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(signaturePart)),
      new TextEncoder().encode(payloadPart),
    );
    if (!valid) {
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
