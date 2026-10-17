import { createHash, randomUUID } from "node:crypto";
import { CommandExitError, Sandbox, TimeoutError, type CommandHandle, type SandboxApiOpts, type SandboxConnectOpts, type SandboxInfo, type SandboxOpts } from "e2b";
import { challengeSourceSha256, editablePath, isListedFile, listedFiles, packageLock, packageLockSha256, projectFiles, starterSource, visibleSuiteSha256 } from "./challenge/files.js";
import { privateSuite, privateSuitePath, privateSuiteSha256, privateTestNames } from "./challenge/grader.js";

const WORKSPACE = "/home/user/workspace";
const MAX_SOURCE_BYTES = 32_768;
const MAX_CAPTURE_BYTES = 24_000;
const COMMAND_TIMEOUT_MS = 45_000;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const SDK_VERSION = "2.53.1";
const RUNNER_VERSION = "tsx@4.20.0";

export type TestCaseObservation = { name: string; status: "passed" | "failed" };
export type TestObservation = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  passed: number | null;
  failed: number | null;
  tests: TestCaseObservation[];
  suiteSha256: string;
  sourceSha256: string;
  infrastructureFailure?: string;
  timedOut?: boolean;
};
export type SandboxEnvironment = {
  provider: "e2b" | "fake";
  sdk: string;
  runner: string;
  nodeVersion: string;
  packageLockSha256: string;
  challengeSourceSha256: string;
  network: string;
};
export type GradeResult = {
  observation: TestObservation;
  sandboxId: string;
  sourceHash: string;
  environment: SandboxEnvironment;
};

export interface SandboxProvider {
  create(ttlSeconds: number, sessionId?: string): Promise<string>;
  listFiles(): Array<{ path: string; editable: boolean }>;
  readFile(sandboxId: string, path: string): Promise<string>;
  writeFile(sandboxId: string, path: string, source: string): Promise<{ path: string; sha256: string; bytes: number }>;
  runVisibleTests(sandboxId: string, expectedSourceHash?: string): Promise<TestObservation>;
  grade(source: string, ttlSeconds: number, sessionId?: string): Promise<GradeResult>;
  kill(sandboxId: string): Promise<boolean>;
}

type SandboxLike = Pick<Sandbox, "sandboxId" | "files" | "commands" | "updateNetwork" | "kill">;
type SandboxSdk = {
  create(options: SandboxOpts): Promise<SandboxLike>;
  connect(sandboxId: string, options: SandboxConnectOpts): Promise<SandboxLike>;
  kill(sandboxId: string, options: SandboxApiOpts): Promise<boolean>;
  list(options: SandboxApiOpts & { query: { metadata: Record<string, string> } }): {
    hasNext: boolean;
    nextItems(): Promise<SandboxInfo[]>;
  };
};

const sdk: SandboxSdk = {
  create: options => Sandbox.create(options),
  connect: (sandboxId, options) => Sandbox.connect(sandboxId, options),
  kill: (sandboxId, options) => Sandbox.kill(sandboxId, options),
  list: options => Sandbox.list(options),
};

export function hashSource(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

export function validateSource(source: string) {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES || source.includes("\0")) {
    throw new Error("Submitted implementation is outside the source size limit.");
  }
  return source;
}

function bounded(value: string, maxBytes = MAX_CAPTURE_BYTES) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) return value;
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n[output truncated at ${maxBytes} bytes]`;
}

export function parseTestOutput(stdout: string, expectedNames: readonly string[], exitCode: number | null, suiteSha256: string, sourceSha256: string) {
  const summary = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map(key => {
    const match = stdout.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
    return [key, match ? Number(match[1]) : null];
  }));
  const cases: TestCaseObservation[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(not )?ok\s+\d+\s+-\s+(.+?)\s*$/);
    if (!match) continue;
    const name = match[2]!.replace(/\s+# duration_ms.*$/, "").trim();
    cases.push({ name, status: match[1] ? "failed" : "passed" });
  }
  const names = cases.map(test => test.name);
  const expectedSet = new Set(expectedNames);
  const exactNames = names.length === expectedNames.length && new Set(names).size === names.length && names.every(name => expectedSet.has(name));
  const countsValid = summary.tests === expectedNames.length && summary.pass === cases.filter(test => test.status === "passed").length &&
    summary.fail === cases.filter(test => test.status === "failed").length && summary.cancelled === 0 && summary.skipped === 0 && summary.todo === 0;
  const noTestRun = !exactNames || !countsValid;
  const failure = noTestRun ? "Expected reviewed tests did not produce the complete matching TAP observation." : undefined;
  const statusMatches = !noTestRun && (summary.fail === 0 ? exitCode === 0 : exitCode !== 0);
  return {
    passed: noTestRun ? null : summary.pass,
    failed: noTestRun ? null : summary.fail,
    tests: cases,
    infrastructureFailure: failure ?? (!statusMatches ? "Test process exit status did not match the TAP assertions." : undefined),
    suiteSha256,
    sourceSha256,
  };
}

type CommandResult = { exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean; outputExceeded: boolean };

async function runBounded(sandbox: SandboxLike, command: string, timeoutMs: number): Promise<CommandResult> {
  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let captured = 0;
  let outputExceeded = false;
  let handle: CommandHandle | undefined;
  const capture = (target: "stdout" | "stderr") => (chunk: string) => {
    const remaining = Math.max(0, MAX_CAPTURE_BYTES - captured);
    const bytes = Buffer.from(chunk, "utf8");
    const part = bytes.subarray(0, remaining).toString("utf8");
    captured += Buffer.byteLength(part, "utf8");
    if (target === "stdout") stdout += part;
    else stderr += part;
    if (bytes.byteLength > remaining) {
      outputExceeded = true;
      if (handle) void handle.kill().catch(() => false);
    }
  };
  try {
    handle = await sandbox.commands.run(command, {
      background: true,
      cwd: WORKSPACE,
      timeoutMs,
      onStdout: capture("stdout"),
      onStderr: capture("stderr"),
    });
    if (outputExceeded) await handle.kill().catch(() => false);
    const result = await handle.wait();
    return { exitCode: result.exitCode ?? 0, stdout: bounded(stdout), stderr: bounded(stderr), durationMs: Date.now() - started, timedOut: false, outputExceeded };
  } catch (error) {
    if (error instanceof CommandExitError) {
      return { exitCode: error.exitCode, stdout: bounded(stdout || error.stdout), stderr: bounded(stderr || error.stderr), durationMs: Date.now() - started, timedOut: false, outputExceeded };
    }
    const timeout = error instanceof TimeoutError || (error instanceof Error && /timeout/i.test(error.name));
    return { exitCode: null, stdout: bounded(stdout), stderr: bounded(stderr), durationMs: Date.now() - started, timedOut: timeout, outputExceeded };
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  constructor(private apiKey: string | undefined, private client: SandboxSdk = sdk) {}

  private requireKey() {
    if (!this.apiKey) throw new Error("E2B_API_KEY is not configured.");
    return this.apiKey;
  }

  private async findExisting(sessionId: string, role: "student" | "grader") {
    const apiKey = this.requireKey();
    const pages = this.client.list({ apiKey, query: { metadata: { trajectoryos: "rate-limiter-v2", sessionId, role } } });
    const matches: SandboxInfo[] = [];
    while (pages.hasNext && matches.length < 20) matches.push(...await pages.nextItems());
    const info = matches.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    return info ? this.client.connect(info.sandboxId, { apiKey }) : undefined;
  }

  private async connect(sandboxId: string) {
    return this.client.connect(sandboxId, { apiKey: this.requireKey() });
  }

  private absolutePath(path: string, allowPrivate = false) {
    if (!isListedFile(path) && !(allowPrivate && path === privateSuitePath)) throw new Error("File path is not allowlisted.");
    return `${WORKSPACE}/${path}`;
  }

  private async guardPath(sandbox: SandboxLike, relativePath: string, allowPrivate = false) {
    const target = this.absolutePath(relativePath, allowPrivate);
    const script = `const fs=require("node:fs"),p=require("node:path");const root=${JSON.stringify(WORKSPACE)},target=${JSON.stringify(target)};const rel=p.relative(root,target);if(!rel||rel.startsWith(".."+p.sep)||p.isAbsolute(rel))process.exit(41);let cur=root;for(const part of rel.split(p.sep)){cur=p.join(cur,part);try{if(fs.lstatSync(cur).isSymbolicLink())process.exit(42)}catch(e){if(e.code==="ENOENT")break;throw e}}let existing=root;for(const part of p.relative(root,p.dirname(target)).split(p.sep)){if(!part||part===".")continue;const next=p.join(existing,part);if(!fs.existsSync(next))break;existing=next}const realParent=fs.realpathSync(existing);if(realParent!==root&&!realParent.startsWith(root+p.sep))process.exit(43);if(fs.existsSync(target)){const st=fs.lstatSync(target);if(!st.isFile()||st.isSymbolicLink())process.exit(44);const real=fs.realpathSync(target);if(!real.startsWith(root+p.sep))process.exit(45)}`;
    const encoded = Buffer.from(script, "utf8").toString("base64");
    const checked = await runBounded(sandbox, `node -e "eval(Buffer.from('${encoded}','base64').toString())"`, 8_000);
    if (checked.exitCode !== 0 || checked.timedOut || checked.outputExceeded) throw new Error("Sandbox file path failed the symlink and workspace check.");
    return target;
  }

  private async upload(sandbox: SandboxLike, files: Record<string, string>) {
    await sandbox.files.makeDir(WORKSPACE);
    for (const [path, content] of Object.entries(files)) {
      const target = this.absolutePath(path);
      await sandbox.files.makeDir(`${WORKSPACE}/${path.split("/").slice(0, -1).join("/")}`.replace(/\/$/, ""));
      await this.guardPath(sandbox, path);
      await sandbox.files.write(target, content);
    }
  }

  private async bootstrap(sandbox: SandboxLike, files: Record<string, string>) {
    try { await sandbox.files.remove(WORKSPACE); } catch { /* Fresh sandbox. */ }
    await sandbox.files.makeDir(WORKSPACE);
    await this.upload(sandbox, files);
    const version = await runBounded(sandbox, "node --version && npm --version", 10_000);
    if (version.exitCode !== 0 || version.timedOut) throw new Error("E2B base image does not provide Node.js and npm.");
    const egressBefore = await runBounded(sandbox, "node -e \"fetch('https://registry.npmjs.org/tsx/latest',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:2)).catch(()=>process.exit(3))\"", 8_000);
    if (egressBefore.exitCode !== 0) throw new Error("Could not verify package-registry access for the pinned bootstrap install.");
    const install = await runBounded(sandbox, "npm ci --ignore-scripts --no-audit --no-fund", BOOTSTRAP_TIMEOUT_MS);
    if (install.exitCode !== 0 || install.timedOut || install.outputExceeded) throw new Error("Pinned challenge dependency installation failed or exceeded its limits.");
    await sandbox.updateNetwork({ allowInternetAccess: false });
    const egressAfter = await runBounded(sandbox, "node -e \"fetch('https://registry.npmjs.org/tsx/latest',{signal:AbortSignal.timeout(4000)}).then(r=>{console.log('FETCH_REACHABLE:'+r.status);process.exit(9)}).catch(e=>{console.log('FETCH_BLOCKED:'+e.name);process.exit(0)})\"", 7_000);
    const blockedProbe = egressAfter.stdout.match(/FETCH_BLOCKED:([A-Za-z0-9_]+)/)?.[1];
    if (!blockedProbe || egressAfter.stdout.includes("FETCH_REACHABLE:")) {
      throw new Error(`E2B outbound network denial could not be verified after bootstrap (exit=${egressAfter.exitCode}, timeout=${egressAfter.timedOut}, probe=${egressAfter.stdout.trim() || egressAfter.stderr.trim() || "no output"}).`);
    }
    return { nodeVersion: version.stdout.trim().split(/\s+/)[0] ?? "unknown", network: `bootstrap registry reachable; E2B outbound disabled; post-bootstrap probe rejected (${blockedProbe})` };
  }

  private async createSandbox(ttlSeconds: number, sessionId: string, role: "student" | "grader") {
    const existing = await this.findExisting(sessionId, role);
    // A job retry may find a sandbox from an attempt whose DB commit was lost.
    // Reprovision instead of reinstalling into a previously network-locked VM.
    if (existing) await existing.kill();
    return this.client.create({
      apiKey: this.requireKey(),
      timeoutMs: ttlSeconds * 1_000,
      allowInternetAccess: true,
      network: { allowPublicTraffic: false },
      metadata: { trajectoryos: "rate-limiter-v2", sessionId, role },
    });
  }

  async create(ttlSeconds: number, sessionId = randomUUID()) {
    const sandbox = await this.createSandbox(ttlSeconds, sessionId, "student");
    try {
      await this.bootstrap(sandbox, projectFiles);
      return sandbox.sandboxId;
    } catch (error) {
      await sandbox.kill().catch(() => false);
      throw error;
    }
  }

  listFiles() {
    return listedFiles.map(path => ({ path, editable: path === editablePath }));
  }

  async readFile(sandboxId: string, path: string) {
    const sandbox = await this.connect(sandboxId);
    const target = await this.guardPath(sandbox, path);
    return sandbox.files.read(target);
  }

  async writeFile(sandboxId: string, path: string, source: string) {
    if (path !== editablePath) throw new Error("Only the reviewed editable implementation file can be changed.");
    validateSource(source);
    const sandbox = await this.connect(sandboxId);
    const target = await this.guardPath(sandbox, path);
    await sandbox.files.write(target, source);
    const actual = await sandbox.files.read(target);
    if (actual !== source) throw new Error("Sandbox source readback did not match the requested write.");
    return { path, sha256: hashSource(actual), bytes: Buffer.byteLength(actual, "utf8") };
  }

  async runVisibleTests(sandboxId: string, expectedSourceHash?: string): Promise<TestObservation> {
    const sandbox = await this.connect(sandboxId);
    const sourcePath = await this.guardPath(sandbox, editablePath);
    const before = await sandbox.files.read(sourcePath);
    const sourceSha256 = hashSource(before);
    if (expectedSourceHash && sourceSha256 !== expectedSourceHash) throw new Error("Sandbox source hash differed from the accepted PostgreSQL revision.");
    const started = Date.now();
    const result = await runBounded(sandbox, "npm run test:visible", COMMAND_TIMEOUT_MS);
    let after = "";
    try { after = await sandbox.files.read(await this.guardPath(sandbox, editablePath)); } catch { /* Reported as integrity failure below. */ }
    const integrityFailure = !after || hashSource(after) !== sourceSha256 ? "Implementation source changed while the test suite was running." : undefined;
    const parsed = parseTestOutput(result.stdout, [
      "allows requests below the configured quota", "denies requests after the quota is used",
      "keeps API key quotas independent", "opens a new epoch-aligned window at the boundary",
      "rounds retry delay up to the next whole second",
    ], result.exitCode, visibleSuiteSha256, sourceSha256);
    return {
      exitCode: result.exitCode,
      stdout: bounded(result.stdout),
      stderr: bounded(result.stderr),
      durationMs: Math.max(Date.now() - started, result.durationMs),
      ...parsed,
      ...(integrityFailure ? { infrastructureFailure: integrityFailure } : {}),
      ...(result.outputExceeded ? { infrastructureFailure: "Test output exceeded the capture limit." } : {}),
      ...(result.timedOut ? { timedOut: true, infrastructureFailure: "Visible test command timed out." } : {}),
    };
  }

  async grade(source: string, ttlSeconds: number, sessionId = randomUUID()): Promise<GradeResult> {
    validateSource(source);
    const sandbox = await this.createSandbox(ttlSeconds, sessionId, "grader");
    let environment: SandboxEnvironment = {
      provider: "e2b", sdk: SDK_VERSION, runner: RUNNER_VERSION, nodeVersion: "unknown",
      packageLockSha256, challengeSourceSha256, network: "grading setup incomplete",
    };
    try {
      const files = { ...projectFiles };
      delete files[editablePath];
      const bootstrap = await this.bootstrap(sandbox, { ...files, "src/rateLimiter.ts": starterSource });
      environment = { ...environment, nodeVersion: bootstrap.nodeVersion, network: bootstrap.network };
      await this.guardPath(sandbox, privateSuitePath, true);
      await sandbox.files.write(`${WORKSPACE}/${privateSuitePath}`, privateSuite);
      const sourcePath = await this.guardPath(sandbox, editablePath);
      await sandbox.files.write(sourcePath, source);
      const uploaded = await sandbox.files.read(sourcePath);
      const sourceHash = hashSource(uploaded);
      if (sourceHash !== hashSource(source)) throw new Error("Grader source readback did not match the frozen submission.");
      const run = await runBounded(sandbox, "npm run test:private", COMMAND_TIMEOUT_MS);
      let sourceAfter = "";
      try { sourceAfter = await sandbox.files.read(await this.guardPath(sandbox, editablePath)); } catch { /* integrity failure */ }
      const implementationChanged = !sourceAfter || hashSource(sourceAfter) !== sourceHash;
      const privateSourceAfter = await sandbox.files.read(await this.guardPath(sandbox, privateSuitePath, true));
      const suiteChanged = hashSource(privateSourceAfter) !== privateSuiteSha256;
      const parsed = parseTestOutput(run.stdout, privateTestNames, run.exitCode, privateSuiteSha256, sourceHash);
      const observation: TestObservation = {
        exitCode: run.exitCode, stdout: bounded(run.stdout), stderr: bounded(run.stderr), durationMs: run.durationMs,
        ...parsed,
        ...((implementationChanged || suiteChanged) ? { infrastructureFailure: "Implementation or private suite changed during grading; no correctness verdict was accepted." } : {}),
        ...(run.outputExceeded ? { infrastructureFailure: "Grader output exceeded the capture limit." } : {}),
        ...(run.timedOut ? { timedOut: true, infrastructureFailure: "Private test command timed out." } : {}),
      };
      return { observation, sandboxId: sandbox.sandboxId, sourceHash, environment };
    } finally {
      await sandbox.kill().catch(() => false);
    }
  }

  async kill(sandboxId: string) {
    if (!this.apiKey) return false;
    return this.client.kill(sandboxId, { apiKey: this.apiKey }).catch(() => false);
  }
}
