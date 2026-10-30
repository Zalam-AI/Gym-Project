export function isPreviewModeEnabled(): boolean {
  return process.env.GYMOS_ALLOW_PREVIEW_ORIGINS === "1";
}

function parseConfiguredOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function getAllowedOriginsSet(): Set<string> {
  const origins = new Set<string>([
    ...parseConfiguredOrigins(process.env.GYMOS_STAFF_APP_ORIGINS),
    ...parseConfiguredOrigins(process.env.GYMOS_MEMBER_APP_ORIGINS),
  ]);

  if (process.env.NODE_ENV !== "production" || isPreviewModeEnabled()) {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://127.0.0.1:3001");
  }

  return origins;
}

export function isPreviewOriginUrl(origin: string): boolean {
  if (process.env.NODE_ENV === "production" && !isPreviewModeEnabled()) {
    return false;
  }
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      parsed.hostname === "127.0.0.1" ||
      (isPreviewModeEnabled() && parsed.hostname.endsWith(".e2b.app"))
    );
  } catch {
    return false;
  }
}

/**
 * Verifies CSRF / Origin safety for state-mutating requests (POST, PUT, PATCH, DELETE).
 */
export function isTrustedRequestOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const origin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
  if (!origin) {
    // Non-browser / server-to-server proxy calls without Origin: reject only if browser explicitly
    // indicates a cross-site fetch outside preview mode.
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite === "cross-site" && !isPreviewModeEnabled()) {
      return false;
    }
    return true;
  }

  try {
    if (origin === new URL(request.url).origin) {
      return true;
    }
  } catch {
    // Ignore malformed URL.
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (origin === `${proto}://${forwardedHost}` || origin === `http://${forwardedHost}`) {
      return true;
    }
  }

  if (getAllowedOriginsSet().has(origin)) {
    return true;
  }

  return isPreviewOriginUrl(origin);
}
