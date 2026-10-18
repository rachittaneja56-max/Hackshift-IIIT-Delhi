import assert from "node:assert/strict";
import { test } from "node:test";
<<<<<<< HEAD
import { challengeSourceSha256, editablePath, isListedFile, starterSha256, visibleSuiteSha256 } from "../src/sandbox/challenge/files.js";
import { privateSuiteSha256, privateTestNames, visibleTestNames } from "../src/sandbox/challenge/grader.js";
import { hashSource, parseTestOutput, validateSource } from "../src/sandbox/provider.js";

process.env.CHALLENGE_IMPLEMENTATION_URL = new URL("../src/sandbox/challenge/reference.ts", import.meta.url).href;
await import("../src/sandbox/challenge/test/visible.test.ts");
await import("../src/sandbox/challenge/test/private.test.ts");

function tap(names: readonly string[], failures = new Set<string>()) {
  const cases = names.map((name, index) => (failures.has(name) ? "not " : "") + "ok " + (index + 1) + " - " + name);
  const passed = names.length - failures.size;
  return ["TAP version 13", ...cases, "1.." + names.length, "# tests " + names.length, "# pass " + passed,
    "# fail " + failures.size, "# cancelled 0", "# skipped 0", "# todo 0"].join("\n");
}

test("sandbox test parser requires all reviewed names, counts, and consistent exit status", () => {
  const failedName = visibleTestNames[0]!;
  const parsed = parseTestOutput(tap(visibleTestNames, new Set([failedName])), visibleTestNames, 1, visibleSuiteSha256, starterSha256);
  assert.equal(parsed.passed, 4);
  assert.equal(parsed.failed, 1);
  assert.equal(parsed.tests.find(item => item.name === failedName)?.status, "failed");
  assert.equal(parsed.infrastructureFailure, undefined);
});

test("zero exit with no expected tests is not accepted as a pass", () => {
  const parsed = parseTestOutput("process exited successfully\n", privateTestNames, 0, privateSuiteSha256, hashSource("source"));
  assert.equal(parsed.passed, null);
  assert.equal(parsed.failed, null);
  assert.match(parsed.infrastructureFailure ?? "", /expected reviewed tests/i);
});

test("mismatched TAP exit code is an infrastructure observation", () => {
  const parsed = parseTestOutput(tap(privateTestNames), privateTestNames, 1, privateSuiteSha256, hashSource("source"));
  assert.equal(parsed.passed, privateTestNames.length);
  assert.match(parsed.infrastructureFailure ?? "", /exit status/i);
});

test("challenge file access is allowlisted and rejects traversal spellings", () => {
  assert.equal(isListedFile(editablePath), true);
  assert.equal(isListedFile("../private.test.ts"), false);
  assert.equal(isListedFile("src\\rateLimiter.ts"), false);
  assert.equal(isListedFile("test/private.test.ts"), false);
});

test("source validation and challenge hashes identify reconstructed v2 inputs", () => {
  assert.equal(starterSha256.length, 64);
  assert.equal(visibleSuiteSha256.length, 64);
  assert.equal(privateSuiteSha256.length, 64);
  assert.equal(challengeSourceSha256.length, 64);
  assert.throws(() => validateSource("x".repeat(32_769)), /size limit/i);
  assert.throws(() => validateSource("bad\0source"), /size limit/i);
=======
import { E2BSandboxProvider, validateSource } from "../src/sandbox/provider.js";

test("sandbox source and path rules reject oversized and traversing inputs before remote access", async () => {
  assert.throws(() => validateSource("x".repeat(32_769)), (error: { code?: string }) => error.code === "SOURCE_TOO_LARGE");
  assert.throws(() => validateSource("x\0y"), (error: { code?: string }) => error.code === "INVALID_SOURCE");
  const provider = new E2BSandboxProvider("no-remote-call");
  await assert.rejects(provider.readFile("not-a-sandbox", "../../secret"), (error: { code?: string }) => error.code === "FILE_NOT_ALLOWED");
  await assert.rejects(provider.writeFile("not-a-sandbox", "tests/hidden.test.ts", "x"), (error: { code?: string }) => error.code === "FILE_NOT_EDITABLE");
>>>>>>> efc913c (sandbox frontend)
});
