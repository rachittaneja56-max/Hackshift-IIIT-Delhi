import "dotenv/config";
import { readApiConfig } from "../config.js";
import { createDatabasePool } from "./pool.js";
import { migrate } from "./migrate.js";

const pool = createDatabasePool(readApiConfig().DATABASE_URL);
if (!pool) throw new Error("DATABASE_URL is required for migrations.");
try { console.log("Applied/verified migrations:", (await migrate(pool)).join(", ")); }
catch { console.error("Migration failed; inspect database access, checksums and content version."); process.exitCode = 1; }
finally { await pool.end(); }
