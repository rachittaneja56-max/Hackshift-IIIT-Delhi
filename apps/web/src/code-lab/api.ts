import { z } from 'zod';
import type { ApiClient } from '../lib/api';

const id = z.string().uuid();
const iso = z.iso.datetime({ offset: true });
const observation = z.object({ exitCode: z.number().int().nullable(), stdout: z.string(), stderr: z.string(), durationMs: z.number(),
  passed: z.number().int().nullable(), failed: z.number().int().nullable(), infrastructureFailure: z.string().optional(), timedOut: z.boolean().optional() });
const toolEvent = z.object({ name: z.string(), arguments: z.unknown(), result: z.unknown(), at: iso });
export const turnSchema = z.object({ id, ordinal: z.number().int(), prompt: z.string(), status: z.enum(['processing', 'completed', 'error']),
  response: z.string().nullable(), model: z.string(), toolEvents: z.array(toolEvent), sourceSha256: z.string().nullable(), failureCode: z.string().nullable(), createdAt: iso });
export const runSchema = z.object({ id, kind: z.enum(['visible', 'hidden']), status: z.enum(['running', 'completed', 'infrastructure_error', 'timeout']),
  sourceSha256: z.string(), observation: observation.nullable(), createdAt: iso, completedAt: iso.nullable() });
export const sessionSchema = z.object({ id, challengeSlug: z.literal('rate-limiter-debugging'), challengeVersion: z.literal(1),
  status: z.enum(['creating', 'ready', 'processing', 'freezing', 'grading', 'submitted', 'expired', 'error']), expiresAt: iso,
  promptCount: z.number().int().min(0).max(5), promptsRemaining: z.number().int().min(0).max(5),
  visibleRunsRemaining: z.number().int().min(0).max(10), currentSha256: z.string(), createdAt: iso, failureCode: z.string().nullable(),
  turns: z.array(turnSchema).optional(), visibleTests: z.array(runSchema).optional() })
  .refine(value => value.promptsRemaining === 5 - value.promptCount, { message: 'Inconsistent prompt count.' });
export const filesSchema = z.object({ files: z.array(z.object({ path: z.string(), editable: z.boolean(), content: z.string(), changed: z.boolean() })),
  starterSource: z.string(), currentSha256: z.string().nullable() });
export const reportSchema = z.object({ challengeSlug: z.literal('rate-limiter-debugging'), challengeVersion: z.literal(1),
  verdict: z.enum(['correct', 'incorrect', 'infrastructure_error', 'timeout']), submittedSource: z.string(), starterSource: z.string(),
  sourceHash: z.string(), starterHash: z.string(), promptCount: z.number(), transcript: z.array(turnSchema), visibleTests: z.array(runSchema),
  hiddenTests: observation, execution: z.object({ provider: z.string(), sdk: z.string(), runner: z.string(), nodeVersion: z.string().optional(), packageLockSha256: z.string().optional(), network: z.string(), graderSandboxId: z.string() }), limits: z.string() });
const availabilitySchema = z.object({ available: z.boolean(), challengeSlug: z.literal('rate-limiter-debugging'), challengeVersion: z.literal(1) });

export type SandboxSession = z.infer<typeof sessionSchema>;
export type SandboxFiles = z.infer<typeof filesSchema>;
export type SandboxReport = z.infer<typeof reportSchema>;
export type SandboxTurn = z.infer<typeof turnSchema>;
export type SandboxRun = z.infer<typeof runSchema>;

export function sandboxApi(api: ApiClient) {
  const base = '/sandbox/sessions';
  return {
    availability: () => api.request('/sandbox/availability', availabilitySchema),
    start: (clientRequestId: string) => api.request(base, sessionSchema, 'POST', { clientRequestId }),
    session: (sessionId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}`, sessionSchema),
    files: (sessionId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/files`, filesSchema),
    send: (sessionId: string, clientRequestId: string, prompt: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/turns`, turnSchema, 'POST', { clientRequestId, prompt }),
    turn: (sessionId: string, turnId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`, turnSchema),
    visible: (sessionId: string, clientRequestId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/visible-tests`, runSchema, 'POST', { clientRequestId }),
    submit: (sessionId: string, clientRequestId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/submit`, sessionSchema, 'POST', { clientRequestId }),
    report: (sessionId: string) => api.request(`${base}/${encodeURIComponent(sessionId)}/report`, reportSchema),
  };
}