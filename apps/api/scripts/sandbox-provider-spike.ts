import { Sandbox } from "e2b";
import { E2BSandboxProvider } from "../apps/api/src/sandbox/provider.js";
import { editablePath, starterSource } from "../apps/api/src/sandbox/challenge/files.js";

const apiKey = process.env.E2B_API_KEY;
if (!apiKey) throw new Error("E2B_API_KEY is required");
const provider = new E2BSandboxProvider(apiKey);
const repaired = `import type { Decision } from "./types.ts";
export class FixedWindowLimiter {
  private buckets = new Map<string, { start: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) throw new RangeError("invalid limit");
  }
  check(apiKey: string): Decision {
    const time = this.now();
    const start = Math.floor(time / this.windowMs) * this.windowMs;
    const previous = this.buckets.get(apiKey);
    const count = previous?.start === start ? previous.count : 0;
    if (count >= this.limit) return { allowed: false, retryAfterSeconds: Math.ceil((start + this.windowMs - time) / 1000) };
    this.buckets.set(apiKey, { start, count: count + 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
`;

let id: string | undefined;
const evidence: Record<string, unknown> = { sdk: "e2b@2.56.0", at: new Date().toISOString() };
try {
  id = await provider.create(180);
  evidence.studentSandboxId = id;
  const sandbox = await Sandbox.connect(id, { apiKey });
  try {
    const network = await sandbox.commands.run("node -e \"fetch('https://example.com',{signal:AbortSignal.timeout(2000)}).then(()=>process.exit(7)).catch(()=>process.exit(0))\"", { timeoutMs: 15_000 });
    evidence.egressProbeExitCode = network.exitCode;
  } catch (error) {
    evidence.egressProbeError = error instanceof Error ? error.name : "unknown";
  }
  evidence.visibleBefore = await provider.runVisibleTests(id);
  await provider.writeFile(id, editablePath, repaired);
  evidence.readMatchesRepair = (await provider.readFile(id, editablePath)) === repaired;
  evidence.visibleAfter = await provider.runVisibleTests(id);
} finally {
  if (id) evidence.studentKilled = await provider.kill(id);
}
evidence.hiddenStarter = await provider.grade(starterSource, 180);
evidence.hiddenRepair = await provider.grade(repaired, 180);
const compact = (value: unknown) => {
  if (!value || typeof value !== "object") return value;
  const row = value as { observation?: unknown; exitCode?: number; passed?: number; failed?: number; infrastructureFailure?: string; durationMs?: number; sandboxId?: string };
  return row.observation ? { sandboxId: row.sandboxId, observation: compact(row.observation) } :
    { exitCode: row.exitCode, passed: row.passed, failed: row.failed, infrastructureFailure: row.infrastructureFailure, durationMs: row.durationMs };
};
console.log(JSON.stringify(Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, ["visibleBefore", "visibleAfter", "hiddenStarter", "hiddenRepair"].includes(key) ? compact(value) : value])), null, 2));
if ((evidence.visibleBefore as { exitCode: number }).exitCode === 0 || (evidence.visibleAfter as { exitCode: number }).exitCode !== 0 ||
  (evidence.hiddenStarter as { observation: { exitCode: number } }).observation.exitCode === 0 ||
  (evidence.hiddenRepair as { observation: { exitCode: number } }).observation.exitCode !== 0 || evidence.egressProbeExitCode === 7) process.exitCode = 1;