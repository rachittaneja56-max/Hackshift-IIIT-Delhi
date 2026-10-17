import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { createDatabasePool } from "../db/pool.js";
import { readApiConfig } from "../config.js";
import { FeedbackService } from "./service.js";
import { PROMPT_VERSION } from "./output.js";

const evidenceId = z.string().uuid().parse(process.argv[2]);
const config = readApiConfig();
const pool = createDatabasePool(config.DATABASE_URL);
if (!pool) throw new Error("DATABASE_URL is required.");
try {
  const owned = (await pool.query(`SELECT a.user_id FROM app.evidence d JOIN app.evaluations e ON e.id=d.evaluation_id
    JOIN app.attempts a ON a.id=e.attempt_id JOIN app.users u ON u.id=a.user_id
    WHERE d.id=$1 AND u.clerk_user_id LIKE 'integration_%'`, [evidenceId])).rows[0];
  if (!owned) throw new Error("Use a generated integration evidence ID for this synthetic-data smoke test.");
  const prior = await pool.query("SELECT id FROM app.ai_annotations WHERE evidence_id=$1 AND feature='evidence_explanation' AND prompt_version=$2", [evidenceId, PROMPT_VERSION]);
  const feedback = await new FeedbackService(pool, config).request(owned.user_id, evidenceId);
  const annotation = (await pool.query("SELECT failure_code,usage FROM app.ai_annotations WHERE evidence_id=$1 AND feature='evidence_explanation' AND prompt_version=$2", [evidenceId, PROMPT_VERSION])).rows[0];
  const report = { observedAt: new Date().toISOString(), evidenceId, configuredProvider: config.AI_PROVIDER,
    configuredModel: config.AI_PROVIDER === "openai" ? config.OPENAI_MODEL : config.MISTRAL_MODEL,
    liveInferenceVerified: feedback.source === "llm" && feedback.provider === config.AI_PROVIDER,
    usedCachedAnnotation: !!prior.rowCount, feedback, failureCode: annotation.failure_code, usage: annotation.usage };
  const directory = new URL("../../verification/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("ai-smoke.json", directory), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ evidenceId, status: feedback.status, source: feedback.source, provider: feedback.provider,
    model: feedback.model, failureCode: annotation.failure_code, liveInferenceVerified: report.liveInferenceVerified }));
  if (!report.liveInferenceVerified) process.exitCode = 1;
} catch { console.error("AI smoke failed before a verified inference result; inspect server configuration and evidence ownership."); process.exitCode = 1; }
finally { await pool.end(); }
