const STAFF_TOKEN_KEY = "gymos_staff_session_v2";
const SESSION_HEADER = "X-GymOS-Session";

let memoryStaffToken: string | null = null;
let fetchPatched = false;

export function getStaffSessionToken(): string | null {
  if (memoryStaffToken) return memoryStaffToken;
  if (typeof window === "undefined") return null;
  try {
    const fromSession = window.sessionStorage.getItem(STAFF_TOKEN_KEY);
    if (fromSession) {
      memoryStaffToken = fromSession;
      return fromSession;
    }
  } catch {
    // Ignore sessionStorage restrictions.
  }
  try {
    const fromLocal = window.localStorage.getItem(STAFF_TOKEN_KEY);
    if (fromLocal) {
      memoryStaffToken = fromLocal;
      return fromLocal;
    }
  } catch {
    // Ignore localStorage restrictions.
  }
  return null;
}

export function setStaffSessionToken(token: string | undefined | null, persist = true): void {
  const normalized = token?.trim() || null;
  memoryStaffToken = normalized;
  if (typeof window === "undefined") return;
  if (!normalized) {
    clearStaffSessionToken();
    return;
  }
  try {
    window.sessionStorage.setItem(STAFF_TOKEN_KEY, normalized);
  } catch {
    // Ignore sessionStorage restrictions.
  }
  if (persist) {
    try {
      window.localStorage.setItem(STAFF_TOKEN_KEY, normalized);
    } catch {
      // Ignore localStorage restrictions.
    }
  }
}

export function clearStaffSessionToken(): void {
  memoryStaffToken = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STAFF_TOKEN_KEY);
    window.sessionStorage.removeItem("gymos_staff_session_token");
  } catch {
    // Ignore sessionStorage restrictions.
  }
  try {
    window.localStorage.removeItem(STAFF_TOKEN_KEY);
    window.localStorage.removeItem("gymos_staff_session_token");
  } catch {
    // Ignore localStorage restrictions.
  }
}

export function ensureStaffFetchPatched(): void {
  if (typeof window === "undefined" || fetchPatched) return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let urlString = "";
    if (typeof input === "string") {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      urlString = input.url;
    }

    const isPublicAuth =
      urlString.includes("/api/auth/login") || urlString.includes("/api/auth/register");

    const token = isPublicAuth ? null : getStaffSessionToken();
    if (!token) {
      return originalFetch(input, init);
    }

    const isSameOriginApi =
      urlString.startsWith("/api/") ||
      urlString.startsWith(`${window.location.origin}/api/`);

    if (!isSameOriginApi) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(SESSION_HEADER)) {
      headers.set(SESSION_HEADER, token);
    }
    let target: RequestInfo | URL = input;
    if (typeof input === "string" && input.startsWith("/api/")) {
      const sep = input.includes("?") ? "&" : "?";
      target = `${input}${sep}_gst=${encodeURIComponent(token)}`;
    }
    return originalFetch(target, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers,
    });
  };
}

if (typeof window !== "undefined") {
  ensureStaffFetchPatched();
}
