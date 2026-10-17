import { Sandbox, CommandExitError } from "e2b";
const apiKey = process.env.E2B_API_KEY;
if (!apiKey) throw new Error("E2B_API_KEY is required");
let sandbox: Sandbox | undefined;
const evidence: Record<string, unknown> = {};
const probe = async () => {
  try {
    const result = await sandbox!.commands.run("timeout 6 curl --connect-timeout 3 --max-time 5 -fsSI https://registry.npmjs.org/tsx/latest", { timeoutMs: 15_000 });
    return { exitCode: result.exitCode, stderr: result.stderr.slice(0, 200) };
  } catch (error) {
    if (error instanceof CommandExitError) return { exitCode: error.exitCode, stderr: error.stderr.slice(0, 200) };
    return { error: error instanceof Error ? error.name : "unknown" };
  }
};
try {
  sandbox = await Sandbox.create({ apiKey, timeoutMs: 90_000, allowInternetAccess: true });
  evidence.before = await probe();
  await sandbox.updateNetwork({ allowInternetAccess: false });
  evidence.after = await probe();
} finally {
  if (sandbox) evidence.killed = await Sandbox.kill(sandbox.sandboxId, { apiKey });
  console.log(JSON.stringify(evidence, null, 2));
}
if ((evidence.before as { exitCode?: number }).exitCode !== 0 || (evidence.after as { exitCode?: number }).exitCode === 0 || !evidence.killed) process.exitCode = 1;
