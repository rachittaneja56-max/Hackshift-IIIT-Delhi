# Low Level Design — three draft lessons

## 1. Give each module one reason to change

**Source:** [TypeScript Handbook: Modules](https://www.typescriptlang.org/docs/handbook/2/modules), Microsoft / TypeScript team; [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling), Microsoft Learn.

The HTTP adapter identifies a trusted caller and formats a 429 response. The limiter counts requests. The clock supplies time. If one function performs all three, a header change can accidentally alter the counting rule. Keep the boundaries explicit, then test each with representative inputs.

**Example / diagram:** `HTTP request → identity adapter → limiter → decision → HTTP response`; inject `Clock` into the limiter. The adapter translates `retryAfterSeconds` to a header.

**Concept check:** Which module should decide whether a forwarded IP header is trusted? **Expected:** the HTTP identity adapter, where proxy configuration is known.

**Maps to:** rate-limiter-debugging. **Open question:** document the actual proxy trust policy for deployment.

## 2. Strategy is useful only when behavior varies

**Source:** [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling), Microsoft Learn; [TypeScript Handbook: Classes](https://www.typescriptlang.org/docs/handbook/2/classes), Microsoft / TypeScript team.

Fixed-window and sliding-window algorithms can implement the same admission interface, but they differ at boundaries and in state cost. A strategy interface makes sense if the product genuinely needs to select an algorithm. In the first lab, one fixed-window implementation is easier to reason about; the interface is useful as a comparison exercise.

**Example / code:** `type RateAlgorithm = { check(key: string, nowMs: number): Decision }`. Compare requests at `999 ms` and `1000 ms` under each strategy in a timeline.

**Concept check:** Why can a fixed window admit a burst around its reset? **Expected:** the caller can use allowance near the end of one window and again at the start of the next.

**Maps to:** rate-limiter-debugging. **Open question:** choose the product's desired burst semantics before adding an alternate strategy.

## 3. Dependency injection makes defects observable

**Source:** [TypeScript Handbook: Classes](https://www.typescriptlang.org/docs/handbook/2/classes), Microsoft / TypeScript team.

The test should control the clock and observe the same public method that production calls. Constructing the limiter with `() => nowMs` lets the test assert exactly what happens at the reset instant. The test can also use two keys to reveal unwanted shared state.

**Example / code:** `let nowMs = 999; const gate = new Limiter(1, 1000, () => nowMs); gate.check('a'); nowMs = 1000; assert.equal(gate.check('a').allowed, true);`.

**Concept check:** What additional test distinguishes per-key state from one global counter? **Expected:** use A's quota, then check that B's first call succeeds.

**Maps to:** rate-limiter-debugging. **Open question:** set behavior for invalid limit and window constructor arguments.
