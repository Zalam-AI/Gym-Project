export const MEMBER_SESSION_COOKIE = "gymos_member_session";
export const MEMBER_SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export type MemberSession = {
  memberId: string;
  gymId: string;
  role: "member";
  exp: number;
};

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

function getSessionSecret() {
  const secret = process.env.GYMOS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GYMOS_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export async function createMemberSessionToken(memberId: string, gymId: string) {
  const payload: MemberSession = {
    memberId,
    gymId,
    role: "member",
    exp: Math.floor(Date.now() / 1000) + MEMBER_SESSION_DURATION_SECONDS,
  };
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getSigningKey(getSessionSecret(), ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyMemberSessionToken(token: string | undefined): Promise<MemberSession | null> {
  if (!token) return null;
  try {
    const [payloadPart, signaturePart, ...extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra.length > 0) return null;
    const key = await getSigningKey(getSessionSecret(), ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(signaturePart)),
      new TextEncoder().encode(payloadPart),
    );
    if (!valid) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload || typeof payload !== "object") return null;
    const session = payload as Partial<MemberSession>;
    if (
      typeof session.memberId !== "string" ||
      typeof session.gymId !== "string" ||
      session.role !== "member" ||
      typeof session.exp !== "number" ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return session as MemberSession;
  } catch {
    return null;
  }
}