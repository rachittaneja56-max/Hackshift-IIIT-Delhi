import { config as loadEnv } from "dotenv";
import { SandboxAgent, type ToolEvent } from "../apps/api/src/sandbox/agent.js";
import { editablePath, starterSource } from "../apps/api/src/sandbox/challenge/files.js";
import { E2BSandboxProvider, hashSource } from "../apps/api/src/sandbox/provider.js";

if (process.env.SPIKE_ENV_PATH) loadEnv({ path: process.env.SPIKE_ENV_PATH });
const e2bKey = process.env.E2B_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
if (!e2bKey || !openaiKey) throw new Error("Host E2B and OpenAI keys are required");
const provider = new E2BSandboxProvider(e2bKey);
const agent = new SandboxAgent(openaiKey, "gpt-6-luna");
let sandboxId: string | undefined;
const events: ToolEvent[] = [];
const evidence: Record<string, unknown> = { at: new Date().toISOString(), model: "gpt-6-luna" };
try {
  sandboxId = await provider.create(180);
  evidence.sandboxId = sandboxId;
  const result = await agent.run({ prompt: "Read README.md and src/rateLimiter.ts. Fix the limiter according to the full documented contract, including exact and non-aligned boundaries, per-key state, denied-request capacity, and Retry-After. Then run visible tests and tell me what you observed.",
    history: [], sandboxId, provider, onEvent: async (event) => { events.push(event); }, runTests: () => provider.runVisibleTests(sandboxId!) });
  evidence.response = result.response;
  evidence.inputTokens = result.inputTokens;
  evidence.outputTokens = result.outputTokens;
  evidence.events = events.map(event => ({ name: event.name, arguments: event.arguments }));
  const source = await provider.readFile(sandboxId, editablePath);
  evidence.changed = source !== starterSource;
  evidence.sourceHash = hashSource(source);
  evidence.visible = await provider.runVisibleTests(sandboxId);
  const grade = await provider.grade(source, 180);
  evidence.hidden = { sandboxId: grade.sandboxId, exitCode: grade.observation.exitCode, passed: grade.observation.passed, failed: grade.observation.failed,
    infrastructureFailure: grade.observation.infrastructureFailure };
} finally {
  if (sandboxId) evidence.studentKilled = await provider.kill(sandboxId);
  console.log(JSON.stringify({ ...evidence, visible: evidence.visible ? { exitCode: (evidence.visible as { exitCode: number }).exitCode,
    passed: (evidence.visible as { passed: number }).passed, failed: (evidence.visible as { failed: number }).failed } : undefined }, null, 2));
}
if (!evidence.changed || !events.some(event => event.name === "write_file") || (evidence.visible as { exitCode: number }).exitCode !== 0) process.exitCode = 1;
