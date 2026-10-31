let pendingRestTimeoutId = null;
let pendingRestTimerId = null;
const notifiedTimerIds = new Set();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const MEDIA_CACHE_NAME = "gymos-exercise-media-v1";
const MAX_MEDIA_CACHE_ENTRIES = 60;
const MAX_MEDIA_FILE_BYTES = 4 * 1024 * 1024;

function isCacheableExerciseMediaUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.pathname.startsWith("/api/")) return false;
    return (
      url.pathname.startsWith("/media/exercises/") &&
      /\.(gif|mp4|webm|webp|png|jpg|jpeg|svg)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function trimMediaCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_MEDIA_CACHE_ENTRIES) return;
  const excess = keys.slice(0, keys.length - MAX_MEDIA_CACHE_ENTRIES);
  await Promise.all(excess.map((req) => cache.delete(req)));
}

// Network pass-through handler required for Android Chrome WebAPK installability.
// Bounded cache-first ONLY for non-authenticated static exercise demos under /media/exercises/*.
// Never caches /api/* or authenticated member/trainer data.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/")) return;

  if (isCacheableExerciseMediaUrl(event.request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        const lengthHeader = Number(response.headers.get("content-length") || 0);
        if (
          response.ok &&
          response.status === 200 &&
          (!lengthHeader || lengthHeader <= MAX_MEDIA_FILE_BYTES)
        ) {
          cache
            .put(event.request, response.clone())
            .then(() => trimMediaCache(cache))
            .catch(() => {});
        }
        return response;
      })(),
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

function clearPendingRestSchedule() {
  if (pendingRestTimeoutId !== null) {
    clearTimeout(pendingRestTimeoutId);
    pendingRestTimeoutId = null;
  }
  pendingRestTimerId = null;
}

async function dismissActiveRestNotifications() {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return;
  }
  try {
    const active = await self.registration.getNotifications({ tag: "gymos-rest-timer" });
    for (const n of active) {
      n.close();
    }
  } catch {
    // Ignore notification query errors in restricted environments
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "CANCEL_REST_NOTIFICATION") {
    clearPendingRestSchedule();
    event.waitUntil(dismissActiveRestNotifications());
    return;
  }

  if (data.type === "SCHEDULE_REST_NOTIFICATION") {
    clearPendingRestSchedule();

    const timerId = typeof data.timerId === "string" ? data.timerId : "";
    const endAtMs = Number(data.endAtMs);
    if (!timerId || !Number.isFinite(endAtMs)) return;
    if (notifiedTimerIds.has(timerId)) return;

    const delayMs = endAtMs - Date.now();
    if (delayMs <= -2500 || delayMs > 610_000) return;

    pendingRestTimerId = timerId;
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : "Rest Complete · GymOS";
    const body =
      typeof data.body === "string" && data.body.trim()
        ? data.body.trim()
        : "Your rest period is finished. Ready for your next set!";
    const vibrateEnabled = data.vibrateEnabled !== false;

    pendingRestTimeoutId = setTimeout(() => {
      pendingRestTimeoutId = null;
      if (pendingRestTimerId !== timerId || notifiedTimerIds.has(timerId)) {
        return;
      }
      pendingRestTimerId = null;

      event.waitUntil(
        (async () => {
          try {
            const windowClients = await self.clients.matchAll({
              type: "window",
              includeUncontrolled: true,
            });
            // Only display a background local notification when GymOS is not visibly focused
            const anyVisible = windowClients.some(
              (client) => client.visibilityState === "visible" || client.focused === true,
            );
            if (anyVisible) return;

            notifiedTimerIds.add(timerId);
            if (notifiedTimerIds.size > 40) {
              const oldest = notifiedTimerIds.values().next().value;
              if (oldest) notifiedTimerIds.delete(oldest);
            }

            if (self.registration && typeof self.registration.showNotification === "function") {
              await self.registration.showNotification(title, {
                body,
                tag: "gymos-rest-timer",
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                renotify: true,
                silent: !vibrateEnabled,
                vibrate: vibrateEnabled ? [180, 70, 220, 70, 300] : undefined,
                data: { timerId, url: "/" },
              });
            }
          } catch {
            // Respect OS/browser notification blocks silently
          }
        })(),
      );
    }, Math.max(0, delayMs));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })(),
  );
});
