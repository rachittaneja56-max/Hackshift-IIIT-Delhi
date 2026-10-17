import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { FeedbackDtoSchema } from "@trajectoryos/contracts";
import { harness, readyArtifact } from "./helpers.js";
import { FeedbackService } from "../src/ai/service.js";
import { EvaluationWorker } from "../src/evaluations/worker.js";
import type { FeedbackProvider } from "../src/ai/provider.js";

const output = { summary: "Interpretation: Stored observations support the tested behavior.",
  strengths: [{ text: "Observed: the first credit persisted one response.", evidenceRefs: ["T1"] }],
  limitations: ["Diagrams require human review."], nextSteps: [{ text: "Review the rollback case.", evidenceRefs: ["T5"] }] };
const response = { output, provider: "test-double", model: "fixture", usage: null };
test("B3: PostgreSQL annotation cache, API ownership, provider doubles, timeout and stale-call fencing", async () => {
  let notify!: () => void; let release!: () => void; let calls = 0;
  const started = new Promise<void>(resolve => { notify = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const provider: FeedbackProvider = { async explain() { calls++; notify(); await gate; return response; } };
  const h = await harness({ feedbackProvider: provider });
  try {
    const created = await h.request("/api/v1/attempts", "POST", { challengeSlug: "retry-safe-credit", challengeVersion: 1, clientRequestId: randomUUID() });
    const attemptId = created.body.data.id;
    assert.equal((await h.request(`/api/v1/attempts/${attemptId}/draft`, "PUT", { expectedRevision: 1, artifact: readyArtifact })).status, 200);
    const submitted = await h.request(`/api/v1/attempts/${attemptId}/submit`, "POST", { expectedRevision: 2 });
    await new EvaluationWorker(h.pool, h.config).tick();
    const evaluation = (await h.request(`/api/v1/evaluations/${submitted.body.data.id}`)).body.data;
    assert.equal(evaluation.status, "completed"); const id = evaluation.evidenceId;
    const owner = (await h.pool.query("SELECT user_id FROM app.attempts WHERE id=$1", [attemptId])).rows[0].user_id;
    const before = (await h.pool.query("SELECT snapshot_sha256 FROM app.evidence WHERE id=$1", [id])).rows[0].snapshot_sha256;
    const path = `/api/v1/evidence/${id}/feedback`;
    assert.equal((await h.request(path)).body.data.status, "not_requested");
    const first = h.request(path, "POST", {}); await started;
    const concurrent = await h.request(path, "POST", {}); assert.equal(concurrent.status, 202); assert.equal(concurrent.body.data.status, "generating");
    release(); const ready = await first; assert.equal(ready.status, 200); assert.equal(ready.body.data.source, "llm");
    FeedbackDtoSchema.parse(ready.body.data); assert.equal(calls, 1);
    assert.equal((await h.request(path, "POST", {})).status, 200); assert.equal(calls, 1);
    assert.equal((await h.request(`/api/v1/evidence/${id}`)).body.data.feedbackStatus, "ready");
    for (const method of ["GET", "POST"]) assert.equal((await h.request(path, method, method === "POST" ? {} : undefined, h.token(h.subjects[1]))).status, 404);
    const service = (double: FeedbackProvider | null, deadline = 12000) => new FeedbackService(h.pool, h.config, double, deadline, "integration-" + randomUUID());
    for (const bad of [
      { ...output, nextSteps: [{ text: "Invented T9", evidenceRefs: ["T9"] }] },
      { ...output, summary: "Interpretation: proficiency score 99" },
      { invalid: true },
    ]) {
      const fallback = await service({ async explain() { return { ...response, output: bad }; } }).request(owner, id);
      assert.equal(fallback.source, "rules"); assert.match(fallback.output!.summary, /Rule-based/);
    }
    const timed = service({ async explain(_input, signal) { await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })); throw new Error("unreachable"); } }, 20);
    assert.equal((await timed.request(owner, id)).source, "rules");
    assert.equal((await service({ async explain() { throw Object.assign(new Error("rate limited"), { status: 429 }); } }).request(owner, id)).source, "rules");
    assert.equal((await service(null).request(owner, id)).source, "rules");
    let lateStart!: () => void; let lateRelease!: () => void;
    const lateStarted = new Promise<void>(resolve => { lateStart = resolve; });
    const lateGate = new Promise<void>(resolve => { lateRelease = resolve; });
    const version = "late-" + randomUUID();
    const slow = new FeedbackService(h.pool, h.config, { async explain() { lateStart(); await lateGate; return response; } }, 12000, version);
    const pending = slow.request(owner, id); await lateStarted;
    await h.pool.query("UPDATE app.ai_annotations SET deadline_at=now()-interval '1 second' WHERE evidence_id=$1 AND prompt_version=$2", [id, version]);
    assert.equal((await slow.get(owner, id)).status, "unavailable");
    lateRelease(); assert.equal((await pending).source, "rules");
    assert.equal((await new FeedbackService(h.pool, h.config, null).get(owner, id)).source, "llm");
    assert.equal((await h.pool.query("SELECT snapshot_sha256 FROM app.evidence WHERE id=$1", [id])).rows[0].snapshot_sha256, before);
    console.log("B3 provider-double scenarios passed against real PostgreSQL; this test makes no live AI call.");
  } finally { release(); await h.close(); }
});
