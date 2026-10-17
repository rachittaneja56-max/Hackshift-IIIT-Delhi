import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readApiConfig } from "../src/config.js";
import { createDatabasePool } from "../src/db/pool.js";
import { SandboxService } from "../src/sandbox/service.js";
import { challengeSourceSha256, packageLockSha256, projectFiles, starterSource, visibleSuiteSha256 } from "../src/sandbox/challenge/files.js";
import { privateSuiteSha256, privateTestNames, visibleTestNames } from "../src/sandbox/challenge/grader.js";
import { hashSource, type SandboxProvider, type TestObservation } from "../src/sandbox/provider.js";
import type { SandboxAgentLike } from "../src/sandbox/agent.js";

const observed: TestObservation = { exitCode: 0, stdout: "", stderr: "", durationMs: 1, passed: privateTestNames.length, failed: 0,
  tests: privateTestNames.map(name => ({ name, status: "passed" })), suiteSha256: privateSuiteSha256, sourceSha256: hashSource(starterSource) };
const config = readApiConfig({ ...process.env, SANDBOX_ENABLED: "true", E2B_API_KEY: "test-only", OPENAI_API_KEY: "test-only", SANDBOX_AGENT_MODEL: "test-model" });
const pool = createDatabasePool(config.DATABASE_URL);

test("sandbox prompt budget, idempotency, ownership, grading and cleanup", { skip: !pool }, async () => {
  const db = pool!;
  const userA = randomUUID(), userB = randomUUID();
  const ids = new Map<string, string>();
  const killed: string[] = [];
  let visibleObservation: TestObservation = { ...observed, passed: visibleTestNames.length,
    tests: visibleTestNames.map(name => ({ name, status: "passed" })), suiteSha256: visibleSuiteSha256 };
  let failGrade = false;
  let failAgent = false;
  let gate: Promise<void> | null = null;
  let releaseGate: (() => void) | undefined;
  const holdAgent = () => { gate = new Promise<void>(resolve => { releaseGate = resolve; }); };
  const provider: SandboxProvider = {
    async create() { const id = randomUUID(); ids.set(id, starterSource); return id; },
    listFiles() { return Object.keys(projectFiles).map(path => ({ path, editable: path === "src/rateLimiter.ts" })); },
    async readFile(id, path) { return path === "src/rateLimiter.ts" ? ids.get(id)! : projectFiles[path]!; },
    async writeFile(id, path, source) { if (path !== "src/rateLimiter.ts") throw new Error("forbidden"); ids.set(id, source); return { path, sha256: hashSource(source), bytes: source.length }; },
    async runVisibleTests(id) { return { ...visibleObservation, sourceSha256: hashSource(ids.get(id) ?? "") }; },
    async grade(source) { if (failGrade) throw new Error("synthetic provider failure"); return {
      observation: { ...observed, sourceSha256: hashSource(source) }, sandboxId: randomUUID(), sourceHash: hashSource(source),
      environment: { provider: "fake", sdk: "fake", runner: "fake", nodeVersion: "test", packageLockSha256,
        challengeSourceSha256, network: "fake" },
    }; },
    async kill(id) { killed.push(id); return true; },
  };
  const agent: SandboxAgentLike = { async run({ prompt, onEvent, provider: tools, sandboxId }) { if (gate) await gate;
    if (failAgent) { await tools.writeFile(sandboxId, "src/rateLimiter.ts", "partial"); await onEvent({ name: "write_file", arguments: { path: "src/rateLimiter.ts" }, result: { sha256: hashSource("partial") }, at: new Date().toISOString() }, "partial"); throw new Error("synthetic model failure"); }
    if (prompt === "first") { await tools.writeFile(sandboxId, "src/rateLimiter.ts", "modified"); await onEvent({ name: "write_file", arguments: { path: "src/rateLimiter.ts" }, result: { sha256: hashSource("modified") }, at: new Date().toISOString() }, "modified"); }
    return { response: `processed ${prompt}`, model: "test-model", inputTokens: 10, outputTokens: 10 }; } };
  const service = new SandboxService(db, config, provider, agent);
  const waitFor = async (id: string, status: string) => {
    for (let attempt = 0; attempt < 1_000; attempt++) {
      const result = await service.get(userA, id);
      if (result.status === status) return result;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${status}`);
  };
  await db.query("INSERT INTO app.users(id,clerk_user_id) VALUES ($1,$2),($3,$4)", [userA, `sandbox-test-${userA}`, userB, `sandbox-test-${userB}`]);
  try {
    const requestId = randomUUID();
    const first = await service.create(userA, requestId);
    assert.equal(first.created, true);
    assert.equal((await service.create(userA, requestId)).session.id, first.session.id);
    const id = first.session.id;
    await waitFor(id, "ready");
    await assert.rejects(service.get(userB, id), (error: { status?: number }) => error.status === 404);
    await assert.rejects(service.create(userA, randomUUID()), (error: { code?: string }) => error.code === "ACTIVE_SESSION_EXISTS");
    const turnKeys = [randomUUID(), randomUUID()];
    holdAgent();
    const concurrent = await Promise.allSettled(turnKeys.map(key => service.acceptTurn(userA, id, key, "first")));
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    const winningKey = turnKeys[concurrent[0].status === "fulfilled" ? 0 : 1]!;
    releaseGate?.(); gate = null;
    await waitFor(id, "ready");
    const duplicate = await service.acceptTurn(userA, id, winningKey, "first");
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.turn.ordinal, 1);
    await assert.rejects(service.acceptTurn(userA, id, winningKey, "changed"), (error: { code?: string }) => error.code === "IDEMPOTENCY_CONFLICT");
    for (let number = 2; number <= 5; number++) {
      const accepted = await service.acceptTurn(userA, id, randomUUID(), `prompt ${number}`);
      assert.equal(accepted.turn.ordinal, number);
      await waitFor(id, "ready");
    }
    assert.equal((await service.get(userA, id)).promptsRemaining, 0);
    await assert.rejects(service.acceptTurn(userA, id, randomUUID(), "sixth"), (error: { code?: string }) => error.code === "PROMPT_LIMIT_REACHED");
    const visibleKey = randomUUID();
    const visible = await service.visibleTests(userA, id, visibleKey);
    await waitFor(id, "ready");
    const repeated = await service.visibleTests(userA, id, visibleKey);
    assert.equal(repeated.run.id, visible.run.id);
    assert.equal((await service.get(userA, id)).visibleRunsRemaining, 9);
    const submitKey = randomUUID();
    await service.submit(userA, id, submitKey);
    const submitted = await waitFor(id, "submitted");
    assert.equal(submitted.promptCount, 5);
    assert.equal((await service.report(userA, id) as { verdict: string }).verdict, "correct");
    assert.equal((await service.files(userA, id)).files.find(file => file.path === "src/rateLimiter.ts")?.content, "modified");
    assert.equal((await service.submit(userA, id, submitKey)).status, "submitted");
    await assert.rejects(service.report(userB, id), (error: { status?: number }) => error.status === 404);
    assert.ok(killed.length >= 1);

    const second = await service.create(userA, randomUUID());
    await waitFor(second.session.id, "ready");
    visibleObservation = { ...observed, exitCode: null, passed: null, failed: null, timedOut: true, infrastructureFailure: "synthetic timeout" };
    await service.visibleTests(userA, second.session.id, randomUUID());
    const afterTimeout = await waitFor(second.session.id, "ready");
    assert.equal(afterTimeout.visibleTests?.[0]?.status, "timeout");
    await db.query("UPDATE app.sandbox_sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [second.session.id]);
    await service.cleanup();
    assert.equal((await service.get(userA, second.session.id)).status, "expired");

    const third = await service.create(userA, randomUUID());
    await waitFor(third.session.id, "ready");
    failGrade = true;
    await service.submit(userA, third.session.id, randomUUID());
    await waitFor(third.session.id, "submitted");
    assert.equal((await service.report(userA, third.session.id) as { verdict: string }).verdict, "infrastructure_error");

    const fourth = await service.create(userA, randomUUID());
    await waitFor(fourth.session.id, "ready");
    failAgent = true;
    const failedKey = randomUUID();
    holdAgent();
    const sameKey = await Promise.all([service.acceptTurn(userA, fourth.session.id, failedKey, "fail after write"), service.acceptTurn(userA, fourth.session.id, failedKey, "fail after write")]);
    assert.deepEqual(sameKey.map(result => result.accepted).sort(), [false, true]);
    releaseGate?.(); gate = null;
    const afterFailure = await waitFor(fourth.session.id, "ready");
    assert.equal(afterFailure.turns?.[0]?.status, "error");
    assert.equal(afterFailure.promptCount, 1);
    assert.equal(afterFailure.currentSha256, hashSource("partial"));
    assert.equal((await service.acceptTurn(userA, fourth.session.id, failedKey, "fail after write")).accepted, false);
  } finally {
    await db.query("DELETE FROM app.sandbox_jobs WHERE session_id IN (SELECT id FROM app.sandbox_sessions WHERE user_id IN ($1,$2))", [userA, userB]);
    await db.query("DELETE FROM app.sandbox_test_runs WHERE session_id IN (SELECT id FROM app.sandbox_sessions WHERE user_id IN ($1,$2))", [userA, userB]);
    await db.query("DELETE FROM app.sandbox_turns WHERE session_id IN (SELECT id FROM app.sandbox_sessions WHERE user_id IN ($1,$2))", [userA, userB]);
    await db.query("DELETE FROM app.sandbox_sessions WHERE user_id IN ($1,$2)", [userA, userB]);
    await db.query("DELETE FROM app.users WHERE id IN ($1,$2)", [userA, userB]);
    await db.end();
  }
});
