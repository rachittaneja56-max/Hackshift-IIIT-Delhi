import assert from 'node:assert/strict';
import { test } from 'node:test';
const implementation = await import(process.env.CHALLENGE_IMPLEMENTATION_URL ?? new URL('../src/rateLimiter.ts', import.meta.url).href) as typeof import('../src/rateLimiter.ts');
const { createRateLimiter } = implementation;

test('rejects invalid quota and window configuration', () => {
  assert.throws(() => createRateLimiter(0, 1_000, () => 0));
  assert.throws(() => createRateLimiter(1, 0, () => 0));
  assert.throws(() => createRateLimiter(1.5, 1_000, () => 0));
});

test('uses the injected clock instead of wall-clock time', () => {
  let time = 10_000;
  const limiter = createRateLimiter(1, 2_000, () => time);
  assert.equal(limiter.consume('key-a').allowed, true);
  time = 11_999;
  assert.equal(limiter.consume('key-a').allowed, false);
  time = 12_000;
  assert.equal(limiter.consume('key-a').allowed, true);
});

test('keeps independent state for separate limiter instances', () => {
  const now = () => 0;
  const first = createRateLimiter(1, 1_000, now);
  const second = createRateLimiter(1, 1_000, now);
  assert.equal(first.consume('shared-key').allowed, true);
  assert.equal(first.consume('shared-key').allowed, false);
  assert.equal(second.consume('shared-key').allowed, true);
});

test('does not report a negative retry delay at a boundary', () => {
  let time = 0;
  const limiter = createRateLimiter(1, 1_000, () => time);
  limiter.consume('key-a');
  assert.equal(limiter.consume('key-a').retryAfterSeconds, 1);
  time = 1_000;
  assert.deepEqual(limiter.consume('key-a'), { allowed: true, remaining: 0, retryAfterSeconds: 0 });
});
