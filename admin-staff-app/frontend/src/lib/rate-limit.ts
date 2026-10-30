type Bucket = {
  timestamps: number[];
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();
let lastPruneAt = 0;

function pruneExpired(now: number) {
  if (now - lastPruneAt < 60_000 && buckets.size < 2_000) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "local";
}

export function checkRateLimit(
  request: Request,
  options: { namespace: string; limit: number; windowMs: number },
): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
  const now = Date.now();
  pruneExpired(now);

  const ip = getClientIp(request);
  const key = `${options.namespace}:${ip}`;
  const cutoff = now - options.windowMs;
  const existing = buckets.get(key);
  const recent = existing ? existing.timestamps.filter((ts) => ts > cutoff) : [];

  if (recent.length >= options.limit) {
    const oldest = recent[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    buckets.set(key, { timestamps: recent, expiresAt: now + options.windowMs });
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }

  recent.push(now);
  buckets.set(key, { timestamps: recent, expiresAt: now + options.windowMs });
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, options.limit - recent.length),
  };
}
