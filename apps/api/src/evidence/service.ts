import type { Pool } from "pg";
import { notFound } from "../errors.js";
import { PROMPT_VERSION } from "../ai/output.js";

export class EvidenceService {
  constructor(private pool: Pool) {}
  async get(owner: string, id: string) {
    const row = (await this.pool.query(`SELECT d.snapshot,n.status AS feedback_status,n.deadline_at FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
      JOIN app.attempts a ON a.id=e.attempt_id LEFT JOIN app.ai_annotations n
      ON n.evidence_id=d.id AND n.feature='evidence_explanation' AND n.prompt_version=$3
      WHERE d.id=$1 AND a.user_id=$2`, [id, owner, PROMPT_VERSION])).rows[0];
    if (!row) throw notFound();
    const expired = row.feedback_status === "generating" && new Date(row.deadline_at).getTime() < Date.now();
    return { ...row.snapshot, feedbackStatus: expired ? "unavailable" : row.feedback_status ?? "not_requested" };
  }
}
