import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { FeedbackDtoSchema, type EvaluationResult, type FeedbackDto } from "@trajectoryos/contracts";
import { EvidenceService } from "../evidence/service.js";
import { configuredProvider, type FeedbackProvider } from "./provider.js";
import { PROMPT_VERSION, ruleFeedback, unrequestedFeedback, validateFeedback, type FeedbackInput } from "./output.js";
import type { ApiConfig } from "../config.js";
import { challenge } from "../content/index.js";
import { ContentService } from "../content/service.js";

const FEATURE = "evidence_explanation";
function compact(value: any): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    if (Array.isArray(value.operations) && Array.isArray(value.ledger)) return { balances: value.balances,
      operationCount: value.operations.length, ledgerCount: value.ledger.length,
      incompleteOperations: value.operations.filter((op: any) => !op.response).length };
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["operationId", "operation_id", "backendPids", "durationMs"].includes(key)).map(([key, child]) => [key, compact(child)]));
  }
  return value;
}
export function feedbackInput(evidence: any, context = challenge): FeedbackInput {
  return { challenge: { title: context.title, requirementMarkdown: context.requirementMarkdown },
    rubric: ["Interpret actual request responses and persisted effects.", "Explain account-scoped replay, changed-payload rejection, concurrent writes and rollback.", "Separate test observations from human review of design and reasoning."],
    tests: evidence.result.tests.map((t: EvaluationResult["tests"][number]) => ({ id: t.id, status: t.status, expected: compact(t.expected), observed: compact(t.observed) })),
    limitations: evidence.limitations };
}
function dto(row: any): FeedbackDto {
  return FeedbackDtoSchema.parse({ status: row.status, source: row.source, provider: row.provider, model: row.model,
    promptVersion: row.prompt_version, output: row.output });
}
export class FeedbackService {
  private evidence: EvidenceService;
  private provider: FeedbackProvider | null;
  constructor(private pool: Pool, config: ApiConfig, provider?: FeedbackProvider | null,
    private deadlineMs = 12000, private promptVersion = PROMPT_VERSION) {
    this.evidence = new EvidenceService(pool); this.provider = provider === undefined ? configuredProvider(config) : provider;
  }
  async get(owner: string, evidenceId: string) {
    const evidence = await this.evidence.get(owner, evidenceId);
    await this.pool.query(`UPDATE app.ai_annotations SET status='unavailable',source='rules',provider=NULL,model=NULL,
      output=$4,claim_token=NULL,failure_code='GENERATION_EXPIRED',updated_at=now()
      WHERE evidence_id=$1 AND feature=$2 AND prompt_version=$3 AND status='generating' AND deadline_at<now()`,
      [evidenceId, FEATURE, this.promptVersion, ruleFeedback(evidence.result, "The feedback generation deadline expired.")]);
    const row = (await this.pool.query("SELECT * FROM app.ai_annotations WHERE evidence_id=$1 AND feature=$2 AND prompt_version=$3",
      [evidenceId, FEATURE, this.promptVersion])).rows[0];
    return row ? dto(row) : unrequestedFeedback();
  }
  async request(owner: string, evidenceId: string) {
    const evidence = await this.evidence.get(owner, evidenceId);
    const token = randomUUID();
    const inserted = await this.pool.query(`INSERT INTO app.ai_annotations(id,evidence_id,feature,prompt_version,status,claim_token,deadline_at)
      VALUES ($1,$2,$3,$4,'generating',$5,now()+($6::int*interval '1 millisecond')) ON CONFLICT DO NOTHING RETURNING id`,
      [randomUUID(), evidenceId, FEATURE, this.promptVersion, token, this.deadlineMs + 3000]);
    if (!inserted.rowCount) return this.get(owner, evidenceId);
    let output; let provider: string | null = null; let model: string | null = null;
    let source: "llm" | "rules" = "rules"; let usage: unknown = null; let failure: string | null = "AI_DISABLED";
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.provider) throw new Error("AI_DISABLED");
      const pinned = evidence.provenance.challenge;
      const context = await new ContentService(this.pool).challenge(pinned.slug, pinned.version);
      const input = feedbackInput(evidence, context);
      if (JSON.stringify(input).length > 14000) throw new Error("CONTEXT_TOO_LARGE");
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, this.deadlineMs); });
      const response = await Promise.race([this.provider.explain(input, controller.signal), deadline]);
      output = validateFeedback(response.output, evidence.result); provider = response.provider; model = response.model;
      usage = response.usage; source = "llm"; failure = null;
    } catch (error) {
      output = ruleFeedback(evidence.result, this.provider ? "The provider call or output validation did not complete successfully." : "AI is disabled in server configuration.");
      const status = (error as { status?: number })?.status;
      failure = controller.signal.aborted ? "AI_TIMEOUT" : !this.provider ? "AI_DISABLED" :
        typeof status === "number" && status >= 400 && status <= 599 ? `PROVIDER_HTTP_${status}` : "PROVIDER_OR_VALIDATION_FAILED";
    } finally { clearTimeout(timer); controller.abort(); }
    await this.pool.query(`UPDATE app.ai_annotations SET status='ready',source=$1,provider=$2,model=$3,output=$4,usage=$5,
      failure_code=$6,claim_token=NULL,updated_at=now() WHERE id=$7 AND status='generating' AND claim_token=$8 AND deadline_at>now()`,
      [source, provider, model, output, usage, failure, inserted.rows[0].id, token]);
    return this.get(owner, evidenceId);
  }
}
