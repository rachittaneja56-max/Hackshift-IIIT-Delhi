import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CareerReviewDtoSchema, type CreateCareerReview } from "@trajectoryos/contracts";
import { harness } from "./helpers.js";
import type { CareerAnalysisProvider } from "../src/career/provider.js";
import { CareerReviewService } from "../src/career/service.js";

test("B5: PostgreSQL-backed career review ownership, idempotency, grounded references, retry, restart and résumé provenance", async (t) => {
  let mode: "normal" | "unmapped" | "invalid" | "failure" | "gate" = "normal";
  let providerCalls = 0;
  let entered!: () => void;
  let release!: () => void;
  let gate = Promise.resolve();
  let signalEntered = () => {};
  const provider: CareerAnalysisProvider = {
    async analyze(input, signal) {
      providerCalls++;
      signalEntered();
      if (mode === "failure") throw new Error("controlled provider failure");
      if (mode === "gate") await gate;
      if (mode === "invalid") return { provider: "openai", model: "gpt-6-luna", output: { requirements: [{
        requirement: "Implement transaction APIs", sourceExcerpt: input.jobDescription, coverage: "related_observation",
        evidence: [{ evidenceId: randomUUID(), testIds: ["T5"], explanation: "Related transaction observation." }], candidateFactIds: [],
      }] } };
      const lines = input.jobDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const requirements = lines.map((line, index) => {
        if (mode === "unmapped" || index > 0) return { requirement: line, sourceExcerpt: line,
          coverage: "unassessed", evidence: [], candidateFactIds: index > 0 ? input.candidateFacts?.items.slice(0, 1).map((fact) => fact.id) ?? [] : [] };
        const selected = input.evidence[0];
        const testId = selected.tests.some((test) => test.testId === "T5") ? "T5" : "T1";
        return { requirement: line, sourceExcerpt: line, coverage: "related_observation",
          evidence: [{ evidenceId: selected.evidenceId, testIds: [testId], explanation: `The recorded ${testId} behavior is related to this requirement.` }], candidateFactIds: [] };
      });
      return { provider: "openai", model: "gpt-6-luna", output: { requirements } };
    },
  };
  const h = await harness({ careerProvider: provider, careerDeadlineMs: 60000 });
  try {
    const existingEvidence = await h.pool.query(`SELECT d.id,ev.attempt_id,e.user_id AS owner_id,u.clerk_user_id AS subject,d.snapshot_sha256
      FROM app.evidence d JOIN app.evaluations ev ON ev.id=d.evaluation_id JOIN app.attempts e ON e.id=ev.attempt_id
      JOIN app.users u ON u.id=e.user_id
      WHERE u.clerk_user_id LIKE 'integration_%' AND d.snapshot->'provenance'->>'isSynthetic'='false'
        AND d.snapshot->'artifact'->>'variantId'='atomic' ORDER BY d.created_at DESC LIMIT 1`);
    if (!existingEvidence.rowCount) {
      t.skip("Run the B1-B4 PostgreSQL integration suite first so this test can use its immutable real evidence record.");
      return;
    }
    const atomicEvidenceId = existingEvidence.rows[0].id as string;
    const ownerToken = h.token(existingEvidence.rows[0].subject as string);
    const request = (path: string, method = "GET", body?: unknown, bearer = ownerToken) => h.request(path, method, body, bearer);
    const factId = randomUUID();
    const normal: CreateCareerReview = {
      clientRequestId: randomUUID(),
      jobDescription: "Implement transactional APIs.\nKubernetes administration is required.",
      evidenceIds: [atomicEvidenceId],
      candidateFacts: { source: "candidate_self_reported", items: [{ id: factId, kind: "skill", text: "I have used Kubernetes in a class project." }] },
    };

    const created = await request("/api/v1/career/reviews", "POST", normal);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const review = CareerReviewDtoSchema.parse(created.body.data);
    assert.equal(review.status, "ready");
    assert.equal(review.analysis?.source, "llm");
    assert.equal(review.analysis?.provider, "openai");
    assert.equal(review.analysis?.requirements[0].evidence[0].tests[0].status, "passed");
    assert.equal(review.analysis?.requirements[1].coverage, "self_reported_only");
    const afterFirst = providerCalls;
    const replay = await request("/api/v1/career/reviews", "POST", normal);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.id, review.id);
    assert.equal(providerCalls, afterFirst, "a cached analysis must not call the provider again");
    assert.equal((await request("/api/v1/career/reviews", "POST", { ...normal, jobDescription: "Changed request." })).status, 409);
    assert.equal((await request(`/api/v1/career/reviews/${review.id}`, "GET", undefined, h.token(h.subjects[1]))).status, 404);

    mode = "unmapped";
    const unsupported = await request("/api/v1/career/reviews", "POST", {
      clientRequestId: randomUUID(), jobDescription: "Kubernetes administration and Rust ownership are required.", evidenceIds: [atomicEvidenceId],
    });
    assert.equal(unsupported.status, 201);
    assert.ok(unsupported.body.data.analysis.requirements.every((item: any) => item.coverage === "unassessed"));
    assert.ok(unsupported.body.data.evidence[0].tests.some((test: any) => test.testId === "T1" && test.status === "passed"));

    mode = "normal";
    const foreign = await request("/api/v1/career/reviews", "POST", {
      clientRequestId: randomUUID(), jobDescription: "Implement transaction APIs.", evidenceIds: [atomicEvidenceId],
    }, h.token(h.subjects[1]));
    assert.equal(foreign.status, 404);
    assert.equal((await request("/api/v1/career/reviews", "POST", { ...normal, clientRequestId: randomUUID(), jobDescription: "" })).status, 422);
    assert.equal((await request("/api/v1/career/reviews", "POST", { ...normal, clientRequestId: randomUUID(), jobDescription: "x".repeat(8001) })).status, 422);
    assert.equal((await request("/api/v1/career/reviews", "POST", { ...normal, clientRequestId: randomUUID(), padding: "x".repeat(1100000) })).status, 413);

    mode = "invalid";
    const badReferences = await request("/api/v1/career/reviews", "POST", {
      clientRequestId: randomUUID(), jobDescription: "Implement transaction APIs.", evidenceIds: [atomicEvidenceId],
    });
    assert.equal(badReferences.status, 201);
    assert.equal(badReferences.body.data.status, "unavailable");
    assert.equal(badReferences.body.data.analysis, null);
    assert.equal(badReferences.body.data.failureCode, "CAREER_ANALYSIS_UNAVAILABLE");

    mode = "failure";
    const retryableInput: CreateCareerReview = { clientRequestId: randomUUID(), jobDescription: "Implement transaction APIs.", evidenceIds: [atomicEvidenceId] };
    const unavailable = await request("/api/v1/career/reviews", "POST", retryableInput);
    assert.equal(unavailable.body.data.status, "unavailable");
    mode = "normal";
    const recovered = await request("/api/v1/career/reviews", "POST", retryableInput);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.data.status, "ready");

    const timeoutProvider: CareerAnalysisProvider = {
      async analyze(_input, signal) {
        return new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      },
    };
    const timeoutService = new CareerReviewService(h.pool, h.config, timeoutProvider, 20);
    const timedOut = await timeoutService.create(existingEvidence.rows[0].owner_id as string, {
      clientRequestId: randomUUID(), jobDescription: "Implement transaction APIs.", evidenceIds: [atomicEvidenceId],
    });
    assert.equal(timedOut.review.status, "unavailable");
    assert.equal(timedOut.review.failureCode, "CAREER_AI_TIMEOUT");

    mode = "gate";
    let enteredResolve!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { enteredResolve = resolve; });
    signalEntered = enteredResolve;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const concurrentInput: CreateCareerReview = { clientRequestId: randomUUID(), jobDescription: "Implement transaction APIs.", evidenceIds: [atomicEvidenceId] };
    const callsBeforeConcurrent = providerCalls;
    const firstRequest = request("/api/v1/career/reviews", "POST", concurrentInput);
    await enteredPromise;
    const concurrent = await request("/api/v1/career/reviews", "POST", concurrentInput);
    assert.equal(concurrent.status, 202);
    assert.equal(concurrent.body.data.status, "generating");
    assert.equal(providerCalls, callsBeforeConcurrent + 1, "concurrent retry must reuse the active provider claim");
    release();
    const generated = await firstRequest;
    assert.equal(generated.body.data.status, "ready");
    assert.equal((await request("/api/v1/career/reviews", "POST", concurrentInput)).status, 200);
    assert.equal(providerCalls, callsBeforeConcurrent + 1, "only one provider call may persist for the idempotency key");

    const callsBeforeResume = providerCalls;
    const resumed = await request(`/api/v1/career/reviews/${review.id}/resume`, "POST", {});
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.data.resumeDraft.needsReview, true);
    assert.ok(resumed.body.data.resumeDraft.markdown.includes("Kubernetes in a class project"));
    assert.ok(!resumed.body.data.resumeDraft.markdown.includes("Senior Engineer"));
    assert.ok(resumed.body.data.resumeDraft.claims.some((claim: any) => claim.sourceLabel === "candidate_self_reported"));
    assert.ok(resumed.body.data.resumeDraft.claims.some((claim: any) => claim.sourceLabel === "observed_test_evidence"));
    assert.equal((await request(`/api/v1/career/reviews/${review.id}/resume`, "POST", {})).body.data.resumeDraft.markdown,
      resumed.body.data.resumeDraft.markdown);
    assert.equal(providerCalls, callsBeforeResume, "résumé template generation must not call the model");
    assert.equal((await h.pool.query("SELECT snapshot_sha256 FROM app.evidence WHERE id=$1", [atomicEvidenceId])).rows[0].snapshot_sha256,
      existingEvidence.rows[0].snapshot_sha256, "career review must not mutate the immutable evidence snapshot");

    const callsBeforeRestart = providerCalls;
    await h.restart();
    assert.equal((await request(`/api/v1/career/reviews/${review.id}`)).status, 200);
    assert.equal((await request("/api/v1/career/reviews", "POST", normal)).status, 200);
    assert.equal(providerCalls, callsBeforeRestart, "cached analysis survives server/pool restart");
    console.log("B5 career ownership, idempotency, evidence references, provider failure/retry, concurrency and cache persistence passed against real PostgreSQL with a provider double; no live inference is claimed by this test.");
  } finally { await h.close(); }
});
