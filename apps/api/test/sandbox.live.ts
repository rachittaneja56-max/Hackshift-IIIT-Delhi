import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { E2BSandboxProvider, hashSource } from "../src/sandbox/provider.js";
import { challengeSourceSha256, starterSource, visibleSuiteSha256 } from "../src/sandbox/challenge/files.js";
import { privateSuiteSha256, privateTestNames } from "../src/sandbox/challenge/grader.js";

if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required for this explicitly invoked live smoke.");

const provider = new E2BSandboxProvider(process.env.E2B_API_KEY);
const sessionId = randomUUID();
let learnerSandboxId: string | undefined;
try {
  learnerSandboxId = await provider.create(300, sessionId);
  const initial = await provider.runVisibleTests(learnerSandboxId, hashSource(starterSource));
  assert.equal(initial.infrastructureFailure, undefined, "the visible TAP suite must execute completely");
  assert.ok((initial.failed ?? 0) > 0, "the reconstructed faulty starter should fail visible assertions");

  const referenceSource = await readFile(new URL("../src/sandbox/challenge/reference.ts", import.meta.url), "utf8");
  await provider.writeFile(learnerSandboxId, "src/rateLimiter.ts", referenceSource);
  const corrected = await provider.runVisibleTests(learnerSandboxId, hashSource(referenceSource));
  assert.equal(corrected.infrastructureFailure, undefined);
  assert.equal(corrected.failed, 0);

  const grade = await provider.grade(referenceSource, 300, randomUUID());
  assert.equal(grade.sourceHash, hashSource(referenceSource));
  assert.equal(grade.observation.suiteSha256, privateSuiteSha256);
  assert.equal(grade.observation.infrastructureFailure, undefined);
  assert.equal(grade.observation.passed, privateTestNames.length);
  assert.equal(grade.observation.failed, 0);
  console.log(JSON.stringify({
    provider: "e2b",
    sdk: grade.environment.sdk,
    challengeVersion: 2,
    challengeSourceSha256,
    visibleSuiteSha256,
    privateSuiteSha256,
    faultyStarter: { passed: initial.passed, failed: initial.failed, sourceSha256: initial.sourceSha256 },
    referenceVisible: { passed: corrected.passed, failed: corrected.failed, sourceSha256: corrected.sourceSha256 },
    freshGrader: { passed: grade.observation.passed, failed: grade.observation.failed, sourceSha256: grade.sourceHash },
    network: grade.environment.network,
    result: "PASS",
  }, null, 2));
} finally {
  if (learnerSandboxId) await provider.kill(learnerSandboxId);
}
