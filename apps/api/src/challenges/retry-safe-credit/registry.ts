import type { VariantId } from "@trajectoryos/contracts";
import { atomic } from "./atomic.js";
import { creditFirst } from "./credit-first.js";
import { keyOnly } from "./key-only.js";
import type { CreditVariant } from "./types.js";
import { randomUUID } from "node:crypto";

// Static imports only. Neither source text nor paths from HTTP requests are executable.
const variants: Record<VariantId, CreditVariant> = { atomic, "credit-first": creditFirst, "key-only": keyOnly };
export function createVariant(id: VariantId): CreditVariant {
  const implementation = variants[id];
  return (client, input, hooks) => implementation(client, input, hooks);
}
export async function freshVariant(id: VariantId): Promise<CreditVariant> {
  // Cache-busting is server-generated and restricted to these three reviewed modules.
  const names = { atomic: ["atomic", "atomic"], "credit-first": ["credit-first", "creditFirst"], "key-only": ["key-only", "keyOnly"] } as const;
  const [file, exported] = names[id];
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  const url = new URL(`./${file}${extension}`, import.meta.url);
  url.searchParams.set("instance", randomUUID());
  const module = await import(url.href);
  return module[exported] as CreditVariant;
}
