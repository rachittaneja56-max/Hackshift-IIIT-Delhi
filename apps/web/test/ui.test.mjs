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
  const challenge = { variants: ['credit-first', 'key-only', 'atomic'].map(id => ({ id, label: id, files: [{ path: `${id}.ts`, source: `// ${id}\nconst html = '<script>unsafe()</script>';` }] })), faultyAiSuggestion: { source: 'curated_fixture', title: 'Curated recommendation', text: 'A unique key alone prevents every duplicate effect.' } };
  const html = renderToStaticMarkup(createElement(Investigation, { artifact, challenge, disabled: false, change: () => {} }));
  assert.match(html, /credit-first\.ts/); assert.match(html, /key-only\.ts/); assert.match(html, /name="repair" checked="" value="atomic"/); assert.doesNotMatch(html, /<script>unsafe/); assert.match(html, /&lt;script&gt;/); assert.match(html, /curated_fixture/); assert.doesNotMatch(html, /All passed|Correct variant/);
});
test('F3: returned mixed outcomes and limitations render without changing the verdict', async () => {
  const { Results } = await server.ssrLoadModule('/src/evidence/details.tsx');
  const html = renderToStaticMarkup(createElement(Results, { result: { verdict: 'some_failed', tests: [{ id: 'T3', status: 'failed', expected: { operations: 1 }, observed: { db: { operations: [{}, {}], ledger: [{}, {}], balances: { A: 1200 } } }, durationMs: 42 }] }, selected: 'T3', select: () => {} }));
  assert.match(html, /Some failed/); assert.match(html, /0 of 1 observed checks passed/); assert.match(html, /operationCount/); assert.match(html, /Expand complete raw record/); assert.match(html, /not a skill score/);
});
