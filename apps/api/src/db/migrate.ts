import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "./transaction.js";
import { contentManifest } from "../content/index.js";
import { sha256 } from "./hash.js";

const directory = new URL("../../migrations/", import.meta.url);
export async function migrate(pool: Pool) {
  const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  await transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(84277103)");
    await client.query("CREATE SCHEMA IF NOT EXISTS app");
    await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations
      (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const name of files) {
      const sql = (await readFile(new URL(name, directory), "utf8")).replaceAll("\r\n", "\n");
      const hash = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query("SELECT sha256 FROM app.schema_migrations WHERE name=$1", [name]);
      if (prior.rowCount) {
        if (prior.rows[0].sha256 !== hash) throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO app.schema_migrations(name,sha256) VALUES ($1,$2)", [name, hash]);
    }
    const hash = sha256(contentManifest);
    await client.query(`INSERT INTO app.challenge_versions(slug,version,manifest,manifest_sha256)
      VALUES ('retry-safe-credit',1,$1,$2) ON CONFLICT DO NOTHING`, [contentManifest, hash]);
    const saved = await client.query("SELECT manifest_sha256 FROM app.challenge_versions WHERE slug='retry-safe-credit' AND version=1");
    if (saved.rows[0]?.manifest_sha256 !== hash) throw new Error("Published challenge v1 differs; a versioned content approval is required.");
  });
  return files;
}

export async function schemasReady(pool: Pool) {
  const names = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  const rows = await pool.query("SELECT name,sha256 FROM app.schema_migrations");
  for (const name of names) {
    const sql = (await readFile(new URL(name, directory), "utf8")).replaceAll("\r\n", "\n");
    if (!rows.rows.some(row => row.name === name && row.sha256 === createHash("sha256").update(sql).digest("hex"))) return false;
  }
  const manifest = await pool.query("SELECT manifest_sha256 FROM app.challenge_versions WHERE slug='retry-safe-credit' AND version=1");
  return manifest.rows[0]?.manifest_sha256 === sha256(contentManifest);
}
