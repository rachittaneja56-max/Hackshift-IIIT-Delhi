# HLD / System Design — three draft lessons

## 1. Place a limit where it protects the service

**Source:** [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling), Microsoft Learn / Azure Architecture Center.

A rate limit is an admission rule. Put it before the expensive operation it protects, but after the service has enough trusted identity to choose a fair quota bucket. A single user limit and an overall capacity limit solve different problems; both may be needed in a real API.

**Example / diagram:** `gateway → authenticate → per-key limiter → global capacity gate → handler`. Label the expensive database call after both gates.

**Concept check:** Why can per-key limits alone fail to protect a database? **Expected:** many distinct keys can each remain under quota while their total load exceeds capacity.

**Maps to:** rate-limiter-debugging; retry-safe-credit. **Open question:** establish the protected resource and capacity target for production.

## 2. Local state changes meaning when instances multiply

**Source:** [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling) and [Design principles for Azure applications](https://learn.microsoft.com/en-us/azure/architecture/guide/design-principles/), Microsoft Learn.

An in-memory map is deterministic within one process. With three API replicas, requests for the same key can reach three separate maps, each granting a full allowance. A shared counter or routing design must supply the desired global semantics. Shared storage also brings latency, failure handling and atomicity choices.

**Example / diagram:** `client K → load balancer → replicas A/B/C`, each with `count=1`; compare with `A/B/C → shared bucket K`.

**Concept check:** If the policy is 10 requests per minute and three replicas each enforce 10 locally, what is the possible total? **Expected:** up to 30 under favorable routing.

**Maps to:** rate-limiter-debugging. **Open question:** the first lab assesses one-process correctness only; set a future distributed contract separately.

## 3. Retries and throttling form a feedback loop

**Source:** [Transient fault handling](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults), Microsoft Learn; [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html), IETF / RFC Editor.

When an API slows, unbounded client retries add more load. A finite retry budget, delay and 429 response can dampen that loop. For a write, retry safety also needs stable operation identity; delaying a duplicate credit does not make it safe.

**Example / diagram:** Draw `load ↑ → latency ↑ → client retries ↑ → load ↑`, then mark the limiting and retry-budget breaks in the loop.

**Concept check:** Can a 429 response replace idempotency for a credit POST? **Expected:** no; a previous attempt may have committed before a timeout.

**Maps to:** both labs. **Open question:** set the client-side retry budget and jitter policy for the production client.
