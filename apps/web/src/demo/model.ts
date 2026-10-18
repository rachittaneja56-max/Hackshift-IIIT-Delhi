import { z } from 'zod';
import { candidateIds, candidateSchema, candidates, demoMeta, exampleLabel, getArtifacts, getCandidate, job, mentorQuestion, requirementReferences, type CandidateId, type DemoArtifact } from './fixtures';

export const STORAGE_KEY = 'trajectoryos:fictional-journey:v1';
const timestamp = z.string().datetime();
const ids = z.array(z.string()).max(10).refine(values => new Set(values).size === values.length, 'Duplicate evidence IDs');
const applicationSchema = z.object({
  status: z.enum(['not_started', 'prepared', 'submitted_demo']), selected: ids, consent: z.boolean(),
  submittedAt: timestamp.nullable(), origin: z.enum(['candidate_demo_action', 'seeded_demo_application']),
}).strict();
const decisionSchema = z.object({
  candidateId: z.enum(candidateIds), jobId: z.literal('northstar-backend-demo'),
  decision: z.enum(['shortlisted_demo', 'reversed_demo']), reviewerNote: z.string().max(500), timestamp,
  provenance: z.literal('human-demo-action'), meta: z.object({ isMock: z.literal(true), provenance: z.literal('fictional-demo') }).strict(),
}).strict();
const baseStateSchema = z.object({
  version: z.literal(1), meta: z.object({ isMock: z.literal(true), provenance: z.literal('fictional-demo') }).strict(),
  job: z.enum(['draft', 'published_demo']),
  applications: z.object({ ananya: applicationSchema, kabir: applicationSchema, meera: applicationSchema }).strict(),
  decisions: z.array(decisionSchema).max(200),
  mentor: z.object({ status: z.enum(['not_requested', 'packet_prepared', 'example_review_available']), selected: ids, question: z.string().max(1000), consent: z.boolean(), requestedAt: timestamp.nullable() }).strict(),
}).strict();
export type DemoState = z.infer<typeof baseStateSchema>;
export const demoStateSchema = baseStateSchema.superRefine((state, context) => {
  const invalid = (message: string) => context.addIssue({ code: 'custom', message });
  for (const id of candidateIds) {
    const app = state.applications[id];
    if (app.selected.some(value => !getCandidate(id).artifacts.some(item => item.id === value))) invalid('Unknown candidate evidence');
    if (app.status === 'not_started' && (app.selected.length || app.consent || app.submittedAt)) invalid('Invalid initial application');
    if (app.status !== 'not_started' && !app.selected.length) invalid('Application needs evidence');
    if (app.status === 'prepared' && app.submittedAt) invalid('Prepared application cannot be submitted');
    if (app.status === 'submitted_demo' && (!app.consent || !app.submittedAt)) invalid('Submission requires recorded consent');
    if (id === 'ananya' && app.origin !== 'candidate_demo_action') invalid('Invalid candidate origin');
    if (id !== 'ananya' && app.origin !== 'seeded_demo_application') invalid('Invalid seed origin');
    if (id === 'ananya' && app.status === 'submitted_demo' && state.job !== 'published_demo') invalid('Unpublished application');
  }
  const active = new Set<string>(); let previous = '';
  for (const decision of state.decisions) {
    if (state.applications[decision.candidateId].status !== 'submitted_demo') invalid('Decision needs submitted application');
    if (decision.timestamp < previous) invalid('Decision history is out of order');
    previous = decision.timestamp;
    if (decision.decision === 'shortlisted_demo') {
      if (active.has(decision.candidateId)) invalid('Duplicate shortlist');
      active.add(decision.candidateId);
    } else {
      if (!active.delete(decision.candidateId)) invalid('Reversal needs shortlist');
    }
  }
  const packet = state.mentor;
  if (packet.selected.some(value => !getCandidate('ananya').artifacts.some(item => item.id === value))) invalid('Unknown mentor evidence');
  if (packet.status === 'not_requested' && (packet.selected.length || packet.consent || packet.requestedAt)) invalid('Invalid initial mentor packet');
  if (packet.status !== 'not_requested' && (!packet.selected.length || !packet.question.trim())) invalid('Mentor packet needs context and a question');
  if (packet.status === 'packet_prepared' && packet.requestedAt) invalid('Prepared packet cannot be requested');
  if (packet.status === 'example_review_available' && (!packet.consent || !packet.requestedAt)) invalid('Review requires consent');
});

export function initialDemoState(): DemoState {
  const seed = (id: CandidateId): DemoState['applications']['ananya'] => ({ status: 'submitted_demo', selected: getCandidate(id).artifacts.map(item => item.id), consent: true, submittedAt: '2026-10-18T04:00:00.000Z', origin: 'seeded_demo_application' });
  return { version: 1, meta: demoMeta, job: 'draft', applications: {
    ananya: { status: 'not_started', selected: [], consent: false, submittedAt: null, origin: 'candidate_demo_action' },
    kabir: seed('kabir'), meera: seed('meera'),
  }, decisions: [], mentor: { status: 'not_requested', selected: [], question: mentorQuestion, consent: false, requestedAt: null } };
}
export type DemoAction =
  | { type: 'publish' } | { type: 'reset' }
  | { type: 'prepare_application'; selected: string[] }
  | { type: 'application_consent'; consent: boolean } | { type: 'submit_application'; at: string }
  | { type: 'shortlist'; candidateId: CandidateId; confirmed: boolean; note: string; at: string }
  | { type: 'reverse_shortlist'; candidateId: CandidateId; at: string }
  | { type: 'prepare_mentor'; selected: string[]; question: string }
  | { type: 'mentor_consent'; consent: boolean } | { type: 'request_mentor'; at: string };
export class DemoTransitionError extends Error {}
function requireState(condition: unknown, message: string): asserts condition { if (!condition) throw new DemoTransitionError(message); }
export function isShortlisted(state: DemoState, id: CandidateId) { return state.decisions.filter(item => item.candidateId === id).at(-1)?.decision === 'shortlisted_demo'; }
export function transition(state: DemoState, action: DemoAction): DemoState {
  demoStateSchema.parse(state);
  if (action.type === 'reset') return initialDemoState();
  const next = structuredClone(state);
  const app = next.applications.ananya;
  switch (action.type) {
    case 'publish': next.job = 'published_demo'; break;
    case 'prepare_application':
      requireState(next.job === 'published_demo', 'Publish the demo job first.');
      requireState(app.status !== 'submitted_demo', 'The submitted package is frozen. Reset the demo to start again.');
      app.selected = [...action.selected]; app.status = 'prepared'; app.consent = false; break;
    case 'application_consent':
      requireState(app.status === 'prepared', 'Prepare the application before consenting.'); app.consent = action.consent; break;
    case 'submit_application':
      requireState(app.status === 'prepared' && app.consent, 'Prepare a package and confirm sharing consent before submission.');
      app.status = 'submitted_demo'; app.submittedAt = action.at; break;
    case 'shortlist':
      requireState(action.confirmed, 'An explicit human confirmation is required.');
      requireState(next.applications[action.candidateId]?.status === 'submitted_demo', 'Only a submitted demo applicant can be shortlisted.');
      requireState(!isShortlisted(next, action.candidateId), 'Candidate is already shortlisted.');
      next.decisions.push({ candidateId: action.candidateId, jobId: job.id, decision: 'shortlisted_demo', reviewerNote: action.note.trim(), timestamp: action.at, provenance: 'human-demo-action', meta: demoMeta }); break;
    case 'reverse_shortlist':
      requireState(isShortlisted(next, action.candidateId), 'Candidate is not shortlisted.');
      next.decisions.push({ candidateId: action.candidateId, jobId: job.id, decision: 'reversed_demo', reviewerNote: 'Shortlist reversed by demo recruiter.', timestamp: action.at, provenance: 'human-demo-action', meta: demoMeta }); break;
    case 'prepare_mentor':
      next.mentor = { status: 'packet_prepared', selected: [...action.selected], question: action.question.trim(), consent: false, requestedAt: null }; break;
    case 'mentor_consent':
      requireState(next.mentor.status === 'packet_prepared', 'Prepare the mentor packet first.'); next.mentor.consent = action.consent; break;
    case 'request_mentor':
      requireState(next.mentor.status === 'packet_prepared' && next.mentor.consent, 'Preview the mentor packet and confirm sharing consent first.');
      next.mentor.status = 'example_review_available'; next.mentor.requestedAt = action.at; break;
  }
  const validated = demoStateSchema.safeParse(next);
  if (!validated.success) throw new DemoTransitionError('This transition contains invalid evidence, state or timestamp.');
  return validated.data;
}

// Views receive projections, never a private candidate artifact collection.
export function employerApplication(state: DemoState, id: CandidateId) {
  const application = state.applications[id];
  if (application.status !== 'submitted_demo') return null;
  const candidate = getCandidate(id);
  return { candidateId: id, name: candidate.name, fictional: true, meta: demoMeta, application, artifacts: getArtifacts(id, application.selected) };
}
export function mentorPacket(state: DemoState) {
  if (state.mentor.status === 'not_requested') return null;
  return { candidateId: 'ananya', name: 'Ananya Mehta', ...state.mentor, artifacts: getArtifacts('ananya', state.mentor.selected), meta: demoMeta };
}
export function requirementMapping(artifacts: DemoArtifact[]) {
  return [...job.requirements.map(requirement => {
    const references = requirementReferences[requirement.id]!;
    const support = artifacts.flatMap(item => [
      ...item.checks.filter(check => references.checks.includes(check.id)).map(check => ({ id: `${item.id}:${check.id}`, text: `${check.id} · ${check.label}: synthetic ${check.status}`, limitation: 'Selected reviewed implementation only; independent authorship and production competence are unassessed.' })),
      ...(references.kinds.includes(item.kind) ? [{ id: item.id, text: `${item.label} · ${item.source}`, limitation: 'Material is available for human review; its correctness and clarity are unassessed.' }] : []),
    ]);
    return { id: requirement.id, requirement: requirement.text, status: support.length ? 'Evidence available for review' : 'Not assessed from shared materials', support };
  }), ...['Operate backend systems in production.', 'Independently author the reviewed implementation.'].map((requirement, i) => ({ id: `unassessed-${i}`, requirement, status: 'Not assessed from shared materials', support: [] }))];
}
export function exampleResponse(state: DemoState) {
  const packet = mentorPacket(state);
  if (!packet || packet.status !== 'example_review_available') return null;
  const failure = packet.artifacts.some(item => item.checks.some(check => check.id === 'T3' && check.status === 'failed'));
  return { label: exampleLabel, references: packet.artifacts.map(item => item.id), text: `${failure ? 'The shared synthetic T3 excerpt records a duplicate credit under one disclosed schedule.' : 'The shared packet does not include a failed concurrency observation; no test outcome is inferred.'} For this retry-safe-credit question, inspect the transaction scope in the selected context. Reserve the account-scoped key before mutating the balance; keep reservation, ledger, balance and stored response on one checked-out PostgreSQL client in one transaction. Under concurrency, a losing duplicate waits for unique-conflict resolution, then reads the committed operation in a new statement and checks its payload. Rollback must remove every partial effect. Next check: gate two independent clients on the same key, inject failure before response persistence, and inspect both returned responses and database state. This is a suggested investigation, not a new run or diagram change.`, nextAction: 'Revisit the transaction boundary in LLD.' };
}

export function loadDemoState(storage?: Pick<Storage, 'getItem'>): { state: DemoState; notice: string } {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { state: initialDemoState(), notice: '' };
    if (raw.length > 50_000) throw new Error('Oversized state');
    const parsed = demoStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('Invalid state');
    return { state: parsed.data, notice: '' };
  } catch { return { state: initialDemoState(), notice: 'Saved demo data was unavailable or invalid. Initial fictional records restored.' }; }
}
export function saveDemoState(storage: Pick<Storage, 'setItem'> | undefined, state: DemoState): boolean {
  try { if (!storage) return false; storage.setItem(STORAGE_KEY, JSON.stringify(demoStateSchema.parse(state))); return true; } catch { return false; }
}
export function validateFixtures() {
  return candidates.length === 3 && new Set(candidates.map(item => item.id)).size === 3 && candidates.every(candidate => {
    const validChecks = candidate.artifacts.every(item => item.kind === 'tests' || !item.checks.length);
    return candidateSchema.safeParse(candidate).success && validChecks && new Set(candidate.artifacts.map(item => item.id)).size === candidate.artifacts.length;
  }) && job.meta.isMock && job.requirements.every(item => !!requirementReferences[item.id]) && demoStateSchema.safeParse(initialDemoState()).success;
}
