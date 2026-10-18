# Database Internals — three draft lessons

## 1. A transaction needs a uniqueness rule

**Source:** [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html), PostgreSQL Global Development Group.

Two retry requests can both read "no operation with key K" before either inserts. A transaction groups writes, but a unique constraint on `(user_id, client_request_id)` is what makes duplicate identity enforceable when requests race. The losing transaction can then read the committed outcome and compare the request payload.

**Example / diagram:** `T1: lookup K → absent; T2: lookup K → absent; T1: insert K → commit; T2: insert K → unique conflict`. Draw the interleaving as two columns.

**Concept check:** Why can a pre-insert `SELECT` alone still allow duplicate credits? **Expected:** both transactions can observe absence before either writes.

**Maps to:** retry-safe-credit; rate-limiter-debugging for prompt idempotency. **Open question:** document handling of a reused key with a different payload.

## 2. Indexes accelerate the lookup you actually make

**Source:** [Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), PostgreSQL Global Development Group.

An index is useful when its keys match a frequent filter, but it adds write and storage cost. For attempt lookup, inspect the actual query shape and plan rather than assuming every column needs an index. A selective `(owner_id, created_at)` index can help an owner-scoped recent-attempt list; a tiny table may still be faster to scan.

**Example / code:** `EXPLAIN SELECT id FROM app.attempts WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 20;` Compare the plan with and without a suitable index on a representative dataset.

**Concept check:** Does an index guarantee PostgreSQL will use it? **Expected:** no; the planner estimates cost using data statistics.

**Maps to:** retry-safe-credit. **Open question:** verify actual column names and row counts before turning this example into executable SQL.

## 3. Isolation and lost updates

**Source:** [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html), PostgreSQL Global Development Group.

At PostgreSQL's default Read Committed level, separate queries in one transaction can see different committed states. A read-modify-write sequence on an attempt revision can lose one writer's intent unless it locks the row or updates conditionally. An optimistic update uses `WHERE revision = expected_revision`; zero updated rows is a conflict for the caller to resolve.

**Example / code:** `UPDATE app.attempts SET revision = revision + 1 WHERE id = $1 AND revision = $2 RETURNING revision;` Two writers with the same expected revision should not both succeed.

**Concept check:** What does zero returned rows mean? **Expected:** the row is absent or the expected revision is stale; an owner-scoped lookup can distinguish them.

**Maps to:** retry-safe-credit. **Open question:** align the example with the application's exact ownership and error contract.
