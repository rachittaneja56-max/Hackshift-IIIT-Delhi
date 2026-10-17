import { readFile } from "node:fs/promises";
import { ChallengeDtoSchema, CourseListDtoSchema, LessonDtoSchema, type VariantId } from "@trajectoryos/contracts";
import { sha256 } from "../db/hash.js";
const sourceDirectory = new URL(
  import.meta.url.endsWith(".ts")
    ? "../challenges/retry-safe-credit/"
    : "../challenge-source/",
  import.meta.url,
);
export const variantFiles = Object.fromEntries(await Promise.all((["credit-first", "key-only", "atomic"] as VariantId[]).map(async id => [id,
  await Promise.all([`${id}.ts`, "shared.ts", "types.ts"].map(async path => ({ path, language: "typescript" as const,
    source: (await readFile(new URL(path, sourceDirectory), "utf8")).replaceAll("\r\n", "\n") }))),
]))) as Record<VariantId, { path: string; language: "typescript"; source: string }[]>;
export const testDescriptions = [
  { id: "T1", description: "One valid credit stores one operation, ledger entry and replayable response." },
  { id: "T2", description: "Sequential retries, including a fresh module instance, replay without another credit." },
  { id: "T3", description: "Concurrent duplicate requests on independent PostgreSQL clients replay one effect." },
  { id: "T4", description: "A changed amount with the same account/key returns 409 without a write." },
  { id: "T5", description: "Injected failure after balance mutation rolls back all effects; retry succeeds." },
  { id: "T6", description: "The same key on two accounts creates independent operations." },
  { id: "T7", description: "Concurrent distinct keys on one account preserve both credits." },
];
export const limitations = ["Synthetic fixture credits only; no real money or financial data.",
  "Tests execute a selected reviewed implementation, not learner-authored code.",
  "These observations cover the disclosed cases and schedule, not every interleaving or production workload.",
  "Diagrams and self-reported reasoning require human review; they are not automatically graded.",
  "Results do not establish authorship, general proficiency or hiring suitability."];
export const challenge = ChallengeDtoSchema.parse({ slug: "retry-safe-credit", version: 1, title: "Retry-safe account credits",
  evaluationMode: "approved_variant", suiteVersion: "retry-safe-credit-v1", hiddenCases: false,
  requirementMarkdown: "## Simulated credit contract\nAccept a positive integer amountMinor and an account-scoped idempotency key. Apply one credit and persist the original 201 response. Same payload retries must replay the exact response, including concurrent retries and module reinitialization. Changed payload returns 409 without writes. Different keys and accounts are independent. Failure after balance mutation must roll back balance, operation and ledger; retry must succeed. All values are synthetic fixture minor units.",
  faultyAiSuggestion: { id: "credit-before-key-v1", title: "Curated faulty AI suggestion for critique",
    text: "First increment the account balance, then insert the idempotency key. If that key already exists, return its saved response. A unique key alone will prevent double credit even if the balance update has committed.", source: "curated_fixture" },
  variants: (["credit-first", "key-only", "atomic"] as VariantId[]).map(id => ({ id, label: id, files: variantFiles[id] })), testDescriptions,
  diagramPrompts: { hld: "Show the client, API, database and retry boundary.", lld: "Show account-scoped key reservation, payload conflict handling, transaction and persisted response." }, limitations });
const lessonBody = { slug: "retry-safe-writes", version: 1, title: "Retries, unique keys and transaction boundaries",
  authoredBy: "TrajectoryOs backend seed; editorial review pending", challenge: { slug: "retry-safe-credit", version: 1 },
  blocks: [
    { id: "retry", type: "markdown", markdown: "A client may retry after losing a response. Persist the operation response under an account-scoped key and hash of the canonical payload. A retry can then return the original response without applying another credit.", sourceIds: ["pg-unique"] },
    { id: "atomicity", type: "markdown", markdown: "A unique key alone does not make separate writes atomic. Reserve the key, update the balance, append a ledger entry and store the response in one transaction. Use the same checked-out connection for BEGIN, every statement and COMMIT or ROLLBACK. Conflicting inserts wait for the other transaction; read its committed response in a subsequent statement.", sourceIds: ["pg-tx", "pg-unique", "node-pg"] },
    { id: "limits", type: "callout", tone: "warning", markdown: "This exercise demonstrates database effects in synthetic accounts. It does not establish exactly-once external side effects or automatically validate your diagrams.", sourceIds: [] }],
  sources: [
    { id: "pg-tx", title: "PostgreSQL: Transactions", url: "https://www.postgresql.org/docs/current/tutorial-transactions.html" },
    { id: "pg-unique", title: "PostgreSQL: INSERT ON CONFLICT", url: "https://www.postgresql.org/docs/current/sql-insert.html" },
    { id: "node-pg", title: "node-postgres: Transactions", url: "https://node-postgres.com/features/transactions" }] };
export const lesson = LessonDtoSchema.parse({ ...lessonBody, contentSha256: sha256(lessonBody) });
export const courses = CourseListDtoSchema.parse([{ slug: "reliable-backend", title: "Reliable backend foundations (seeded)",
  lessons: [{ slug: lesson.slug, version: lesson.version, title: lesson.title }] }]);
export const contentManifest = { challenge, lesson, courses };
