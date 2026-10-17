import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { readApiConfig } from "../src/config.js";
import { sha256 } from "../src/db/hash.js";

test("liveness, readiness and auth fail closed without credentials", async () => {
  const server = createServer(createApp(readApiConfig({ NODE_ENV: "test" }), null));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base + "/health/live")).status, 200);
    assert.equal((await fetch(base + "/health/ready")).status, 503);
    const denied = await fetch(base + "/api/v1/courses", { headers: { Authorization: "Bearer invalid" } });
    assert.equal(denied.status, 401); assert.equal((await denied.json()).error.code, "UNAUTHENTICATED");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("canonical hashes and provider configuration", () => {
  assert.equal(sha256({ a: 1, b: [2, 3] }), sha256({ b: [2, 3], a: 1 }));
  assert.throws(() => readApiConfig({ AI_ENABLED: "true" }), /OPENAI_API_KEY, OPENAI_MODEL/);
  assert.throws(() => readApiConfig({ AI_ENABLED: "true", AI_PROVIDER: "mistral" }), /MISTRAL_API_KEY, MISTRAL_MODEL/);
});
