const MOBILE_TOKEN_KEY = "gymos_mobile_session_v2";
const SESSION_HEADER = "X-GymOS-Session";

let memoryMobileToken: string | null = null;

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
    // Ignore storage restrictions in strict sandboxed iframes.
  }
}

export function safeLocalRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage restrictions in strict sandboxed iframes.
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

function isPublicAuthPath(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  return (
    url.includes("/api/auth/member/login") ||
    url.includes("/api/auth/member/register") ||
    url.includes("/api/auth/trainer-code")
  );
}

export function mobileFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = isPublicAuthPath(input) ? null : getMobileSessionToken();
  let target: RequestInfo | URL = input;
  if (token) {
    if (!headers.has(SESSION_HEADER)) {
      headers.set(SESSION_HEADER, token);
    }
    if (typeof input === "string" && input.startsWith("/api/")) {
      const sep = input.includes("?") ? "&" : "?";
      target = `${input}${sep}_gst=${encodeURIComponent(token)}`;
    }
  }
  return fetch(target, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
}
