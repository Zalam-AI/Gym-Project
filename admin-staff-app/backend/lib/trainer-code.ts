import { randomBytes } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTrainerInviteCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `TRN-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function normalizeTrainerInviteCode(value: string): string {
  return value.trim().toUpperCase();
}
