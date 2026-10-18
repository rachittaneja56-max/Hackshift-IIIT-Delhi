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
test('S11 published startup is usable; optional draft replay retains publication guard', () => {
  const initial = initialDemoState();
  assert.equal(initial.job, 'published_demo');
  assert.equal(initial.version, 2);
  assert.deepEqual(initial.applications.ananya.selected, []);
  assert.equal(initial.applications.ananya.consent, false);
  const published = render(ui.CandidateApplicationView, { state: initial, send() {}, switchPersona() {} });
  assert.match(published, /Published to demo board/);
  assert.match(published, /Junior Backend Engineer/);
  assert.match(published, /View opportunity/);
  assert.doesNotMatch(published, /type="checkbox"/);
  const draft = transition(initial, { type: 'replay_publication' });
  assert.equal(draft.job, 'draft');
  assert.throws(() => transition(draft, { type: 'prepare_application', selected: ['a-hld'] }), /Publish/);
  assert.equal(transition(draft, { type: 'publish' }).job, 'published_demo');
  assert.equal(initial.job, 'published_demo', 'Input stays unchanged');
  const html = render(ui.EmployerMentorDemo);
  assert.match(html, /Career Journey/);
  assert.match(html, /Follow the journey/);
  assert.match(html, /Fictional company, candidates and mentor/);
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
  assert.match(render(ui.CandidateApplicationView, { state, send() {}, switchPersona() {} }), /Application added to the fictional employer inbox/);
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
test('S10 end-to-end application, employer evidence review, human shortlist and mentor example remain fictional', () => {
  let state = transition(initialDemoState(), { type: 'publish' });
  state = transition(state, { type: 'prepare_application', selected: ['a-hld', 'a-tests', 'a-reasoning'] });
  state = transition(state, { type: 'application_consent', consent: true });
  state = transition(state, { type: 'submit_application', at });
  assert.equal(state.applications.ananya.status, 'submitted_demo');
  assert.deepEqual(employerApplication(state, 'ananya').artifacts.map(item => item.id), ['a-hld', 'a-tests', 'a-reasoning']);
  const employer = render(ui.EmployerProfile, { state, id: 'ananya' });
  assert.match(employer, /Fictional profile/);
  assert.match(employer, /failed.*synthetic/);
  assert.match(employer, /Not assessed from shared materials/);
  assert.doesNotMatch(employer, /a-critique|a-profile|a-lld/);
  state = transition(state, { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: 'Review transaction reasoning.', at: later });
  assert.equal(isShortlisted(state, 'ananya'), true);
  state = transition(state, { type: 'prepare_mentor', selected: ['a-failure', 'a-reasoning'], question: fixtures.mentorQuestion });
  state = transition(state, { type: 'mentor_consent', consent: true });
  state = transition(state, { type: 'request_mentor', at: '2026-10-18T05:02:00.000Z' });
  const response = exampleResponse(state);
  assert.equal(response.references.includes('a-failure'), true);
  assert.equal(response.references.includes('a-critique'), false);
  assert.match(response.label, /fictional demonstration, not a real message/);
  const mentorReview = render(ui.MentorPacketView, { state });
  assert.match(mentorReview, /Example mentor response/);
  assert.match(mentorReview, /Revisit transaction boundaries in your LLD/);
  assert.equal(employerApplication(state, 'kabir').meta.isMock, true);
});

test('S10 versioned browser persistence validates structure, references, consent and semantic state', () => {
  const state = submitted(['a-tests']);
  let raw;
  const storage = { getItem: key => { return key === STORAGE_KEY ? raw ?? null : null; }, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); raw = value; } };
  assert.equal(saveDemoState(storage, state), true);
  assert.deepEqual(loadDemoState(storage).state, state);
  const malformed = [null, {}, { ...state, version: 99 }, { ...state, job: 'real' }, { ...state, secret: 'untrusted' }, { ...state, meta: { isMock: false } }, { ...state, applications: { ...state.applications, ananya: { ...state.applications.ananya, selected: ['b-tests'] } } }, { ...state, applications: { ...state.applications, ananya: { ...state.applications.ananya, consent: false } } }];
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

test('S11 v1 storage resets visibly and never carries forward consent or decisions', () => {
  const legacy = { ...submitted(), version: 1 };
  const loaded = loadDemoState({ getItem: key => key === model.LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null });
  assert.deepEqual(loaded.state, initialDemoState());
  assert.match(loaded.notice, /older demo was reset/);
  const underNewKey = loadDemoState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(legacy) : null });
  assert.deepEqual(underNewKey.state, initialDemoState());
  assert.match(underNewKey.notice, /invalid/);
});

test('S11 draft replay clears prior submissions and review actions; normal reset restores published scenario', () => {
  let state = transition(submitted(), { type: 'shortlist', candidateId: 'ananya', confirmed: true, note: '', at });
  state = transition(state, { type: 'prepare_mentor', selected: ['a-hld'], question: 'Review the boundary?' });
  state = transition(state, { type: 'mentor_consent', consent: true });
  state = transition(state, { type: 'request_mentor', at });
  const draft = transition(state, { type: 'replay_publication' });
  assert.equal(draft.job, 'draft');
  assert.equal(draft.applications.ananya.status, 'not_started');
  assert.equal(draft.applications.ananya.consent, false);
  assert.equal(draft.mentor.status, 'not_requested');
  assert.deepEqual(draft.decisions, []);
  assert.deepEqual(transition(draft, { type: 'reset' }), initialDemoState());
});

test('S11 mentorship works before any application or shortlist, and changed packets renew consent', () => {
  const state = requested(['a-hld']);
  assert.equal(state.applications.ananya.status, 'not_started');
  assert.equal(state.decisions.length, 0);
  const revised = transition(state, { type: 'prepare_mentor', selected: ['a-lld'], question: 'A different question?' });
  assert.equal(revised.mentor.consent, false);
  assert.equal(exampleResponse(revised), null);
  assert.throws(() => transition(revised, { type: 'request_mentor', at }), /consent/);
  assert.deepEqual(mentorPacket(revised).artifacts.map(item => item.id), ['a-lld']);
});

test('S11 comparison preserves failures, selected-only artifact links and no aggregate score', () => {
  const mapping = requirementMapping(employerApplication(submitted(['a-tests']), 'ananya').artifacts);
  const concurrency = mapping.find(row => row.id === 'concurrency');
  assert.equal(concurrency.support.find(item => item.id.endsWith(':T3')).outcome, 'failed');
  assert.ok(mapping.flatMap(row => row.support).every(item => item.artifactId === 'a-tests'));
  const html = render(ui.EmployerProfile, { state: submitted(['a-tests']), id: 'ananya' });
  assert.match(html, /T3 · failed/);
  assert.doesNotMatch(html, /\d+%|match score|skill score|a-hld|a-lld|a-profile/);
});
