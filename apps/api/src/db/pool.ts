import { Pool } from "pg";

export function createDatabasePool(databaseUrl?: string) {
  if (!databaseUrl) {
    return null;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    statement_timeout: 8000,
    idle_in_transaction_session_timeout: 10000,
    application_name: "trajectoryos-api",
  });
  pool.on("error", () => { console.error("An idle database connection failed."); });
  return pool;
}
