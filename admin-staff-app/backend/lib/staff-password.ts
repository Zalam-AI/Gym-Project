import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export async function hashStaffPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return `${salt.toString("base64url")}.${derivedKey.toString("base64url")}`;
}

export async function verifyStaffPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const [saltValue, keyValue, ...extra] = passwordHash.split(".");
  if (!saltValue || !keyValue || extra.length > 0) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expectedKey = Buffer.from(keyValue, "base64url");
    if (salt.length !== 16 || expectedKey.length !== keyLength) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
