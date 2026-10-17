import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:http";
import { createApp } from "../apps/api/dist/app.js";
import { readApiConfig } from "../apps/api/dist/config.js";
import {
  API_CONTRACT_VERSION,
  ArtifactSchema,
  AttemptDtoSchema,
  FaultyAiSuggestionSchema,
  SubmissionReadyArtifactSchema,
} from "../packages/contracts/dist/index.js";
import { contentManifest, variantFiles } from "../apps/api/dist/content/index.js";
import { suiteSha256 } from "../apps/api/dist/challenges/retry-safe-credit/suite.js";

const draftExample = JSON.parse(
  await readFile(
    new URL("../packages/contracts/examples/draft-attempt.json", import.meta.url),
    "utf8",
  ),
);
AttemptDtoSchema.parse(draftExample);
ArtifactSchema.parse(draftExample.artifact);

const faultySuggestion = {
  id: "faulty-suggestion-1",
  title: "Credit before reserving the key",
  text: "Apply the balance update before recording the idempotency key.",
  source: "curated_fixture",
};
FaultyAiSuggestionSchema.parse(faultySuggestion);

const readyArtifact = {
  ...draftExample.artifact,
  hld: {
    engine: "excalidraw",
    formatVersion: 1,
    elements: [{ type: "rectangle", isDeleted: false }],
  },
  lld: {
    engine: "excalidraw",
    formatVersion: 1,
    elements: [{ type: "arrow", isDeleted: false }],
  },
  decisions: {
    keyScope: "account",
    atomicity: "transaction",
    payloadConflict: "reject",
  },
  variantId: "atomic",
  aiCritique: "The suggestion can credit twice after a retry.",
  repairJustification: "The atomic variant stores the credit and response together.",
};
SubmissionReadyArtifactSchema.parse(readyArtifact);
assert.equal(suiteSha256.length, 64, "built challenge suite source hash must be available");
for (const variant of contentManifest.challenge.variants) {
  assert.deepEqual(variant.files, variantFiles[variant.id], `built source package must preserve ${variant.id} content`);
  assert.ok(variant.files.every(file => file.source.length > 0), `${variant.id} source content must be present`);
}
const packagedMigrations = await readdir(new URL("../apps/api/dist/migrations/", import.meta.url));
assert.deepEqual(packagedMigrations.filter(name => /^\d+.*\.sql$/.test(name)).sort(), [
  "001_foundation.sql",
  "002_evaluation.sql",
  "003_feedback.sql",
  "004_career_reviews.sql",
  "005_sandbox.sql",
  "006_sandbox_v2_recovery.sql",
]);
for (const path of ["package.json", "package-lock.json", "test/private.test.ts"]) {
  await readFile(new URL("../apps/api/dist/sandbox/challenge/" + path, import.meta.url), "utf8");
}

const blankReasoning = SubmissionReadyArtifactSchema.safeParse({
  ...readyArtifact,
  aiCritique: "  \n",
  repairJustification: "\t",
});
assert.equal(blankReasoning.success, false);
assert.deepEqual(
  new Set(blankReasoning.error.issues.map((issue) => issue.path[0])),
  new Set(["aiCritique", "repairJustification"]),
);

const config = readApiConfig({ NODE_ENV: "test", DATABASE_URL: "" });
assert.throws(
  () => readApiConfig({ NODE_ENV: "test", AI_ENABLED: "true" }),
  /OPENAI_API_KEY, OPENAI_MODEL/,
);
assert.throws(
  () => readApiConfig({ NODE_ENV: "production" }),
  /DATABASE_URL/,
);
const appServer = createServer(createApp(config, null));
appServer.listen(0, "127.0.0.1");
await once(appServer, "listening");

try {
  const address = appServer.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const liveResponse = await fetch(`${baseUrl}/health/live`);
  assert.equal(liveResponse.status, 200);
  assert.deepEqual(await liveResponse.json(), { status: "ok" });

  const readyResponse = await fetch(`${baseUrl}/health/ready`);
  assert.equal(readyResponse.status, 503);
  assert.deepEqual(await readyResponse.json(), {
    status: "not_ready",
    missing: ["DATABASE_URL"],
  });
} finally {
  appServer.closeAllConnections();
  appServer.close();
  await once(appServer, "close");
}

console.log(
  `Smoke checks passed: API health/readiness, v${API_CONTRACT_VERSION} schemas, and packaged challenge/migration runtime assets.`,
);
