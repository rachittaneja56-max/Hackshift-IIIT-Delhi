import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const privateSuite = readFileSync(new URL("test/private.test.ts", import.meta.url), "utf8");
const referenceSource = readFileSync(new URL("reference.ts", import.meta.url), "utf8");
export const privateSuitePath = "test/private.test.ts";
export const privateSuiteSha256 = createHash("sha256").update(privateSuite).digest("hex");
export const referenceSourceSha256 = createHash("sha256").update(referenceSource).digest("hex");
export { privateSuite, referenceSource };

export const visibleTestNames = [
  "allows requests below the configured quota",
  "denies requests after the quota is used",
  "keeps API key quotas independent",
  "opens a new epoch-aligned window at the boundary",
  "rounds retry delay up to the next whole second",
] as const;

export const privateTestNames = [
  "rejects invalid quota and window configuration",
  "uses the injected clock instead of wall-clock time",
  "keeps independent state for separate limiter instances",
  "does not report a negative retry delay at a boundary",
] as const;
