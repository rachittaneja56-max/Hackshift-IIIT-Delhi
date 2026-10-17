import { Pool } from "pg";

export function verifiedDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode && !["prefer", "require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("DATABASE_URL must retain PostgreSQL certificate verification.");
  }
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

export function createDatabasePool(databaseUrl?: string) {
  if (!databaseUrl) {
    return null;
  }
  const pool = new Pool({
    connectionString: verifiedDatabaseUrl(databaseUrl),
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
