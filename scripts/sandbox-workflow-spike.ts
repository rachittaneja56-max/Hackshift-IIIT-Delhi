import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { readApiConfig } from "../apps/api/src/config.js";
import { createDatabasePool } from "../apps/api/src/db/pool.js";
import { SandboxService } from "../apps/api/src/sandbox/service.js";
import { E2BSandboxProvider } from "../apps/api/src/sandbox/provider.js";

if (process.env.SPIKE_ENV_PATH) loadEnv({ path: process.env.SPIKE_ENV_PATH });
const config = readApiConfig({ ...process.env, SANDBOX_ENABLED: "true", SANDBOX_AGENT_MODEL: "gpt-6-luna", SANDBOX_SESSION_TTL_SECONDS: "1200" });
const pool = createDatabasePool(config.DATABASE_URL);
if (!pool || !config.E2B_API_KEY) throw new Error("Database and E2B credentials are required");
const provider = new E2BSandboxProvider(config.E2B_API_KEY);
const service = new SandboxService(pool, config, provider);
const userId = randomUUID();
let sessionId: string | undefined;
const evidence: Record<string, unknown> = { at: new Date().toISOString(), model: config.SANDBOX_AGENT_MODEL };
const waitFor = async (status: string, timeoutMs = 240_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await service.get(userId, sessionId!);
    if (current.status === status) return current;
    if (current.status === "error" || current.status === "expired") throw new Error(`Session entered ${current.status}: ${current.failureCode}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timeout waiting for ${status}`);
};
await pool.query("INSERT INTO app.users(id,clerk_user_id) VALUES ($1,$2)", [userId, `sandbox-live-${userId}`]);
try {
  const start = await service.create(userId, randomUUID());
  sessionId = start.session.id;
  await waitFor("ready");
  evidence.created = true;
  await service.acceptTurn(userId, sessionId, randomUUID(), "Read README.md and src/rateLimiter.ts. Repair the full fixed-window contract, including per-key state, epoch-aligned boundaries, denial capacity and Retry-After. Run visible tests, then explain what changed.");
  const afterTurn = await waitFor("ready");
  evidence.promptCount = afterTurn.promptCount;
  evidence.turnStatus = afterTurn.turns?.[0]?.status;
  evidence.turnFailureCode = afterTurn.turns?.[0]?.failureCode;
  evidence.toolNames = afterTurn.turns?.[0]?.toolEvents.map(event => event.name);
  evidence.sourceChanged = afterTurn.currentSha256 !== start.session.currentSha256;
  evidence.visible = afterTurn.visibleTests?.at(-1)?.observation ? { exitCode: afterTurn.visibleTests.at(-1)!.observation!.exitCode,
    passed: afterTurn.visibleTests.at(-1)!.observation!.passed, failed: afterTurn.visibleTests.at(-1)!.observation!.failed } : null;
  await service.submit(userId, sessionId, randomUUID());
  await waitFor("submitted");
  const report = await service.report(userId, sessionId) as { verdict: string; sourceHash: string; hiddenTests: { exitCode: number | null; passed: number | null; failed: number | null } };
  evidence.report = { verdict: report.verdict, sourceHash: report.sourceHash, hidden: { exitCode: report.hiddenTests.exitCode, passed: report.hiddenTests.passed, failed: report.hiddenTests.failed } };
} finally {
  if (sessionId) {
    const row = await pool.query<{ sandbox_id: string | null }>("SELECT sandbox_id FROM app.sandbox_sessions WHERE id=$1", [sessionId]);
    if (row.rows[0]?.sandbox_id) await provider.kill(row.rows[0].sandbox_id).catch(() => false);
    await pool.query("DELETE FROM app.sandbox_test_runs WHERE session_id=$1", [sessionId]);
    await pool.query("DELETE FROM app.sandbox_turns WHERE session_id=$1", [sessionId]);
    await pool.query("DELETE FROM app.sandbox_sessions WHERE id=$1", [sessionId]);
  }
  await pool.query("DELETE FROM app.users WHERE id=$1", [userId]);
  await pool.end();
  console.log(JSON.stringify(evidence, null, 2));
}
if (!evidence.sourceChanged || evidence.turnStatus !== "completed" || (evidence.report as { verdict?: string } | undefined)?.verdict !== "correct") process.exitCode = 1;
