export type MentorProfileFixture = { provenance: 'local-demo'; fictional: true; name: string; focus: string; seededResponse: string };
export const mentor: MentorProfileFixture = { provenance: 'local-demo', fictional: true, name: 'Mira Sen', focus: 'Backend reliability', seededResponse: 'Start with one failure window: the balance changed, but the replay record did not become durable. Mark that boundary in your LLD. Compare expected and observed values for concurrent duplicates (T3) and rollback (T5), if you selected them. Explain what a transaction makes atomic and what the disclosed schedule leaves untested. This is an example response, not a review of your packet.' };
export type JobFixture = { provenance: 'local-demo'; fictional: true; title: string; description: string; requirements: { id: string; text: string; tests: string[] }[]; notAssessed: string[] };
export const sampleJob: JobFixture = { provenance: 'local-demo', fictional: true, title: 'Junior Backend Developer', description: 'Fictional role for an internal services team. Explain HTTP behavior, preserve data invariants and support a bounded technical discussion with test observations.', requirements: [
  { id: 'http', text: 'Explain HTTP response, replay and payload conflicts', tests: ['T1', 'T2', 'T4'] },
  { id: 'transactions', text: 'Reason about transaction boundaries and rollback', tests: ['T5'] },
  { id: 'retries', text: 'Investigate durable idempotency under retries', tests: ['T2', 'T3', 'T6'] },
  { id: 'concurrency', text: 'Discuss competing writes and account independence', tests: ['T3', 'T6', 'T7'] },
  { id: 'evidence', text: 'Explain observations, failures and assessment limits', tests: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] }
], notAssessed: ['Authentication or security expertise', 'Production operations and workload performance', 'General DSA proficiency', 'Code authorship', 'Correctness of diagrams or self-reported reasoning'] };
