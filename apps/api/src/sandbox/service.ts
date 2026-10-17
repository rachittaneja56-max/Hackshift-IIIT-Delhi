import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ApiConfig } from "../config.js";
import { ApiError, notFound } from "../errors.js";
import { transaction } from "../db/transaction.js";
import { SandboxAgent, type SandboxAgentLike, type ToolEvent } from "./agent.js";
import { challengeSlug, challengeVersion, challengeSourceSha256, editablePath, listedFiles, packageLockSha256, projectFiles, starterSha256, starterSource, visibleSuiteSha256 } from "./challenge/files.js";
import { privateSuiteSha256, privateTestNames } from "./challenge/grader.js";
import { E2BSandboxProvider, hashSource, validateSource, type GradeResult, type SandboxProvider, type TestObservation } from "./provider.js";

type SessionRow = {
  id: string; user_id: string; client_request_id?: string; challenge_version: number; status: string; sandbox_id: string | null;
  starter_source: string; current_source: string; current_sha256: string; source_revision: string | number;
  prompt_count: number; visible_run_count: number; submit_request_id: string | null;
  submitted_source: string | null; submitted_sha256: string | null; report: unknown;
  failure_code: string | null; expires_at: Date; created_at: Date; updated_at: Date;
};
type TurnRow = { id: string; session_id: string; client_request_id: string; prompt_fingerprint: string; ordinal: number; prompt: string;
  status: string; model: string; response: string | null; tool_events: ToolEvent[]; source_sha256: string | null; failure_code: string | null; created_at: Date };
type RunRow = { id: string; session_id: string; client_request_id: string; kind: string; status: string; source_sha256: string;
  challenge_version: number; suite_sha256: string | null; implementation_sha256: string | null; source_revision: string | number | null;
  observation: TestObservation | null; created_at: Date; completed_at: Date | null };
type JobRow = { id: string; session_id: string; kind: "create" | "turn" | "visible" | "grade"; request_id: string; payload: Record<string, unknown>;
  attempts: number; claim_token: string; lease_until: Date };

const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 360;
const busy = () => new ApiError(409, "SESSION_BUSY", "Finish the current operation before starting another.", undefined, true);
const unavailable = () => new ApiError(503, "SANDBOX_UNAVAILABLE", "The AI debugging lab is unavailable.", undefined, true);
const hashPrompt = (prompt: string) => hashSource(prompt);
const databaseCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "57P01", "53300", "08006", "08001", "40001"]);
const isDatabaseError = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && databaseCodes.has(String(error.code)));
function failedObservation(message: string, sourceSha256: string, suiteSha256: string): TestObservation {
  return { exitCode: null, stdout: "", stderr: "", durationMs: 0, passed: null, failed: null, tests: [], sourceSha256, suiteSha256, infrastructureFailure: message };
}

export class SandboxService {
  private provider: SandboxProvider;
  private agent: SandboxAgentLike | null;
  private wakeScheduled = false;
  private draining = false;
  private stopped = false;
  private pollTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private drainPromise?: Promise<void>;

  constructor(private pool: Pool, private config: ApiConfig, provider?: SandboxProvider, agent?: SandboxAgentLike) {
    this.provider = provider ?? new E2BSandboxProvider(config.E2B_API_KEY);
    this.agent = agent ?? (config.OPENAI_API_KEY && config.SANDBOX_AGENT_MODEL ? new SandboxAgent(config.OPENAI_API_KEY, config.SANDBOX_AGENT_MODEL) : null);
  }
  available() { return this.config.SANDBOX_ENABLED && !!this.config.E2B_API_KEY && !!this.agent; }
  requireAvailable() { if (!this.available()) throw unavailable(); }

  start() {
    if (this.pollTimer) return;
    this.stopped = false;
    if (this.available()) { this.pollTimer = setInterval(() => this.wake(), 1_000); this.pollTimer.unref(); }
    this.cleanupTimer = setInterval(() => { void this.cleanup().catch(() => console.error("Sandbox cleanup failed.")); }, 30_000);
    this.cleanupTimer.unref();
    void this.cleanup().catch(() => console.error("Sandbox cleanup failed."));
    this.wake();
  }
  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.pollTimer = undefined;
    this.cleanupTimer = undefined;
    await this.drainPromise?.catch(() => undefined);
  }
  private wake() {
    if (this.stopped || this.wakeScheduled || this.draining || !this.available()) return;
    this.wakeScheduled = true;
    setImmediate(() => {
      this.wakeScheduled = false;
      if (this.draining || this.stopped) return;
      this.drainPromise = this.drain();
      void this.drainPromise.catch(() => console.error("Sandbox worker poll failed."));
    });
  }
  private async drain() {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      await this.failExpiredLeases();
      for (let count = 0; count < 20 && !this.stopped; count++) {
        const job = await this.claimJob();
        if (!job) break;
        await this.runClaimed(job);
      }
    } finally { this.draining = false; }
  }
  private async claimJob(): Promise<JobRow | null> {
    return transaction(this.pool, async client => {
      const result = await client.query<JobRow>("WITH candidate AS (" +
        "SELECT id FROM app.sandbox_jobs WHERE ((status='queued' AND available_at<=now()) OR (status='running' AND lease_until<=now())) " +
        "AND attempts < $1 ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) " +
        "UPDATE app.sandbox_jobs j SET status='running',attempts=j.attempts+1,claim_token=$2," +
        "lease_until=now()+($3::integer * interval '1 second'),updated_at=now() FROM candidate " +
        "WHERE j.id=candidate.id RETURNING j.id,j.session_id,j.kind,j.request_id,j.payload,j.attempts,j.claim_token,j.lease_until",
        [MAX_ATTEMPTS, randomUUID(), LEASE_SECONDS]);
      return result.rows[0] ?? null;
    });
  }
  private async runClaimed(job: JobRow) {
    const heartbeat = setInterval(() => {
      void this.pool.query("UPDATE app.sandbox_jobs SET lease_until=now()+($3::integer * interval '1 second'),updated_at=now() " +
        "WHERE id=$1 AND status='running' AND claim_token=$2", [job.id, job.claim_token, LEASE_SECONDS]).catch(() => undefined);
    }, 60_000);
    heartbeat.unref();
    try {
      if (job.kind === "create") await this.executeCreate(job);
      else if (job.kind === "turn") await this.executeTurn(job);
      else if (job.kind === "visible") await this.executeVisible(job);
      else await this.executeGrade(job);
    } catch (error) {
      const code = isDatabaseError(error) ? "DATABASE_INTERRUPTED" : error instanceof Error && /timeout/i.test(error.name) ? "PROVIDER_TIMEOUT" : "SANDBOX_OPERATION_FAILED";
      console.error("Sandbox job failed:", job.kind, code, error instanceof Error ? error.name : "unknown");
      await this.releaseOrFailJob(job, code).catch(() => undefined);
    } finally { clearInterval(heartbeat); }
  }
  private async completeJob(client: PoolClient, job: JobRow) {
    const result = await client.query("UPDATE app.sandbox_jobs SET status='completed',claim_token=NULL,lease_until=NULL,failure_code=NULL," +
      "completed_at=now(),updated_at=now() WHERE id=$1 AND status='running' AND claim_token=$2", [job.id, job.claim_token]);
    if (!result.rowCount) throw new Error("Sandbox job lease was lost before completion.");
  }
  private async releaseOrFailJob(job: JobRow, failureCode: string) {
    await transaction(this.pool, async client => {
      const current = await client.query<{ attempts: number }>("SELECT attempts FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!current.rows[0]) return;
      if (current.rows[0].attempts < MAX_ATTEMPTS) {
        const delay = Math.min(30, 3 * 2 ** Math.max(0, current.rows[0].attempts - 1));
        await client.query("UPDATE app.sandbox_jobs SET status='queued',claim_token=NULL,lease_until=NULL," +
          "available_at=now()+($3::integer * interval '1 second'),failure_code=$4,updated_at=now() WHERE id=$1 AND claim_token=$2",
          [job.id, job.claim_token, delay, failureCode]);
        return;
      }
      await client.query("UPDATE app.sandbox_jobs SET status='failed',claim_token=NULL,lease_until=NULL,failure_code=$3," +
        "completed_at=now(),updated_at=now() WHERE id=$1 AND claim_token=$2", [job.id, job.claim_token, failureCode]);
      const result = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [job.session_id]);
      const session = result.rows[0];
      if (!session) return;
      if (job.kind === "create") {
        await client.query("UPDATE app.sandbox_sessions SET status='error',failure_code=$2,updated_at=now() WHERE id=$1 AND status='creating'", [job.session_id, failureCode]);
      } else if (job.kind === "turn") {
        await client.query("UPDATE app.sandbox_turns SET status='error',failure_code=$2,updated_at=now() WHERE id=$1 AND status='processing'", [job.request_id, failureCode]);
        await client.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END," +
          "failure_code=$2,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id, failureCode]);
      } else if (job.kind === "visible") {
        const observation = failedObservation("Visible test infrastructure failed after bounded recovery attempts.", session.current_sha256, visibleSuiteSha256);
        await client.query("UPDATE app.sandbox_test_runs SET status='infrastructure_error',source_sha256=$2,suite_sha256=$3," +
          "implementation_sha256=$2,observation=$4::jsonb,completed_at=now() WHERE id=$1 AND status='running'",
          [String(job.payload.runId ?? ""), session.current_sha256, visibleSuiteSha256, JSON.stringify(observation)]);
        await client.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END," +
          "failure_code=$2,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id, failureCode]);
      } else if (session.submitted_source && session.submitted_sha256) {
        const [turns, runs] = await Promise.all([
          client.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [job.session_id]),
          client.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [job.session_id]),
        ]);
        const report = this.infrastructureReport(session, failureCode, turns.rows, runs.rows);
        await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,observation," +
          "challenge_version,suite_sha256,implementation_sha256,source_revision,completed_at) " +
          "VALUES ($1,$2,$3,'hidden','infrastructure_error',$4,$5::jsonb,2,$6,$4,$7,now()) " +
          "ON CONFLICT (session_id,client_request_id) DO NOTHING",
          [randomUUID(), job.session_id, job.request_id, session.submitted_sha256, JSON.stringify(report.hiddenTests), privateSuiteSha256, session.source_revision]);
        await client.query("UPDATE app.sandbox_sessions SET status='submitted',report=$2::jsonb,updated_at=now() WHERE id=$1 AND report IS NULL",
          [job.session_id, JSON.stringify(report)]);
      } else {
        await client.query("UPDATE app.sandbox_sessions SET status='error',failure_code=$2,updated_at=now() WHERE id=$1 AND status IN ('freezing','grading')",
          [job.session_id, failureCode]);
      }
    });
  }
  private async failExpiredLeases() {
    const expired = await this.pool.query<{ session_id: string; kind: JobRow["kind"]; request_id: string; payload: Record<string, unknown> }>(
      "UPDATE app.sandbox_jobs SET status='failed',claim_token=NULL,lease_until=NULL,failure_code='WORKER_RETRIES_EXHAUSTED'," +
      "completed_at=now(),updated_at=now() WHERE status='running' AND lease_until<=now() AND attempts >= $1 " +
      "RETURNING session_id,kind,request_id,payload", [MAX_ATTEMPTS]);
    for (const job of expired.rows) {
      const row = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
      if (!row) continue;
      if (job.kind === "turn") {
        await this.pool.query("UPDATE app.sandbox_turns SET status='error',failure_code='WORKER_RETRIES_EXHAUSTED',updated_at=now() WHERE id=$1 AND status='processing'", [job.request_id]);
        await this.pool.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id]);
      } else if (job.kind === "visible") {
        const obs = failedObservation("Worker lease expired after the allowed attempts.", row.current_sha256, visibleSuiteSha256);
        await this.pool.query("UPDATE app.sandbox_test_runs SET status='infrastructure_error',observation=$2::jsonb,completed_at=now() WHERE id=$1 AND status='running'",
          [String(job.payload.runId ?? ""), JSON.stringify(obs)]);
        await this.pool.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id]);
      } else if (job.kind === "grade" && row.submitted_source && row.submitted_sha256) {
        const [turns, runs] = await Promise.all([
          this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [job.session_id]),
          this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [job.session_id]),
        ]);
        const report = this.infrastructureReport(row, "WORKER_RETRIES_EXHAUSTED", turns.rows, runs.rows);
        await transaction(this.pool, async client => {
          await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,observation," +
            "challenge_version,suite_sha256,implementation_sha256,source_revision,completed_at) " +
            "VALUES ($1,$2,$3,'hidden','infrastructure_error',$4,$5::jsonb,2,$6,$4,$7,now()) ON CONFLICT DO NOTHING",
            [randomUUID(), job.session_id, job.request_id, row.submitted_sha256, JSON.stringify(report.hiddenTests), privateSuiteSha256, row.source_revision]);
          await client.query("UPDATE app.sandbox_sessions SET status='submitted',report=$2::jsonb,updated_at=now() WHERE id=$1 AND report IS NULL", [job.session_id, JSON.stringify(report)]);
        });
      } else await this.pool.query("UPDATE app.sandbox_sessions SET status='error',failure_code='WORKER_RETRIES_EXHAUSTED',updated_at=now() WHERE id=$1", [job.session_id]);
    }
  }

  private async owned(userId: string, id: string): Promise<SessionRow> {
    const result = await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2", [id, userId]);
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }
  private present(row: SessionRow) {
    const legacy = row.challenge_version !== challengeVersion && row.status !== "submitted";
    return { id: row.id, challengeSlug, challengeVersion: row.challenge_version, status: legacy ? "error" : row.status, expiresAt: row.expires_at,
      promptCount: row.prompt_count, promptsRemaining: 5 - row.prompt_count, visibleRunsRemaining: 10 - row.visible_run_count,
      currentSha256: row.current_sha256, createdAt: row.created_at, failureCode: legacy ? "CHALLENGE_VERSION_RETIRED" : row.failure_code };
  }
  private async enqueue(client: PoolClient, sessionId: string, kind: JobRow["kind"], requestId: string, payload: Record<string, unknown> = {}) {
    await client.query("INSERT INTO app.sandbox_jobs(id,session_id,kind,request_id,payload,status) VALUES ($1,$2,$3,$4,$5::jsonb,'queued')",
      [randomUUID(), sessionId, kind, requestId, JSON.stringify(payload)]);
  }

  async create(userId: string, clientRequestId: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(7331001)");
      const prior = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE user_id=$1 AND client_request_id=$2", [userId, clientRequestId]);
      if (prior.rows[0]) return { row: prior.rows[0], created: false };
      await client.query("UPDATE app.sandbox_sessions SET status='expired',updated_at=now() WHERE user_id=$1 AND challenge_version=1 " +
        "AND status IN ('creating','ready','processing','freezing','grading')", [userId]);
      const active = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM app.sandbox_sessions " +
        "WHERE status IN ('creating','ready','processing','freezing','grading') AND expires_at>now()");
      if (Number(active.rows[0]?.count) >= this.config.SANDBOX_MAX_ACTIVE) throw new ApiError(429, "SANDBOX_CAPACITY", "All sandbox slots are occupied.", undefined, true);
      const own = await client.query("SELECT 1 FROM app.sandbox_sessions WHERE user_id=$1 AND status IN ('creating','ready','processing','freezing','grading') AND expires_at>now()", [userId]);
      if (own.rowCount) throw new ApiError(409, "ACTIVE_SESSION_EXISTS", "You already have an active sandbox session.");
      const id = randomUUID();
      const inserted = await client.query<SessionRow>("INSERT INTO app.sandbox_sessions " +
        "(id,user_id,client_request_id,challenge_version,status,starter_source,current_source,current_sha256,expires_at) " +
        "VALUES ($1,$2,$3,2,'creating',$4,$4,$5,now()+($6::integer * interval '1 second')) RETURNING *",
        [id, userId, clientRequestId, starterSource, starterSha256, this.config.SANDBOX_SESSION_TTL_SECONDS]);
      await this.enqueue(client, id, "create", clientRequestId);
      return { row: inserted.rows[0]!, created: true };
    });
    if (result.created) this.wake();
    return { session: this.present(result.row), created: result.created };
  }
  private async executeCreate(job: JobRow) {
    const row = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
    if (!row || row.status !== "creating") throw new Error("Session is no longer awaiting sandbox creation.");
    const ttl = Math.max(120, Math.ceil((row.expires_at.getTime() - Date.now()) / 1_000));
    const sandboxId = await this.provider.create(ttl, row.id);
    const stored = await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) return false;
      const updated = await client.query("UPDATE app.sandbox_sessions SET sandbox_id=$2,status='ready',failure_code=NULL,updated_at=now() WHERE id=$1 AND status='creating'", [row.id, sandboxId]);
      if (!updated.rowCount) return false;
      await this.completeJob(client, job);
      return true;
    });
    if (!stored) await this.provider.kill(sandboxId).catch(() => false);
  }

  async get(userId: string, id: string) {
    const row = await this.owned(userId, id);
    const [turns, runs] = await Promise.all([
      this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [id]),
      this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [id]),
    ]);
    return { ...this.present(row), turns: turns.rows.map(item => this.presentTurn(item)), visibleTests: runs.rows.map(item => this.presentRun(item)) };
  }
  private async reconcileSource(session: SessionRow, source: string, job?: JobRow) {
    validateSource(source);
    const hash = hashSource(source);
    return transaction(this.pool, async client => {
      if (job) {
        const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
        if (!claim.rowCount) throw new Error("Sandbox job lease was lost during source reconciliation.");
      }
      const current = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [session.id]);
      const row = current.rows[0];
      if (!row || !["ready", "processing", "freezing", "grading"].includes(row.status)) throw busy();
      const changed = row.current_sha256 !== hash;
      await client.query("UPDATE app.sandbox_sessions SET current_source=$2,current_sha256=$3," +
        "source_revision=source_revision+CASE WHEN $4 THEN 1 ELSE 0 END,updated_at=now() WHERE id=$1", [row.id, source, hash, changed]);
      return { source, sourceHash: hash, revision: Number(row.source_revision) + (changed ? 1 : 0), changed };
    });
  }
  async files(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.challenge_version === 1) {
      const source = row.status === "submitted" ? row.submitted_source ?? row.current_source : row.current_source;
      return { files: [{ path: editablePath, editable: false, content: source, changed: hashSource(source) !== hashSource(row.starter_source) }],
        starterSource: row.starter_source, currentSha256: row.status === "submitted" ? row.submitted_sha256 : row.current_sha256 };
    }
    if (row.status === "submitted") {
      const source = row.submitted_source ?? "";
      return { files: listedFiles.map(path => ({ path, editable: path === editablePath, content: path === editablePath ? source : projectFiles[path]!,
        changed: path === editablePath && row.submitted_sha256 !== starterSha256 })), starterSource: row.starter_source, currentSha256: row.submitted_sha256 };
    }
    if (!row.sandbox_id || !["ready", "processing", "freezing", "grading"].includes(row.status)) throw busy();
    const files = [];
    for (const path of listedFiles) files.push({ path, editable: path === editablePath, content: await this.provider.readFile(row.sandbox_id, path),
      changed: path === editablePath && row.current_sha256 !== starterSha256 });
    const source = files.find(file => file.path === editablePath)!.content;
    const reconciled = await this.reconcileSource(row, source);
    return { files, starterSource: row.starter_source, currentSha256: reconciled.sourceHash };
  }
  private presentTurn(turn: TurnRow) { return { id: turn.id, ordinal: turn.ordinal, prompt: turn.prompt, status: turn.status, response: turn.response,
    model: turn.model, toolEvents: turn.tool_events, sourceSha256: turn.source_sha256, failureCode: turn.failure_code, createdAt: turn.created_at }; }
  private presentRun(run: RunRow) { return { id: run.id, kind: run.kind, status: run.status, sourceSha256: run.source_sha256,
    observation: run.observation, createdAt: run.created_at, completedAt: run.completed_at }; }

  async acceptTurn(userId: string, id: string, clientRequestId: string, prompt: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      const found = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
      const row = found.rows[0]; if (!row) throw notFound();
      if (row.challenge_version !== challengeVersion) throw new ApiError(409, "CHALLENGE_VERSION_RETIRED", "This saved session uses an older challenge version.");
      const duplicate = await client.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 AND client_request_id=$2", [id, clientRequestId]);
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].prompt_fingerprint !== hashPrompt(prompt)) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Request ID was used with a different prompt.");
        return { turn: duplicate.rows[0], accepted: false };
      }
      if (row.status !== "ready") throw busy();
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.prompt_count >= 5) throw new ApiError(409, "PROMPT_LIMIT_REACHED", "All five prompts were used.");
      const turnId = randomUUID();
      const turn = await client.query<TurnRow>("INSERT INTO app.sandbox_turns " +
        "(id,session_id,client_request_id,prompt_fingerprint,ordinal,prompt,status,model) VALUES ($1,$2,$3,$4,$5,$6,'processing',$7) RETURNING *",
        [turnId, id, clientRequestId, hashPrompt(prompt), row.prompt_count + 1, prompt, this.config.SANDBOX_AGENT_MODEL ?? "unconfigured"]);
      await client.query("UPDATE app.sandbox_sessions SET prompt_count=prompt_count+1,status='processing',failure_code=NULL,updated_at=now() WHERE id=$1", [id]);
      await this.enqueue(client, id, "turn", turnId, { turnId, baseSha256: row.current_sha256, toolRunId: randomUUID() });
      return { turn: turn.rows[0]!, accepted: true };
    });
    if (result.accepted) this.wake();
    return { turn: this.presentTurn(result.turn), accepted: result.accepted };
  }
  private async executeTurn(job: JobRow) {
    const session = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
    const turn = (await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE id=$1", [job.request_id])).rows[0];
    if (!session?.sandbox_id || !turn || turn.status !== "processing" || !this.agent || session.status !== "processing") throw new Error("Turn is no longer runnable.");
    const reconciled = await this.reconcileSource(session, await this.provider.readFile(session.sandbox_id, editablePath), job);
    const hasEffect = turn.tool_events.some(event => ["write_file", "run_visible_tests"].includes(event.name));
    if (job.attempts > 1 && (hasEffect || reconciled.sourceHash !== String(job.payload.baseSha256 ?? ""))) {
      await this.finishInterruptedTurn(job, turn, reconciled.sourceHash);
      return;
    }
    const prior = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 AND ordinal<$2 AND status='completed' ORDER BY ordinal", [job.session_id, turn.ordinal]);
    const outcome = await this.agent.run({ prompt: turn.prompt, history: prior.rows.map(item => ({ prompt: item.prompt, response: item.response ?? "" })),
      sandboxId: session.sandbox_id, provider: this.provider,
      runTests: () => this.runVisibleForAgent(job, session.sandbox_id!, String(job.payload.toolRunId)),
      onEvent: (event, source) => this.recordToolEvent(job, turn.id, session.sandbox_id!, event, source) });
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost before assistant response persistence.");
      const current = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [job.session_id]);
      if (!current.rows[0] || current.rows[0].status !== "processing") throw busy();
      await client.query("UPDATE app.sandbox_turns SET status='completed',response=$2,model=$3,source_sha256=$4,updated_at=now() WHERE id=$1 AND status='processing'",
        [turn.id, outcome.response.slice(0, 6_000), outcome.model, current.rows[0].current_sha256]);
      await client.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id]);
      await this.completeJob(client, job);
    });
  }
  private async finishInterruptedTurn(job: JobRow, turn: TurnRow, sourceHash: string) {
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost while recovering a turn.");
      const event: ToolEvent = { name: "source_reconciled", arguments: {}, result: { sourceSha256: sourceHash }, at: new Date().toISOString() };
      const hasEvent = turn.tool_events.some(item => item.name === "source_reconciled");
      await client.query("UPDATE app.sandbox_turns SET status='error',failure_code='WORKER_INTERRUPTED_AFTER_TOOL'," +
        "tool_events=CASE WHEN $2 THEN tool_events ELSE tool_events || $3::jsonb END,updated_at=now() WHERE id=$1 AND status='processing'",
        [turn.id, hasEvent, JSON.stringify([event])]);
      await client.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END," +
        "failure_code='WORKER_INTERRUPTED_AFTER_TOOL',updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id]);
      await this.completeJob(client, job);
    });
  }
  private async recordToolEvent(job: JobRow, turnId: string, sandboxId: string, event: ToolEvent, source?: string) {
    let actual: string | undefined;
    if (source !== undefined) {
      validateSource(source);
      actual = await this.provider.readFile(sandboxId, editablePath);
      validateSource(actual);
      if (actual !== source) throw new Error("Sandbox readback differed from the successful source write.");
    }
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost before the tool event was saved.");
      if (actual !== undefined) {
        const locked = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [job.session_id]);
        const row = locked.rows[0]; if (!row || row.status !== "processing") throw busy();
        const hash = hashSource(actual); const changed = hash !== row.current_sha256;
        await client.query("UPDATE app.sandbox_sessions SET current_source=$2,current_sha256=$3," +
          "source_revision=source_revision+CASE WHEN $4 THEN 1 ELSE 0 END,updated_at=now() WHERE id=$1", [job.session_id, actual, hash, changed]);
      }
      const saved = await client.query("UPDATE app.sandbox_turns SET tool_events=tool_events || $2::jsonb,updated_at=now() WHERE id=$1 AND status='processing'",
        [turnId, JSON.stringify([event])]);
      if (!saved.rowCount) throw new Error("Tool event no longer belongs to an active turn.");
    });
  }
  private async runVisibleForAgent(job: JobRow, sandboxId: string, runRequestId: string) {
    const session = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
    if (!session) throw notFound();
    const sourceInfo = await this.reconcileSource(session, await this.provider.readFile(sandboxId, editablePath), job);
    const existing = await this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND client_request_id=$2", [job.session_id, runRequestId]);
    if (existing.rows[0] && existing.rows[0].status !== "running") return existing.rows[0].observation!;
    const runId = existing.rows[0]?.id ?? randomUUID();
    if (!existing.rows[0]) {
      await transaction(this.pool, async client => {
        const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
        if (!claim.rowCount) throw new Error("Sandbox job lease was lost before visible tests started.");
        const locked = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [job.session_id]);
        if (!locked.rows[0] || locked.rows[0].status !== "processing") throw busy();
        if (locked.rows[0].visible_run_count >= 10) throw new ApiError(409, "TEST_LIMIT_REACHED", "Visible test limit reached.");
        await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,challenge_version," +
          "suite_sha256,implementation_sha256,source_revision) VALUES ($1,$2,$3,'visible','running',$4,2,$5,$4,$6)",
          [runId, job.session_id, runRequestId, sourceInfo.sourceHash, visibleSuiteSha256, sourceInfo.revision]);
        await client.query("UPDATE app.sandbox_sessions SET visible_run_count=visible_run_count+1,updated_at=now() WHERE id=$1", [job.session_id]);
      });
    } else {
      await this.pool.query("UPDATE app.sandbox_test_runs SET source_sha256=$2,implementation_sha256=$2,source_revision=$3 WHERE id=$1 AND status='running'",
        [runId, sourceInfo.sourceHash, sourceInfo.revision]);
    }
    let observation: TestObservation;
    try { observation = await this.provider.runVisibleTests(sandboxId, sourceInfo.sourceHash); }
    catch { observation = failedObservation("Visible test provider failed.", sourceInfo.sourceHash, visibleSuiteSha256); }
    const status = observation.timedOut ? "timeout" : observation.infrastructureFailure ? "infrastructure_error" : "completed";
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost before visible observations were saved.");
      await client.query("UPDATE app.sandbox_test_runs SET status=$2,observation=$3::jsonb,suite_sha256=$4,implementation_sha256=$5," +
        "completed_at=now() WHERE id=$1 AND source_sha256=$5", [runId, status, JSON.stringify(observation), observation.suiteSha256, sourceInfo.sourceHash]);
    });
    return observation;
  }
  async visibleTests(userId: string, id: string, clientRequestId: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      const found = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
      const row = found.rows[0]; if (!row) throw notFound();
      if (row.challenge_version !== challengeVersion) throw new ApiError(409, "CHALLENGE_VERSION_RETIRED", "This saved session uses an older challenge version.");
      const existing = await client.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND client_request_id=$2", [id, clientRequestId]);
      if (existing.rows[0]) return { run: existing.rows[0], started: false };
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.status !== "ready" || !row.sandbox_id) throw busy();
      if (row.visible_run_count >= 10) throw new ApiError(409, "TEST_LIMIT_REACHED", "Visible test limit reached.");
      const runId = randomUUID();
      const run = await client.query<RunRow>("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256," +
        "challenge_version,suite_sha256,implementation_sha256,source_revision) VALUES ($1,$2,$3,'visible','running',$4,2,$5,$4,$6) RETURNING *",
        [runId, id, clientRequestId, row.current_sha256, visibleSuiteSha256, row.source_revision]);
      await client.query("UPDATE app.sandbox_sessions SET visible_run_count=visible_run_count+1,status='processing',failure_code=NULL,updated_at=now() WHERE id=$1", [id]);
      await this.enqueue(client, id, "visible", clientRequestId, { runId });
      return { run: run.rows[0]!, started: true };
    });
    if (result.started) this.wake();
    return { run: this.presentRun(result.run), started: result.started };
  }
  private async executeVisible(job: JobRow) {
    const session = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
    if (!session?.sandbox_id || session.status !== "processing") throw new Error("Visible test run is no longer runnable.");
    const sourceInfo = await this.reconcileSource(session, await this.provider.readFile(session.sandbox_id, editablePath), job);
    const runId = String(job.payload.runId);
    await this.pool.query("UPDATE app.sandbox_test_runs SET source_sha256=$2,implementation_sha256=$2,source_revision=$3 WHERE id=$1 AND status='running'",
      [runId, sourceInfo.sourceHash, sourceInfo.revision]);
    let observation: TestObservation;
    try { observation = await this.provider.runVisibleTests(session.sandbox_id, sourceInfo.sourceHash); }
    catch { observation = failedObservation("Visible test provider failed.", sourceInfo.sourceHash, visibleSuiteSha256); }
    const status = observation.timedOut ? "timeout" : observation.infrastructureFailure ? "infrastructure_error" : "completed";
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost before visible observations were saved.");
      await client.query("UPDATE app.sandbox_test_runs SET status=$2,observation=$3::jsonb,suite_sha256=$4,implementation_sha256=$5," +
        "completed_at=now() WHERE id=$1 AND status='running' AND source_sha256=$5",
        [runId, status, JSON.stringify(observation), observation.suiteSha256, sourceInfo.sourceHash]);
      await client.query("UPDATE app.sandbox_sessions SET status=CASE WHEN expires_at<=now() THEN 'expired' ELSE 'ready' END,updated_at=now() WHERE id=$1 AND status='processing'", [job.session_id]);
      await this.completeJob(client, job);
    });
  }
  async turn(userId: string, sessionId: string, turnId: string) {
    await this.owned(userId, sessionId);
    const result = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE id=$1 AND session_id=$2", [turnId, sessionId]);
    if (!result.rows[0]) throw notFound();
    return this.presentTurn(result.rows[0]);
  }

  async submit(userId: string, id: string, clientRequestId: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      const found = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
      const row = found.rows[0]; if (!row) throw notFound();
      if (row.challenge_version !== challengeVersion) throw new ApiError(409, "CHALLENGE_VERSION_RETIRED", "This saved session uses an older challenge version.");
      if (row.submit_request_id) {
        if (row.submit_request_id !== clientRequestId) throw new ApiError(409, "ALREADY_SUBMITTED", "This session was already submitted.");
        return { session: row, started: false };
      }
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.status !== "ready" || !row.sandbox_id) throw busy();
      const frozen = await client.query<SessionRow>("UPDATE app.sandbox_sessions SET status='freezing',submit_request_id=$2,updated_at=now() WHERE id=$1 RETURNING *", [id, clientRequestId]);
      await this.enqueue(client, id, "grade", clientRequestId);
      return { session: frozen.rows[0]!, started: true };
    });
    if (result.started) this.wake();
    return this.present(result.session);
  }
  private async executeGrade(job: JobRow) {
    const initial = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [job.session_id])).rows[0];
    if (!initial?.sandbox_id || !["freezing", "grading"].includes(initial.status)) throw new Error("Submission is no longer awaiting grading.");
    let frozen = initial;
    if (!initial.submitted_source || !initial.submitted_sha256) {
      const source = validateSource(await this.provider.readFile(initial.sandbox_id, editablePath));
      const sourceHash = hashSource(source);
      frozen = await transaction(this.pool, async client => {
        const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
        if (!claim.rowCount) throw new Error("Sandbox job lease was lost before source freeze.");
        const current = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [job.session_id]);
        if (!current.rows[0] || current.rows[0].status !== "freezing") throw busy();
        const changed = current.rows[0].current_sha256 !== sourceHash;
        const saved = await client.query<SessionRow>("UPDATE app.sandbox_sessions SET submitted_source=$2,submitted_sha256=$3,current_source=$2," +
          "current_sha256=$3,source_revision=source_revision+CASE WHEN $4 THEN 1 ELSE 0 END,status='grading',updated_at=now() " +
          "WHERE id=$1 AND status='freezing' RETURNING *", [job.session_id, source, sourceHash, changed]);
        return saved.rows[0]!;
      });
    }
    const source = frozen.submitted_source!;
    const grade = await this.provider.grade(source, this.config.SANDBOX_SESSION_TTL_SECONDS, `${frozen.id}-${job.id}-${job.attempts}`);
    if (grade.sourceHash !== frozen.submitted_sha256) throw new Error("Fresh grader hash differed from the frozen PostgreSQL source.");
    const state = grade.observation.timedOut ? "timeout" : grade.observation.infrastructureFailure ? "infrastructure_error" : "completed";
    const verdict = state !== "completed" || grade.observation.passed === null || grade.observation.failed === null
      ? state === "completed" ? "infrastructure_error" : state
      : grade.observation.exitCode === 0 && grade.observation.failed === 0 && grade.observation.passed === privateTestNames.length ? "correct" : "incorrect";
    const [turns, runs] = await Promise.all([
      this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [job.session_id]),
      this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [job.session_id]),
    ]);
    const report = { challengeSlug, challengeVersion, challengeReconstruction: "Approved source reconstruction; equivalence to missing v1 files is unverified.",
      verdict, submittedSource: source, starterSource, sourceHash: grade.sourceHash, starterHash: starterSha256,
      challengeSourceSha256, visibleSuiteSha256, privateSuiteSha256, packageLockSha256, sourceRevision: frozen.source_revision,
      promptCount: turns.rows.length, transcript: turns.rows.map(item => this.presentTurn(item)), visibleTests: runs.rows.map(item => this.presentRun(item)),
      hiddenTests: grade.observation, execution: { ...grade.environment, graderSandboxId: grade.sandboxId },
      limits: "A fresh E2B environment ran the reconstructed private suite against the frozen source. Test and source hashes are recorded; this cooperative runner cannot establish perfect VM isolation, hidden-test secrecy, authorship, or general engineering competence." };
    await transaction(this.pool, async client => {
      const claim = await client.query("SELECT 1 FROM app.sandbox_jobs WHERE id=$1 AND status='running' AND claim_token=$2 FOR UPDATE", [job.id, job.claim_token]);
      if (!claim.rowCount) throw new Error("Sandbox job lease was lost before report persistence.");
      await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,observation," +
        "challenge_version,suite_sha256,implementation_sha256,source_revision,completed_at) " +
        "VALUES ($1,$2,$3,'hidden',$4,$5,$6::jsonb,2,$7,$5,$8,now()) ON CONFLICT (session_id,client_request_id) DO NOTHING",
        [randomUUID(), job.session_id, job.request_id, state, grade.sourceHash, JSON.stringify(grade.observation), grade.observation.suiteSha256, frozen.source_revision]);
      await client.query("UPDATE app.sandbox_sessions SET status='submitted',report=$2::jsonb,updated_at=now() WHERE id=$1 AND status='grading' AND report IS NULL", [job.session_id, JSON.stringify(report)]);
      await this.completeJob(client, job);
    });
    await this.provider.kill(initial.sandbox_id).catch(() => false);
  }
  private infrastructureReport(session: SessionRow, reason: string, turns: TurnRow[] = [], runs: RunRow[] = []) {
    const source = session.submitted_source ?? session.current_source;
    const sourceHash = session.submitted_sha256 ?? session.current_sha256;
    const hiddenTests = failedObservation("No correctness verdict was produced because grading infrastructure failed.", sourceHash, privateSuiteSha256);
    return { challengeSlug, challengeVersion, challengeReconstruction: "Approved source reconstruction; equivalence to missing v1 files is unverified.",
      verdict: "infrastructure_error", submittedSource: source, starterSource, sourceHash, starterHash: starterSha256,
      challengeSourceSha256, visibleSuiteSha256, privateSuiteSha256, packageLockSha256, sourceRevision: session.source_revision,
      promptCount: session.prompt_count, transcript: turns.map(turn => this.presentTurn(turn)),
      visibleTests: runs.map(run => this.presentRun(run)), hiddenTests,
      execution: { provider: "e2b", sdk: "2.53.1", runner: "tsx@4.20.0", nodeVersion: "unknown", packageLockSha256,
        challengeSourceSha256, network: "grading setup failed", graderSandboxId: "unavailable" },
      infrastructureFailure: reason, limits: "No correctness verdict was produced because grading infrastructure failed." };
  }
  async report(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.status !== "submitted") throw new ApiError(409, "REPORT_NOT_READY", "The report is not ready yet.", undefined, true);
    return row.report;
  }
  async cleanup() {
    const result = await transaction(this.pool, async client => {
      const rows = await client.query<SessionRow>("UPDATE app.sandbox_sessions SET status='expired',failure_code='SESSION_EXPIRED',updated_at=now() " +
        "WHERE expires_at<=now() AND status IN ('creating','ready') RETURNING *");
      for (const row of rows.rows) {
        await client.query("UPDATE app.sandbox_jobs SET status='failed',claim_token=NULL,lease_until=NULL,failure_code='SESSION_EXPIRED'," +
          "completed_at=now(),updated_at=now() WHERE session_id=$1 AND status IN ('queued','running')", [row.id]);
        await client.query("UPDATE app.sandbox_turns SET status='error',failure_code='SESSION_EXPIRED',updated_at=now() WHERE session_id=$1 AND status='processing'", [row.id]);
        await client.query("UPDATE app.sandbox_test_runs SET status='infrastructure_error',observation=$2::jsonb,completed_at=now() WHERE session_id=$1 AND status='running'",
          [row.id, JSON.stringify(failedObservation("Session expired before the accepted operation started.", row.current_sha256, visibleSuiteSha256))]);
      }
      return rows.rows;
    });
    for (const row of result) if (row.sandbox_id) await this.provider.kill(row.sandbox_id).catch(() => false);
    return result.length;
  }
}
