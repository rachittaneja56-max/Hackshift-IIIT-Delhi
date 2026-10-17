import { ApiErrorEnvelopeSchema, ApiMetaSchema, ArtifactSchema, AttemptDtoSchema, AttemptListDtoSchema, ChallengeDtoSchema, ChallengeVersionSchema, CourseListDtoSchema, EvaluationDtoSchema, EvaluationResultSchema, FeedbackDtoSchema, LessonDtoSchema, type ApiMeta, type Artifact } from '@trajectoryos/contracts';

export class ApiClientError extends Error {
  constructor(message: string, public status = 0, public code = 'NETWORK_ERROR', public requestId?: string, public retryAfter?: string, public details?: Record<string, unknown>, public retryable = false) { super(message); }
}
type Parser<T> = { parse: (value: unknown) => T };
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('Expected text.'); return value; }
const uuid = (value: unknown) => AttemptDtoSchema.shape.id.parse(value);
const timestamp = (value: unknown) => AttemptDtoSchema.shape.createdAt.parse(value);
export const EvidenceSchema = { parse(value: unknown) {
  const data = record(value), p = record(data.provenance);
  if (typeof p.isSynthetic !== 'boolean' || p.runnerKind !== 'approved_variant' || !Number.isInteger(p.generation) || Number(p.generation) < 1) throw new Error('Invalid provenance.');
  const provenance = { isSynthetic: p.isSynthetic, runnerKind: p.runnerKind, challenge: ChallengeVersionSchema.parse(p.challenge),
    manifestSha256: string(p.manifestSha256), contentSha256: string(p.contentSha256), artifactSha256: string(p.artifactSha256),
    suiteVersion: string(p.suiteVersion), suiteSha256: string(p.suiteSha256), implementationSha256: string(p.implementationSha256),
    appCommit: string(p.appCommit), databaseVersion: string(p.databaseVersion), runId: uuid(p.runId), generation: Number(p.generation),
    startedAt: p.startedAt === null ? null : timestamp(p.startedAt), finishedAt: timestamp(p.finishedAt) };
  if (!Array.isArray(data.limitations) || !data.limitations.every(v => typeof v === 'string')) throw new Error('Invalid limitations.');
  return { id: uuid(data.id), evaluationId: uuid(data.evaluationId), attemptId: uuid(data.attemptId), createdAt: timestamp(data.createdAt),
    artifact: ArtifactSchema.parse(data.artifact), provenance, result: EvaluationResultSchema.parse(data.result), limitations: data.limitations as string[],
    feedbackStatus: FeedbackDtoSchema.shape.status.parse(data.feedbackStatus) };
} };
export type Evidence = ReturnType<typeof EvidenceSchema.parse>;
export function apiOrigin(base: string) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/', '/api/v1', '/api/v1/'].includes(url.pathname)) throw new Error('VITE_API_BASE_URL must be an HTTP(S) API origin.');
  return `${url.origin}/api/v1`;
}
export class ApiClient {
  readonly base: string;
  private writeBlockedUntil = 0;
  constructor(base: string, private token: (fresh?: boolean) => Promise<string | null>, private metadata: (meta: ApiMeta) => void = () => {}, private transport: typeof fetch = fetch) { this.base = apiOrigin(base); }
  async request<T>(path: string, schema: Parser<T>, method = 'GET', body?: unknown): Promise<T> {
    if (method !== 'GET' && Date.now() < this.writeBlockedUntil) throw new ApiClientError('The server asked us to wait before another write.', 429, 'RATE_LIMITED', undefined, String(Math.ceil((this.writeBlockedUntil - Date.now()) / 1000)));
    for (let authTry = 0; authTry < 2; authTry++) {
      let token: string | null;
      try { token = await this.token(authTry > 0); } catch { throw new ApiClientError('Your session could not be refreshed. Sign in again.', 401, 'UNAUTHENTICATED'); }
      if (!token) throw new ApiClientError('Sign in to continue.', 401, 'UNAUTHENTICATED');
      let response: Response;
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
      try { response = await this.transport(this.base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, cache: 'no-store' }); }
      catch { throw new ApiClientError('The API could not be reached. Your local work is retained; check your connection and API origin.', 0, 'NETWORK_ERROR', undefined, undefined, undefined, true); }
      finally { clearTimeout(timer); }
      if (response.status === 401 && authTry === 0) continue;
      const requestId = response.headers.get('X-Request-ID') ?? undefined, retryAfter = response.headers.get('Retry-After') ?? undefined;
      let json: unknown;
      try { json = await response.json(); } catch { throw new ApiClientError('The API returned a non-JSON response.', response.status, 'INVALID_RESPONSE', requestId, retryAfter); }
      if (!response.ok) {
        if (response.status === 429) { const seconds = Number(retryAfter); const deadline = Number.isFinite(seconds) && seconds >= 0 ? Date.now() + seconds * 1000 : Date.parse(retryAfter ?? ''); this.writeBlockedUntil = Number.isFinite(deadline) ? Math.max(Date.now() + 1000, deadline) : Date.now() + 2000; }
        const parsed = ApiErrorEnvelopeSchema.safeParse(json);
        if (!parsed.success) throw new ApiClientError('The API returned an unrecognized error response.', response.status, 'INVALID_RESPONSE', requestId, retryAfter);
        this.metadata(parsed.data.meta);
        const { error, meta } = parsed.data;
        throw new ApiClientError(error.message, response.status, error.code, meta.requestId, retryAfter, error.details, error.retryable);
      }
      try {
        const envelope = record(json); const meta = ApiMetaSchema.parse(envelope.meta);
        if (Object.keys(envelope).some(k => !['data', 'meta'].includes(k)) || !('data' in envelope)) throw new Error();
        const result = schema.parse(envelope.data); this.metadata(meta); return result;
      } catch { throw new ApiClientError('The API response does not match contract v0.3. No success was assumed.', response.status, 'INVALID_RESPONSE', requestId); }
    }
    throw new ApiClientError('Your session has expired. Sign in again.', 401, 'UNAUTHENTICATED');
  }
  courses = () => this.request('/courses', CourseListDtoSchema);
  lesson = (slug: string, version: number) => this.request(`/lessons/${encodeURIComponent(slug)}/versions/${version}`, LessonDtoSchema);
  challenge = () => this.request('/challenges/retry-safe-credit/versions/1', ChallengeDtoSchema);
  create = (clientRequestId: string) => this.request('/attempts', AttemptDtoSchema, 'POST', { challengeSlug: 'retry-safe-credit', challengeVersion: 1, clientRequestId });
  history = (cursor?: string) => this.request(`/attempts?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, AttemptListDtoSchema);
  attempt = (id: string) => this.request(`/attempts/${encodeURIComponent(id)}`, AttemptDtoSchema);
  save = (id: string, expectedRevision: number, artifact: Artifact) => this.request(`/attempts/${id}/draft`, AttemptDtoSchema, 'PUT', { expectedRevision, artifact });
  submit = (id: string, expectedRevision: number) => this.request(`/attempts/${id}/submit`, EvaluationDtoSchema, 'POST', { expectedRevision });
  evaluation = (id: string) => this.request(`/evaluations/${encodeURIComponent(id)}`, EvaluationDtoSchema);
  retry = (id: string) => this.request(`/evaluations/${id}/retry`, EvaluationDtoSchema, 'POST', {});
  evidence = (id: string) => this.request(`/evidence/${encodeURIComponent(id)}`, EvidenceSchema);
  feedback = (id: string) => this.request(`/evidence/${id}/feedback`, FeedbackDtoSchema);
  requestFeedback = (id: string) => this.request(`/evidence/${id}/feedback`, FeedbackDtoSchema, 'POST', {});
}
