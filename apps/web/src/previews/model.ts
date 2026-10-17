import type { AttemptDto } from '@trajectoryos/contracts';
import type { Evidence } from '../lib/api.ts';
export function mentorPacket(attempt: AttemptDto, evidence: Evidence | null, selection: string[], question: string) {
  const artifact = evidence?.artifact ?? attempt.artifact;
  return { provenance: 'local-demo', attemptId: attempt.id, ...(evidence ? { evidenceId: evidence.id } : {}), artifactSource: evidence ? 'immutable evidence' : 'saved attempt; not evaluated', question,
    ...Object.fromEntries((['hld', 'lld', 'aiCritique', 'repairJustification', 'comments'] as const).filter(k => selection.includes(k)).map(k => [k, artifact[k] ?? 'Missing in this saved artifact'])),
    ...(selection.some(k => k.startsWith('T')) ? { tests: evidence?.result.tests.filter(t => selection.includes(t.id)) ?? [] } : {}) };
}
