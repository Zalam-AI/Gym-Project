const MOBILE_TOKEN_KEY = "gymos_mobile_session_v2";
const SESSION_HEADER = "X-GymOS-Session";
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

export function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_BASE_URL "${trimmed}": must start with https:// or http://.`,
    );
  }
  // Gracefully tolerate values ending in `/api` so paths never double up as `/api/api/...`
  return trimmed.replace(/\/api$/i, "");
}

const configuredApiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

let memoryMobileToken: string | null = null;

function isSandboxedPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".e2b.app");
}

export function getMobileApiBaseUrl(): string {
  return configuredApiBaseUrl;
}

export function resolveMobileApiUrl(path: string, baseOverride?: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const base =
    baseOverride !== undefined ? normalizeApiBaseUrl(baseOverride) : configuredApiBaseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function safeLocalGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage restrictions in strict WebViews or private browsing.
  }
}

export function safeLocalRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions in strict WebViews or private browsing.
  }
}

export function getMobileSessionToken(): string | null {
  if (memoryMobileToken) return memoryMobileToken;
  if (typeof window === "undefined") return null;
  try {
    const fromSession = window.sessionStorage.getItem(MOBILE_TOKEN_KEY);
    if (fromSession) {
      memoryMobileToken = fromSession;
      return fromSession;
    }
  } catch {
    // Ignore sessionStorage restrictions.
  }
  const fromLocal = safeLocalGet(MOBILE_TOKEN_KEY);
  if (fromLocal) {
    memoryMobileToken = fromLocal;
    return fromLocal;
  }
  return null;
}

export function setMobileSessionToken(token: string | undefined | null): void {
  const normalized = token?.trim() || null;
  memoryMobileToken = normalized;
  if (typeof window === "undefined") return;
  if (!normalized) {
    clearMobileSessionToken();
    return;
  }
  try {
    window.sessionStorage.setItem(MOBILE_TOKEN_KEY, normalized);
  } catch {
    // Ignore sessionStorage restrictions.
  }
  safeLocalSet(MOBILE_TOKEN_KEY, normalized);
}

export function clearMobileSessionToken(): void {
  memoryMobileToken = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(MOBILE_TOKEN_KEY);
    window.sessionStorage.removeItem("gymos_mobile_session_token");
  } catch {
    // Ignore sessionStorage restrictions.
  }
  safeLocalRemove(MOBILE_TOKEN_KEY);
  safeLocalRemove("gymos_mobile_session_token");
}

function isPublicAuthPath(url: string): boolean {
  return (
    url.includes("/api/auth/member/login") ||
    url.includes("/api/auth/member/register") ||
    url.includes("/api/auth/trainer-code")
  );
}

export async function mobileFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const token = isPublicAuthPath(rawUrl) ? null : getMobileSessionToken();
  let targetUrl = typeof input === "string" ? resolveMobileApiUrl(input) : rawUrl;

  if (token) {
    if (!headers.has(SESSION_HEADER)) {
      headers.set(SESSION_HEADER, token);
    }
    if (isSandboxedPreviewHost() && rawUrl.startsWith("/api/")) {
      const sep = targetUrl.includes("?") ? "&" : "?";
      targetUrl = `${targetUrl}${sep}_gst=${encodeURIComponent(token)}`;
    }
  }

  const finalTarget: RequestInfo | URL =
    typeof input === "string" || input instanceof URL ? targetUrl : input;

  const controller = !init?.signal ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS)
    : null;

  try {
    return await fetch(finalTarget, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers,
      signal: init?.signal ?? controller?.signal,
    });
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error("Connection to GymOS timed out. Please try again.");
    }
    throw new Error(
      "Unable to reach the GymOS server. Check your internet connection and try again.",
    );
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function statusFallbackMessage(status: number, fallbackMessage: string): string {
  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return "Access denied. Verify your account status or app configuration.";
  }
  if (status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "GymOS server is waking up or temporarily unavailable. Please try again in a few seconds.";
  }
  return fallbackMessage;
}

/**
 * Safely parses JSON from a mobile API response without crashing on HTML gateway/proxy
 * pages (e.g., Render 502/503 cold-start responses) or empty bodies.
 */
export async function readMobileJson<T extends Record<string, unknown>>(
  response: Response,
  fallbackError = "Unexpected server response. Please try again.",
): Promise<T> {
  let rawText = "";
  try {
    rawText = await response.text();
  } catch {
    return { error: statusFallbackMessage(response.status, fallbackError) } as unknown as T;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return (
      response.ok
        ? {}
        : { error: statusFallbackMessage(response.status, fallbackError) }
    ) as unknown as T;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // Non-JSON response (e.g. HTML 502/503 gateway page during cold start).
  }

  return {
    error: statusFallbackMessage(response.status, fallbackError),
  } as unknown as T;
}
