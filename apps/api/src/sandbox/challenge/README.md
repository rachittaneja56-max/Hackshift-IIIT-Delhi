# Rate limiter debugging challenge v2

Build a deterministic fixed-window rate limiter. Each API key has an independent quota. Windows align to Unix epoch multiples of `windowMs`. A successful request consumes one unit. A denied request consumes none. Denied decisions report the seconds until the next boundary, rounded up.

The only editable file is `src/rateLimiter.ts`. Export `createRateLimiter(limit, windowMs, now)` and return an object with `consume(apiKey)`. `now` is an injected function returning epoch milliseconds. A result has `allowed`, `remaining`, and `retryAfterSeconds` fields.

The visible suite covers ordinary requests, quota denial, key isolation, an epoch boundary, and rounded retry timing. Final grading runs additional cases in a fresh provider sandbox. Test output is accepted only when the expected named tests and TAP summary are present.

This is a reconstructed v2 challenge. It has not been shown equivalent to the missing v1 source or test corpus. The remote runner executes reviewed test commands in an E2B environment and blocks outbound traffic before source execution. Hidden-test secrecy and tamper resistance are limited by the cooperative runner design; the report records these limits.
