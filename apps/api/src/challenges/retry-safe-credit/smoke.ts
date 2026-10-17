import "dotenv/config";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readApiConfig } from "../../config.js";
import { createDatabasePool } from "../../db/pool.js";
import { runSuite } from "./suite.js";

const config = readApiConfig();
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for the real PostgreSQL evaluation smoke.");
const pool = createDatabasePool(config.DATABASE_URL);
if (!pool) throw new Error("DATABASE_URL is required for the real PostgreSQL evaluation smoke.");

try {
  const started = performance.now();
  const run = await runSuite(pool, "atomic", randomUUID());
  const wallMs = Math.round(performance.now() - started);
  console.log(JSON.stringify({
    runId: run.runId,
    verdict: run.result.verdict,
    suiteSha256: run.result.suiteSha256,
    implementationSha256: run.result.implementationSha256,
    wallMs,
    tests: run.result.tests.map(({ id, status, durationMs }) => ({ id, status, durationMs })),
    cleanup: "generated runId only",
  }, null, 2));
  if (run.result.verdict !== "all_passed") process.exitCode = 1;
} finally {
  await pool.end();
}
