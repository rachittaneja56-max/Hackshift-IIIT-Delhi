import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';

// DOM interaction checks, not rendered browser/viewport or native dialog certification.
const dom = new JSDOM('<div id="root"></div>', {
  url: 'http://localhost/demo/journey',
});
for (const name of [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Event',
  'MouseEvent',
])
  globalThis[name] = dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
  this.querySelector('[autofocus],button')?.focus();
};
const { createRoot } = await import('react-dom/client');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
const { EmployerMentorDemo } = await server.ssrLoadModule(
  '/src/demo/EmployerMentorDemo.tsx',
);
const { STORAGE_KEY, initialDemoState } =
  await server.ssrLoadModule('/src/demo/model.ts');
const container = document.getElementById('root');
let root;
let externalCalls = 0;
globalThis.fetch = async () => {
  externalCalls++;
  throw Error('Fictional actions must never make API calls');
};
const visible = (element) => !element.closest('[hidden]');
const buttons = () => [...container.querySelectorAll('button')].filter(visible);
function button(text) {
  const exact = buttons().filter((element) => element.textContent === text);
  const matches = exact.length
    ? exact
    : buttons().filter((element) => element.textContent.includes(text));
  assert.equal(matches.length, 1, `One visible button: ${text}`);
  return matches[0];
}
async function click(element) {
  await act(async () => {
    element.click();
  });
}
async function press(text) {
  await click(button(text));
}
const active = () =>
  container.querySelector('section[id$="-workspace"]:not([hidden])');
const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY));
async function mount() {
  root = createRoot(container);
  await act(async () => root.render(createElement(EmployerMentorDemo)));
}
async function refresh() {
  await act(async () => root.unmount());
  await mount();
}
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  window.localStorage.clear();
  externalCalls = 0;
  await mount();
});
after(async () => {
  await act(async () => root.unmount());
  await server.close();
  dom.window.close();
});

test('S11 DOM: discovery → exact evidence → consent → selected applicant → manual reversible shortlist', async () => {
  assert.match(active().textContent, /View opportunity/);
  assert.equal(active().querySelectorAll('input').length, 0);
  await press('View opportunity');
  assert.match(active().textContent, /Overview/);
  assert.equal(
    document.activeElement.className,
    'dj-candidate',
    'Stage changes move keyboard focus to the new context',
  );
  await press('Prepare application');
  assert.equal(button('Review application (0)').disabled, true);
  await click(document.getElementById('application-a-hld'));
  await click(document.getElementById('application-a-tests'));
  await press('Employer');
  assert.equal(saved().applications.ananya.status, 'not_started');
  await press('Submitted');
  assert.equal(active().querySelectorAll('.dj-applicant').length, 2);
  await press('Candidate');
  assert.equal(
    document.getElementById('application-a-tests').checked,
    true,
    'Persona switches preserve the current selection',
  );
  await press('Review application (2)');
  assert.equal(button('Submit demo application').disabled, true);
  const consent = active().querySelector('.dj-consent input');
  assert.equal(consent.checked, false);
  await click(consent);
  await press('Submit demo application');
  assert.match(
    active().textContent,
    /Application added to the fictional employer inbox/,
  );
  await press('See what the employer receives');
  const selected = active().querySelector('.dj-applicant[aria-pressed=true]');
  assert.match(selected.textContent, /Ananya Mehta/);
  const profile = active().querySelector('.dj-review-pane');
  assert.match(profile.textContent, /T3 · failed/);
  assert.doesNotMatch(profile.textContent, /a-lld|a-reasoning|a-profile|92%/);
  const concurrency = [...profile.querySelectorAll('.dj-requirement-row')].find(row => row.textContent.includes('Investigate concurrent requests'));
  await click(concurrency.querySelector('button'));
  assert.match(concurrency.querySelector('.dj-support').textContent, /T3.*synthetic failed/);
  assert.match(concurrency.querySelector('.dj-failed-text').textContent, /T3/);
  assert.doesNotMatch(concurrency.textContent, /a-lld|a-hld/);
  const shortlist = button('Shortlist for technical conversation');
  shortlist.focus();
  await click(shortlist);
  assert.equal(container.querySelector('dialog').open, true);
  await act(async () =>
    container
      .querySelector('dialog')
      .dispatchEvent(new Event('cancel', { cancelable: true })),
  );
  assert.equal(saved().decisions.length, 0);
  assert.equal(
    document.activeElement,
    shortlist,
    'Dialog cancellation restores trigger focus',
  );
  await press('Shortlist for technical conversation');
  await press('Confirm human demo shortlist');
  assert.equal(saved().decisions.length, 1);
  await press('Shortlisted');
  assert.equal(active().querySelectorAll('.dj-applicant').length, 1);
  await press('Reverse shortlist');
  assert.equal(saved().decisions.length, 2);
  assert.match(active().textContent, /No manual shortlists yet/);
  await press('All');
  await click(
    [...active().querySelectorAll('.dj-applicant')].find((element) =>
      element.textContent.includes('Meera'),
    ),
  );
  assert.match(
    active().querySelector('.dj-review-pane').textContent,
    /Not assessed from shared materials/,
  );
  assert.doesNotMatch(
    active().querySelector('.dj-review-pane').textContent,
    /T3 · passed|92%/,
  );
  await refresh();
  assert.equal(saved().applications.ananya.status, 'submitted_demo');
  await press('See what the employer receives');
  assert.match(
    active().querySelector('.dj-applicant[aria-pressed=true]').textContent,
    /Ananya/,
  );
  assert.equal(saved().decisions.length, 2);
  assert.equal(externalCalls, 0);
});

test('S11 DOM: mentor topics, exact context and consent work independently; revision resets consent', async () => {
  await press('Mentor');
  await press('Concurrent retries');
  const textarea = active().querySelector('textarea');
  assert.match(textarea.value, /two concurrent requests/);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    ).set.call(textarea, 'Where should I reserve the key?');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(document.getElementById('mentor-a-failure'));
  await press('Preview what the mentor sees');
  assert.match(active().textContent, /Where should I reserve the key/);
  assert.equal(button('Request example review').disabled, true);
  await click(active().querySelector('.dj-consent input'));
  await press('Request example review');
  assert.equal(document.activeElement.className, 'dj-mentor', 'Review receives keyboard focus');
  assert.match(active().textContent, /Illustrative mentor response/);
  assert.match(active().textContent, /duplicate credit/);
  assert.doesNotMatch(
    active().querySelector('.dj-mentor-review').textContent,
    /a-hld|a-profile|a-reasoning/,
  );
  assert.equal(saved().applications.ananya.status, 'not_started');
  assert.equal(saved().decisions.length, 0);
  await press('Prepare a question');
  await press('Revise packet');
  assert.equal(saved().mentor.consent, false);
  await press('Preview what the mentor sees');
  assert.equal(button('Request example review').disabled, true);
  assert.equal(externalCalls, 0);
});

test('S11 DOM: guide only navigates; reset and replay need confirmation; storage refresh recovers safely', async () => {
  const initial = saved();
  await press('Follow the journey');
  await press('Explore as candidate');
  assert.deepEqual(
    saved(),
    initial,
    'Guide cannot submit, consent or shortlist',
  );
  await press('Employer');
  await press('Replay publishing');
  assert.equal(saved().job, 'published_demo');
  await press('Reset & replay publishing');
  assert.equal(saved().job, 'draft');
  await press('Publish to demo board');
  assert.equal(saved().job, 'published_demo');
  await press('Reset demo');
  await press('Reset local demo');
  assert.deepEqual(saved(), initialDemoState());
  await act(async () => root.unmount());
  root = null;
  window.localStorage.setItem(STORAGE_KEY, '{bad');
  await mount();
  assert.match(container.querySelector('[role=status]').textContent, /invalid/);
  assert.deepEqual(saved(), initialDemoState());
  const personas = container.querySelectorAll('.dj-personas button');
  assert.equal(personas.length, 3);
  personas[2].focus();
  assert.equal(document.activeElement, personas[2]);
  assert.equal(personas[2].getAttribute('aria-pressed'), 'false');
  await click(personas[2]);
  assert.equal(personas[2].getAttribute('aria-pressed'), 'true');
  assert.equal(externalCalls, 0);
});
