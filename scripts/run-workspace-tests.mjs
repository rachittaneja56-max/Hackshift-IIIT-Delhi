import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspacePaths = [
  "packages/contracts/package.json",
  "apps/api/package.json",
  "apps/web/package.json",
];

const workspacesWithTests = [];
for (const relativePath of workspacePaths) {
  const packageJson = JSON.parse(
    await readFile(resolve(projectRoot, relativePath), "utf8"),
  );
  if (packageJson.scripts?.test) {
    workspacesWithTests.push(packageJson.name);
  }
}

if (workspacesWithTests.length === 0) {
  console.log("No workspace test suites are configured; nothing ran.");
  process.exit(0);
}

const npmCliPath = process.env.npm_execpath;
if (!npmCliPath) {
  console.error("Run this script through `npm test` so npm can locate itself.");
  process.exit(1);
}

for (const workspace of workspacesWithTests) {
  const result = spawnSync(
    process.execPath,
    [npmCliPath, "run", "test", `--workspace=${workspace}`],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(result.status ?? 1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
