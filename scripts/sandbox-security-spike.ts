import { Sandbox } from "e2b";
import { E2BSandboxProvider } from "../apps/api/src/sandbox/provider.js";
import { editablePath, projectRoot } from "../apps/api/src/sandbox/challenge/files.js";

const apiKey = process.env.E2B_API_KEY;
if (!apiKey) throw new Error("E2B_API_KEY is required");
const provider = new E2BSandboxProvider(apiKey);
let id: string | undefined;
const evidence: Record<string, unknown> = {};
try {
  await provider.writeFile("not-a-real-sandbox", "../hidden.test.ts", "x").then(() => evidence.traversalWriteRejected = false, () => evidence.traversalWriteRejected = true);
  await provider.readFile("not-a-real-sandbox", "../../etc/passwd").then(() => evidence.traversalReadRejected = false, () => evidence.traversalReadRejected = true);
  id = await provider.create(180);
  const sandbox = await Sandbox.connect(id, { apiKey });
  await sandbox.commands.run("mv src/rateLimiter.ts src/rateLimiter.backup && ln -s ../README.md src/rateLimiter.ts", { cwd: projectRoot, timeoutMs: 12_000 });
  await provider.readFile(id, editablePath).then(() => evidence.symlinkReadRejected = false, () => evidence.symlinkReadRejected = true);
  await provider.writeFile(id, editablePath, "export class Test {}\n").then(() => evidence.symlinkWriteRejected = false, () => evidence.symlinkWriteRejected = true);
} finally {
  if (id) evidence.killed = await provider.kill(id);
  console.log(JSON.stringify(evidence, null, 2));
}
if (!evidence.traversalWriteRejected || !evidence.traversalReadRejected || !evidence.symlinkReadRejected || !evidence.symlinkWriteRejected || !evidence.killed) process.exitCode = 1;