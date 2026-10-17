import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { readApiConfig } from "../apps/api/src/config.js";
import { createDatabasePool } from "../apps/api/src/db/pool.js";
import { SandboxService } from "../apps/api/src/sandbox/service.js";
import { E2BSandboxProvider } from "../apps/api/src/sandbox/provider.js";

if (process.env.SPIKE_ENV_PATH) loadEnv({ path: process.env.SPIKE_ENV_PATH });
const config = readApiConfig({ ...process.env, SANDBOX_ENABLED: "true", SANDBOX_AGENT_MODEL: "gpt-6-luna", SANDBOX_SESSION_TTL_SECONDS: "600" });
const pool = createDatabasePool(config.DATABASE_URL);
if (!pool || !config.E2B_API_KEY) throw new Error("Database and E2B key required");
const provider = new E2BSandboxProvider(config.E2B_API_KEY);
const service = new SandboxService(pool, config, provider, { async run() { throw new Error("not used"); } });
const userId = randomUUID();
let sessionId: string | undefined;
const evidence: Record<string, unknown> = {};
async function waitFor(status: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const row = await service.get(userId, sessionId!);
    if (row.status === status) return row;
    if (row.status === "error") throw new Error(`Session error: ${row.failureCode}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${status}`);
}
await pool.query("INSERT INTO app.users(id,clerk_user_id) VALUES ($1,$2)", [userId, `sandbox-visible-${userId}`]);
try {
  sessionId = (await service.create(userId, randomUUID())).session.id;
  await waitFor("ready");
  const run = await service.visibleTests(userId, sessionId, randomUUID());
  evidence.initialRun = run.run.status;
  const session = await waitFor("ready");
  evidence.finalRun = session.visibleTests?.[0]?.status;
  evidence.observation = session.visibleTests?.[0]?.observation ? { exitCode: session.visibleTests[0].observation.exitCode, passed: session.visibleTests[0].observation.passed, failed: session.visibleTests[0].observation.failed } : null;
} finally {
  if (sessionId) {
    const row = await pool.query<{ sandbox_id: string | null }>("SELECT sandbox_id FROM app.sandbox_sessions WHERE id=$1", [sessionId]);
    if (row.rows[0]?.sandbox_id) await provider.kill(row.rows[0].sandbox_id).catch(() => false);
    await pool.query("DELETE FROM app.sandbox_test_runs WHERE session_id=$1", [sessionId]);
    await pool.query("DELETE FROM app.sandbox_sessions WHERE id=$1", [sessionId]);
  }
  await pool.query("DELETE FROM app.users WHERE id=$1", [userId]);
  await pool.end();
  console.log(JSON.stringify(evidence, null, 2));
}
if (evidence.finalRun !== "completed") process.exitCode = 1;
