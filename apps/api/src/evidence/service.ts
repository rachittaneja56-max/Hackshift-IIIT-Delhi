import type { Pool } from "pg";
import { notFound } from "../errors.js";

export class EvidenceService {
  constructor(private pool: Pool) {}
  async get(owner: string, id: string) {
    const row = (await this.pool.query(`SELECT d.snapshot FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
      JOIN app.attempts a ON a.id=e.attempt_id WHERE d.id=$1 AND a.user_id=$2`, [id, owner])).rows[0];
    if (!row) throw notFound();
    return { ...row.snapshot, feedbackStatus: "not_requested" };
  }
}
