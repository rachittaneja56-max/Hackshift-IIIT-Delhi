import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { EvaluationResultSchema, type EvaluationResult, type VariantId } from "@trajectoryos/contracts";
import { sha256 } from "../../db/hash.js";
import { variantFiles } from "../../content/index.js";
import { createVariant, freshVariant } from "./registry.js";
import type { CreditInput, CreditResponse, CreditHooks } from "./types.js";

export class RunError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
class InjectedFault extends Error {}
export const suiteVersion = "retry-safe-credit-v1";
export const suiteSha256 = sha256(await Promise.all(["suite", "registry"].map(async name =>
  (await readFile(new URL(`../../../src/challenges/retry-safe-credit/${name}.ts`, import.meta.url), "utf8")).replaceAll("\r\n", "\n"))));
// The URL above resolves from src/challenges/retry-safe-credit AND dist/challenges/retry-safe-credit.

export async function cleanupRun(pool: Pool, runId: string) {
  await pool.query("DELETE FROM challenge_eval.ledger WHERE run_id=$1", [runId]);
  await pool.query("DELETE FROM challenge_eval.operations WHERE run_id=$1", [runId]);
  await pool.query("DELETE FROM challenge_eval.accounts WHERE run_id=$1", [runId]);
}

export async function runSuite(pool: Pool, variantId: VariantId, runId: string = randomUUID(), signal = AbortSignal.timeout(120000)) {
  const active = new Set<PoolClient>();
  const cancel = () => { for (const client of active) client.release(true); active.clear(); };
  signal.addEventListener("abort", cancel, { once: true });
  async function withClient<T>(work: (client: PoolClient) => Promise<T>) {
    signal.throwIfAborted();
    const client = await pool.connect();
    if (signal.aborted) { client.release(true); signal.throwIfAborted(); }
    active.add(client);
    try { return await work(client); }
    finally { if (active.delete(client)) client.release(); }
  }
  const input = (scenario: string, overrides: Partial<CreditInput> = {}): CreditInput => ({ runId, scenario, accountId: "A", key: "retry-key", amountMinor: 100, ...overrides });
  const invoke = (i: CreditInput, hooks?: CreditHooks) => withClient(client => createVariant(variantId)(client, i, hooks));
  async function state(scenario: string) {
    return withClient(async client => {
      const accounts = (await client.query("SELECT account_id,balance_minor FROM challenge_eval.accounts WHERE run_id=$1 AND scenario=$2 ORDER BY account_id", [runId, scenario])).rows;
      const operations = (await client.query("SELECT account_id,key,operation_id,response FROM challenge_eval.operations WHERE run_id=$1 AND scenario=$2 ORDER BY account_id,key", [runId, scenario])).rows;
      const ledger = (await client.query("SELECT account_id,operation_id,amount_minor FROM challenge_eval.ledger WHERE run_id=$1 AND scenario=$2 ORDER BY account_id,operation_id", [runId, scenario])).rows;
      return { balances: Object.fromEntries(accounts.map(row => [row.account_id, Number(row.balance_minor)])),
        operations, ledger: ledger.map(row => ({ ...row, amount_minor: Number(row.amount_minor) })) };
    });
  }
  const complete = (s: Awaited<ReturnType<typeof state>>, counts: number, balances: Record<string, number>, responses: CreditResponse[]) =>
    s.operations.length === counts && s.ledger.length === counts && sha256(s.balances) === sha256(balances) &&
    responses.every(r => r.status === 201 && s.operations.some(o => sha256(o.response) === sha256(r))) &&
    s.operations.every(o => o.response?.status === 201 && o.response.body.operationId === o.operation_id &&
      s.ledger.some(l => l.operation_id === o.operation_id && l.amount_minor === o.response.body.amountMinor)) &&
    Object.entries(s.balances).every(([account, balance]) => balance === 1000 + s.ledger.filter(l => l.account_id === account).reduce((total, row) => total + row.amount_minor, 0));
  async function concurrent(first: CreditInput, second: CreditInput) {
    // Both connections are acquired before release. No latch occurs after a database lock.
    const acquired = await Promise.allSettled([pool.connect(), pool.connect()]);
    if (acquired.some(result => result.status === "rejected")) {
      acquired.forEach(result => { if (result.status === "fulfilled") result.value.release(); });
      throw new RunError("EVAL_DB_UNAVAILABLE", "Concurrent connections unavailable.");
    }
    const clients = acquired.map(result => (result as PromiseFulfilledResult<PoolClient>).value);
    clients.forEach(client => active.add(client));
    try {
      signal.throwIfAborted();
      const pids = await Promise.all(clients.map(async c => (await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid));
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const pending = clients.map(async (client, index) => { await gate; return createVariant(variantId)(client, index ? second : first); });
      release();
      const settled = await Promise.allSettled(pending);
      const failure = settled.find(r => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      return { responses: settled.map(r => (r as PromiseFulfilledResult<CreditResponse>).value), backendPids: pids,
        independentClients: clients[0] !== clients[1] };
    } finally { clients.forEach(client => { if (active.delete(client)) client.release(); }); }
  }
  const tests: EvaluationResult["tests"] = [];
  try {
    for (let number = 1; number <= 7; number++) {
      signal.throwIfAborted();
      const id = `T${number}`;
      const started = performance.now();
      await withClient(c => c.query(`INSERT INTO challenge_eval.accounts(run_id,scenario,account_id,balance_minor)
        VALUES ($1,$2,'A',1000),($1,$2,'B',1000)`, [runId, id]));
      let passed = false;
      let observed: unknown;
      let expected: unknown;
      if (number === 1) {
        const response = await invoke(input(id)); const db = await state(id);
        passed = complete(db, 1, { A: 1100, B: 1000 }, [response]);
        expected = { status: 201, operations: 1, ledger: 1, balances: { A: 1100, B: 1000 }, storedResponseMatches: true };
        observed = { response, db };
      } else if (number === 2) {
        const responses = [await invoke(input(id)), await invoke(input(id))];
        const reinitialized = await freshVariant(variantId);
        responses.push(await withClient(client => reinitialized(client, input(id))));
        const db = await state(id);
        passed = complete(db, 1, { A: 1100, B: 1000 }, responses) && responses.every(r => sha256(r) === sha256(responses[0]));
        expected = { identicalResponses: true, operations: 1, ledger: 1, balanceA: 1100, freshVariantInstance: true };
        observed = { responses, db, freshVariantInstance: true };
      } else if (number === 3) {
        const concurrentResult = await concurrent(input(id), input(id)); const db = await state(id);
        passed = complete(db, 1, { A: 1100, B: 1000 }, concurrentResult.responses) && sha256(concurrentResult.responses[0]) === sha256(concurrentResult.responses[1]);
        expected = { identicalResponses: true, operations: 1, ledger: 1, balanceA: 1100, independentConnections: true };
        observed = { ...concurrentResult, db };
      } else if (number === 4) {
        const first = await invoke(input(id)); const before = await state(id);
        const conflict = await invoke(input(id, { amountMinor: 200 })); const after = await state(id);
        passed = first.status === 201 && conflict.status === 409 && sha256(before) === sha256(after);
        expected = { conflictStatus: 409, stateUnchanged: true }; observed = { first, conflict, before, after };
      } else if (number === 5) {
        let faultInjected = false;
        try { await invoke(input(id), { afterBalance: () => { throw new InjectedFault(); } }); }
        catch (e) { if (!(e instanceof InjectedFault)) throw e; faultInjected = true; }
        const afterFault = await state(id); const response = await invoke(input(id)); const afterRetry = await state(id);
        passed = faultInjected && afterFault.balances.A === 1000 && afterFault.operations.length === 0 && afterFault.ledger.length === 0 &&
          complete(afterRetry, 1, { A: 1100, B: 1000 }, [response]);
        expected = { afterFault: { balanceA: 1000, operations: 0, ledger: 0 }, retryStatus: 201, afterRetryBalanceA: 1100 };
        observed = { faultInjected, afterFault, response, afterRetry };
      } else if (number === 6) {
        const responses = [await invoke(input(id)), await invoke(input(id, { accountId: "B" }))]; const db = await state(id);
        passed = complete(db, 2, { A: 1100, B: 1100 }, responses) && responses[0].body.operationId !== responses[1].body.operationId;
        expected = { operations: 2, ledger: 2, balances: { A: 1100, B: 1100 } }; observed = { responses, db };
      } else {
        const pair = await concurrent(input(id), input(id, { key: "independent-key", amountMinor: 200 })); const db = await state(id);
        passed = complete(db, 2, { A: 1300, B: 1000 }, pair.responses) && new Set(pair.responses.map(r => r.body.operationId)).size === 2;
        expected = { operations: 2, ledger: 2, balanceA: 1300, independentConnections: true }; observed = { ...pair, db };
      }
      tests.push({ id, status: passed ? "passed" : "failed", expected, observed, durationMs: Math.round(performance.now() - started) });
    }
    return { runId, result: EvaluationResultSchema.parse({ suiteVersion, suiteSha256, implementationSha256: sha256(variantFiles[variantId]),
      runnerKind: "approved_variant", verdict: tests.every(test => test.status === "passed") ? "all_passed" : "some_failed", tests }) };
  } catch (error) {
    if (signal.aborted || (error as any)?.code === "57014") throw new RunError("RUN_TIMEOUT", "The evaluation exceeded its deadline.");
    throw new RunError("EVAL_DB_UNAVAILABLE", "The evaluation database operation did not complete.");
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    await cleanupRun(pool, runId);
  }
}
