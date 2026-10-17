import { Pool } from "pg";

export function createDatabasePool(databaseUrl?: string) {
  if (!databaseUrl) {
    return null;
  }
  return new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
}
