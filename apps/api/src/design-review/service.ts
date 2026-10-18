import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ArtifactSchema, DesignReviewDtoSchema, DesignReviewVersion, type DesignReviewDto } from '@trajectoryos/contracts';
import type { ApiConfig } from '../config.js';
import { notFound } from '../errors.js';
import { ContentService } from '../content/service.js';
import { extractDesign, type ExtractedDesign } from './scenes.js';
import { configuredDesignReviewProvider, type DesignReviewProvider } from './provider.js';
import { limitedDesignReview, validateDesignReview } from './output.js';

type EvidenceSnapshot = {
  evidenceId: string;
  artifactSha256: string;
  challenge: { slug: string; version: number };
  artifact: ReturnType<typeof ArtifactSchema.parse>;
  extracted: ExtractedDesign;
};

const MAX_REVIEW_INPUT_BYTES = 18_000;
const FAILURE_CODE = /^[A-Z0-9_]{1,64}$/;

function dto(snapshot: EvidenceSnapshot, row?: Record<string, any> | null): DesignReviewDto {
  if (!row) return DesignReviewDtoSchema.parse({
    id: null, evidenceId: snapshot.evidenceId, artifactSha256: snapshot.artifactSha256,
    reviewVersion: DesignReviewVersion, status: 'not_requested', source: null, provider: null, model: null,
    hld: null, lld: null, limitations: snapshot.extracted.limitations, failureCode: null, createdAt: null, updatedAt: null,
  });
  const content = row.output;
  return DesignReviewDtoSchema.parse({
    id: row.id, evidenceId: snapshot.evidenceId, artifactSha256: snapshot.artifactSha256,
    reviewVersion: row.review_version, status: row.status, source: row.source, provider: row.provider, model: row.model,
    hld: content?.hld ?? null, lld: content?.lld ?? null,
    limitations: content?.limitations ?? snapshot.extracted.limitations,
    failureCode: row.failure_code, createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? null,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? null,
  });
}

export class DesignReviewService {
  private provider: DesignReviewProvider | null;
  private content: ContentService;
  constructor(private pool: Pool, config: ApiConfig, provider?: DesignReviewProvider | null,
    private deadlineMs = 12_000, private reviewVersion = DesignReviewVersion) {
    this.provider = provider === undefined ? configuredDesignReviewProvider(config) : provider;
    this.content = new ContentService(pool);
  }

  private async evidence(owner: string, evidenceId: string): Promise<EvidenceSnapshot> {
    const row = (await this.pool.query<{ snapshot: unknown }>(`SELECT d.snapshot
      FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
      JOIN app.attempts a ON a.id=e.attempt_id
      WHERE d.id=$1 AND a.user_id=$2`, [evidenceId, owner])).rows[0];
    if (!row) throw notFound();
    const snapshot = row.snapshot as Record<string, any>;
    const artifact = ArtifactSchema.parse(snapshot?.artifact);
    const artifactSha256 = snapshot?.provenance?.artifactSha256;
    const challenge = snapshot?.provenance?.challenge;
    if (typeof artifactSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifactSha256) ||
      typeof challenge?.slug !== 'string' || !Number.isInteger(challenge.version) || challenge.version < 1) throw notFound();
    return { evidenceId, artifactSha256, challenge: { slug: challenge.slug, version: challenge.version }, artifact, extracted: extractDesign(artifact) };
  }

  private async current(snapshot: EvidenceSnapshot) {
    await this.pool.query(`UPDATE app.design_reviews SET status='unavailable',source=NULL,provider=NULL,model=NULL,
      output=NULL,claim_token=NULL,deadline_at=NULL,failure_code='GENERATION_EXPIRED',updated_at=now()
      WHERE evidence_id=$1 AND artifact_sha256=$2 AND review_version=$3 AND status='generating' AND deadline_at<now()`,
      [snapshot.evidenceId, snapshot.artifactSha256, this.reviewVersion]);
    return (await this.pool.query(`SELECT * FROM app.design_reviews
      WHERE evidence_id=$1 AND artifact_sha256=$2 AND review_version=$3`,
      [snapshot.evidenceId, snapshot.artifactSha256, this.reviewVersion])).rows[0] as Record<string, any> | undefined;
  }

  async get(owner: string, evidenceId: string) {
    const snapshot = await this.evidence(owner, evidenceId);
    return dto(snapshot, await this.current(snapshot));
  }

  async request(owner: string, evidenceId: string, retry = false) {
    const snapshot = await this.evidence(owner, evidenceId);
    let row = await this.current(snapshot);
    let token = randomUUID();
    let reviewId: string | undefined;
    if (!row) {
      const inserted = await this.pool.query<{ id: string }>(`INSERT INTO app.design_reviews
        (id,evidence_id,artifact_sha256,review_version,status,claim_token,deadline_at)
        VALUES ($1,$2,$3,$4,'generating',$5,now()+($6::int*interval '1 millisecond'))
        ON CONFLICT (evidence_id,artifact_sha256,review_version) DO NOTHING RETURNING id`,
        [randomUUID(), snapshot.evidenceId, snapshot.artifactSha256, this.reviewVersion, token, this.deadlineMs + 3000]);
      reviewId = inserted.rows[0]?.id;
      if (!reviewId) row = await this.current(snapshot);
    } else if (row.status === 'ready' || row.status === 'generating' || (row.status === 'limited' && (!retry || !row.failure_code))) {
      return dto(snapshot, row);
    } else if (retry && (row.status === 'unavailable' || (row.status === 'limited' && row.failure_code))) {
      token = randomUUID();
      const claimed = await this.pool.query<{ id: string }>(`UPDATE app.design_reviews SET status='generating',source=NULL,
        provider=NULL,model=NULL,output=NULL,failure_code=NULL,claim_token=$4,
        deadline_at=now()+($5::int*interval '1 millisecond'),updated_at=now()
        WHERE id=$1 AND evidence_id=$2 AND artifact_sha256=$3 AND status IN ('unavailable','limited')
        AND failure_code IS NOT NULL RETURNING id`,
        [row.id, snapshot.evidenceId, snapshot.artifactSha256, token, this.deadlineMs + 3000]);
      reviewId = claimed.rows[0]?.id;
      if (!reviewId) return this.get(owner, evidenceId);
    } else return dto(snapshot, row);

    if (!reviewId) return dto(snapshot, row);
    let source: 'llm' | 'rules' = 'rules';
    let providerName: string | null = null;
    let modelName: string | null = null;
    let failureCode: string | null = null;
    let output: unknown;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const rules = limitedDesignReview(snapshot.extracted);
      if (!this.provider) {
        output = rules;
        failureCode = 'AI_DISABLED';
      } else if (snapshot.extracted.hld.elements.length + snapshot.extracted.lld.elements.length === 0) {
        output = rules;
      } else {
        const challenge = await this.content.challenge(snapshot.challenge.slug, snapshot.challenge.version);
        const input = { challenge: { slug: challenge.slug, version: challenge.version, title: challenge.title,
          requirementMarkdown: challenge.requirementMarkdown }, design: snapshot.extracted };
        if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_REVIEW_INPUT_BYTES) {
          output = rules;
          failureCode = 'CONTEXT_TOO_LARGE';
        } else {
          const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('DESIGN_REVIEW_TIMEOUT')); }, this.deadlineMs);
          });
          const response = await Promise.race([this.provider.review(input, controller.signal), timeout]);
          output = validateDesignReview(response.output, snapshot.extracted);
          source = 'llm'; providerName = response.provider; modelName = response.model;
        }
      }
    } catch (error) {
      output = limitedDesignReview(snapshot.extracted);
      const status = (error as { status?: number })?.status;
      failureCode = controller.signal.aborted ? 'DESIGN_REVIEW_TIMEOUT' :
        typeof status === 'number' && status >= 400 && status <= 599 ? `PROVIDER_HTTP_${status}` : 'PROVIDER_OR_VALIDATION_FAILED';
    } finally {
      clearTimeout(timer); controller.abort();
    }
    const finalStatus = source === 'llm' ? 'ready' : 'limited';
    if (failureCode && !FAILURE_CODE.test(failureCode)) failureCode = 'PROVIDER_OR_VALIDATION_FAILED';
    await this.pool.query(`UPDATE app.design_reviews SET status=$1,source=$2,provider=$3,model=$4,output=$5::jsonb,
      failure_code=$6,claim_token=NULL,deadline_at=NULL,updated_at=now()
      WHERE id=$7 AND status='generating' AND claim_token=$8 AND deadline_at>now()`,
      [finalStatus, source, providerName, modelName, JSON.stringify(output), failureCode, reviewId, token]);
    return this.get(owner, evidenceId);
  }
}
