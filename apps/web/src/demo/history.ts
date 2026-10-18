import { z } from 'zod';
import { getCandidate, type DemoArtifact } from './fixtures';
import { exampleResponse, isShortlisted, type DemoState } from './model';

const origins = {
  learning: 'fictional-content-interaction',
  design: 'representative-design-summary',
  investigation: 'fictional-candidate-writing',
  observation: 'synthetic-evaluation',
  question: 'candidate-demo-action',
  guidance: 'illustrative-mentor-response',
  application: 'local-demo-application',
  shortlist: 'human-demo-action',
} as const;
export const historyEventSchema = z.object({
  id: z.string().min(1), candidateId: z.literal('ananya'),
  type: z.enum(['learning', 'design', 'investigation', 'observation', 'question', 'guidance', 'application', 'shortlist']),
  origin: z.enum(Object.values(origins)),
  title: z.string().min(1), summary: z.string().min(1),
  relatedArtifactIds: z.array(z.string()).max(10).optional(),
}).strict().superRefine((event, context) => {
  if (event.origin !== origins[event.type]) context.addIssue({ code: 'custom', message: 'History origin does not match event type' });
  const ids = event.relatedArtifactIds ?? [];
  if (new Set(ids).size !== ids.length || ids.some(id => !getCandidate('ananya').artifacts.some(item => item.id === id))) context.addIssue({ code: 'custom', message: 'History must reference canonical Ananya artifacts' });
  if (['design', 'investigation', 'observation'].includes(event.type) && !ids.length) context.addIssue({ code: 'custom', message: 'Evidence event needs an artifact' });
  if (event.type === 'learning' && ids.length) context.addIssue({ code: 'custom', message: 'Learning interactions are private fixture content, not submitted artifacts' });
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;
const event = (id: string, type: HistoryEvent['type'], title: string, summary: string, relatedArtifactIds?: string[]): HistoryEvent => historyEventSchema.parse({ id, candidateId: 'ananya', type, origin: origins[type], title, summary, ...(relatedArtifactIds ? { relatedArtifactIds } : {}) });

// Ordered fixture milestones, without invented activity dates or LMS completions.
export const learningHistory = [
  event('network-concepts', 'learning', 'Explored network reliability', 'Computer Networks · HTTP request/response loss, application retries and why duplicate requests occur. Fictional viewed concept.'),
  event('database-concepts', 'learning', 'Studied database transactions', 'Database Internals · atomicity, transaction boundaries, unique constraints and rollback. Fictional content interaction.'),
];

/** Receives only supplied materials. It cannot look up a private candidate by ID. */
export function artifactHistory(artifacts: readonly DemoArtifact[]): HistoryEvent[] {
  return artifacts.flatMap(item => {
    if (item.kind === 'hld' || item.kind === 'lld') return [event(`design-${item.id}`, 'design', `Created ${item.kind.toUpperCase()} design summary`, item.label, [item.id])];
    if (item.kind === 'reasoning' || item.kind === 'critique') return [event(`writing-${item.id}`, 'investigation', item.kind === 'reasoning' ? 'Investigated transaction boundaries' : 'Questioned an engineering suggestion', item.label, [item.id])];
    if (item.kind === 'tests') {
      const passed = item.checks.filter(check => check.status === 'passed').length;
      const failed = item.checks.filter(check => check.status === 'failed');
      return [event(`observed-${item.id}`, 'observation', item.checks.length === 7 ? `Reviewed ${passed}/7 synthetic checks passed` : 'Inspected a synthetic observation', failed.length ? `${failed.length === 1 ? 'Concurrent-retry check failed' : 'Failed checks recorded'} · duplicate credit under concurrent requests. Selected implementation; independent authorship unassessed.` : 'Selected synthetic observations available; production behavior and authorship unassessed.', [item.id])];
    }
    return [];
  }).sort((a, b) => ['design', 'investigation', 'observation'].indexOf(a.type) - ['design', 'investigation', 'observation'].indexOf(b.type));
}

export function candidateHistory(state: DemoState): HistoryEvent[] {
  const packet = state.mentor;
  const app = state.applications.ananya;
  const response = exampleResponse(state);
  return [
    ...learningHistory,
    ...artifactHistory(getCandidate('ananya').artifacts.filter(item => item.id !== 'a-failure')),
    event('mentor-question', 'question', packet.status === 'not_requested' ? 'Prepared a mentor question' : 'Selected mentorship context', packet.question, packet.selected),
    ...(response ? [event('mentor-example', 'guidance', 'Mentor example reviewed', response.nextAction, packet.selected)] : []),
    ...(app.status !== 'not_started' ? [event('job-application', 'application', app.status === 'submitted_demo' ? 'Shared work with Northstar' : 'Prepared an application', `${app.selected.length} selected artifacts · ${app.status === 'submitted_demo' ? 'submitted in this browser' : 'awaiting submission'} · Junior Backend Engineer.`, app.selected)] : []),
    ...(isShortlisted(state, 'ananya') ? [event('manual-shortlist', 'shortlist', 'Shortlisted in this demo', 'Manual employer review for a technical conversation. No invitation or interview date.', app.selected)] : []),
  ];
}

/** Projection of the submitted packet, never of private learning or mentorship activity. */
export function sharedHistory(artifacts: readonly DemoArtifact[]): HistoryEvent[] {
  const owned = getCandidate('ananya').artifacts;
  // Match canonical values as well as IDs; a known ID cannot smuggle private text.
  const canonical = artifacts.filter(item => owned.some(source => source.id === item.id && JSON.stringify(source) === JSON.stringify(item)));
  return artifactHistory(canonical);
}
