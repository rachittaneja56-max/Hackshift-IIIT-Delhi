export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number };

type Bucket = { count: number; windowStart: number };

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('limit must be a positive safe integer');
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new RangeError('windowMs must be a positive safe integer');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const buckets = new Map<string, Bucket>();
  return {
    consume(apiKey: string): RateLimitDecision {
      if (typeof apiKey !== 'string' || apiKey.length === 0) throw new TypeError('apiKey must be a nonempty string');
      const timestamp = now();
      if (!Number.isFinite(timestamp)) throw new RangeError('clock must return finite epoch milliseconds');
      const windowStart = Math.floor(timestamp / windowMs) * windowMs;
      const bucketKey = `${apiKey}\u0000${windowStart}`;
      const current = buckets.get(bucketKey) ?? { count: 0, windowStart };
      if (current.count < limit) {
        current.count += 1;
        buckets.set(bucketKey, current);
        return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 };
      }
      const resetAt = windowStart + windowMs;
      const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - timestamp) / 1_000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    },
  };
}
