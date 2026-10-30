const MOBILE_TOKEN_KEY = "gymos_mobile_session_v2";
const SESSION_HEADER = "X-GymOS-Session";

const configuredApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

let memoryMobileToken: string | null = null;

function isSandboxedPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".e2b.app");
}

export function getMobileApiBaseUrl(): string {
  return configuredApiBaseUrl;
}

export function resolveMobileApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return configuredApiBaseUrl
    ? `${configuredApiBaseUrl}${normalizedPath}`
    : normalizedPath;
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

export function mobileFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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

  return fetch(finalTarget, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
}
