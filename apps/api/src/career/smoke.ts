import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readApiConfig } from "../config.js";
import { createDatabasePool } from "../db/pool.js";
import { CareerReviewService } from "./service.js";

const config = readApiConfig();
if (config.NODE_ENV === "production") throw new Error("Career smoke is limited to non-production integration evidence.");
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for the live career smoke.");
const evidenceId = z.string().uuid().parse(process.argv[2]);
const pool = createDatabasePool(config.DATABASE_URL);
if (!pool) throw new Error("DATABASE_URL is required for the live career smoke.");

try {
  const evidence = (await pool.query(`SELECT d.id,a.user_id,u.clerk_user_id AS subject
    FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
    JOIN app.attempts a ON a.id=e.attempt_id JOIN app.users u ON u.id=a.user_id
    WHERE d.id=$1 AND u.clerk_user_id LIKE 'integration_%' AND d.snapshot->'provenance'->>'isSynthetic'='false'`, [evidenceId])).rows[0];
  if (!evidence) throw new Error("The supplied evidence must be a persisted, non-synthetic integration record.");

  const request = {
    clientRequestId: randomUUID(),
    jobDescription: "Design a transactional HTTP service that rejects conflicting idempotency-key payloads and rolls back balance changes if a ledger write fails. Kubernetes deployment experience is required.",
    evidenceIds: [evidenceId],
  };
  const result = await new CareerReviewService(pool, config).create(evidence.user_id, request);
  const review = result.review;
  console.log(JSON.stringify({ request, response: {
    id: review.id,
    clientRequestId: review.clientRequestId,
    status: review.status,
    source: review.analysis?.source ?? "unavailable",
    provider: review.analysis?.provider ?? null,
    model: review.analysis?.model ?? null,
    requirements: review.analysis?.requirements ?? [],
    selectedEvidence: review.evidence.map((record) => ({
      evidenceId: record.evidenceId,
      attemptId: record.attemptId,
      variantId: record.variantId,
      provenance: record.provenance,
      tests: record.tests,
      limitations: record.limitations,
    })),
    limitations: review.analysis?.limitations ?? [],
    failureCode: review.failureCode,
  } }, null, 2));
  if (review.status !== "ready" || review.analysis?.source !== "llm" || review.analysis.provider !== config.AI_PROVIDER) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
