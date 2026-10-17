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
