import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ApiConfig } from "../config.js";
import { EvaluationResultSchema, VariantIdSchema, type EvaluationResult } from "@trajectoryos/contracts";
import { transaction } from "../db/transaction.js";
import { sha256 } from "../db/hash.js";
import { limitations } from "../content/index.js";
import { cleanupRun, runSuite, RunError } from "../challenges/retry-safe-credit/suite.js";
import { iso } from "../attempts/service.js";
import { appCommit } from "../provenance.js";

export type ClaimedEvaluation = { id: string; attempt_id: string; generation: number; execution_count: number; run_id: string; started_at: Date };
export class EvaluationWorker {
  private busy = false;
  private stopping = false;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<boolean>;
  constructor(private pool: Pool, private config: ApiConfig,
    private runner: typeof runSuite = runSuite) {}
  async expireLeases() {
    const expired = await transaction(this.pool, async client => {
      const rows = (await client.query(`UPDATE app.evaluations SET status='error',finished_at=now(),lease_expires_at=NULL,
        execution_error=jsonb_build_object('code','RUNNER_RESTARTED','message','Worker lease expired.','retryable',execution_count<2)
        WHERE status='running' AND lease_expires_at < now() RETURNING attempt_id,run_id`)).rows;
      for (const row of rows) await client.query("UPDATE app.attempts SET status='execution_error',updated_at=now() WHERE id=$1", [row.attempt_id]);
      return rows;
    });
    for (const row of expired) if (row.run_id) await cleanupRun(this.pool, row.run_id);
  }
  async claim(): Promise<ClaimedEvaluation | undefined> {
    return transaction(this.pool, async client => {
      const row = (await client.query(`SELECT * FROM app.evaluations WHERE status='queued' AND execution_count<2
        ORDER BY queued_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) return undefined;
      const claimed = (await client.query(`UPDATE app.evaluations SET status='running',execution_count=execution_count+1,
        started_at=now(),lease_expires_at=now()+interval '5 minutes',run_id=$2 WHERE id=$1 RETURNING *`, [row.id, randomUUID()])).rows[0];
      await client.query("UPDATE app.attempts SET status='running',updated_at=now() WHERE id=$1", [row.attempt_id]);
      return claimed;
    });
  }
  async finalize(claim: ClaimedEvaluation, suppliedResult: EvaluationResult) {
    const result = EvaluationResultSchema.parse(suppliedResult);
    return transaction(this.pool, async client => {
      const row = (await client.query("SELECT * FROM app.evaluations WHERE id=$1 FOR UPDATE", [claim.id])).rows[0];
      if (!row || row.status !== "running" || row.generation !== claim.generation || row.run_id !== claim.run_id ||
        new Date(row.lease_expires_at).getTime() <= Date.now()) return false;
      const attempt = (await client.query(`SELECT a.*,c.manifest,c.manifest_sha256 FROM app.attempts a
        JOIN app.challenge_versions c ON c.slug=a.challenge_slug AND c.version=a.challenge_version WHERE a.id=$1 FOR UPDATE OF a`, [claim.attempt_id])).rows[0];
      const databaseVersion = (await client.query("SELECT version() AS version")).rows[0].version;
      const now = new Date().toISOString(); const id = randomUUID();
      const snapshot = { id, evaluationId: claim.id, attemptId: claim.attempt_id, createdAt: now, artifact: attempt.artifact,
        provenance: { isSynthetic: false, runnerKind: "approved_variant", challenge: { slug: attempt.challenge_slug, version: attempt.challenge_version },
          manifestSha256: attempt.manifest_sha256, contentSha256: attempt.manifest.lesson.contentSha256,
          artifactSha256: attempt.artifact_sha256, suiteVersion: result.suiteVersion, suiteSha256: result.suiteSha256,
          implementationSha256: result.implementationSha256, appCommit: appCommit(this.config.APP_COMMIT_SHA),
          databaseVersion, runId: claim.run_id, generation: claim.generation, startedAt: iso(row.started_at), finishedAt: now },
        result, limitations };
      await client.query("INSERT INTO app.evidence(id,evaluation_id,snapshot,snapshot_sha256,created_at) VALUES ($1,$2,$3,$4,$5)",
        [id, claim.id, snapshot, sha256(snapshot), now]);
      await client.query(`UPDATE app.evaluations SET status='completed',deterministic_result=$1,evidence_id=$2,finished_at=$3,lease_expires_at=NULL WHERE id=$4`,
        [result, id, now, claim.id]);
      await client.query("UPDATE app.attempts SET status='evaluated',evidence_id=$1,updated_at=$2 WHERE id=$3", [id, now, claim.attempt_id]);
      return true;
    });
  }
  async fail(claim: ClaimedEvaluation, code: string) {
    await transaction(this.pool, async client => {
      const error = { code, message: "Evaluation infrastructure did not complete. No test verdict was recorded.", retryable: claim.execution_count < 2 };
      const updated = await client.query(`UPDATE app.evaluations SET status='error',execution_error=$1,finished_at=now(),lease_expires_at=NULL
        WHERE id=$2 AND status='running' AND generation=$3 AND run_id=$4 RETURNING attempt_id`, [error, claim.id, claim.generation, claim.run_id]);
      if (updated.rowCount) await client.query("UPDATE app.attempts SET status='execution_error',updated_at=now() WHERE id=$1", [claim.attempt_id]);
    });
  }
  async tick() {
    if (this.busy || this.stopping) return false;
    this.busy = true;
    try {
      await this.expireLeases();
      const claim = await this.claim(); if (!claim) return false;
      this.controller = new AbortController();
      const timer = setTimeout(() => this.controller?.abort(), 120000);
      try {
        const attempt = (await this.pool.query("SELECT artifact FROM app.attempts WHERE id=$1", [claim.attempt_id])).rows[0];
        const variant = VariantIdSchema.parse(attempt.artifact.variantId);
        const run = await this.runner(this.pool, variant, claim.run_id, this.controller.signal);
        await this.finalize(claim, run.result);
      } catch (error) {
        await this.fail(claim, this.stopping ? "RUNNER_RESTARTED" : error instanceof RunError ? error.code : "EVALUATOR_UNAVAILABLE");
      } finally { clearTimeout(timer); this.controller = undefined; }
      return true;
    } finally { this.busy = false; }
  }
  start() {
    const run = () => { this.pending = this.tick().catch(() => { console.error("Evaluation worker database operation failed."); return false; }); };
    run(); this.timer = setInterval(run, 1000); this.timer.unref();
  }
  async stop() { this.stopping = true; clearInterval(this.timer); this.controller?.abort();
    while (this.busy) { await new Promise(resolve => setTimeout(resolve, 25)); }
    await this.pending;
  }
}
