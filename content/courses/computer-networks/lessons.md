# Computer Networks — three draft lessons

## 1. A timeout does not reveal whether a write happened

**Source:** [RFC 9110, HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html), IETF / RFC Editor, especially idempotent methods; [Transient fault handling](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults), Microsoft Learn.

A client can time out after the server commits a credit but before the response arrives. Retrying the same POST can then credit twice unless the application recognizes the operation. An idempotency key names the *intended operation*, while a timeout names only the client's uncertainty. The client should retain the same key across retries and the server should return the stored outcome or reject a conflicting payload.

**Example / diagram:** `client POST(key=k) → server commits → response lost → client POST(key=k) → same result`. Draw two request arrows, one commit marker, and one row keyed by `k`.

**Concept check:** Why is generating a fresh key for the second POST unsafe? **Expected:** it represents a new operation and may apply a second credit.

**Maps to:** retry-safe-credit. **Open question:** choose and document key retention duration for any production API.

## 2. HTTP 429 and Retry-After

**Source:** [RFC 6585, Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585.html), IETF / RFC Editor; [RFC 9110, Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html), IETF / RFC Editor.

429 communicates that a request exceeded a rate limit. Its response may include Retry-After; that field can be seconds or an HTTP date. A fixed-window limiter should derive delay from its actual reset boundary and round a fractional positive delay *up* to whole seconds. A hard-coded delay can tell the client to retry while the same window is still full.

**Example / diagram:** At `t=950 ms`, a one-second window ending at `t=1000 ms` has 50 ms left. `Math.ceil(50 / 1000)` yields `Retry-After: 1`. Show a timeline with the denied request and reset point.

**Concept check:** Is `Retry-After: 0` appropriate when 50 ms remain? **Expected:** no, zero can invite an immediate failed retry.

**Maps to:** rate-limiter-debugging. **Open question:** confirm whether the challenge API emits numeric seconds only.

## 3. Decide whose requests share a limit

**Source:** [RFC 6585, section 4](https://www.rfc-editor.org/rfc/rfc6585.html), IETF / RFC Editor; [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling), Microsoft Learn.

The HTTP standard leaves the identity and counting scope to the service. A key per IP, API key, user, or tenant protects different resources. Behind a proxy, many users can share an IP; trusting an arbitrary forwarded header can also let callers choose their own identity. Decide which *authenticated, trusted* principal the limit belongs to before choosing a map key.

**Example / diagram:** `client A + client B → proxy → API`. With one proxy-IP bucket, A can exhaust B's quota. With validated API-key buckets, their counts stay separate.

**Concept check:** What must happen to B's allowance after A uses its last request? **Expected:** nothing when the contract specifies per-key limits.

**Maps to:** rate-limiter-debugging. **Open question:** specify whether missing keys are rejected or grouped into a documented anonymous bucket.
