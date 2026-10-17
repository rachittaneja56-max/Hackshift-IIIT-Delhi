import { execFileSync } from "node:child_process";
export function appCommit(configured?: string) {
  if (configured) return configured;
  try {
    const options = { cwd: new URL("../", import.meta.url), encoding: "utf8" as const, stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"] };
    const sha = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], options).trim();
    return sha + (dirty ? "+dirty" : "");
  }
  catch { return "unconfigured"; }
}
