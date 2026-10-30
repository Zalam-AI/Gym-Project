export const DEFAULT_GYM_TIMEZONE = "Africa/Cairo";
export const DEFAULT_GYM_CAPACITY = 100;

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(tz?: string | null): string {
  const trimmed = typeof tz === "string" ? tz.trim() : "";
  return trimmed && isValidTimezone(trimmed) ? trimmed : DEFAULT_GYM_TIMEZONE;
}

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  };
}

function localMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  // Start with a UTC guess at 00:00Z, then adjust by the timezone's offset at that date.
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const partsAtGuess = getDatePartsInTimezone(new Date(utcGuess), timeZone);
  const zonedAsUtc = Date.UTC(
    partsAtGuess.year,
    partsAtGuess.month - 1,
    partsAtGuess.day,
    partsAtGuess.hour,
    partsAtGuess.minute,
    partsAtGuess.second,
    0,
  );
  const offsetMs = zonedAsUtc - utcGuess;
  const firstPass = utcGuess - offsetMs;

  // Second pass handles DST transition boundaries accurately.
  const partsSecond = getDatePartsInTimezone(new Date(firstPass), timeZone);
  const zonedSecond = Date.UTC(
    partsSecond.year,
    partsSecond.month - 1,
    partsSecond.day,
    partsSecond.hour,
    partsSecond.minute,
    partsSecond.second,
    0,
  );
  const secondOffsetMs = zonedSecond - firstPass;
  return new Date(utcGuess - secondOffsetMs);
}

export function startOfGymDay(date = new Date(), rawTimeZone?: string | null): Date {
  const tz = normalizeTimezone(rawTimeZone);
  const { year, month, day } = getDatePartsInTimezone(date, tz);
  return localMidnightToUtc(year, month, day, tz);
}

export function addGymDays(dayStartUtc: Date, offsetDays: number, rawTimeZone?: string | null): Date {
  const tz = normalizeTimezone(rawTimeZone);
  // Step from noon local time to avoid DST 23h/25h day drift.
  const probe = new Date(dayStartUtc.getTime() + 12 * 3600_000 + offsetDays * 86_400_000);
  const { year, month, day } = getDatePartsInTimezone(probe, tz);
  return localMidnightToUtc(year, month, day, tz);
}

export function startOfGymMonth(
  date = new Date(),
  rawTimeZone?: string | null,
  monthOffset = 0,
): Date {
  const tz = normalizeTimezone(rawTimeZone);
  const { year, month } = getDatePartsInTimezone(date, tz);
  const targetDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return localMidnightToUtc(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    1,
    tz,
  );
}

export function getLocalHourInTimezone(date: Date, rawTimeZone?: string | null): number {
  const tz = normalizeTimezone(rawTimeZone);
  return getDatePartsInTimezone(date, tz).hour;
}

export function formatTimeInTimezone(date: Date, rawTimeZone?: string | null): string {
  const tz = normalizeTimezone(rawTimeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatIsoDateInTimezone(date: Date, rawTimeZone?: string | null): string {
  const tz = normalizeTimezone(rawTimeZone);
  const { year, month, day } = getDatePartsInTimezone(date, tz);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const RESERVED_GYM_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "platform",
  "portal",
  "mobile",
  "auth",
  "login",
  "register",
  "mail",
  "smtp",
  "status",
  "docs",
  "help",
  "support",
  "cdn",
  "static",
  "assets",
  "staging",
  "dev",
  "test",
  "localhost",
]);

export function slugifyGymName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "gym";
}

export function subdomainifyGymName(name: string): string {
  const compact = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  const candidate = compact || "gym";
  return RESERVED_GYM_SUBDOMAINS.has(candidate) ? `${candidate}club` : candidate;
}
