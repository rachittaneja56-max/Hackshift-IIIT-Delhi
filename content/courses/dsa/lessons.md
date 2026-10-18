# DSA — three draft lessons

## 1. A hash map gives each key a bucket

**Source:** [Hash Tables](https://opendatastructures.org/versions/edition-0.1e/ods-java/5_Hash_Tables.html), Pat Morin / Open Data Structures.

A map from API key to `{windowStart, count}` expresses independent limits. The expected lookup cost is constant under ordinary hashing assumptions, but memory grows with the number of distinct active keys. A production limiter needs an expiration or eviction policy to bound that growth.

**Example / code:** `const buckets = new Map<string, { start: number; count: number }>();` Draw two keys pointing to separate bucket records.

**Concept check:** What goes wrong if every request uses the literal key `'all'`? **Expected:** all clients share one quota.

**Maps to:** rate-limiter-debugging. **Open question:** choose expiration semantics for idle buckets in a long-running service.

## 2. A deque can represent a sliding time window

**Source:** [Array-Based Lists](https://opendatastructures.org/versions/edition-0.1e/ods-java/2_Array_Based_Lists.html), Pat Morin / Open Data Structures.

For each key, keep timestamps in arrival order. Remove timestamps older than `now - windowMs` from the front, then admit if fewer than the limit remain. A deque supports removing old entries without shifting every item. This uses memory proportional to the admitted requests still in the window.

**Example / diagram:** At `now=1200`, a 1000 ms window holds `[300, 700, 1100]`; `100` is removed. Draw a queue with the oldest item at the left.

**Concept check:** Why is repeated `array.shift()` a concern at high volume? **Expected:** an array implementation may move later elements when removing from the front.

**Maps to:** rate-limiter-debugging. **Open question:** define treatment of non-monotonic timestamps before claiming this algorithm as production ready.

## 3. Compare time and space costs against the contract

**Source:** [Hash Tables](https://opendatastructures.org/versions/edition-0.1e/ods-java/5_Hash_Tables.html) and [Array-Based Lists](https://opendatastructures.org/versions/edition-0.1e/ods-java/2_Array_Based_Lists.html), Pat Morin / Open Data Structures; [Throttling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling), Microsoft Learn.

A fixed-window bucket stores two numbers per active key and can decide in expected constant time. A timestamp queue records each request still in range, giving finer rolling-window behavior but greater memory use. Worst-case cleanup work may be large after an idle interval even when the amortized cost across many requests is small.

**Example / diagram:** Compare `K` active keys with `R` retained request timestamps: fixed windows use `O(K)` state; timestamp queues use `O(K + R)` state. Show one key's bucket beside its queue.

**Concept check:** Does a faster lookup prove the limiter enforces the intended policy? **Expected:** no; algorithmic cost and policy correctness are separate checks.

**Maps to:** rate-limiter-debugging. **Open question:** benchmark with a defined traffic distribution before choosing a production algorithm.
