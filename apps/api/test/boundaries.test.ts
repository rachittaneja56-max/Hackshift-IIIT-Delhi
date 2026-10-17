import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { readApiConfig } from "../src/config.js";
import { sha256 } from "../src/db/hash.js";
import { verifiedDatabaseUrl } from "../src/db/pool.js";

test("liveness, readiness and auth fail closed without credentials", async () => {
  const server = createServer(createApp(readApiConfig({ NODE_ENV: "test" }), null));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base + "/health/live")).status, 200);
    assert.equal((await fetch(base + "/health/ready")).status, 503);
    const allowedOrigin = await fetch(base + "/api/v1/courses", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:5173", "Access-Control-Request-Method": "GET" },
    });
    assert.equal(allowedOrigin.status, 204);
    assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
    const hostnameMismatch = await fetch(base + "/api/v1/courses", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" },
    });
    assert.equal(hostnameMismatch.status, 403);
    const denied = await fetch(base + "/api/v1/courses", { headers: { Authorization: "Bearer invalid" } });
    assert.equal(denied.status, 401); assert.equal((await denied.json()).error.code, "UNAUTHENTICATED");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("canonical hashes and provider configuration", () => {
  assert.equal(sha256({ a: 1, b: [2, 3] }), sha256({ b: [2, 3], a: 1 }));
  assert.throws(() => readApiConfig({ AI_ENABLED: "true" }), /OPENAI_API_KEY, OPENAI_MODEL/);
  assert.throws(() => readApiConfig({ AI_ENABLED: "true", AI_PROVIDER: "mistral" }), /MISTRAL_API_KEY, MISTRAL_MODEL/);
  assert.equal(readApiConfig({ NODE_ENV: "" }).NODE_ENV, "development");
  assert.equal(readApiConfig({ CLERK_AUTHORIZED_PARTIES: "http://127.0.0.1:5173/" }).CLERK_AUTHORIZED_PARTIES, "http://127.0.0.1:5173");
  assert.equal(new URL(verifiedDatabaseUrl("postgresql://user:pass@db.example/neondb?sslmode=require")).searchParams.get("sslmode"), "verify-full");
  assert.equal(new URL(verifiedDatabaseUrl("postgresql://user:pass@db.example/neondb")).searchParams.get("sslmode"), "verify-full");
  assert.throws(() => verifiedDatabaseUrl("postgresql://user:pass@db.example/neondb?sslmode=disable"), /certificate verification/);
  assert.throws(() => readApiConfig({ CORS_ORIGINS: "https://example.com/path" }), /CORS_ORIGINS/);
  assert.throws(() => readApiConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/example" }), /CLERK_SECRET_KEY/);
});
