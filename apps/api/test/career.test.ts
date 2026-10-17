import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CreateCareerReviewSchema } from "@trajectoryos/contracts";
import { ruleCareerAnalysis, validateCareerOutput, type CareerProviderInput } from "../src/career/output.js";

const evidenceId = "11111111-1111-4111-8111-111111111111";
const factId = "22222222-2222-4222-8222-222222222222";
const input: CareerProviderInput = {
  jobDescription: "Build reliable transaction APIs. Kubernetes administration is required.",
  candidateFacts: { source: "candidate_self_reported", items: [{ id: factId, kind: "skill", text: "I have used Kubernetes." }] },
  evidence: [{
    evidenceId,
    attemptId: "33333333-3333-4333-8333-333333333333",
    variantId: "key-only",
    createdAt: "2026-10-18T00:00:00.000Z",
    provenance: { isSynthetic: false, runnerKind: "approved_variant", challenge: { slug: "retry-safe-credit", version: 1 },
      manifestSha256: "a".repeat(64), contentSha256: "b".repeat(64), artifactSha256: "c".repeat(64),
      suiteVersion: "suite-v1", suiteSha256: "d".repeat(64), implementationSha256: "e".repeat(64), appCommit: "test",
      databaseVersion: "PostgreSQL", runId: "44444444-4444-4444-8444-444444444444", generation: 1,
      startedAt: "2026-10-18T00:00:00.000Z", finishedAt: "2026-10-18T00:00:01.000Z" },
    tests: [{ testId: "T5", status: "failed", expected: { rollback: true }, observed: { rollback: false } }],
    limitations: ["Reviewed implementation only."],
  }],
};

test("career output maps only selected tests and preserves actual failed outcomes", () => {
  const analysis = validateCareerOutput({ requirements: [
    { requirement: "Build reliable transaction APIs", sourceExcerpt: "Build reliable transaction APIs.", coverage: "related_observation",
      evidence: [{ evidenceId, testIds: ["T5"], explanation: "The rollback behavior is related to transaction safety." }], candidateFactIds: [] },
    { requirement: "Kubernetes administration is required", sourceExcerpt: "Kubernetes administration is required.", coverage: "unassessed",
      evidence: [], candidateFactIds: [factId] },
  ] }, input, "llm", "openai", "gpt-6-luna");
  assert.equal(analysis.source, "llm");
  assert.equal(analysis.provider, "openai");
  assert.equal(analysis.requirements[0].coverage, "related_observation");
  assert.deepEqual(analysis.requirements[0].evidence[0].tests, [{ testId: "T5", status: "failed" }]);
  assert.equal(analysis.requirements[1].coverage, "self_reported_only");
  assert.deepEqual(analysis.requirements[1].candidateFactIds, [factId]);
  assert.ok(analysis.limitations.some((line) => line.includes("authorship")));
});

test("career output rejects unselected evidence, invented test IDs and fabricated JD excerpts", () => {
  const base = { requirement: "Build transaction APIs", sourceExcerpt: "Build reliable transaction APIs.", coverage: "related_observation" as const,
    evidence: [{ evidenceId, testIds: ["T5"], explanation: "This test records transaction rollback behavior." }], candidateFactIds: [] };
  assert.throws(() => validateCareerOutput({ requirements: [{ ...base, evidence: [{ ...base.evidence[0], evidenceId: randomUUID() }] }] }, input, "llm", "openai", "gpt-6-luna"), /INVALID_EVIDENCE_REFERENCE/);
  assert.throws(() => validateCareerOutput({ requirements: [{ ...base, evidence: [{ ...base.evidence[0], testIds: ["T8"] }] }] }, input, "llm", "openai", "gpt-6-luna"), /must match pattern/);
  assert.throws(() => validateCareerOutput({ requirements: [{ ...base, sourceExcerpt: "Go" }] }, input, "llm", "openai", "gpt-6-luna"), /INVALID_JOB_DESCRIPTION_REFERENCE/);
  assert.throws(() => validateCareerOutput({ requirements: [{ ...base, candidateFactIds: [randomUUID()] }] }, input, "llm", "openai", "gpt-6-luna"), /INVALID_CANDIDATE_FACT_REFERENCE/);
});

test("rules path is explicit and leaves requirements unassessed", () => {
  const analysis = ruleCareerAnalysis(input);
  assert.equal(analysis.source, "rules");
  assert.equal(analysis.provider, null);
  assert.equal(analysis.requirements.length, 2);
  assert.ok(analysis.requirements.every((requirement) => requirement.coverage === "unassessed"));
  assert.ok(analysis.limitations.some((line) => line.includes("does not map")));
});

test("career request schema bounds job text and requires unique owned evidence selections", () => {
  const valid = { clientRequestId: randomUUID(), jobDescription: "Backend engineer", evidenceIds: [evidenceId] };
  assert.equal(CreateCareerReviewSchema.parse(valid).jobDescription, "Backend engineer");
  assert.throws(() => CreateCareerReviewSchema.parse({ ...valid, jobDescription: " " }));
  assert.throws(() => CreateCareerReviewSchema.parse({ ...valid, jobDescription: "x".repeat(8001) }));
  assert.throws(() => CreateCareerReviewSchema.parse({ ...valid, evidenceIds: [evidenceId, evidenceId] }));
  assert.throws(() => CreateCareerReviewSchema.parse({ ...valid, extra: true }));
  assert.throws(() => CreateCareerReviewSchema.parse({ ...valid, candidateFacts: { items: [] } }));
});
