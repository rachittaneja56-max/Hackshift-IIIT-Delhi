import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { EvaluationDtoSchema, SubmissionReadyArtifactSchema, type EvaluationDto } from "@trajectoryos/contracts";
import { ApiError, notFound } from "../errors.js";
import { transaction } from "../db/transaction.js";
import { sha256 } from "../db/hash.js";
import { iso } from "../attempts/service.js";
import { validateScenes } from "../attempts/scenes.js";

export function evaluationDto(row: any): EvaluationDto {
  return EvaluationDtoSchema.parse({ id: row.id, attemptId: row.attempt_id, status: row.status, generation: row.generation,
    executionCount: row.execution_count, queuedAt: iso(row.queued_at), startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    result: row.deterministic_result, error: row.execution_error, evidenceId: row.evidence_id });
}
async function admit(client: PoolClient, owner: string) {
  const user = await client.query("SELECT 1 FROM app.attempts WHERE user_id=$1 AND status IN ('queued','running') LIMIT 1", [owner]);
  const count = await client.query("SELECT count(*)::int AS count FROM app.evaluations WHERE status IN ('queued','running')");
  if (user.rowCount || count.rows[0].count >= 25) throw new ApiError(429, "RATE_LIMITED", "Evaluation capacity reached. Try again later.", undefined, true);
}
export class EvaluationService {
  constructor(private pool: Pool) {}
  async get(owner: string, id: string) {
    const row = (await this.pool.query(`SELECT e.* FROM app.evaluations e JOIN app.attempts a ON a.id=e.attempt_id
      WHERE e.id=$1 AND a.user_id=$2`, [id, owner])).rows[0];
    if (!row) throw notFound(); return evaluationDto(row);
  }
  async submit(owner: string, id: string, revision: number) {
    return transaction(this.pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(84277104)");
      const row = (await client.query("SELECT * FROM app.attempts WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, owner])).rows[0];
      if (!row) throw notFound();
      if (row.revision !== revision) throw new ApiError(409, "REVISION_CONFLICT", "Submit the saved revision.", { currentRevision: row.revision });
      if (row.evaluation_id) return evaluationDto((await client.query("SELECT * FROM app.evaluations WHERE id=$1", [row.evaluation_id])).rows[0]);
      if (row.status !== "draft") throw new ApiError(409, "ATTEMPT_LOCKED", "This attempt is frozen.");
      const ready = SubmissionReadyArtifactSchema.safeParse(row.artifact);
      if (!ready.success) throw new ApiError(422, "SUBMISSION_INCOMPLETE", "Complete both diagrams, decisions, critique and repair justification.",
        { issues: ready.error.issues.map(({ path, message }) => ({ path, message })) });
      validateScenes(ready.data);
      await admit(client, owner);
      const evaluation = (await client.query("INSERT INTO app.evaluations(id,attempt_id,status) VALUES ($1,$2,'queued') RETURNING *", [randomUUID(), id])).rows[0];
      await client.query(`UPDATE app.attempts SET status='queued',evaluation_id=$1,artifact_sha256=$2,submitted_at=now(),updated_at=now()
        WHERE id=$3`, [evaluation.id, sha256(row.artifact), id]);
      return evaluationDto(evaluation);
    });
  }
  async retry(owner: string, id: string) {
    return transaction(this.pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(84277104)");
      const row = (await client.query(`SELECT e.* FROM app.evaluations e JOIN app.attempts a ON a.id=e.attempt_id
        WHERE e.id=$1 AND a.user_id=$2 FOR UPDATE OF e`, [id, owner])).rows[0];
      if (!row) throw notFound();
      if (["queued", "running"].includes(row.status)) return evaluationDto(row);
      if (row.status !== "error" || row.execution_count >= 2 || !row.execution_error?.retryable)
        throw new ApiError(409, "RETRY_LIMIT", "Only retryable infrastructure errors with remaining executions can be retried.");
      await admit(client, owner);
      const next = (await client.query(`UPDATE app.evaluations SET status='queued',generation=generation+1,
        queued_at=now(),started_at=NULL,finished_at=NULL,lease_expires_at=NULL,execution_error=NULL,run_id=NULL
        WHERE id=$1 RETURNING *`, [id])).rows[0];
      await client.query("UPDATE app.attempts SET status='queued',updated_at=now() WHERE id=$1", [row.attempt_id]);
      return evaluationDto(next);
    });
  }
}
