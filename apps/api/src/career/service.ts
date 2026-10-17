import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  ArtifactSchema,
  CareerReviewDtoSchema,
  CreateCareerReviewSchema,
  EvaluationResultSchema,
  type CareerEvidenceRecord,
  type CareerResumeDraft,
  type CreateCareerReview,
} from "@trajectoryos/contracts";
import { ApiError, notFound } from "../errors.js";
import { sha256 } from "../db/hash.js";
import { transaction } from "../db/transaction.js";
import type { ApiConfig } from "../config.js";
import { configuredCareerProvider, type CareerAnalysisProvider } from "./provider.js";
import {
  CAREER_ANALYSIS_VERSION,
  CAREER_LIMITATIONS,
  ruleCareerAnalysis,
  validateCareerOutput,
  type CareerPromptEvidence,
  type CareerProviderInput,
} from "./output.js";

const GENERATION_LEASE_MS = 20000;

function iso(value: unknown) { return new Date(value as string | number | Date).toISOString(); }
function jsonObject(value: unknown): any { return typeof value === "string" ? JSON.parse(value) : value; }

async function evidenceRows(client: PoolClient, owner: string, evidenceIds: string[]) {
  const rows = await client.query(`SELECT d.id AS evidence_id,e.attempt_id,d.snapshot,d.created_at
    FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
    JOIN app.attempts a ON a.id=e.attempt_id
    WHERE d.id=ANY($1::uuid[]) AND a.user_id=$2`, [evidenceIds, owner]);
  if (rows.rowCount !== evidenceIds.length) throw notFound();
  const byId = new Map(rows.rows.map((row) => [row.evidence_id, row]));
  return evidenceIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw notFound();
    const snapshot = jsonObject(row.snapshot);
    const artifact = ArtifactSchema.parse(snapshot.artifact);
    const result = EvaluationResultSchema.parse(snapshot.result);
    if (!artifact.variantId) throw new Error("EVIDENCE_VARIANT_MISSING");
    const dto: CareerEvidenceRecord = {
      evidenceId: row.evidence_id,
      attemptId: row.attempt_id,
      variantId: artifact.variantId,
      createdAt: iso(row.created_at),
      provenance: {
        isSynthetic: snapshot.provenance.isSynthetic,
        runnerKind: snapshot.provenance.runnerKind,
        challenge: snapshot.provenance.challenge,
        manifestSha256: snapshot.provenance.manifestSha256,
        contentSha256: snapshot.provenance.contentSha256,
        artifactSha256: snapshot.provenance.artifactSha256,
        suiteVersion: snapshot.provenance.suiteVersion,
        suiteSha256: snapshot.provenance.suiteSha256,
        implementationSha256: snapshot.provenance.implementationSha256,
        appCommit: snapshot.provenance.appCommit,
        databaseVersion: snapshot.provenance.databaseVersion,
        runId: snapshot.provenance.runId,
        generation: snapshot.provenance.generation,
        startedAt: snapshot.provenance.startedAt,
        finishedAt: snapshot.provenance.finishedAt,
      },
      tests: result.tests.map((test) => ({ testId: test.id, status: test.status })),
      limitations: snapshot.limitations,
    };
    return {
      dto,
      prompt: {
        ...dto,
        tests: result.tests.map((test) => ({ testId: test.id, status: test.status, expected: test.expected, observed: test.observed })),
      } satisfies CareerPromptEvidence,
    };
  });
}

async function selectedEvidence(client: PoolClient, owner: string, reviewId: string) {
  const ids = await client.query(`SELECT evidence_id FROM app.career_review_evidence
    WHERE review_id=$1 ORDER BY position`, [reviewId]);
  if (!ids.rowCount) throw notFound();
  return evidenceRows(client, owner, ids.rows.map((row) => row.evidence_id));
}

function reviewDto(row: any, evidence: CareerEvidenceRecord[]) {
  const input = { ...jsonObject(row.input) };
  delete input.clientRequestId;
  return CareerReviewDtoSchema.parse({
    id: row.id,
    clientRequestId: row.client_request_id,
    status: row.status,
    input,
    evidence,
    analysisVersion: row.analysis_version,
    analysis: row.analysis ? jsonObject(row.analysis) : null,
    failureCode: row.failure_code,
    resumeDraft: row.resume_draft ? jsonObject(row.resume_draft) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function providerFailureCode(error: unknown, timedOut: boolean) {
  if (timedOut) return "CAREER_AI_TIMEOUT";
  if ((error as { message?: string })?.message === "CAREER_CONTEXT_TOO_LARGE") return "CAREER_CONTEXT_TOO_LARGE";
  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status <= 599) return `PROVIDER_HTTP_${status}`;
  return "CAREER_ANALYSIS_UNAVAILABLE";
}

function escapeMarkdown(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([`*_{}\[\]()#+.!|>])/g, "\\$1").replace(/\r?\n/g, " ");
}

function buildResume(input: CreateCareerReview, evidence: CareerEvidenceRecord[]): CareerResumeDraft {
  const claims: CareerResumeDraft["claims"] = [];
  const sections: string[] = [];
  const facts = input.candidateFacts?.items ?? [];
  if (facts.length) {
    sections.push("## Candidate-supplied facts (self-reported; unverified)");
    for (const fact of facts) {
      const claim = { text: fact.text, sourceLabel: "candidate_self_reported" as const, candidateFactIds: [fact.id], evidence: [] };
      claims.push(claim);
      sections.push(`- **Candidate self-report · ${fact.kind} · ${fact.id}:** ${escapeMarkdown(fact.text)}`);
    }
  }
  if (evidence.length) {
    sections.push("## Selected engineering test observations");
    for (const record of evidence) {
      const outcomes = record.tests.map((test) => `${test.testId}=${test.status}`).join(", ");
      const text = `The reviewed ${record.variantId} implementation recorded ${outcomes}. This describes the selected implementation's observed test behavior and does not show who authored or implemented it.`;
      const refs = [{ evidenceId: record.evidenceId, tests: record.tests, explanation: "Actual test outcomes copied from the immutable evidence record." }];
      claims.push({ text, sourceLabel: "observed_test_evidence", candidateFactIds: [], evidence: refs });
      sections.push(`- **Observed test evidence · ${record.evidenceId}:** ${escapeMarkdown(text)}`);
    }
  }
  if (!facts.length && !evidence.length) sections.push("No supported facts or engineering test observations were selected.");
  sections.push("\n*Editable draft. Candidate facts are unverified. Test results describe reviewed code and do not establish authorship, professional experience or qualification. Review every statement before use.*");
  return { source: "rules", markdown: sections.join("\n\n"), claims, needsReview: true, createdAt: new Date().toISOString() };
}

export class CareerReviewService {
  private provider: CareerAnalysisProvider | null;
  constructor(
    private pool: Pool,
    config: ApiConfig,
    provider?: CareerAnalysisProvider | null,
    private deadlineMs = 12000,
    private analysisVersion = CAREER_ANALYSIS_VERSION,
  ) {
    this.provider = provider === undefined ? configuredCareerProvider(config) : provider;
  }

  async get(owner: string, id: string) {
    return transaction(this.pool, async (client) => {
      let row = (await client.query("SELECT * FROM app.career_reviews WHERE id=$1 AND user_id=$2", [id, owner])).rows[0];
      if (!row) throw notFound();
      if (row.status === "generating" && row.deadline_at && new Date(row.deadline_at).getTime() < Date.now()) {
        await client.query(`UPDATE app.career_reviews SET status='unavailable',source=NULL,provider=NULL,model=NULL,
          analysis=NULL,failure_code='CAREER_GENERATION_EXPIRED',claim_token=NULL,deadline_at=NULL,updated_at=now()
          WHERE id=$1 AND status='generating'`, [id]);
        row = (await client.query("SELECT * FROM app.career_reviews WHERE id=$1 AND user_id=$2", [id, owner])).rows[0];
      }
      const selected = await selectedEvidence(client, owner, id);
      return reviewDto(row, selected.map((item) => item.dto));
    });
  }

  async create(owner: string, rawInput: CreateCareerReview) {
    const parsed = CreateCareerReviewSchema.parse(rawInput);
    const { clientRequestId, ...requestFields } = parsed;
    const input = { ...requestFields, candidateFacts: parsed.candidateFacts ?? null };
    const fingerprint = sha256({ analysisVersion: this.analysisVersion, input });
    const leaseMs = Math.max(GENERATION_LEASE_MS, this.deadlineMs + 3000);
    const decision = await transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`career:${owner}:${clientRequestId}`]);
      let row = (await client.query("SELECT * FROM app.career_reviews WHERE user_id=$1 AND client_request_id=$2 FOR UPDATE",
        [owner, clientRequestId])).rows[0];
      if (!row) {
        const selected = await evidenceRows(client, owner, input.evidenceIds);
        const id = randomUUID(), token = randomUUID();
        row = (await client.query(`INSERT INTO app.career_reviews(id,user_id,client_request_id,request_fingerprint,input,analysis_version,
            status,claim_token,deadline_at)
          VALUES ($1,$2,$3,$4,$5,$6,'generating',$7,now()+($8::int*interval '1 millisecond')) RETURNING *`,
          [id, owner, clientRequestId, fingerprint, input, this.analysisVersion, token, leaseMs])).rows[0];
        for (const [position, evidence] of selected.entries()) {
          await client.query("INSERT INTO app.career_review_evidence(review_id,evidence_id,position) VALUES ($1,$2,$3)",
            [id, evidence.dto.evidenceId, position]);
        }
        return { kind: "generate" as const, row, token, selected, created: true };
      }
      if (row.request_fingerprint !== fingerprint) {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This clientRequestId was already used with different career review inputs.");
      }
      if (["ready", "limited"].includes(row.status)) {
        const selected = await selectedEvidence(client, owner, row.id);
        return { kind: "return" as const, row, selected, statusCode: 200 };
      }
      if (row.status === "generating" && row.deadline_at && new Date(row.deadline_at).getTime() > Date.now()) {
        const selected = await selectedEvidence(client, owner, row.id);
        return { kind: "return" as const, row, selected, statusCode: 202 };
      }
      const selected = await selectedEvidence(client, owner, row.id);
      const token = randomUUID();
      row = (await client.query(`UPDATE app.career_reviews SET status='generating',source=NULL,provider=NULL,model=NULL,
        analysis=NULL,failure_code=NULL,claim_token=$2,deadline_at=now()+($3::int*interval '1 millisecond'),updated_at=now()
        WHERE id=$1 RETURNING *`, [row.id, token, leaseMs])).rows[0];
      return { kind: "generate" as const, row, token, selected, created: false };
    });

    if (decision.kind === "return") return { review: reviewDto(decision.row, decision.selected.map((item) => item.dto)), statusCode: decision.statusCode };
    await this.generate(decision.row, decision.token, decision.selected.map((item) => item.prompt));
    return { review: await this.get(owner, decision.row.id), statusCode: decision.created ? 201 : 200 };
  }

  private async generate(row: any, token: string, selected: CareerPromptEvidence[]) {
    const input = jsonObject(row.input) as CreateCareerReview;
    const providerInput: CareerProviderInput = {
      jobDescription: input.jobDescription,
      candidateFacts: input.candidateFacts ?? null,
      evidence: selected,
    };
    const serialized = JSON.stringify(providerInput);
    let status: "ready" | "limited" | "unavailable";
    let analysis: unknown = null;
    let source: "llm" | "rules" | null = null;
    let provider: string | null = null;
    let model: string | null = null;
    let failureCode: string | null = null;
    if (!this.provider) {
      status = "limited";
      source = "rules";
      analysis = ruleCareerAnalysis(providerInput);
    } else {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (serialized.length > 24000) throw new Error("CAREER_CONTEXT_TOO_LARGE");
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("CAREER_AI_TIMEOUT")); }, this.deadlineMs);
        });
        const response = await Promise.race([this.provider.analyze(providerInput, controller.signal), deadline]);
        analysis = validateCareerOutput(response.output, providerInput, "llm", response.provider, response.model);
        status = "ready";
        source = "llm";
        provider = response.provider;
        model = response.model;
      } catch (error) {
        status = "unavailable";
        failureCode = providerFailureCode(error, controller.signal.aborted || (error as { message?: string })?.message === "CAREER_AI_TIMEOUT");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    await transaction(this.pool, async (client) => {
      await client.query(`UPDATE app.career_reviews SET status=$1,source=$2,provider=$3,model=$4,analysis=$5,
        failure_code=$6,claim_token=NULL,deadline_at=NULL,updated_at=now()
        WHERE id=$7 AND status='generating' AND claim_token=$8 AND deadline_at>now()`,
        [status, source, provider, model, analysis, failureCode, row.id, token]);
    });
  }

  async resume(owner: string, id: string) {
    return transaction(this.pool, async (client) => {
      let row = (await client.query("SELECT * FROM app.career_reviews WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, owner])).rows[0];
      if (!row) throw notFound();
      if (row.status === "generating") throw new ApiError(409, "CAREER_REVIEW_NOT_READY", "Wait for the career review to finish before drafting a résumé.", undefined, true);
      if (!["ready", "limited"].includes(row.status)) throw new ApiError(409, "CAREER_REVIEW_UNAVAILABLE", "Retry the review before requesting a résumé draft.", undefined, true);
      if (!row.resume_draft) {
        const input = jsonObject(row.input) as CreateCareerReview;
        const selected = await selectedEvidence(client, owner, id);
        const draft = buildResume(input, selected.map((item) => item.dto));
        row = (await client.query(`UPDATE app.career_reviews SET resume_draft=$2,updated_at=now()
          WHERE id=$1 AND resume_draft IS NULL RETURNING *`, [id, draft])).rows[0];
      }
      const selected = await selectedEvidence(client, owner, id);
      return reviewDto(row, selected.map((item) => item.dto));
    });
  }
}
