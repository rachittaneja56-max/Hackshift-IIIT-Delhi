import { z } from "zod";

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

export const SandboxCreateRequestSchema = z.object({ clientRequestId: uuid }).strict();
export const SandboxTurnRequestSchema = SandboxCreateRequestSchema.extend({ prompt: z.string().trim().min(1).max(4_000) }).strict();

export const SandboxTestCaseSchema = z.object({
  name: z.string().min(1).max(300),
  status: z.enum(["passed", "failed"]),
}).strict();

export const SandboxObservationSchema = z.object({
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(24_200),
  stderr: z.string().max(24_200),
  durationMs: z.number().finite().nonnegative(),
  passed: z.number().int().nonnegative().nullable(),
  failed: z.number().int().nonnegative().nullable(),
  tests: z.array(SandboxTestCaseSchema).max(20),
  suiteSha256: sha256,
  sourceSha256: sha256,
  infrastructureFailure: z.string().max(500).optional(),
  timedOut: z.boolean().optional(),
}).strict();

const legacyObservation = z.object({
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().finite().nonnegative(),
  passed: z.number().int().nullable(),
  failed: z.number().int().nullable(),
  infrastructureFailure: z.string().optional(),
  timedOut: z.boolean().optional(),
}).passthrough();

export const SandboxTurnDtoSchema = z.object({
  id: uuid, ordinal: z.number().int().min(1).max(5), prompt: z.string(), status: z.enum(["processing", "completed", "error"]),
  response: z.string().nullable(), model: z.string(), toolEvents: z.array(z.object({
    name: z.string(), arguments: z.unknown(), result: z.unknown(), at: timestamp,
  }).strict()), sourceSha256: sha256.nullable(), failureCode: z.string().nullable(), createdAt: timestamp,
}).strict();

export const SandboxRunDtoSchema = z.object({
  id: uuid, kind: z.enum(["visible", "hidden"]), status: z.enum(["running", "completed", "infrastructure_error", "timeout"]),
  sourceSha256: sha256, challengeVersion: z.union([z.literal(1), z.literal(2)]).optional(), suiteSha256: sha256.nullable().optional(),
  implementationSha256: sha256.nullable().optional(), sourceRevision: z.union([z.number().int().nonnegative(), z.string()]).nullable().optional(),
  observation: z.union([SandboxObservationSchema, legacyObservation]).nullable(), createdAt: timestamp, completedAt: timestamp.nullable(),
}).passthrough();

export const SandboxSessionDtoSchema = z.object({
  id: uuid, challengeSlug: z.literal("rate-limiter-debugging"), challengeVersion: z.union([z.literal(1), z.literal(2)]),
  status: z.enum(["creating", "ready", "processing", "freezing", "grading", "submitted", "expired", "error"]),
  expiresAt: timestamp, promptCount: z.number().int().min(0).max(5), promptsRemaining: z.number().int().min(0).max(5),
  visibleRunsRemaining: z.number().int().min(0).max(10), currentSha256: sha256, createdAt: timestamp,
  failureCode: z.string().nullable(), turns: z.array(SandboxTurnDtoSchema).optional(), visibleTests: z.array(SandboxRunDtoSchema).optional(),
}).strict().refine(value => value.promptsRemaining === 5 - value.promptCount, { message: "Prompt count does not match the five prompt budget." });

export const SandboxFilesDtoSchema = z.object({
  files: z.array(z.object({ path: z.string(), editable: z.boolean(), content: z.string(), changed: z.boolean() }).strict()),
  starterSource: z.string(), currentSha256: sha256.nullable(),
}).strict();

export const SandboxReportDtoSchema = z.object({
  challengeSlug: z.literal("rate-limiter-debugging"), challengeVersion: z.union([z.literal(1), z.literal(2)]),
  verdict: z.enum(["correct", "incorrect", "infrastructure_error", "timeout"]), submittedSource: z.string(), starterSource: z.string(),
  sourceHash: sha256, starterHash: sha256, promptCount: z.number().int().min(0).max(5), transcript: z.array(SandboxTurnDtoSchema),
  visibleTests: z.array(SandboxRunDtoSchema), hiddenTests: z.union([SandboxObservationSchema, legacyObservation]),
  execution: z.object({ provider: z.string(), sdk: z.string(), runner: z.string(), nodeVersion: z.string().optional(),
    packageLockSha256: sha256.optional(), challengeSourceSha256: sha256.optional(), network: z.string(), graderSandboxId: z.string() }).passthrough(),
  challengeReconstruction: z.string().optional(), challengeSourceSha256: sha256.optional(), visibleSuiteSha256: sha256.optional(),
  privateSuiteSha256: sha256.optional(), packageLockSha256: sha256.optional(),
  sourceRevision: z.union([z.number().int().nonnegative(), z.string()]).optional(),
  infrastructureFailure: z.string().optional(), limits: z.string(),
}).passthrough();

export const SandboxAvailabilityDtoSchema = z.object({
  available: z.boolean(), challengeSlug: z.literal("rate-limiter-debugging"), challengeVersion: z.literal(2),
}).strict();

export type SandboxSessionDto = z.infer<typeof SandboxSessionDtoSchema>;
export type SandboxTurnDto = z.infer<typeof SandboxTurnDtoSchema>;
export type SandboxRunDto = z.infer<typeof SandboxRunDtoSchema>;
export type SandboxFilesDto = z.infer<typeof SandboxFilesDtoSchema>;
export type SandboxReportDto = z.infer<typeof SandboxReportDtoSchema>;
export type SandboxObservationDto = z.infer<typeof SandboxObservationSchema>;
