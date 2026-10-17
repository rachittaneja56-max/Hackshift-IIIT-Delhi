import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ApiConfig } from "../config.js";
import { ApiError, notFound } from "../errors.js";
import { transaction } from "../db/transaction.js";
import { SandboxAgent, type SandboxAgentLike, type ToolEvent } from "./agent.js";
import { challengeSlug, challengeVersion, editablePath, projectFiles, starterSource } from "./challenge/files.js";
import { E2BSandboxProvider, hashSource, validateSource, type SandboxProvider, type TestObservation } from "./provider.js";

type SessionRow = {
  id: string; user_id: string; status: string; sandbox_id: string | null;
  starter_source: string; current_source: string; current_sha256: string;
  prompt_count: number; visible_run_count: number; submit_request_id: string | null;
  submitted_source: string | null; submitted_sha256: string | null; report: unknown;
  failure_code: string | null; expires_at: Date; created_at: Date; updated_at: Date;
};
type TurnRow = { id: string; session_id: string; client_request_id: string; prompt_fingerprint: string; ordinal: number; prompt: string;
  status: string; model: string; response: string | null; tool_events: ToolEvent[]; source_sha256: string | null; failure_code: string | null; created_at: Date };
type RunRow = { id: string; session_id: string; client_request_id: string; kind: string; status: string; source_sha256: string;
  observation: TestObservation | null; created_at: Date; completed_at: Date | null };

const busy = () => new ApiError(409, "SESSION_BUSY", "Finish the current operation before starting another.", undefined, true);
const unavailable = () => new ApiError(503, "SANDBOX_UNAVAILABLE", "The AI debugging lab is unavailable.", undefined, true);
const hashPrompt = (prompt: string) => hashSource(prompt);

export class SandboxService {
  private provider: SandboxProvider;
  private agent: SandboxAgentLike | null;
  constructor(private pool: Pool, private config: ApiConfig, provider?: SandboxProvider, agent?: SandboxAgentLike) {
    this.provider = provider ?? new E2BSandboxProvider(config.E2B_API_KEY);
    this.agent = agent ?? (config.OPENAI_API_KEY && config.SANDBOX_AGENT_MODEL ? new SandboxAgent(config.OPENAI_API_KEY, config.SANDBOX_AGENT_MODEL) : null);
  }

  available() { return this.config.SANDBOX_ENABLED && !!this.config.E2B_API_KEY && !!this.agent; }
  requireAvailable() { if (!this.available()) throw unavailable(); }
  private async owned(userId: string, id: string): Promise<SessionRow> {
    const found = await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2", [id, userId]);
    if (!found.rows[0]) throw notFound();
    return found.rows[0];
  }
  private present(row: SessionRow) {
    return { id: row.id, challengeSlug, challengeVersion, status: row.status, expiresAt: row.expires_at,
      promptCount: row.prompt_count, promptsRemaining: 5 - row.prompt_count, visibleRunsRemaining: 10 - row.visible_run_count,
      currentSha256: row.current_sha256, createdAt: row.created_at, failureCode: row.failure_code };
  }
  private schedule(task: () => Promise<void>) {
    setImmediate(() => { void task().catch(error => {
      console.error("A sandbox background operation failed:", error instanceof Error ? error.name : "unknown", error && typeof error === "object" && "code" in error ? String(error.code) : "no_code");
    }); });
  }

  async create(userId: string, clientRequestId: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(7331001)");
      const prior = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE user_id=$1 AND client_request_id=$2", [userId, clientRequestId]);
      if (prior.rows[0]) return { row: prior.rows[0], created: false, expiredSandboxIds: [] as string[] };
      const expired = await client.query<{ sandbox_id: string | null }>("UPDATE app.sandbox_sessions SET status='expired',updated_at=now() WHERE user_id=$1 AND expires_at<=now() AND status IN ('creating','ready','processing','freezing') RETURNING sandbox_id", [userId]);
      const expiredSandboxIds = expired.rows.flatMap(row => row.sandbox_id ? [row.sandbox_id] : []);
      const active = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM app.sandbox_sessions WHERE status IN ('creating','ready','processing','freezing','grading') AND expires_at > now()");
      if (Number(active.rows[0]?.count) >= this.config.SANDBOX_MAX_ACTIVE) throw new ApiError(429, "SANDBOX_CAPACITY", "All sandbox slots are occupied.", undefined, true);
      const own = await client.query("SELECT 1 FROM app.sandbox_sessions WHERE user_id=$1 AND status IN ('creating','ready','processing','freezing','grading') AND expires_at > now()", [userId]);
      if (own.rowCount) throw new ApiError(409, "ACTIVE_SESSION_EXISTS", "You already have an active sandbox session.");
      const id = randomUUID();
      const row = await client.query<SessionRow>(`INSERT INTO app.sandbox_sessions
        (id,user_id,client_request_id,status,starter_source,current_source,current_sha256,expires_at)
        VALUES ($1,$2,$3,'creating',$4,$4,$5,now()+($6::integer * interval '1 second')) RETURNING *`,
        [id, userId, clientRequestId, starterSource, hashSource(starterSource), this.config.SANDBOX_SESSION_TTL_SECONDS]);
      return { row: row.rows[0]!, created: true, expiredSandboxIds };
    });
    for (const id of result.expiredSandboxIds) await this.provider.kill(id).catch(() => false);
    if (result.created) this.schedule(() => this.createRemote(result.row.id));
    return { session: this.present(result.row), created: result.created };
  }

  private async createRemote(id: string) {
    let sandboxId: string | undefined;
    try {
      sandboxId = await this.provider.create(this.config.SANDBOX_SESSION_TTL_SECONDS);
      const updated = await this.pool.query("UPDATE app.sandbox_sessions SET sandbox_id=$2,status='ready',updated_at=now() WHERE id=$1 AND status='creating' AND expires_at>now()", [id, sandboxId]);
      if (!updated.rowCount) await this.provider.kill(sandboxId);
    } catch {
      if (sandboxId) await this.provider.kill(sandboxId).catch(() => false);
      await this.pool.query("UPDATE app.sandbox_sessions SET status='error',failure_code='SANDBOX_CREATE_FAILED',updated_at=now() WHERE id=$1 AND status='creating'", [id]);
    }
  }

  async get(userId: string, id: string) {
    const row = await this.owned(userId, id);
    const turns = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [id]);
    const runs = await this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [id]);
    return { ...this.present(row), turns: turns.rows.map(turn => this.presentTurn(turn)), visibleTests: runs.rows.map(run => this.presentRun(run)) };
  }

  async files(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.status === "submitted") return { files: this.provider.listFiles().map(item => ({ ...item, content: item.path === editablePath ? row.submitted_source : projectFiles[item.path], changed: item.path === editablePath && row.submitted_sha256 !== hashSource(row.starter_source) })), starterSource: row.starter_source, currentSha256: row.submitted_sha256 };
    if (!row.sandbox_id || !["ready", "processing", "freezing", "grading", "submitted"].includes(row.status)) throw busy();
    const files = [];
    for (const item of this.provider.listFiles()) files.push({ ...item, content: await this.provider.readFile(row.sandbox_id, item.path), changed: item.path === editablePath && row.current_sha256 !== hashSource(row.starter_source) });
    return { files, starterSource: row.starter_source, currentSha256: row.current_sha256 };
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
      const duplicate = await client.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 AND client_request_id=$2", [id, clientRequestId]);
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].prompt_fingerprint !== hashPrompt(prompt)) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Request ID was used with a different prompt.");
        return { turn: duplicate.rows[0], accepted: false };
      }
      if (row.status !== "ready") throw busy();
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.prompt_count >= 5) throw new ApiError(409, "PROMPT_LIMIT_REACHED", "All five prompts were used.");
      const turn = await client.query<TurnRow>(`INSERT INTO app.sandbox_turns
        (id,session_id,client_request_id,prompt_fingerprint,ordinal,prompt,status,model)
        VALUES ($1,$2,$3,$4,$5,$6,'processing',$7) RETURNING *`,
        [randomUUID(), id, clientRequestId, hashPrompt(prompt), row.prompt_count + 1, prompt, this.config.SANDBOX_AGENT_MODEL]);
      await client.query("UPDATE app.sandbox_sessions SET prompt_count=prompt_count+1,status='processing',updated_at=now() WHERE id=$1", [id]);
      return { turn: turn.rows[0]!, accepted: true };
    });
    if (result.accepted) this.schedule(() => this.processTurn(id, result.turn.id));
    return { turn: this.presentTurn(result.turn), accepted: result.accepted };
  }

  private async processTurn(sessionId: string, turnId: string) {
    try {
      const session = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [sessionId])).rows[0]!;
      const turn = (await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE id=$1", [turnId])).rows[0]!;
      if (!session.sandbox_id || !this.agent || session.status !== "processing") throw new Error("Session is unavailable for model processing.");
      const prior = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 AND ordinal<$2 AND status='completed' ORDER BY ordinal", [sessionId, turn.ordinal]);
      const outcome = await this.agent.run({ prompt: turn.prompt, history: prior.rows.map(row => ({ prompt: row.prompt, response: row.response ?? "" })),
        sandboxId: session.sandbox_id, provider: this.provider,
        runTests: () => this.runVisibleForAgent(sessionId, turnId, session.sandbox_id!),
        onEvent: (event, source) => this.recordToolEvent(sessionId, turnId, event, source) });
      await transaction(this.pool, async client => {
        await client.query("UPDATE app.sandbox_turns SET status='completed',response=$2,source_sha256=(SELECT current_sha256 FROM app.sandbox_sessions WHERE id=$3),updated_at=now() WHERE id=$1 AND status='processing'", [turnId, outcome.response, sessionId]);
        await client.query("UPDATE app.sandbox_sessions SET status='ready',updated_at=now() WHERE id=$1 AND status='processing'", [sessionId]);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const failureCode = /deadline/i.test(message) ? "AGENT_DEADLINE" : /timeout/i.test(error instanceof Error ? error.name : "") ? "AGENT_TIMEOUT" : /token budget/i.test(message) ? "TOKEN_BUDGET" : /tool.*budget/i.test(message) ? "TOOL_BUDGET" : "MODEL_OR_TOOL_FAILED";
      console.error("Sandbox turn failed:", failureCode, error instanceof Error ? error.name : "unknown");
      await transaction(this.pool, async client => {
        await client.query("UPDATE app.sandbox_turns SET status='error',failure_code=$2,updated_at=now() WHERE id=$1 AND status='processing'", [turnId, failureCode]);
        await client.query("UPDATE app.sandbox_sessions SET status='ready',updated_at=now() WHERE id=$1 AND status='processing'", [sessionId]);
      });
    }
  }

  private async recordToolEvent(sessionId: string, turnId: string, event: ToolEvent, source?: string) {
    await transaction(this.pool, async client => {
      if (source !== undefined) {
        validateSource(source);
        const update = await client.query("UPDATE app.sandbox_sessions SET current_source=$2,current_sha256=$3,updated_at=now() WHERE id=$1 AND status='processing'", [sessionId, source, hashSource(source)]);
        if (!update.rowCount) throw busy();
      }
      await client.query("UPDATE app.sandbox_turns SET tool_events=tool_events || $2::jsonb,updated_at=now() WHERE id=$1", [turnId, JSON.stringify([event])]);
    });
  }

  private async runVisibleForAgent(sessionId: string, turnId: string, sandboxId: string) {
    const runId = randomUUID();
    await transaction(this.pool, async client => {
      const session = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 FOR UPDATE", [sessionId]);
      const row = session.rows[0]!;
      if (row.status !== "processing" || row.visible_run_count >= 10) throw new ApiError(409, "TEST_LIMIT_REACHED", "Visible test limit reached.");
      await client.query("UPDATE app.sandbox_sessions SET visible_run_count=visible_run_count+1,updated_at=now() WHERE id=$1", [sessionId]);
      await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256) VALUES ($1,$2,$3,'visible','running',$4)", [runId, sessionId, randomUUID(), row.current_sha256]);
    });
    const observation = await this.provider.runVisibleTests(sandboxId);
    await this.finishRun(runId, observation);
    return observation;
  }

  private async finishRun(id: string, observation: TestObservation) {
    const status = observation.timedOut ? "timeout" : observation.infrastructureFailure ? "infrastructure_error" : "completed";
    await this.pool.query("UPDATE app.sandbox_test_runs SET status=$2,observation=$3::jsonb,completed_at=now() WHERE id=$1", [id, status, JSON.stringify(observation)]);
  }

  async visibleTests(userId: string, id: string, clientRequestId: string) {
    this.requireAvailable();
    const result = await transaction(this.pool, async client => {
      const found = await client.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, userId]);
      const row = found.rows[0]; if (!row) throw notFound();
      const existing = await client.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND client_request_id=$2", [id, clientRequestId]);
      if (existing.rows[0]) return { run: existing.rows[0], started: false };
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.status !== "ready" || !row.sandbox_id) throw busy();
      if (row.visible_run_count >= 10) throw new ApiError(409, "TEST_LIMIT_REACHED", "Visible test limit reached.");
      const run = await client.query<RunRow>("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256) VALUES ($1,$2,$3,'visible','running',$4) RETURNING *", [randomUUID(), id, clientRequestId, row.current_sha256]);
      await client.query("UPDATE app.sandbox_sessions SET visible_run_count=visible_run_count+1,status='processing',updated_at=now() WHERE id=$1", [id]);
      return { run: run.rows[0]!, started: true, sandboxId: row.sandbox_id };
    });
    if (result.started) this.schedule(async () => {
      const observation = await this.provider.runVisibleTests(result.sandboxId!);
      await this.finishRun(result.run.id, observation);
      await this.pool.query("UPDATE app.sandbox_sessions SET status='ready',updated_at=now() WHERE id=$1 AND status='processing'", [id]);
    });
    return { run: this.presentRun(result.run), started: result.started };
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
      if (row.submit_request_id) {
        if (row.submit_request_id !== clientRequestId) throw new ApiError(409, "ALREADY_SUBMITTED", "This session was already submitted.");
        return { session: row, started: false };
      }
      if (row.expires_at <= new Date()) throw new ApiError(410, "SESSION_EXPIRED", "The session expired.");
      if (row.status !== "ready" || !row.sandbox_id) throw busy();
      const frozen = await client.query<SessionRow>("UPDATE app.sandbox_sessions SET status='freezing',submit_request_id=$2,updated_at=now() WHERE id=$1 RETURNING *", [id, clientRequestId]);
      return { session: frozen.rows[0]!, started: true };
    });
    if (result.started) this.schedule(() => this.freezeAndGrade(id, result.session.sandbox_id!));
    return this.present(result.session);
  }

  private async freezeAndGrade(id: string, sandboxId: string) {
    try {
      const source = await this.provider.readFile(sandboxId, editablePath);
      validateSource(source);
      const sourceHash = hashSource(source);
      await this.pool.query("UPDATE app.sandbox_sessions SET submitted_source=$2,submitted_sha256=$3,current_source=$2,current_sha256=$3,status='grading',updated_at=now() WHERE id=$1 AND status='freezing'", [id, source, sourceHash]);
      const grade = await this.provider.grade(source, this.config.SANDBOX_SESSION_TTL_SECONDS);
      const turns = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [id]);
      const runs = await this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [id]);
      const hiddenStatus = grade.observation.timedOut ? "timeout" : grade.observation.infrastructureFailure ? "infrastructure_error" : "completed";
      const verdict = hiddenStatus === "completed" ? (grade.observation.exitCode === 0 ? "correct" : "incorrect") : hiddenStatus;
      const report = { challengeSlug, challengeVersion, verdict, submittedSource: source, starterSource, sourceHash, starterHash: hashSource(starterSource),
        promptCount: turns.rows.length, transcript: turns.rows.map(row => this.presentTurn(row)), visibleTests: runs.rows.map(row => this.presentRun(row)),
        hiddenTests: grade.observation, execution: { ...grade.environment, graderSandboxId: grade.sandboxId },
        limits: "Tests assess this rate-limiter contract on reviewed cases, not general engineering competence or authorship." };
      await transaction(this.pool, async client => {
        await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,observation,completed_at) VALUES ($1,$2,$3,'hidden',$4,$5,$6::jsonb,now())", [randomUUID(), id, randomUUID(), hiddenStatus, sourceHash, JSON.stringify(grade.observation)]);
        await client.query("UPDATE app.sandbox_sessions SET status='submitted',report=$2::jsonb,updated_at=now() WHERE id=$1 AND status='grading'", [id, JSON.stringify(report)]);
      });
    } catch {
      const row = (await this.pool.query<SessionRow>("SELECT * FROM app.sandbox_sessions WHERE id=$1", [id])).rows[0];
      if (row?.status === "grading" && row.submitted_source && row.submitted_sha256) {
        const turns = await this.pool.query<TurnRow>("SELECT * FROM app.sandbox_turns WHERE session_id=$1 ORDER BY ordinal", [id]);
        const runs = await this.pool.query<RunRow>("SELECT * FROM app.sandbox_test_runs WHERE session_id=$1 AND kind='visible' ORDER BY created_at", [id]);
        const observation: TestObservation = { exitCode: null, stdout: "", stderr: "", durationMs: 0, passed: null, failed: null, infrastructureFailure: "Fresh grading sandbox failed." };
        const report = { challengeSlug, challengeVersion, verdict: "infrastructure_error", submittedSource: row.submitted_source,
          starterSource, sourceHash: row.submitted_sha256, starterHash: hashSource(starterSource), promptCount: turns.rows.length,
          transcript: turns.rows.map(turn => this.presentTurn(turn)), visibleTests: runs.rows.map(run => this.presentRun(run)), hiddenTests: observation,
          execution: { provider: "e2b", sdk: "2.56.0", runner: "tsx@4.20.0", network: "grading setup failed", graderSandboxId: "unavailable" },
          limits: "No correctness verdict was produced because grading infrastructure failed." };
        await transaction(this.pool, async client => {
          await client.query("INSERT INTO app.sandbox_test_runs(id,session_id,client_request_id,kind,status,source_sha256,observation,completed_at) VALUES ($1,$2,$3,'hidden','infrastructure_error',$4,$5::jsonb,now())", [randomUUID(), id, randomUUID(), row.submitted_sha256, JSON.stringify(observation)]);
          await client.query("UPDATE app.sandbox_sessions SET status='submitted',report=$2::jsonb,updated_at=now() WHERE id=$1 AND status='grading'", [id, JSON.stringify(report)]);
        });
      } else {
        await this.pool.query("UPDATE app.sandbox_sessions SET status='error',failure_code='SUBMISSION_FREEZE_FAILED',updated_at=now() WHERE id=$1 AND status='freezing'", [id]);
      }
    } finally {
      await this.provider.kill(sandboxId).catch(() => false);
    }
  }

  async report(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.status !== "submitted") throw new ApiError(409, "REPORT_NOT_READY", "The report is not ready yet.", undefined, true);
    return row.report;
  }

  async cleanup() {
    const expired = await this.pool.query<SessionRow>(`UPDATE app.sandbox_sessions SET status='expired',updated_at=now()
      WHERE expires_at<=now() AND status IN ('creating','ready','processing','freezing') RETURNING *`);
    const stale = await this.pool.query<SessionRow>(`UPDATE app.sandbox_sessions SET status='error',failure_code='WORKER_INTERRUPTED',updated_at=now()
      WHERE updated_at < now()-interval '5 minutes' AND status IN ('creating','processing','freezing','grading') RETURNING *`);
    const rows = [...expired.rows, ...stale.rows];
    for (const row of rows) {
      await this.pool.query("UPDATE app.sandbox_turns SET status='error',failure_code='WORKER_INTERRUPTED',updated_at=now() WHERE session_id=$1 AND status='processing'", [row.id]);
      await this.pool.query("UPDATE app.sandbox_test_runs SET status='infrastructure_error',observation=$2::jsonb,completed_at=now() WHERE session_id=$1 AND status='running'", [row.id, JSON.stringify({ exitCode: null, stdout: "", stderr: "", durationMs: 0, passed: null, failed: null, infrastructureFailure: "Worker was interrupted." })]);
    }
    for (const row of rows) if (row.sandbox_id) await this.provider.kill(row.sandbox_id).catch(() => false);
    return rows.length;
  }
}