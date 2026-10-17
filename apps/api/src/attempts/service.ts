import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AttemptDtoSchema, type Artifact, type CreateAttempt, type SaveDraft, type AttemptDto } from "@trajectoryos/contracts";
import type { Pool } from "pg";
import { ApiError, notFound } from "../errors.js";
import { validateScenes } from "./scenes.js";

export const emptyArtifact: Artifact = { hld: null, lld: null,
  decisions: { keyScope: null, atomicity: null, payloadConflict: null },
  variantId: null, aiCritique: null, repairJustification: null };
export const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
export function attemptDto(row: any): AttemptDto {
  return AttemptDtoSchema.parse({ id: row.id, challenge: { slug: row.challenge_slug, version: row.challenge_version },
    status: row.status, revision: row.revision, artifact: row.artifact, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    submittedAt: iso(row.submitted_at), evaluationId: row.evaluation_id, evidenceId: row.evidence_id });
}

const cursorSchema = z.object({ time: z.string().datetime(), id: z.string().uuid() }).strict();
export const historyQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional() }).strict();

export class AttemptService {
  constructor(private pool: Pool) {}
  async create(owner: string, input: CreateAttempt) {
    const inserted = await this.pool.query(`INSERT INTO app.attempts
      (id,user_id,challenge_slug,challenge_version,client_request_id,artifact) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id,client_request_id) DO NOTHING RETURNING *`,
      [randomUUID(), owner, input.challengeSlug, input.challengeVersion, input.clientRequestId, emptyArtifact]);
    const row = inserted.rows[0] ?? (await this.pool.query("SELECT * FROM app.attempts WHERE user_id=$1 AND client_request_id=$2", [owner, input.clientRequestId])).rows[0];
    if (row.challenge_slug !== input.challengeSlug || row.challenge_version !== input.challengeVersion)
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This creation key already identifies a different challenge.");
    return { created: !!inserted.rowCount, attempt: attemptDto(row) };
  }
  async get(owner: string, id: string) {
    const row = (await this.pool.query("SELECT * FROM app.attempts WHERE id=$1 AND user_id=$2", [id, owner])).rows[0];
    if (!row) throw notFound();
    return attemptDto(row);
  }
  async save(owner: string, id: string, input: SaveDraft) {
    validateScenes(input.artifact);
    const updated = await this.pool.query(`UPDATE app.attempts SET artifact=$1,revision=revision+1,updated_at=now()
      WHERE id=$2 AND user_id=$3 AND status='draft' AND revision=$4 RETURNING *`,
      [input.artifact, id, owner, input.expectedRevision]);
    if (updated.rowCount) return attemptDto(updated.rows[0]);
    const current = await this.get(owner, id);
    if (current.status !== "draft") throw new ApiError(409, "ATTEMPT_LOCKED", "Submitted attempts are immutable.");
    throw new ApiError(409, "REVISION_CONFLICT", "Reload the saved draft before editing.", { currentRevision: current.revision });
  }
  async history(owner: string, query: z.infer<typeof historyQuerySchema>) {
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (query.cursor) {
      try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); }
      catch { throw new ApiError(422, "VALIDATION_FAILED", "Invalid history cursor."); }
    }
    const rows = (await this.pool.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM app.attempts WHERE user_id=$1
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $4`, [owner, cursor?.time ?? null, cursor?.id ?? null, query.limit + 1])).rows;
    const page = rows.slice(0, query.limit).map(attemptDto);
    const last = page.at(-1);
    return { items: page.map(({ id, challenge, status, createdAt, submittedAt, evidenceId }) => ({ id, challenge, status, createdAt, submittedAt, evidenceId })),
      nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ time: rows[query.limit - 1].cursor_time, id: last.id })).toString("base64url") : null };
  }
}
