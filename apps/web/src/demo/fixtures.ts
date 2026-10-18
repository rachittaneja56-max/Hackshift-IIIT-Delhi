import { z } from 'zod';

export const demoMeta = { isMock: true, provenance: 'fictional-demo' } as const;
export const candidateIds = ['ananya', 'kabir', 'meera'] as const;
export type CandidateId = typeof candidateIds[number];
export const checkIds = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
export const artifactSchema = z.object({
  id: z.string(), label: z.string(), kind: z.enum(['hld', 'lld', 'tests', 'reasoning', 'critique', 'profile', 'question']),
  source: z.enum(['representative design summary', 'synthetic observation', 'fictional candidate writing', 'self-report']),
  content: z.string(),
  checks: z.array(z.object({ id: z.enum(checkIds), label: z.string(), status: z.enum(['passed', 'failed']), expected: z.string(), observed: z.string() })),
}).strict();
export type DemoArtifact = z.infer<typeof artifactSchema>;
export const candidateSchema = z.object({
  id: z.enum(candidateIds), name: z.string(), summary: z.string(), fictional: z.literal(true),
  meta: z.object({ isMock: z.literal(true), provenance: z.literal('fictional-demo') }).strict(),
  artifacts: z.array(artifactSchema),
}).strict();

const checkLabels = ['One valid credit', 'Sequential replay after module restart', 'Concurrent duplicate requests', 'Changed-payload conflict', 'Rollback after injected failure, then retry', 'Same key across two accounts', 'Distinct keys on one account'];
const expectations = [
  'One operation and ledger entry; balance 1000 → 1100; response balance 1100.',
  'Original status/body replayed; one operation and credit after module restart.',
  'Two independent clients using the same key complete; one credit; balance 1100.',
  'Changed amount returns 409; original response and balance 1100 unchanged.',
  'Injected failure leaves balance 1000 and no operation/ledger; retry commits one credit to 1100.',
  'Two accounts independently credit 100 each with the same key.',
  'Two distinct keys credit 100 and 200; one account balance 1000 → 1300; two ledger entries.',
];
function observations(failed: boolean): DemoArtifact['checks'] {
  return checkIds.map((id, i) => ({ id, label: checkLabels[i]!, status: failed && id === 'T3' ? 'failed' : 'passed', expected: expectations[i]!, observed: failed && id === 'T3' ? 'Synthetic schedule: both requests returned 200, two ledger entries, balance 1200 (expected 1100). Duplicate effect observed.' : `Synthetic record matches: ${expectations[i]}` }));
}
function artifact(id: string, label: string, kind: DemoArtifact['kind'], source: DemoArtifact['source'], content: string, checks: DemoArtifact['checks'] = []): DemoArtifact {
  return { id, label, kind, source, content, checks };
}
export const candidates = [
  { id: 'ananya', name: 'Ananya Mehta', fictional: true, meta: demoMeta, summary: 'Retry-safe-credit v1 · design, investigation and a mixed synthetic result.', artifacts: [
    artifact('a-hld', 'HLD design', 'hld', 'representative design summary', 'Client → HTTP credit API → PostgreSQL. Account-scoped idempotency key crosses the API boundary. The client may retry after a lost response. Representative saved-design summary, not an actual Excalidraw scene.'),
    artifact('a-lld', 'LLD design', 'lld', 'representative design summary', 'Read operation → reserve key → update balance → append ledger → store response. Proposed transaction boundary surrounds the writes; the lookup/reservation ordering still needs review. Representative summary; diagram correctness is unassessed.'),
    artifact('a-tests', 'Test observations · synthetic 6 of 7', 'tests', 'synthetic observation', 'Retry-safe-credit v1 · selected reviewed implementation · synthetic T1–T7 record, not a current database run. Six checks pass; concurrent duplicate requests fail.', observations(true)),
    artifact('a-reasoning', 'Engineering explanation', 'reasoning', 'fictional candidate writing', 'In the seeded concurrent schedule, both requests saw no completed operation and the balance increased twice. I would inspect key reservation before mutation on one checked-out client. The rollback check passes in this record, but it does not establish that every concurrent schedule is safe.'),
    artifact('a-critique', 'AI suggestion critique', 'critique', 'fictional candidate writing', 'A unique key by itself is not enough if the credit commits before reservation. I would keep reservation, balance, ledger and stored response in one transaction. This is a fictional candidate critique of a curated faulty suggestion, not live AI feedback.'),
    artifact('a-profile', 'Self-reported profile facts', 'profile', 'self-report', 'Fictional student interested in backend reliability. No verified production-scale experience. Education, employment and independent code authorship are unverified.'),
    artifact('a-failure', 'Failed concurrency observation', 'tests', 'synthetic observation', 'Selected excerpt of the same synthetic attempt: concurrent duplicate requests produced two ledger entries and balance 1200 instead of 1100.', observations(true).filter(check => check.id === 'T3')),
  ] },
  { id: 'kabir', name: 'Kabir Sharma', fictional: true, meta: demoMeta, summary: 'Retry-safe-credit v1 · saved design and synthetic 7 of 7 reviewed-implementation checks.', artifacts: [
    artifact('b-hld', 'Saved design artifact', 'hld', 'representative design summary', 'Client → credit handler → PostgreSQL. A stored operation response supports replay. Representative HLD summary; no separate LLD or detailed trade-off explanation is included.'),
    artifact('b-tests', 'Test observations · synthetic 7 of 7', 'tests', 'synthetic observation', 'Seven checks pass for a selected reviewed implementation in this fictional record. This does not establish that Kabir authored the implementation, and production competence remains unassessed.', observations(false)),
    artifact('b-profile', 'Self-reported profile facts', 'profile', 'self-report', 'Fictional learner seeking a first backend role. Explanatory material is limited; production competence and authorship are unassessed.'),
  ] },
  { id: 'meera', name: 'Meera Kapoor', fictional: true, meta: demoMeta, summary: 'Incomplete retry-safe-credit investigation · design notes and open technical questions; no recorded test result.', artifacts: [
    artifact('c-lld', 'Selected design notes', 'lld', 'representative design summary', 'Draft notes place key reservation near the credit mutation. Transaction boundaries and the response-persistence step are unresolved. Partial representative notes, not a verified diagram.'),
    artifact('c-question', 'Engineering questions', 'question', 'fictional candidate writing', 'If two requests reserve the same key, when does the losing transaction read the response? Should a changed payload be rejected before mutation? What rolls back when response persistence fails?'),
    artifact('c-profile', 'Self-reported profile facts', 'profile', 'self-report', 'Fictional student with an incomplete backend challenge. No completed or partial test outcomes have been recorded; experience and authorship are unassessed.'),
  ] },
] satisfies z.infer<typeof candidateSchema>[];

export const job = {
  id: 'northstar-backend-demo' as const, company: 'Northstar Engineering — Demo Company', title: 'Junior Backend Engineer',
  arrangement: 'Fictional hybrid arrangement · New Delhi', meta: demoMeta,
  description: 'Help an internal services team make backend writes safe to retry. Bring design notes and honest observations to a technical conversation about reliability.',
  responsibilities: ['Trace request failures and explain replay behavior.', 'Review database writes and transaction boundaries with teammates.', 'Investigate concurrent requests and document trade-offs and limitations.'],
  topics: ['HTTP retries', 'Idempotency', 'PostgreSQL', 'HLD / LLD'],
  requirements: [
    { id: 'retries', text: 'Understand HTTP retries and idempotency.' },
    { id: 'rollback', text: 'Reason about PostgreSQL transactions and rollback.' },
    { id: 'concurrency', text: 'Investigate concurrent requests.' },
    { id: 'design', text: 'Explain system boundaries using HLD and LLD.' },
    { id: 'communication', text: 'Communicate engineering decisions and limitations.' },
  ],
};
// Evaluator references stay separate from the human-readable job description.
export const requirementReferences: Record<string, { checks: readonly string[]; kinds: DemoArtifact['kind'][] }> = {
  retries: { checks: ['T1', 'T2', 'T4', 'T6'], kinds: ['reasoning', 'critique', 'question'] },
  rollback: { checks: ['T5'], kinds: ['reasoning', 'critique', 'question'] },
  concurrency: { checks: ['T3', 'T7'], kinds: ['reasoning', 'question'] },
  design: { checks: [], kinds: ['hld', 'lld'] },
  communication: { checks: [], kinds: ['reasoning', 'critique', 'question'] },
};
export const mentor = { name: 'Mira Sen', focus: 'Backend reliability', fictional: true, meta: demoMeta };
export const exampleLabel = 'Example mentor response — fictional demonstration, not a real message.';
export const mentorQuestion = 'My transaction design still seems vulnerable when two requests use the same idempotency key. What should I investigate?';
export function getCandidate(id: CandidateId) { return candidates.find(candidate => candidate.id === id)!; }
export function getArtifacts(id: CandidateId, selected: readonly string[]): DemoArtifact[] {
  return getCandidate(id).artifacts.filter(item => selected.includes(item.id));
}
