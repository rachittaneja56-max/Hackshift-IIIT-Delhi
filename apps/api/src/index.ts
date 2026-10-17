import "dotenv/config";
import { createApp } from "./app.js";
import { readApiConfig } from "./config.js";
import { createDatabasePool } from "./db/pool.js";
import { EvaluationWorker } from "./evaluations/worker.js";

const config = readApiConfig();
const pool = createDatabasePool(config.DATABASE_URL);
const app = createApp(config, pool);
const worker = pool ? new EvaluationWorker(pool, config) : null;
worker?.start();
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`TrajectoryOs API listening on port ${config.PORT}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const serverClosed = new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  await worker?.stop();
  await serverClosed;
  await pool?.end();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().catch(() => {
      console.error("API shutdown did not complete cleanly.");
      process.exitCode = 1;
    });
  });
}
