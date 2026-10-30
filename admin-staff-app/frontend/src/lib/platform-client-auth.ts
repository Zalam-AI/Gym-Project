const PLATFORM_TOKEN_KEY = "gymos_platform_session_v1";
const PLATFORM_HEADER = "X-GymOS-Platform-Session";

let memoryPlatformToken: string | null = null;
let platformFetchPatched = false;

function isSandboxedPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".e2b.app");
}

export function getPlatformSessionToken(): string | null {
  if (memoryPlatformToken) return memoryPlatformToken;
  if (typeof window === "undefined" || !isSandboxedPreviewHost()) return null;
  try {
    const stored = window.sessionStorage.getItem(PLATFORM_TOKEN_KEY);
    if (stored) {
      memoryPlatformToken = stored;
      return stored;
    }
  } catch {
    // Ignore sessionStorage restrictions.
  }
  return null;
}

export function setPlatformSessionToken(token: string | undefined | null): void {
  const normalized = token?.trim() || null;
  memoryPlatformToken = normalized;
  if (typeof window === "undefined") return;
  if (!normalized || !isSandboxedPreviewHost()) {
    if (!normalized) clearPlatformSessionToken();
    return;
  }
  try {
    window.sessionStorage.setItem(PLATFORM_TOKEN_KEY, normalized);
  } catch {
    // Ignore sessionStorage restrictions.
  }
}

export function clearPlatformSessionToken(): void {
  memoryPlatformToken = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PLATFORM_TOKEN_KEY);
  } catch {
    // Ignore sessionStorage restrictions.
  }
}

export function ensurePlatformFetchPatched(): void {
  if (typeof window === "undefined" || platformFetchPatched) return;
  platformFetchPatched = true;
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

    const isPlatformApi =
      urlString.startsWith("/api/platform/") ||
      urlString.startsWith(`${window.location.origin}/api/platform/`);

    if (!isPlatformApi || urlString.includes("/api/platform/auth/login")) {
      return originalFetch(input, init);
    }

    const token = getPlatformSessionToken();
    if (!token) {
      return originalFetch(input, {
        ...init,
        credentials: init?.credentials ?? "same-origin",
      });
    }

    const headers = new Headers(
      init?.headers ??
        (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(PLATFORM_HEADER)) {
      headers.set(PLATFORM_HEADER, token);
    }
    let target: RequestInfo | URL = input;
    if (isSandboxedPreviewHost() && typeof input === "string" && input.startsWith("/api/platform/")) {
      const sep = input.includes("?") ? "&" : "?";
      target = `${input}${sep}_gpt=${encodeURIComponent(token)}`;
    }
    return originalFetch(target, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers,
    });
  };
}
