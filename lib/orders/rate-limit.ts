/**
 * Minimal in-memory, per-IP sliding-window rate limiter for order placement.
 *
 * No external infrastructure is introduced (project rule: avoid unnecessary
 * infrastructure). The trade-off is that on a multi-instance/serverless
 * deployment the limit is per warm instance, not global. It still stops the
 * common cases — a single client rapid-firing or a bot loop — while a durable
 * store (e.g. Upstash/Postgres) can be swapped in later behind this interface.
 */

type Window = number[];

const buckets = new Map<string, Window>();
const MAX_TRACKED_KEYS = 5000;

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function pruneStale(now: number, windowMs: number): void {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  const cutoff = now - windowMs;
  for (const [key, hits] of buckets) {
    const alive = hits.filter((time) => time > cutoff);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  pruneStale(now, windowMs);

  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((time) => time > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((hits[0] + windowMs - now) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);
  return {
    allowed: true,
    remaining: Math.max(0, limit - hits.length),
    retryAfterSeconds: 0,
  };
}

/** Test-only helper. */
export function resetRateLimit(): void {
  buckets.clear();
}
