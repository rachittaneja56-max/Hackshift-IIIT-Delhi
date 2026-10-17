import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const server = await createServer({ root: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
test('F2: rendered comparison and selected repair remain independent; canonical source is escaped', async () => {
  const { Investigation } = await server.ssrLoadModule('/src/attempts/workspace.tsx');
  const artifact = { hld: null, lld: null, decisions: { keyScope: null, atomicity: null, payloadConflict: null }, variantId: 'atomic', aiCritique: null, repairJustification: null };
  const challenge = { variants: ['credit-first', 'key-only', 'atomic'].map(id => ({ id, label: id, files: [{ path: `${id}.ts`, source: `// ${id}\nconst html = '<script>unsafe()</script>';` }] })), testDescriptions: [{ id: 'T5', description: 'Failure after a write rolls back all effects.' }], faultyAiSuggestion: { source: 'curated_fixture', title: 'Curated recommendation', text: 'A unique key alone prevents every duplicate effect.' } };
  const html = renderToStaticMarkup(createElement(Investigation, { attemptId: 'attempt-one', artifact, challenge, disabled: false, change: () => {} }));
  assert.match(html, /credit-first\.ts/); assert.match(html, /key-only\.ts/); assert.match(html, /name="repair" checked="" value="atomic"/); assert.doesNotMatch(html, /<script>unsafe/); assert.match(html, /&lt;script&gt;/); assert.match(html, /curated_fixture/); assert.match(html, /source-line-number/); assert.match(html, /Initial hypothesis &amp; investigation notes/); assert.doesNotMatch(html, /All passed|Correct variant/);
});
test('F3: returned mixed outcomes and limitations render without changing the verdict', async () => {
  const { Results } = await server.ssrLoadModule('/src/evidence/details.tsx');
  const html = renderToStaticMarkup(createElement(Results, { result: { verdict: 'some_failed', tests: [{ id: 'T3', status: 'failed', expected: { operations: 1 }, observed: { db: { operations: [{}, {}], ledger: [{}, {}], balances: { A: 1200 } } }, durationMs: 42 }] }, selected: 'T3', select: () => {} }));
  assert.match(html, /Some checks failed/); assert.match(html, /0 of 1 observed checks passed/); assert.match(html, /operationCount/); assert.match(html, /Expand complete raw test record/); assert.match(html, /not a skill score/);
});
test('Lesson companion teaches response loss, application retries and the durable replay boundary', async () => {
  const { EditorialCompanion } = await server.ssrLoadModule('/src/learning/content.tsx');
  const html = renderToStaticMarkup(createElement(EditorialCompanion));
  assert.match(html, /Client sends a credit request/);
  assert.match(html, /The response is lost/);
  assert.match(html, /The handler may apply the credit again/);
  assert.match(html, /Replay the first response/);
  assert.match(html, /TCP retransmission repeats byte delivery/);
  assert.match(html, /Check your understanding/);
  assert.match(html, /outside the published lesson hash/);
});
test('History records make drafts, completed runs and execution errors distinct', async () => {
  const { HistoryRecords } = await server.ssrLoadModule('/src/evidence/pages.tsx');
  const make = (id, status) => ({ id, challenge: { slug: 'retry-safe-credit', version: 1 }, status, createdAt: '2026-10-18T00:00:00.000Z', submittedAt: status === 'draft' ? null : '2026-10-18T00:30:00.000Z', evidenceId: status === 'evaluated' ? id : null });
  const html = renderToStaticMarkup(createElement(HistoryRecords, { items: [make('draft-id', 'draft'), make('complete-id', 'evaluated'), make('error-id', 'execution_error'), make('queued-id', 'queued')], filter: 'all', onFilter: () => {} }));
  assert.match(html, /Resume draft/);
  assert.match(html, /View evidence/);
  assert.match(html, /Execution error/);
  assert.match(html, /no test verdict/);
  assert.match(html, /aria-label="Filter attempts"/);
});
test('Mentor preview formats the selected packet and labels it as unsent', async () => {
  const { MentorPacketContents } = await server.ssrLoadModule('/src/previews/mentor.tsx');
  const packet = { provenance: 'local-demo', attemptId: 'attempt-1', evidenceId: 'evidence-1', artifactSource: 'immutable evidence', question: 'Which write belongs in the transaction?', hld: { elements: [{ type: 'rectangle' }] }, aiCritique: 'selected critique', tests: [{ id: 'T5', status: 'failed' }] };
  const artifact = { hld: { elements: [{ type: 'rectangle' }] }, lld: null };
  const html = renderToStaticMarkup(createElement(MentorPacketContents, { packet, selected: ['hld', 'aiCritique', 'T5'], artifact }));
  assert.match(html, /Prepared review request/);
  assert.match(html, /Private · not sent/);
  assert.match(html, /immutable evidence/);
  assert.match(html, /Which write belongs in the transaction/);
  assert.match(html, /1 saved drawing elements/);
  assert.match(html, /T5/);
});
test('Career review stepper points to the next incomplete step', async () => {
  const { CareerSteps } = await server.ssrLoadModule('/src/previews/career.tsx');
  const html = renderToStaticMarkup(createElement(CareerSteps, { stage: 'review', complete: ['job', 'evidence'] }));
  assert.match(html, /Add a job description/);
  assert.match(html, /Choose evidence/);
  assert.match(html, /Review requirements/);
  assert.match(html, /aria-current="step"/);
});
