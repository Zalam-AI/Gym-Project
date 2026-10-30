export const RESERVED_SUBDOMAINS = new Set([
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

const DNS_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CUSTOM_DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export type ParsedTenantHost =
  | { kind: "neutral"; hostname: string }
  | { kind: "subdomain"; hostname: string; subdomain: string }
  | { kind: "custom-domain"; hostname: string; customDomain: string }
  | { kind: "invalid-host"; hostname: string };

export type GymHostIdentity = {
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
};

export function getConfiguredBaseDomain(): string {
  const raw = process.env.GYMOS_BASE_DOMAIN || "gymos.com";
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\.+|\.+$/g, "") || "gymos.com";
}

export function stripPortAndNormalizeHost(rawHost: string): string {
  const first = rawHost.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "";
  if (first.startsWith("[")) {
    const closeIdx = first.indexOf("]");
    return closeIdx !== -1 ? first.slice(0, closeIdx + 1) : first;
  }
  const colonIdx = first.indexOf(":");
  const withoutPort = colonIdx !== -1 ? first.slice(0, colonIdx) : first;
  return withoutPort.replace(/\.+$/, "");
}

export function extractRequestHostname(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const parsed = stripPortAndNormalizeHost(forwarded);
    if (parsed) return parsed;
  }
  const host = request.headers.get("host");
  if (host) {
    const parsed = stripPortAndNormalizeHost(host);
    if (parsed) return parsed;
  }
  try {
    return stripPortAndNormalizeHost(new URL(request.url).hostname);
  } catch {
    return "";
  }
}

export function isValidGymSubdomainLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length < 2 || normalized.length > 63) return false;
  if (RESERVED_SUBDOMAINS.has(normalized)) return false;
  return DNS_LABEL_REGEX.test(normalized);
}

export function isValidCustomDomainHostname(value: string, baseDomain = getConfiguredBaseDomain()): boolean {
  const normalized = value.trim().toLowerCase().replace(/\.+$/, "");
  if (!normalized || normalized.length > 253) return false;
  if (!CUSTOM_DOMAIN_REGEX.test(normalized)) return false;
  if (
    normalized === baseDomain ||
    normalized.endsWith(`.${baseDomain}`) ||
    normalized.endsWith(".onrender.com") ||
    normalized.endsWith(".e2b.app") ||
    normalized.endsWith(".vercel.app") ||
    normalized.endsWith(".localhost")
  ) {
    return false;
  }
  return true;
}

export function parseHostnameAsTenant(
  rawHostname: string,
  baseDomain = getConfiguredBaseDomain(),
): ParsedTenantHost {
  const hostname = stripPortAndNormalizeHost(rawHostname);

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    IPV4_REGEX.test(hostname) ||
    hostname.endsWith(".onrender.com") ||
    hostname.endsWith(".e2b.app") ||
    hostname.endsWith(".vercel.app")
  ) {
    return { kind: "neutral", hostname };
  }

  // Local developer & test subdomain support: <gym>.localhost (e.g. ironhouse.localhost:3000)
  if (hostname.endsWith(".localhost")) {
    const prefix = hostname.slice(0, -".localhost".length);
    if (!prefix || prefix.includes(".") || !DNS_LABEL_REGEX.test(prefix)) {
      return { kind: "invalid-host", hostname };
    }
    if (RESERVED_SUBDOMAINS.has(prefix)) {
      return { kind: "neutral", hostname };
    }
    return { kind: "subdomain", hostname, subdomain: prefix };
  }

  // Root SaaS domain: gymos.com -> neutral; <gym>.gymos.com -> subdomain
  if (hostname === baseDomain) {
    return { kind: "neutral", hostname };
  }

  const baseSuffix = `.${baseDomain}`;
  if (hostname.endsWith(baseSuffix)) {
    const prefix = hostname.slice(0, -baseSuffix.length);
    if (!prefix || prefix.includes(".") || !DNS_LABEL_REGEX.test(prefix)) {
      return { kind: "invalid-host", hostname };
    }
    if (RESERVED_SUBDOMAINS.has(prefix)) {
      return { kind: "neutral", hostname };
    }
    return { kind: "subdomain", hostname, subdomain: prefix };
  }

  // Custom gym domain (e.g. portal.ironhouse.eg or www.ironhousegym.com)
  if (CUSTOM_DOMAIN_REGEX.test(hostname)) {
    return { kind: "custom-domain", hostname, customDomain: hostname };
  }

  return { kind: "invalid-host", hostname };
}

export function parseTenantHost(request: Request): ParsedTenantHost {
  return parseHostnameAsTenant(extractRequestHostname(request));
}

export function doesGymMatchHost(gym: GymHostIdentity, parsedHost: ParsedTenantHost): boolean {
  if (parsedHost.kind === "neutral") {
    return true;
  }
  if (parsedHost.kind === "invalid-host") {
    return false;
  }
  if (parsedHost.kind === "subdomain") {
    const target = parsedHost.subdomain.toLowerCase();
    const explicitSub = gym.subdomain?.trim().toLowerCase() ?? "";
    const slug = gym.slug.trim().toLowerCase();
    if (explicitSub && explicitSub === target) return true;
    if (slug === target) return true;
    if (!explicitSub && slug.replace(/-/g, "") === target) return true;
    return false;
  }
  if (parsedHost.kind === "custom-domain") {
    const custom = gym.customDomain?.trim().toLowerCase() ?? "";
    return Boolean(custom && custom === parsedHost.customDomain.toLowerCase());
  }
  return false;
}

export function deriveGymInitials(name: string, explicitLogoText?: string | null): string {
  const cleanedExplicit = explicitLogoText?.trim().toUpperCase();
  if (cleanedExplicit) return cleanedExplicit.slice(0, 4);
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) ?? "G").toUpperCase();
}
