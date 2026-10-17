import "dotenv/config";
import { createApp } from "./app.js";
import { readApiConfig } from "./config.js";
import { createDatabasePool } from "./db/pool.js";

const config = readApiConfig();
const pool = createDatabasePool(config.DATABASE_URL);
const app = createApp(config, pool);
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`TrajectoryOs API listening on port ${config.PORT}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await pool?.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
