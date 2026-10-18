import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => server.close());
const model = await server.ssrLoadModule('/src/demo/model.ts');
const fixtures = await server.ssrLoadModule('/src/demo/fixtures.ts');
const ui = await server.ssrLoadModule('/src/demo/EmployerMentorDemo.tsx');
const { initialDemoState, transition, employerApplication, requirementMapping, mentorPacket, exampleResponse, isShortlisted, loadDemoState, saveDemoState, demoStateSchema, STORAGE_KEY } = model;
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const at = '2026-10-18T05:00:00.000Z';
const later = '2026-10-18T05:01:00.000Z';
function prepared(selected = ['a-hld', 'a-tests', 'a-reasoning']) {
  let state = transition(initialDemoState(), { type: 'publish' });
  return transition(state, { type: 'prepare_application', selected });
}
function submitted(selected) {
  let state = transition(prepared(selected), { type: 'application_consent', consent: true });
  return transition(state, { type: 'submit_application', at });
}
function requested(selected = ['a-lld', 'a-failure']) {
  let state = transition(initialDemoState(), { type: 'prepare_mentor', selected, question: fixtures.mentorQuestion });
  state = transition(state, { type: 'mentor_consent', consent: true });
  return transition(state, { type: 'request_mentor', at });
}
test('S10 fixtures: exactly three fictional people; A has mixed checks, B passes reviewed checks, C has no invented outcomes', () => {
  assert.equal(model.validateFixtures(), true);
  for (const candidate of fixtures.candidates) {
    assert.equal(fixtures.candidateSchema.safeParse(candidate).success, true);
    assert.equal(candidate.meta.isMock, true);
  }
  const [a, b, c] = fixtures.candidates;
  const aChecks = a.artifacts.find(item => item.id === 'a-tests').checks;
  assert.equal(aChecks.length, 7);
  assert.equal(aChecks.filter(check => check.status === 'passed').length, 6);
  assert.equal(aChecks.find(check => check.id === 'T3').status, 'failed');
  assert.equal(b.artifacts.find(item => item.id === 'b-tests').checks.filter(check => check.status === 'passed').length, 7);
  assert.equal(c.artifacts.flatMap(item => item.checks).length, 0);
  const posting = render(ui.JobPosting);
  assert.match(posting, /Northstar Engineering/);
  assert.doesNotMatch(posting, /T[1-7]/);
});
test('S10 publication gates applications and changes the local board state', () => {
  const state = initialDemoState();
  assert.equal(state.job, 'draft');
  assert.throws(() => transition(state, { type: 'prepare_application', selected: ['a-hld'] }), /Publish/);
  assert.equal(transition(state, { type: 'publish' }).job, 'published_demo');
  const published = render(ui.CandidateApplicationView, { state: transition(state, { type: 'publish' }), send() {}, switchPersona() {} });
  assert.match(published, /Published to demo board/);
  assert.match(published, /Junior Backend Engineer/);
  assert.match(published, /Open job &amp; requirements/);
  assert.equal(state.job, 'draft', 'Transition must not mutate input');
  const html = render(ui.EmployerMentorDemo);
  assert.match(html, /Open employer workspace/);
  assert.match(html, /Fictional demo/);
  assert.match(html, /Not externally sent/);
});
test('S10 preparation includes only selected evidence and resets consent on any re-preparation', () => {
  let state = prepared(['a-lld']);
  assert.deepEqual(state.applications.ananya.selected, ['a-lld']);
  assert.equal(state.applications.ananya.consent, false);
  assert.equal(employerApplication(state, 'ananya'), null);
  state = transition(state, { type: 'application_consent', consent: true });
  state = transition(state, { type: 'prepare_application', selected: ['a-hld'] });
  assert.equal(state.applications.ananya.consent, false);
  for (const selected of [[], ['a-hld', 'a-hld'], ['b-tests'], ['unknown']]) assert.throws(() => prepared(selected), /invalid/);
});
test('S10 submission requires consent and a published prepared package; submitted materials are frozen', () => {
  assert.throws(() => transition(initialDemoState(), { type: 'submit_application', at }), /consent/);
  assert.throws(() => transition(prepared(), { type: 'submit_application', at }), /consent/);
  const state = submitted(['a-hld']);
  assert.equal(state.applications.ananya.submittedAt, at);
  assert.equal(state.applications.ananya.status, 'submitted_demo');
  assert.match(render(ui.CandidateApplicationView, { state, send() {}, switchPersona() {} }), /Demo application recorded locally/);
  assert.throws(() => transition(state, { type: 'prepare_application', selected: ['a-profile'] }), /frozen/);
  assert.throws(() => transition(state, { type: 'submit_application', at }), /consent/);
});
test('S10 employer projection and actual profile markup cannot reveal unselected private artifacts', () => {
  const state = submitted(['a-hld']);
  const packet = employerApplication(state, 'ananya');
  assert.deepEqual(packet.artifacts.map(item => item.id), ['a-hld']);
  const html = render(ui.EmployerProfile, { state, id: 'ananya' });
  assert.match(html, /Ananya Mehta/);
  assert.match(html, /HLD design/);
  assert.match(html, /Explicit demo consent/);
  for (const privateId of ['a-reasoning', 'a-tests', 'a-lld', 'a-profile', 'a-critique']) {
    const privateArtifact = fixtures.getCandidate('ananya').artifacts.find(item => item.id === privateId);
    assert.doesNotMatch(html, new RegExp(privateId));
    assert.equal(html.includes(privateArtifact.content), false);
  }
  assert.match(render(ui.EmployerProfile, { state: initialDemoState(), id: 'ananya' }), /Private artifacts are not available/);
});
test('S10 deterministic mapping retains failures and never turns unknown or unassessed requirements into successes', () => {
  const shared = employerApplication(submitted(), 'ananya').artifacts;
  const mapping = requirementMapping(shared);
  assert.deepEqual(mapping, requirementMapping(shared));
  assert.match(mapping.find(item => item.id === 'concurrency').support.map(item => item.text).join(' '), /T3.*failed/);
  assert.match(mapping.find(item => item.id === 'rollback').support.map(item => item.text).join(' '), /T5.*passed/);
  for (const row of mapping.filter(item => item.id.startsWith('unassessed'))) assert.equal(row.status, 'Not assessed from shared materials');
  assert.ok(requirementMapping([]).every(item => item.status === 'Not assessed from shared materials'));
  assert.equal(mapping.some(item => /satisfied|qualified|employability/i.test(item.status)), false);
  const kabir = render(ui.EmployerProfile, { state: initialDemoState(), id: 'kabir' });
  assert.match(kabir, /does not establish that Kabir authored/);
  const meera = render(ui.EmployerProfile, { state: initialDemoState(), id: 'meera' });
  assert.match(meera, /No completed or partial test outcomes/);
  assert.doesNotMatch(meera, /synthetic passed|7 of 7/);
});
test('S10 shortlist is an explicit confirmed human action with candidate, job, note, timestamp and provenance; reversal retains history', () => {
  let state = submitted();
  assert.equal(isShortlisted(state, 'ananya'), false);
  assert.throws(() => transition(state, { type: 'shortlist', candidateId: 'ananya', confirmed: false, note: '', at }), /explicit human/);
  assert.throws(() => transition(initialDemoState(), { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: '', at }), /submitted/);
  state = transition(state, { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: ' Discuss reservation ordering. ', at });
  assert.equal(isShortlisted(state, 'ananya'), true);
  assert.deepEqual(state.decisions[0], { candidateId: 'ananya', jobId: fixtures.job.id, decision: 'shortlisted_demo', reviewerNote: 'Discuss reservation ordering.', timestamp: at, provenance: 'human-demo-action', meta: fixtures.demoMeta });
  assert.throws(() => transition(state, { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: '', at }), /already/);
  state = transition(state, { type: 'reverse_shortlist', candidateId: 'ananya', at: later });
  assert.equal(isShortlisted(state, 'ananya'), false);
  assert.equal(state.decisions.length, 2);
  assert.throws(() => transition(state, { type: 'reverse_shortlist', candidateId: 'ananya', at: later }), /not shortlisted/);
});
test('S10 mentor packet includes selected artifacts only and requires preview, question, context and consent', () => {
  assert.equal(mentorPacket(initialDemoState()), null);
  assert.throws(() => transition(initialDemoState(), { type: 'request_mentor', at }), /consent/);
  assert.throws(() => transition(initialDemoState(), { type: 'prepare_mentor', selected: [], question: 'Question?' }), /invalid/);
  assert.throws(() => transition(initialDemoState(), { type: 'prepare_mentor', selected: ['a-hld'], question: '  ' }), /invalid/);
  const state = requested(['a-failure']);
  assert.deepEqual(mentorPacket(state).artifacts.map(item => item.id), ['a-failure']);
  const html = render(ui.MentorPacketView, { state });
  assert.match(html, /Failed concurrency observation/);
  assert.doesNotMatch(html, /a-profile|a-reasoning|a-critique|a-lld|a-hld/);
  assert.match(html, /Open HLD\/LLD Engineering Lab/);
  assert.match(html, /href="\/lab"/);
});
test('S10 seeded response is always labelled and does not infer missing test results', () => {
  assert.equal(exampleResponse(initialDemoState()), null);
  for (const selected of [['a-failure'], ['a-hld']]) {
    const response = exampleResponse(requested(selected));
    assert.equal(response.label, fixtures.exampleLabel);
    assert.match(render(ui.MentorPacketView, { state: requested(selected) }), /Example mentor response.*fictional demonstration, not a real message/);
    for (const term of ['transaction', 'Reserve', 'concurrency', 'Rollback', 'Next check']) assert.ok(response.text.includes(term));
    if (selected[0] === 'a-hld') assert.match(response.text, /does not include a failed concurrency observation; no test outcome is inferred/);
  }
});
test('S10 complete connected journey resets to initial fixture state without mutating prior snapshots', () => {
  let state = submitted();
  state = transition(state, { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: 'Discuss concurrency', at });
  state = transition(state, { type: 'prepare_mentor', selected: ['a-failure'], question: fixtures.mentorQuestion });
  state = transition(state, { type: 'mentor_consent', consent: true });
  state = transition(state, { type: 'request_mentor', at });
  assert.equal(employerApplication(state, 'ananya').artifacts.length, 3);
  assert.equal(mentorPacket(state).artifacts.length, 1);
  const reset = transition(state, { type: 'reset' });
  assert.deepEqual(reset, initialDemoState());
  assert.equal(state.decisions.length, 1);
});
test('S10 versioned browser persistence validates structure, references, consent and semantic state', () => {
  const state = submitted(['a-tests']);
  let raw;
  const storage = { getItem: key => { assert.equal(key, STORAGE_KEY); return raw ?? null; }, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); raw = value; } };
  assert.equal(saveDemoState(storage, state), true);
  assert.deepEqual(loadDemoState(storage).state, state);
  const malformed = [null, {}, { ...state, version: 2 }, { ...state, job: 'real' }, { ...state, secret: 'untrusted' }, { ...state, meta: { isMock: false } }, { ...state, applications: { ...state.applications, ananya: { ...state.applications.ananya, selected: ['b-tests'] } } }, { ...state, applications: { ...state.applications, ananya: { ...state.applications.ananya, consent: false } } }];
  for (const value of malformed) {
    raw = JSON.stringify(value);
    assert.deepEqual(loadDemoState(storage).state, initialDemoState());
    assert.match(loadDemoState(storage).notice, /invalid/);
  }
  raw = '{broken'; assert.match(loadDemoState(storage).notice, /invalid/);
  raw = 'x'.repeat(50_001); assert.match(loadDemoState(storage).notice, /invalid/);
  assert.equal(saveDemoState({ setItem() { throw Error('Full'); } }, state), false);
  assert.match(loadDemoState({ getItem() { throw Error('Denied'); } }).notice, /unavailable/);
  assert.equal(demoStateSchema.safeParse({ ...initialDemoState(), mentor: { ...initialDemoState().mentor, selected: ['a-hld'] } }).success, false);
});
test('S10 React escapes untrusted local questions and fixture output stays labelled', () => {
  let state = transition(initialDemoState(), { type: 'prepare_mentor', selected: ['a-hld'], question: '<script>steal()</script>' });
  state = transition(state, { type: 'mentor_consent', consent: true });
  state = transition(state, { type: 'request_mentor', at });
  const html = render(ui.MentorPacketView, { state });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>steal/);
  assert.match(html, /meta.isMock: true/);
});
