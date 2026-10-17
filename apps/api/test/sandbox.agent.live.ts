import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readApiConfig } from "../src/config.js";
import { SandboxAgent, type ToolEvent } from "../src/sandbox/agent.js";
import { E2BSandboxProvider, hashSource } from "../src/sandbox/provider.js";
import { starterSource } from "../src/sandbox/challenge/files.js";

const config = readApiConfig();
if (!config.E2B_API_KEY || !config.OPENAI_API_KEY || !config.SANDBOX_AGENT_MODEL) {
  throw new Error("E2B_API_KEY, OPENAI_API_KEY, and SANDBOX_AGENT_MODEL are required for this explicitly invoked live test.");
}

const provider = new E2BSandboxProvider(config.E2B_API_KEY);
const agent = new SandboxAgent(config.OPENAI_API_KEY, config.SANDBOX_AGENT_MODEL);
const sandboxId = await provider.create(300, randomUUID());
const events: ToolEvent[] = [];
try {
  const outcome = await agent.run({
    prompt: "Inspect the rate limiter, explain the main correctness problems, then make a minimal correct implementation of the README contract in src/rateLimiter.ts. Use the tools to read and edit the file and run the visible tests. Do not claim tests passed unless the tool result confirms it.",
    history: [],
    sandboxId,
    provider,
    runTests: () => provider.runVisibleTests(sandboxId),
    onEvent: async event => { events.push(event); },
  });
  const names = events.map(event => event.name);
  assert.ok(names.includes("list_files"), "assistant should inspect available files");
  assert.ok(names.includes("read_file"), "assistant should read the implementation");
  assert.ok(names.includes("write_file"), "assistant should change the implementation");
  assert.ok(names.includes("run_visible_tests"), "assistant should run the visible suite");
  const source = await provider.readFile(sandboxId, "src/rateLimiter.ts");
  assert.notEqual(hashSource(source), hashSource(starterSource), "assistant should leave a source change in E2B");
  const testEvent = events.find(event => event.name === "run_visible_tests");
  const observation = testEvent?.result as { passed?: number | null; failed?: number | null; infrastructureFailure?: string } | undefined;
  assert.equal(observation?.infrastructureFailure, undefined, "the visible suite should produce a complete observation");
  console.log(JSON.stringify({
    result: "PASS",
    model: outcome.model,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    toolCalls: names,
    sourceChanged: true,
    sourceSha256: hashSource(source),
    visibleTests: { passed: observation?.passed, failed: observation?.failed },
  }, null, 2));
} finally {
  await provider.kill(sandboxId);
}
