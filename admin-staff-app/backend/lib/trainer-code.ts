import { randomBytes } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCodeSegment(length: number): string {
  const bytes = randomBytes(length);
  let raw = "";
  for (let i = 0; i < length; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return raw;
}

export function generateTrainerInviteCode(): string {
  const raw = randomCodeSegment(8);
  return `TRN-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function normalizeTrainerInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateStaffInviteCode(): string {
  const raw = randomCodeSegment(8);
  return `STF-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function normalizeStaffInviteCode(value: string): string {
  return value.trim().toUpperCase();
}
