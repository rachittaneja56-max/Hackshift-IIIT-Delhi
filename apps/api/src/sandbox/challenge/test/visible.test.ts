import assert from 'node:assert/strict';
import { test } from 'node:test';
const implementation = await import(process.env.CHALLENGE_IMPLEMENTATION_URL ?? new URL('../src/rateLimiter.ts', import.meta.url).href) as typeof import('../src/rateLimiter.ts');
const { createRateLimiter } = implementation;

test('allows requests below the configured quota', () => {
  let time = 0;
  const limiter = createRateLimiter(2, 1_000, () => time);
  assert.deepEqual(limiter.consume('key-a'), { allowed: true, remaining: 1, retryAfterSeconds: 0 });
  time = 100;
  assert.deepEqual(limiter.consume('key-a'), { allowed: true, remaining: 0, retryAfterSeconds: 0 });
});

test('denies requests after the quota is used', () => {
  const limiter = createRateLimiter(1, 1_000, () => 0);
  assert.equal(limiter.consume('key-a').allowed, true);
  const denied = limiter.consume('key-a');
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
});

test('keeps API key quotas independent', () => {
  const limiter = createRateLimiter(1, 1_000, () => 0);
  assert.equal(limiter.consume('key-a').allowed, true);
  assert.equal(limiter.consume('key-b').allowed, true);
  assert.equal(limiter.consume('key-a').allowed, false);
});

test('opens a new epoch-aligned window at the boundary', () => {
  let time = 500;
  const limiter = createRateLimiter(1, 1_000, () => time);
  assert.equal(limiter.consume('key-a').allowed, true);
  time = 1_000;
  assert.equal(limiter.consume('key-a').allowed, true);
});

test('rounds retry delay up to the next whole second', () => {
  let time = 1_500;
  const limiter = createRateLimiter(1, 2_000, () => time);
  assert.equal(limiter.consume('key-a').allowed, true);
  time = 1_501;
  const denied = limiter.consume('key-a');
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 1);
});
