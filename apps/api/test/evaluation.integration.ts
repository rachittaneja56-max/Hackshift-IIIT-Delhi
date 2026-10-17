import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { EvaluationDtoSchema, type VariantId } from "@trajectoryos/contracts";
import { harness, readyArtifact } from "./helpers.js";
import { runSuite, cleanupRun, RunError } from "../src/challenges/retry-safe-credit/suite.js";
import { EvaluationWorker } from "../src/evaluations/worker.js";
import { sha256 } from "../src/db/hash.js";

test("B2: real T1-T7 matrix, durable lifecycle, ownership, fencing and immutable evidence", async () => {
  const h = await harness();
  try {
    const untouched = randomUUID();
    await h.pool.query("INSERT INTO challenge_eval.accounts(run_id,scenario,account_id,balance_minor) VALUES ($1,'sentinel','untouched',123)", [untouched]);
    const reports = [];
    for (const variant of ["atomic", "credit-first", "key-only"] as VariantId[]) {
      const run = await runSuite(h.pool, variant);
      console.log(JSON.stringify({ variant, runId: run.runId, tests: run.result.tests.map(t => `${t.id}:${t.status}`) }));
      if (variant === "atomic") assert.equal(run.result.verdict, "all_passed");
      else assert.equal(run.result.verdict, "some_failed");
      if (variant === "credit-first") for (const id of ["T2", "T4", "T5"]) assert.equal(run.result.tests.find(t => t.id === id)?.status, "failed");
      if (variant === "key-only") assert.equal(run.result.tests.find(t => t.id === "T5")?.status, "failed");
      assert.equal((await h.pool.query("SELECT count(*)::int AS count FROM challenge_eval.accounts WHERE run_id=$1", [run.runId])).rows[0].count, 0);
      reports.push({ variant, ...run });
    }
    assert.equal((await h.pool.query("SELECT balance_minor FROM challenge_eval.accounts WHERE run_id=$1", [untouched])).rows[0].balance_minor, "123");
    await cleanupRun(h.pool, untouched);
    const directory = new URL("../../../.hackshift-local/backend/", import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL("variant-runs.json", directory), JSON.stringify({ observedAt: new Date().toISOString(), reports }, null, 2));
    async function createReady() {
      const created = await h.request("/api/v1/attempts", "POST", { challengeSlug: "retry-safe-credit", challengeVersion: 1, clientRequestId: randomUUID() });
      const id = created.body.data.id;
      assert.equal((await h.request(`/api/v1/attempts/${id}/submit`, "POST", { expectedRevision: 1 })).status, 422);
      const saved = await h.request(`/api/v1/attempts/${id}/draft`, "PUT", { expectedRevision: 1, artifact: readyArtifact });
      assert.equal(saved.status, 200); return id;
    }
    const attemptId = await createReady();
    const foreign = h.token(h.subjects[1]);
    assert.equal((await h.request(`/api/v1/attempts/${attemptId}/submit`, "POST", { expectedRevision: 2 }, foreign)).status, 404);
    const submitted = await Promise.all([1, 2].map(() => h.request(`/api/v1/attempts/${attemptId}/submit`, "POST", { expectedRevision: 2 })));
    assert.deepEqual(submitted.map(r => r.status), [202, 202]);
    const evaluation = EvaluationDtoSchema.parse(submitted[0].body.data); assert.equal(evaluation.id, submitted[1].body.data.id);
    const otherAttempt = await createReady();
    assert.equal((await h.request(`/api/v1/attempts/${otherAttempt}/submit`, "POST", { expectedRevision: 2 })).status, 429);
    assert.equal((await h.request(`/api/v1/attempts/${attemptId}/draft`, "PUT", { expectedRevision: 2, artifact: readyArtifact })).status, 409);
    assert.equal((await h.request(`/api/v1/attempts/${attemptId}/submit`, "POST", { expectedRevision: 1 })).status, 409);
    assert.equal((await h.request(`/api/v1/evaluations/${evaluation.id}`, "GET", undefined, foreign)).status, 404);
    assert.equal((await h.request(`/api/v1/evaluations/${evaluation.id}/retry`, "POST", {}, foreign)).status, 404);
    const worker = new EvaluationWorker(h.pool, h.config);
    assert.equal(await worker.tick(), true);
    const completed = EvaluationDtoSchema.parse((await h.request(`/api/v1/evaluations/${evaluation.id}`)).body.data);
    assert.equal(completed.status, "completed"); assert.equal(completed.result?.verdict, "all_passed");
    assert.equal((await h.request(`/api/v1/attempts/${attemptId}/submit`, "POST", { expectedRevision: 2 })).status, 200);
    assert.equal((await h.request(`/api/v1/evaluations/${evaluation.id}/retry`, "POST", {})).status, 409);
    const evidence = (await h.request(`/api/v1/evidence/${completed.evidenceId}`)).body.data;
    assert.deepEqual(evidence.artifact, readyArtifact); assert.equal(evidence.provenance.isSynthetic, false);
    assert.equal((await h.request(`/api/v1/evidence/${completed.evidenceId}`, "GET", undefined, foreign)).status, 404);
    const stored = (await h.pool.query("SELECT snapshot,snapshot_sha256 FROM app.evidence WHERE id=$1", [completed.evidenceId])).rows[0];
    assert.equal(sha256(stored.snapshot), stored.snapshot_sha256);
    await assert.rejects(h.pool.query("UPDATE app.evidence SET snapshot='{}' WHERE id=$1", [completed.evidenceId]), /immutable/);
    await assert.rejects(h.pool.query("UPDATE app.attempts SET artifact='{}' WHERE id=$1", [attemptId]), /immutable/);
    await assert.rejects(h.pool.query("UPDATE app.evaluations SET deterministic_result='{}' WHERE id=$1", [evaluation.id]), /immutable/);
    await writeFile(new URL("persisted-evidence.json", directory), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ evidenceId: completed.evidenceId, attemptId, evaluationId: evaluation.id }));
    // A real queue row is claimed, abandoned, expired and retried; no database double is involved.
    const queued = await h.request(`/api/v1/attempts/${otherAttempt}/submit`, "POST", { expectedRevision: 2 });
    assert.equal(queued.status, 202);
    const old = await worker.claim(); assert.ok(old); assert.equal(old.id, queued.body.data.id);
    await h.pool.query("UPDATE app.evaluations SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [old.id]);
    await worker.expireLeases();
    assert.equal((await h.request(`/api/v1/evaluations/${old.id}`)).body.data.error.code, "RUNNER_RESTARTED");
    const retries = await Promise.all([1, 2].map(() => h.request(`/api/v1/evaluations/${old.id}/retry`, "POST", {})));
    assert.deepEqual(retries.map(r => r.status), [202, 202]); assert.equal(retries[0].body.data.generation, 2); assert.equal(retries[1].body.data.generation, 2);
    assert.equal(await worker.finalize(old, reports[0].result), false);
    const infrastructureFailure = new EvaluationWorker(h.pool, h.config, async () => { throw new RunError("EVAL_DB_UNAVAILABLE", "Controlled infrastructure error"); });
    await infrastructureFailure.tick();
    const failed = (await h.request(`/api/v1/evaluations/${old.id}`)).body.data;
    assert.equal(failed.status, "error"); assert.equal(failed.executionCount, 2); assert.equal(failed.result, null); assert.equal(failed.evidenceId, null);
    assert.equal((await h.request(`/api/v1/evaluations/${old.id}/retry`, "POST", {})).status, 409);
    assert.equal((await h.request(`/api/v1/attempts/${otherAttempt}`)).body.data.status, "execution_error");
  } finally { await h.close(); }
});
