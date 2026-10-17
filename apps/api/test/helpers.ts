import "dotenv/config";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readApiConfig } from "../src/config.js";
import { createDatabasePool } from "../src/db/pool.js";
import { createApp, type AppDependencies } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";

export const scene = { engine: "excalidraw" as const, formatVersion: 1 as const, elements: [
  { id: "shape-1", type: "rectangle", x: 12, y: 34, width: 200, height: 80, angle: 0, isDeleted: false,
    groupIds: [], boundElements: [{ id: "text-1", type: "text" }], seed: 22, version: 1, versionNonce: 13 },
  { id: "text-1", type: "text", text: "API transaction", originalText: "API transaction", containerId: "shape-1", x: 20, y: 40 },
] };
export const readyArtifact = { hld: scene, lld: scene, decisions: { keyScope: "account" as const, atomicity: "transaction" as const,
  payloadConflict: "reject" as const }, variantId: "atomic" as const, aiCritique: "A committed balance can be applied again on retry.",
  repairJustification: "Store the key, effect and response in one transaction." };

export async function harness(dependencies: AppDependencies = {}) {
  let pool = createDatabasePool(process.env.DATABASE_URL);
  if (!pool) throw new Error("DATABASE_URL required: integration tests never substitute a mock database.");
  try { await migrate(pool); } catch (error) { await pool.end(); throw error; }
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const issuer = "https://testing.clerk.accounts.dev";
  const config = readApiConfig({ NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: "sk_test_local", CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("testing.clerk.accounts.dev$").toString("base64")}`,
    CLERK_JWT_KEY: publicKey, CLERK_AUTHORIZED_PARTIES: "http://localhost:5173", CORS_ORIGINS: "http://localhost:5173" });
  const subjects = [`integration_${randomUUID()}`, `integration_${randomUUID()}`];
  function token(subject = subjects[0], overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: issuer, sub: subject, sid: "sess_integration", azp: "http://localhost:5173",
      iat: now - 5, nbf: now - 5, exp: now + 300, ...overrides })).toString("base64url");
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(keys.privateKey, "base64url");
    return `${header}.${payload}.${signature}`;
  }
  let server = createServer(createApp(config, pool, dependencies));
  let base = "";
  async function listen() {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listening socket");
    base = `http://127.0.0.1:${address.port}`;
  }
  async function stopServer() {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  await listen();
  async function request(path: string, method = "GET", body?: unknown, bearer: string | null = token(), headers = {}) {
    const response = await fetch(base + path, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return {
    get pool() { return pool; },
    config,
    subjects,
    token,
    request,
    get base() { return base; },
    async restart() {
      await stopServer();
      await pool.end();
      const nextPool = createDatabasePool(process.env.DATABASE_URL);
      if (!nextPool) throw new Error("DATABASE_URL required after API restart.");
      pool = nextPool;
      server = createServer(createApp(config, pool, dependencies));
      await listen();
    },
    async close() { await stopServer(); await pool.end(); },
  };
}
