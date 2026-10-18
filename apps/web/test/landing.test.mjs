import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => server.close());

test('public root renders without Clerk or API configuration and links to protected destinations', async () => {
  const { EntryRoutes } = await server.ssrLoadModule('/src/landing/LandingEntry.tsx');
  const { PublicOrPrivate } = await server.ssrLoadModule('/src/app/App.tsx');
  const { RouteContext } = await server.ssrLoadModule('/src/app/router.tsx');
  const render = (path) => renderToStaticMarkup(createElement(RouteContext.Provider, { value: { path, search: '', navigate: () => {} } }, createElement(PublicOrPrivate, { configured: false })));
  const publicHtml = render('/');
  const entryHtml = renderToStaticMarkup(createElement(RouteContext.Provider, { value: { path: '/', search: '', navigate: () => {} } }, createElement(EntryRoutes)));
  assert.match(entryHtml, /A résumé lists skills/);
  assert.doesNotMatch(entryHtml, /Clerk|Frontend configuration/);
  assert.match(publicHtml, /A résumé lists skills/);
  assert.match(publicHtml, /Illustrative product visualization/);
  assert.match(publicHtml, /href="\/lab"/);
  assert.match(publicHtml, /href="\/demo\/journey"/);
  assert.match(publicHtml, /Fictional job example/i);
  assert.doesNotMatch(publicHtml, /Frontend configuration|Initializing your secure session|Bearer |DATABASE_URL/);
  assert.match(render('/lab'), /Connect your engineering workspace/);
  assert.match(render('/demo/journey'), /Connect your engineering workspace/);
});

test('retry scenario has a complete accessible static sequence', async () => {
  const { ProblemSequence } = await server.ssrLoadModule('/src/landing/ProblemSequence.tsx');
  const html = renderToStaticMarkup(createElement(ProblemSequence));
  assert.equal((html.match(/aria-label="(?:Previous|Next) step"/g) ?? []).length, 2);
  assert.equal((html.match(/<li><button/g) ?? []).length, 6);
  assert.match(html, /HTTP response is lost/);
  assert.match(html, /faulty version credits twice/);
  assert.match(html, /retry-safe version replays the stored result/);
});
