import { copyFile, mkdir, readdir } from "node:fs/promises";

const challengeSourceDirectory = new URL("../src/challenges/retry-safe-credit/", import.meta.url);
const challengeOutputDirectory = new URL("../dist/challenge-source/", import.meta.url);
const reviewedFiles = [
  "atomic.ts",
  "credit-first.ts",
  "key-only.ts",
  "registry.ts",
  "shared.ts",
  "suite.ts",
  "types.ts",
];
await mkdir(challengeOutputDirectory, { recursive: true });
for (const name of reviewedFiles) {
  await copyFile(new URL(name, challengeSourceDirectory), new URL(name, challengeOutputDirectory));
}

const migrationSourceDirectory = new URL("../migrations/", import.meta.url);
const migrationOutputDirectory = new URL("../dist/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationSourceDirectory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
if (migrationFiles.length === 0) throw new Error("No numbered API migrations were found to package.");
await mkdir(migrationOutputDirectory, { recursive: true });
for (const name of migrationFiles) {
  await copyFile(new URL(name, migrationSourceDirectory), new URL(name, migrationOutputDirectory));
}

const sandboxSourceDirectory = new URL("../src/sandbox/challenge/", import.meta.url);
const sandboxOutputDirectory = new URL("../dist/sandbox/challenge/", import.meta.url);
const sandboxFiles = ["README.md", "package.json", "package-lock.json", "reference.ts", "src/rateLimiter.ts",
  "test/visible.test.ts", "test/private.test.ts"];
for (const name of sandboxFiles) {
  const output = new URL(name, sandboxOutputDirectory);
  await mkdir(new URL(".", output), { recursive: true });
  await copyFile(new URL(name, sandboxSourceDirectory), output);
}

console.log("Packaged " + reviewedFiles.length + " reviewed credit challenge sources, " + sandboxFiles.length +
  " sandbox challenge v2 assets, and " + migrationFiles.length + " migration files for the API runtime.");
