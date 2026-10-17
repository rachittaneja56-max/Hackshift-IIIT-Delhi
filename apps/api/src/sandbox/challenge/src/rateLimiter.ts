export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = { windowStart: number; count: number };

export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
) {
  const counts = new Map<string, number>();

  return {
    consume(_apiKey: string): RateLimitDecision {
      const timestamp = now();
      const windowIndex = Math.ceil(timestamp / windowMs);
      const bucket = String(windowIndex);
      const count = (counts.get(bucket) ?? 0) + 1;
      counts.set(bucket, count);
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = (windowIndex + 1) * windowMs;
      return {
        allowed,
        remaining,
        retryAfterSeconds: allowed ? 0 : Math.floor((resetAt - timestamp) / 1000),
      };
    },
  };
}
