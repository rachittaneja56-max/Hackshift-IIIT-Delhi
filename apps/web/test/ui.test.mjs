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
  assert.match(html, /credit-first\.ts/); assert.match(html, /key-only\.ts/); assert.match(html, /name="repair" checked="" value="atomic"/); assert.doesNotMatch(html, /<script>unsafe/); assert.match(html, /&lt;script&gt;/); assert.match(html, /curated_fixture/); assert.match(html, /source-line-number/); assert.match(html, /Search source files/); assert.match(html, /Reviewed source files/); assert.match(html, /Line-level note/); assert.match(html, /Initial hypothesis &amp; investigation notes/); assert.doesNotMatch(html, /All passed|Correct variant/);
});
test('F3: returned mixed outcomes and limitations render without changing the verdict', async () => {
  const { Results } = await server.ssrLoadModule('/src/evidence/details.tsx');
  const html = renderToStaticMarkup(createElement(Results, { result: { verdict: 'some_failed', tests: [{ id: 'T3', status: 'failed', expected: { operations: 1 }, observed: { db: { operations: [{}, {}], ledger: [{}, {}], balances: { A: 1200 } } }, durationMs: 42 }] }, selected: 'T3', select: () => {} }));
  assert.match(html, /Some checks failed/); assert.match(html, /0 of 1 observed checks passed/); assert.match(html, /operationCount/); assert.match(html, /Expand complete raw test record/); assert.match(html, /not a skill score/);
});
test('Lesson companion teaches response loss, application retries and the durable replay boundary', async () => {
  const { EditorialCompanion } = await server.ssrLoadModule('/src/learning/content.tsx');
  const html = renderToStaticMarkup(createElement(EditorialCompanion));
  assert.match(html, /Client sends an HTTP request/);
  assert.match(html, /response from API to client may be lost/);
  assert.match(html, /The handler may apply the credit again/);
  assert.match(html, /Replay the first response/);
  assert.match(html, /not a TCP retransmission/);
  assert.match(html, /Client sends an HTTP request/);
  assert.match(html, /API owns idempotency/);
  assert.match(html, /Application-level retry/);
  assert.match(html, /same key \+ payload/);
  assert.match(html, /Stored response/);
  assert.match(html, /Check your understanding/);
  assert.match(html, /outside the published lesson hash/);
});
test('History records make drafts, completed runs and execution errors distinct', async () => {
  const { HistoryRecords } = await server.ssrLoadModule('/src/evidence/pages.tsx');
  const make = (id, status) => ({ id, challenge: { slug: 'retry-safe-credit', version: 1 }, status, createdAt: '2026-10-18T00:00:00.000Z', submittedAt: status === 'draft' ? null : '2026-10-18T00:30:00.000Z', evidenceId: status === 'evaluated' ? id : null });
  const html = renderToStaticMarkup(createElement(HistoryRecords, { items: [make('draft-id', 'draft'), make('complete-id', 'evaluated'), make('error-id', 'execution_error'), make('queued-id', 'queued')], filter: 'all', onFilter: () => {} }));
  assert.match(html, /Resume draft/);
  assert.match(html, /View results/);
  assert.match(html, /Needs attention/);
  assert.match(html, /no test verdict/);
  assert.match(html, /aria-label="Filter attempts"/);
  assert.equal((html.match(/Resume draft/g) ?? []).length, 1);
});
test('S8: HLD and LLD review findings show statuses and exact saved diagram citations', async () => {
  const { ReviewFindings } = await server.ssrLoadModule('/src/evidence/design-review.tsx');
  const html = renderToStaticMarkup(createElement(ReviewFindings, { title: 'HLD', section: {
    observedElements: [{ text: 'The drawing contains the label “API”.', evidenceElements: [{ elementId: 'api-box', excerpt: 'API' }], connectionIds: [] }],
    findings: [{ criterion: 'system_boundaries', status: 'explicitly_shown', explanation: 'The API boundary is explicitly labelled.', evidenceElements: [{ elementId: 'api-box', excerpt: 'API' }], connectionIds: [], nextStep: null }],
    questions: ['Where does a retry re-enter the request path?'], limitations: [],
  } }));
  assert.match(html, /HLD analysis/);
  assert.match(html, /System boundaries/);
  assert.match(html, /Explicitly shown/);
  assert.match(html, /View saved HLD drawing/);
  assert.match(html, /Exact element reference/);
  assert.match(html, /api-box/);
  assert.match(html, /Where does a retry re-enter/);
});
test('S8: history rows retain a single draft action and career checks explain canonical IDs', async () => {
  const { CareerRelatedChecks } = await server.ssrLoadModule('/src/previews/career.tsx');
  const html = renderToStaticMarkup(createElement(CareerRelatedChecks, { tests: [{ testId: 'T5', status: 'failed' }, { testId: 'T6', status: 'passed' }] }));
  assert.match(html, /Related checks \(2\)/);
  assert.match(html, /T5/);
  assert.match(html, /failure after the balance update rolls back the transaction/i);
  assert.match(html, /T6/);
  assert.match(html, /same key remains independent across two accounts/i);
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
  assert.match(html, />Role</);
  assert.match(html, />Evidence</);
  assert.match(html, />Analysis</);
  assert.match(html, /aria-current="step"/);
});

test('S9: primary header exposes learner destinations and selects the AI lab under Practice', async () => {
  const { Header } = await server.ssrLoadModule('/src/app/App.tsx');
  const { RouteContext } = await server.ssrLoadModule('/src/app/router.tsx');
  const location = { path: '/lab/ai-debugging', search: '', navigate: () => {} };
  const html = renderToStaticMarkup(createElement(RouteContext.Provider, { value: location }, createElement(Header, { account: false })));
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /<a(?=[^>]*href="\/practice")(?=[^>]*aria-current="page")[^>]*>Practice/);
  assert.match(html, /href="\/evidence">My Work/);
  assert.match(html, /href="\/opportunities">Opportunities/);
  assert.doesNotMatch(html, /Product previews|Preview<\/small>/);
});

test('S9: career empty state points to a real practice route without implying draft evidence', async () => {
  const { CareerEmptyEvidence } = await server.ssrLoadModule('/src/previews/career.tsx');
  const html = renderToStaticMarkup(createElement(CareerEmptyEvidence));
  assert.match(html, /Complete one engineering lab to create test-backed evidence/);
  assert.match(html, /Draft drawings and evaluation errors do not contain completed test observations/);
  assert.match(html, /href="\/practice"/);
});

test('S10: Opportunities links to a distinct fictional demo and the route keeps the S9 shell', async () => {
  const { CareerDemoEntry } = await server.ssrLoadModule('/src/previews/career.tsx');
  const { AppRoutes, Header } = await server.ssrLoadModule('/src/app/App.tsx');
  const { RouteContext } = await server.ssrLoadModule('/src/app/router.tsx');
  const location = { path: '/demo/journey', search: '', navigate: () => {} };
  const entry = renderToStaticMarkup(createElement(CareerDemoEntry));
  const route = renderToStaticMarkup(createElement(RouteContext.Provider, { value: location }, createElement(AppRoutes)));
  const header = renderToStaticMarkup(createElement(RouteContext.Provider, { value: location }, createElement(Header, { account: false })));
  assert.match(entry, /Separate fictional walkthrough/);
  assert.match(entry, /no real attempts, evidence or career APIs/);
  assert.match(entry, /href="\/demo\/journey"/);
  assert.match(route, /Fictional demo/);
  assert.match(route, /All activity stays in this browser/);
  assert.match(route, /no external applications or messages/);
  assert.match(header, /<a(?=[^>]*href="\/opportunities")(?=[^>]*aria-current="page")[^>]*>Opportunities/);
});
