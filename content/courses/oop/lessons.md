# OOP — three draft lessons

## 1. Encapsulate an invariant, not just a field

**Source:** [TypeScript Handbook: Classes](https://www.typescriptlang.org/docs/handbook/2/classes), Microsoft / TypeScript team.

A limiter should own the rule that counts cannot exceed its allowance. Exposing a mutable `Map` lets callers skip that rule. A public `check(key)` operation gives callers a useful decision while keeping state changes in one place. TypeScript `private` limits access during type checking; it is not a security boundary for untrusted code.

**Example / code:** `class Limiter { private counts = new Map<string, number>(); check(key: string): boolean { /* enforce quota here */ return true; } }` The method is the boundary at which count and decision change together.

**Concept check:** Why can a caller writing directly to `counts` invalidate a test of `check`? **Expected:** it can create states the operation would never allow.

**Maps to:** rate-limiter-debugging. **Open question:** settle the public decision shape before publishing the code example.

## 2. Compose a clock instead of inheriting time behavior

**Source:** [TypeScript Handbook: Classes](https://www.typescriptlang.org/docs/handbook/2/classes), Microsoft / TypeScript team.

Time is an external dependency of a rate limiter. Passing a `now: () => number` function into its constructor is simpler than subclassing the limiter only to override time. Tests can advance a local number instantly, so boundary behavior is reproducible without sleeping.

**Example / code:** `let time = 999; const limiter = new Limiter(() => time); time = 1000;` Draw `test clock → limiter → window decision`.

**Concept check:** What makes a real one-second sleep a weaker boundary test? **Expected:** scheduling delay makes the observation slower and less precise.

**Maps to:** rate-limiter-debugging. **Open question:** define behavior if the injected clock moves backward.

## 3. Depend on a small interface

**Source:** [TypeScript Handbook: Classes](https://www.typescriptlang.org/docs/handbook/2/classes) and [Modules](https://www.typescriptlang.org/docs/handbook/2/modules), Microsoft / TypeScript team.

The HTTP layer needs an admission decision, not knowledge of a storage implementation. A small interface such as `check(key): Decision` allows the route to use an in-memory limiter for a lesson and another implementation for a multi-instance service. The contract must still define the same key scope and Retry-After meaning.

**Example / code:** `interface RateGate { check(key: string): Decision }` and `function handle(gate: RateGate, key: string) { return gate.check(key); }`.

**Concept check:** Can a storage swap fix a wrong choice of caller identity? **Expected:** no; the route must pass the correct trusted key.

**Maps to:** rate-limiter-debugging. **Open question:** decide whether `check` needs an asynchronous result for shared storage.
