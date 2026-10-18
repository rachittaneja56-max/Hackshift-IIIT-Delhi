import { SubmissionReadyArtifactSchema, type Artifact } from '@trajectoryos/contracts';
import { sceneError } from '../lib/scenes';

export type SubmissionIssueInput = { path: unknown[] | string; message?: unknown };
export type SubmissionIssue = { path: string; message: string; diagnostic: string; targetId: string };

const helpByPath: Record<string, string> = {
  'variantId': 'Choose the implementation you want evaluated.',
  'aiCritique': 'Explain what may be incorrect or incomplete in the AI suggestion.',
  'repairJustification': 'Explain why you selected this repair.',
  'decisions.keyScope': 'Choose whether the idempotency key is scoped per account or globally.',
  'decisions.atomicity': 'Choose the database write boundary.',
  'decisions.payloadConflict': 'Choose how the API handles a changed payload with the same key.',
};

function normalizedPath(input: unknown[] | string) {
  const parts = Array.isArray(input) ? input.map(String) : String(input).split('.');
  return parts[0] === 'artifact' ? parts.slice(1).join('.') : parts.join('.');
}

export function submissionIssue(input: SubmissionIssueInput): SubmissionIssue {
  const path = normalizedPath(input.path);
  const rawMessage = typeof input.message === 'string' ? input.message : 'The server rejected this value.';
  const scene = path === 'hld' || path === 'lld';
  const message = helpByPath[path] ?? (scene
    ? /nondeleted drawable/i.test(rawMessage)
      ? `${path.toUpperCase()} diagram: Add at least one element.`
      : /1 mib|request limit/i.test(rawMessage)
        ? `${path.toUpperCase()} diagram: Reduce drawing detail to fit the submission size limit.`
        : /200 elements/i.test(rawMessage)
          ? `${path.toUpperCase()} diagram: Keep the drawing to 200 elements or fewer.`
          : /unsupported element|linked elements/i.test(rawMessage)
            ? `${path.toUpperCase()} diagram: Remove unsupported or linked elements.`
            : `${path.toUpperCase()} diagram: Review unsupported elements or drawing size.`
    : 'Review this field and try again.');
  const targetId = path ? `field-${path.replaceAll('.', '-')}` : 'review-title';
  return { path, message, diagnostic: rawMessage, targetId };
}

export function submissionIssues(artifact: Artifact, revision = 1): SubmissionIssue[] {
  const parsed = SubmissionReadyArtifactSchema.safeParse(artifact);
  const issues = parsed.success ? [] : parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message }));
  const hldError = sceneError(artifact.hld);
  const lldError = sceneError(artifact.lld);
  if (hldError) issues.push({ path: ['hld'], message: hldError });
  if (lldError) issues.push({ path: ['lld'], message: lldError });
  if (new TextEncoder().encode(JSON.stringify({ expectedRevision: revision, artifact })).length > 1024 * 1024) {
    issues.push({ path: ['hld'], message: 'Submission exceeds the 1 MiB request limit.' });
  }
  const unique = new Map<string, SubmissionIssue>();
  for (const issue of issues) {
    const mapped = submissionIssue(issue);
    if (!unique.has(mapped.path)) unique.set(mapped.path, mapped);
  }
  return [...unique.values()];
}

export function serverSubmissionIssues(value: unknown): SubmissionIssue[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, SubmissionIssue>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const issue = item as Record<string, unknown>;
    const path = Array.isArray(issue.path) || typeof issue.path === 'string' ? issue.path as unknown[] | string : '';
    const mapped = submissionIssue({ path, message: issue.message });
    if (!unique.has(mapped.path)) unique.set(mapped.path, mapped);
  }
  return [...unique.values()];
}
