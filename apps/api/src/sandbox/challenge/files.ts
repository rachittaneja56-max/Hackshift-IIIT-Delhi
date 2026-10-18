<<<<<<< HEAD
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const challengeSlug = "rate-limiter-debugging" as const;
export const challengeVersion = 2 as const;
export const editablePath = "src/rateLimiter.ts" as const;

const fromChallenge = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

export const packageManifest = fromChallenge("package.json");
export const packageLock = fromChallenge("package-lock.json");
export const visibleSuite = fromChallenge("test/visible.test.ts");

export const projectFiles: Record<string, string> = Object.freeze({
  "README.md": fromChallenge("README.md"),
  "package.json": packageManifest,
  "package-lock.json": packageLock,
  [editablePath]: fromChallenge("src/rateLimiter.ts"),
  "test/visible.test.ts": visibleSuite,
});

export const listedFiles = Object.freeze(Object.keys(projectFiles));
export const starterSource = projectFiles[editablePath]!;
export const starterSha256 = createHash("sha256").update(starterSource).digest("hex");
export const packageLockSha256 = createHash("sha256").update(packageLock).digest("hex");
export const visibleSuiteSha256 = createHash("sha256").update(visibleSuite).digest("hex");

const allChallengeSources = [
  "README.md", "package.json", "package-lock.json", "src/rateLimiter.ts", "reference.ts",
  "test/visible.test.ts", "test/private.test.ts",
].map(path => `${path}\0${fromChallenge(path)}`).join("\0");
export const challengeSourceSha256 = createHash("sha256").update(allChallengeSources).digest("hex");

export function isListedFile(value: string): value is keyof typeof projectFiles {
  return Object.hasOwn(projectFiles, value) && !value.includes("\\") && !value.split("/").some(part => part === ".." || part === "." || part === "");
}
=======
export const challengeSlug = "rate-limiter-debugging";
export const challengeVersion = 1;
export const editablePath = "src/rateLimiter.ts";
export const projectRoot = "/home/user/trajectoryos-lab";

export const starterSource = `import type { Decision } from "./types.ts";

/** One fixed window per API key, aligned to multiples of windowMs. */
export class FixedWindowLimiter {
  private buckets = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
      throw new RangeError("limit and windowMs must be positive integers");
    }
  }

  check(apiKey: string): Decision {
    const time = this.now();
    const bucket = this.buckets.get("all") ?? { start: time, count: 0 };
    if (time > bucket.start + this.windowMs) {
      bucket.start = time;
      bucket.count = 0;
    }
    bucket.count += 1;
    this.buckets.set("all", bucket);
    return bucket.count <= this.limit
      ? { allowed: true, retryAfterSeconds: 0 }
      : { allowed: false, retryAfterSeconds: 0 };
  }
}
`;

export const visibleTestSource = `import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedWindowLimiter } from "../src/rateLimiter.ts";

test("exact boundary opens a new window", () => {
  let now = 0;
  const limiter = new FixedWindowLimiter(1, 1000, () => now);
  assert.equal(limiter.check("a").allowed, true);
  now = 1000;
  assert.equal(limiter.check("a").allowed, true);
});

test("different API keys have independent allowance", () => {
  const limiter = new FixedWindowLimiter(1, 1000, () => 100);
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
});

test("denial reports whole seconds until reset", () => {
  const limiter = new FixedWindowLimiter(1, 1000, () => 950);
  limiter.check("a");
  assert.deepEqual(limiter.check("a"), { allowed: false, retryAfterSeconds: 1 });
});
`;

// Private grader material. It is only written into a fresh grading sandbox.
export const hiddenTestSource = `import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedWindowLimiter } from "../src/rateLimiter.ts";

test("window is aligned to epoch, not first request", () => {
  let now = 900;
  const limiter = new FixedWindowLimiter(1, 1000, () => now);
  assert.equal(limiter.check("a").allowed, true);
  now = 1000;
  assert.equal(limiter.check("a").allowed, true);
});

test("denied requests do not consume future capacity", () => {
  let now = 0;
  const limiter = new FixedWindowLimiter(1, 1000, () => now);
  limiter.check("a");
  for (let i = 0; i < 10; i++) assert.equal(limiter.check("a").allowed, false);
  now = 1000;
  assert.equal(limiter.check("a").allowed, true);
});

test("the delay uses the actual reset boundary", () => {
  const limiter = new FixedWindowLimiter(1, 3000, () => 2900);
  limiter.check("a");
  assert.deepEqual(limiter.check("a"), { allowed: false, retryAfterSeconds: 1 });
});

test("key state stays independent across windows", () => {
  let now = 5;
  const limiter = new FixedWindowLimiter(2, 1000, () => now);
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
  now = 1000;
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
});
`;

export const projectFiles: Record<string, string> = {
  "package.json": JSON.stringify({ name: "trajectoryos-rate-limiter", private: true, type: "module", scripts: { "test:visible": "tsx --test tests/visible.test.ts", "test:hidden": "tsx --test tests/hidden.test.ts" }, devDependencies: { tsx: "4.20.0" } }, null, 2) + "\n",
  "README.md": `# Rate limiter debugging\n\nImplement a fixed-window limit per API key. Windows align to epoch multiples of windowMs. A request is allowed when fewer than limit requests have been accepted in the current window. Denial does not consume capacity. An allowed decision has retryAfterSeconds=0; denial reports the positive number of whole seconds, rounded up, until the next window. Only src/rateLimiter.ts can be edited by the assistant.\n`,
  "src/rateLimiter.ts": starterSource,
  "src/server.ts": `import { FixedWindowLimiter } from "./rateLimiter.ts";\nexport const limiter = new FixedWindowLimiter(10, 60_000);\n`,
  "src/types.ts": `export type Decision = { allowed: boolean; retryAfterSeconds: number };\n`,
  "tests/visible.test.ts": visibleTestSource,
};

export const listedFiles = Object.keys(projectFiles);
>>>>>>> efc913c (sandbox frontend)
