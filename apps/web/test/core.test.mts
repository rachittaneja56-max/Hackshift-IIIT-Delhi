import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactSchema, SubmissionReadyArtifactSchema } from '@trajectoryos/contracts';
import { ApiClient, ApiClientError, EvidenceSchema, apiOrigin } from '../src/lib/api.ts';
import { SaveQueue } from '../src/attempts/save-queue.ts';
import { artifactError, recoveryArtifact, sceneError, serializeElements } from '../src/lib/scenes.ts';
import { feedbackLabel, observationSummary } from '../src/lib/presentation.ts';
import { mentorPacket } from '../src/previews/model.ts';
import { SceneSession } from '../src/drawing/scene-session.ts';

const empty = () => ({ hld: null, lld: null, decisions: { keyScope: null, atomicity: null, payloadConflict: null }, variantId: null, aiCritique: null, repairJustification: null });
const id = '11111111-1111-4111-8111-111111111111';
const attempt = (artifact = empty(), revision = 1) => ({ id, challenge: { slug: 'retry-safe-credit', version: 1 }, status: 'draft', revision, artifact, createdAt: '2026-10-17T12:00:00.000Z', updatedAt: '2026-10-17T12:00:00.000Z', submittedAt: null, evaluationId: null, evidenceId: null });
const evaluation = { id, attemptId: id, status: 'queued', generation: 1, executionCount: 0, queuedAt: '2026-10-17T12:00:00.000Z', startedAt: null, finishedAt: null, result: null, error: null, evidenceId: null };
const shape = (id = 'rect', extra = {}) => ({ id, type: 'rectangle', x: 10, y: 20, width: 200, height: 80, version: 1, isDeleted: false, ...extra });
const ready = () => ({ ...empty(), hld: serializeElements([shape('hld')]), lld: serializeElements([shape('lld')]), decisions: { keyScope: 'account', atomicity: 'transaction', payloadConflict: 'reject' }, variantId: 'atomic', aiCritique: 'An independent credit can commit before the key.', repairJustification: 'I expect one transaction to roll back all writes.' });
const defer = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function fake(initial = attempt()) {
  let server = structuredClone(initial); const writes = []; const events = [];
  return { writes, events, get server() { return server; }, set server(value) { server = value; },
    api: { attempt: async () => structuredClone(server), evaluation: async () => evaluation, save: async (_id, revision, artifact) => { assert.equal(revision, server.revision); writes.push(structuredClone(artifact)); events.push('save'); server = { ...server, revision: revision + 1, artifact: structuredClone(artifact) }; return structuredClone(server); }, submit: async (_id, revision) => { assert.equal(revision, server.revision); assert.ok(SubmissionReadyArtifactSchema.safeParse(server.artifact).success); events.push('submit'); return evaluation; } } };
}
test('F1: scene round trip retains text, bindings, geometry, IDs and deletion tombstones', () => {
  const elements = [shape('box', { boundElements: [{ id: 'label', type: 'text' }] }), { id: 'label', type: 'text', containerId: 'box', text: 'API', originalText: 'API', x: 30, y: 40 }, { id: 'arrow', type: 'arrow', startBinding: { elementId: 'box', focus: 0, gap: 1 }, points: [[0, 0], [120, 0]], endBinding: null }, shape('deleted', { isDeleted: true })];
  const scene = serializeElements(elements); assert.deepEqual(scene.elements, elements); assert.deepEqual(Object.keys(scene), ['engine', 'formatVersion', 'elements']); assert.equal(sceneError(scene), null);
  const artifact = ArtifactSchema.parse({ ...empty(), hld: scene, lld: serializeElements([shape('different')]) });
  assert.equal(artifact.hld.elements[0].id, 'box'); assert.equal(artifact.lld.elements[0].id, 'different'); assert.equal(JSON.parse(JSON.stringify(artifact)).hld.elements[3].isDeleted, true);
});
test('F1: unsupported elements, links, oversized scenes and request bytes are rejected without mutation', () => {
  const unsupported = serializeElements([shape('img', { type: 'image', isDeleted: true })]); assert.ok(sceneError(unsupported)); assert.equal(unsupported.elements[0].type, 'image');
  assert.ok(sceneError(serializeElements([shape('link', { link: 'https://example.com' })])));
  assert.ok(sceneError(serializeElements([shape('file', { fileId: 'secret' })])));
  assert.ok(sceneError(serializeElements(Array.from({ length: 201 }, (_, i) => shape(String(i))))));
  const huge = { ...empty(), hld: serializeElements(Array.from({ length: 100 }, (_, i) => shape(String(i), { text: 'z'.repeat(15000) }))) }; assert.match(artifactError(huge), /1 MiB/);
});

test('native scene initialization and camera/tool notifications do not dirty a draft', () => {
  const saved = serializeElements([shape('saved')]);
  const restored = [shape('saved', { index: 'a0', updated: Date.now() })];
  const session = new SceneSession(saved, restored);
  assert.equal(session.change(restored), null);
  assert.equal(session.change(structuredClone(restored)), null);
  assert.equal(session.needsReplacement(saved), false);
  const edited = [...restored, shape('new')];
  assert.deepEqual(session.change(edited), serializeElements(edited));
  // Parent echoes and save acknowledgements must preserve native undo/selection.
  assert.equal(session.needsReplacement(serializeElements(edited)), false);
  assert.equal(session.change(edited), null);
});

test('server/device scene replacement resets the native baseline without writing it back', () => {
  const first = serializeElements([shape('first')]), replacement = serializeElements([shape('server')]);
  const session = new SceneSession(first, first.elements);
  session.change(first.elements);
  const local = [shape('local')];
  assert.deepEqual(session.change(local), serializeElements(local));
  session.needsReplacement(serializeElements(local));
  assert.equal(session.needsReplacement(replacement), true);
  const restored = [shape('server', { index: 'a0' })];
  session.reset(restored);
  assert.equal(session.change(restored), null);
  assert.equal(session.change(restored), null);
  assert.deepEqual(session.change([...restored, shape('after-recovery')]), serializeElements([...restored, shape('after-recovery')]));
  assert.equal(session.needsReplacement(null), true);
  session.reset([]);
  assert.equal(session.change([]), null);
  assert.deepEqual(session.change([shape('fresh')]), serializeElements([shape('fresh')]));
});

test('HLD and LLD changes stay independent and preserve deletion/undo snapshots', () => {
  const hld = new SceneSession(null, []), lld = new SceneSession(null, []);
  hld.change([]); lld.change([]);
  const hldScene = hld.change([shape('hld', { updated: Date.now() })]);
  const lldScene = lld.change([shape('lld')]);
  assert.equal(hld.needsReplacement(hldScene), false);
  assert.equal(lld.needsReplacement(lldScene), false);
  const deleted = hld.change([shape('hld', { updated: Date.now(), version: 2, isDeleted: true })]);
  assert.equal(deleted.elements[0].isDeleted, true);
  assert.equal(lld.change(lldScene.elements), null);
  assert.deepEqual(hld.change(hldScene.elements), hldScene);
});

test('native timestamps fit the existing API bound without mutating geometry, bindings or recovery', () => {
  const elements = [shape('box', { updated: Date.now(), boundElements: [{ id: 'label', type: 'text' }] })];
  const original = structuredClone(elements), scene = serializeElements(elements);
  assert.deepEqual(elements, original);
  assert.equal(sceneError(scene), null);
  assert.equal(scene.elements[0].updated, 1e12);
  assert.deepEqual(scene.elements[0].boundElements, elements[0].boundElements);
  assert.deepEqual(recoveryArtifact({ ...empty(), hld: { engine: 'excalidraw', formatVersion: 1, elements } }).hld, scene);
});
test('F1: API prefix, fresh token, envelope validation and ownership 404 stay honest', async () => {
  assert.equal(apiOrigin('https://api.example.com/api/v1/'), 'https://api.example.com/api/v1'); assert.throws(() => apiOrigin('https://example.com/unapproved'));
  const tokens = [], urls = []; let requests = 0;
  const api = new ApiClient('https://api.example.com', async fresh => { tokens.push(fresh); return 'session'; }, () => {}, async (url, options) => { urls.push(url); assert.equal(options.headers.Authorization, 'Bearer session'); return new Response(JSON.stringify(++requests === 1 ? { error: { code: 'UNAUTHENTICATED', message: 'Expired', retryable: false }, meta: { requestId: id, isMock: false } } : { data: [], meta: { requestId: id, isMock: false } }), { status: requests === 1 ? 401 : 200 }); });
  assert.deepEqual(await api.courses(), []); assert.deepEqual(tokens, [false, true]); assert.equal(urls[0], 'https://api.example.com/api/v1/courses');
  const forbidden = new ApiClient('https://api.example.com', async () => 'token', () => {}, async () => new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unavailable', retryable: false }, meta: { requestId: id, isMock: false } }), { status: 404 }));
  await assert.rejects(forbidden.attempt(id), error => error.status === 404 && error.code === 'NOT_FOUND');
});
test('F1: non-JSON and malformed success never become mock data', async () => {
  for (const body of ['upstream unavailable', JSON.stringify({ data: [], meta: {} })]) { const api = new ApiClient('https://api.example.com', async () => 'token', () => {}, async () => new Response(body, { status: 200 })); await assert.rejects(api.courses(), error => error.code === 'INVALID_RESPONSE'); }
});
test('F2: one save in flight coalesces newer edits; stale acknowledgement never replaces local', async () => {
  const backend = fake(); const gate = defer(); let count = 0; const original = backend.api.save;
  backend.api.save = async (...args) => { if (++count === 1) await gate.promise; return original(...args); };
  const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit({ ...empty(), comments: 'first' }); const saving = queue.flush(); await Promise.resolve(); queue.edit({ ...empty(), comments: 'newest' }); const second = queue.flush(); gate.resolve(); await Promise.all([saving, second]);
  assert.equal(backend.writes.length, 2); assert.equal(queue.local.comments, 'newest'); assert.equal(queue.server.revision, 3); assert.equal(queue.server.artifact.comments, 'newest'); queue.dispose();
});
test('F2: lost PUT acknowledgement reconciles GET before the next write', async () => {
  const backend = fake(); const original = backend.api.save; let lost = true;
  backend.api.save = async (...args) => { const saved = await original(...args); if (lost) { lost = false; throw new ApiClientError('Lost response'); } return saved; };
  const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit({ ...empty(), comments: 'retained' }); await assert.rejects(queue.flush()); assert.equal(queue.state, 'Offline'); await queue.flush(); assert.equal(backend.writes.length, 1); assert.equal(queue.server.revision, 2); assert.equal(queue.state, 'Saved'); queue.dispose();
});
test('F2: revision conflict pauses writes, preserves base/local/server, requires explicit resolution', async () => {
  const backend = fake(); backend.server = attempt({ ...empty(), comments: 'other tab' }, 2); backend.api.save = async () => { throw new ApiClientError('Stale', 409, 'REVISION_CONFLICT'); };
  const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit({ ...empty(), comments: 'my work' }); await assert.rejects(queue.flush()); assert.equal(queue.state, 'Conflict'); assert.equal(queue.local.comments, 'my work'); assert.equal(queue.conflict.artifact.comments, 'other tab'); await assert.rejects(queue.flush());
  queue.resolve(false); assert.equal(queue.local.comments, 'other tab'); assert.equal(queue.server.revision, 2); queue.dispose();
});
test('F2: submission saves the exact captured artifact first and freezes further edits', async () => {
  const backend = fake(); const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit(ready()); await queue.submit(); assert.deepEqual(backend.events, ['save', 'submit']); assert.equal(queue.state, 'Frozen'); queue.edit({ ...empty(), comments: 'too late' }); assert.equal(queue.local.aiCritique, ready().aiCritique); queue.dispose();
});
test('F2: failed save prevents submit; missing diagrams and blank reasoning stay incomplete', async () => {
  const backend = fake(); backend.api.save = async () => { throw new ApiClientError('Invalid', 422, 'VALIDATION_FAILED'); }; const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit(ready()); await assert.rejects(queue.submit()); assert.equal(backend.events.length, 0); assert.equal(queue.submitting, false); queue.dispose();
  assert.equal(SubmissionReadyArtifactSchema.safeParse({ ...ready(), aiCritique: ' ', lld: serializeElements([shape('gone', { isDeleted: true })]) }).success, false);
});
test('F3: lost submit response recovers the existing evaluation without creating a new attempt', async () => {
  const backend = fake(); backend.api.submit = async () => { backend.server = { ...backend.server, status: 'queued', evaluationId: id }; throw new ApiClientError('Lost submit response'); };
  const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit(ready()); const result = await queue.submit(); assert.equal(result.id, id); assert.equal(queue.server.evaluationId, id); assert.equal(queue.state, 'Frozen'); queue.dispose();
});
test('F2: ambiguous submit pauses edits until a confirmed read, then retains the existing run', async () => {
  const backend = fake(); const queue = new SaveQueue(attempt(), backend.api, () => {}); let unavailable = true;
  backend.api.submit = async () => { backend.server = { ...backend.server, status: 'queued', evaluationId: id }; throw new ApiClientError('Lost response'); };
  backend.api.attempt = async () => { if (unavailable) throw new ApiClientError('Offline'); return structuredClone(backend.server); };
  queue.edit(ready()); await assert.rejects(queue.submit()); assert.equal(queue.submissionUnknown, true); queue.edit(empty()); assert.equal(queue.local.variantId, 'atomic'); await assert.rejects(queue.flush()); unavailable = false; await queue.checkSubmission(); assert.equal(queue.submissionUnknown, false); assert.equal(queue.server.evaluationId, id); assert.equal(queue.state, 'Frozen'); queue.dispose();
});
test('F2: locked attempts preserve local recovery and switch to frozen without a retry write', async () => {
  const backend = fake(); backend.server = { ...backend.server, status: 'queued', evaluationId: id }; backend.api.save = async () => { throw new ApiClientError('Frozen', 409, 'ATTEMPT_LOCKED'); }; const queue = new SaveQueue(attempt(), backend.api, () => {}); queue.edit(ready()); await assert.rejects(queue.flush()); assert.equal(queue.state, 'Frozen'); assert.equal(queue.local.variantId, 'atomic'); assert.equal(queue.server.status, 'queued'); queue.dispose();
});
test('F1: invalid imported work remains device-recoverable while server validation still rejects it', () => {
  const invalid = { ...empty(), hld: serializeElements(Array.from({ length: 201 }, (_, i) => shape(String(i)))) };
  const recovered = recoveryArtifact(JSON.parse(JSON.stringify(invalid))); assert.equal(recovered.hld.elements.length, 201); assert.ok(artifactError(recovered));
});
test('F3: evidence adapter guards runtime fields and does not invent a snapshot hash', () => {
  const data = { id, attemptId: id, evaluationId: id, createdAt: '2026-10-17T12:00:00.000Z', artifact: ready(), provenance: { isSynthetic: false, runnerKind: 'approved_variant', challenge: { slug: 'retry-safe-credit', version: 1 }, manifestSha256: 'manifest', contentSha256: 'content', artifactSha256: 'artifact', suiteVersion: 'v1', suiteSha256: 'suite', implementationSha256: 'implementation', appCommit: 'test', databaseVersion: 'test fixture', runId: id, generation: 1, startedAt: null, finishedAt: '2026-10-17T12:00:00.000Z' }, result: { suiteVersion: 'v1', suiteSha256: 'suite', implementationSha256: 'implementation', runnerKind: 'approved_variant', verdict: 'some_failed', tests: [{ id: 'T3', status: 'failed', expected: { operations: 1 }, observed: { operations: 2 }, durationMs: 1 }] }, limitations: ['Invented unit-test data; no database execution.'], feedbackStatus: 'unavailable' };
  const parsed = EvidenceSchema.parse(data); assert.equal(parsed.result.tests[0].status, 'failed'); assert.equal('snapshotSha256' in parsed.provenance, false); assert.throws(() => EvidenceSchema.parse({ ...data, provenance: { ...data.provenance, generation: 'one' } }));
});
test('F3: unavailable rule output is labelled as rules, with actual records summarized without grading', () => {
  const feedback = { status: 'unavailable', source: 'rules', provider: null, model: null, promptVersion: 'v1', output: { summary: 'Rules', strengths: [], limitations: ['Human review'], nextSteps: [] } };
  assert.equal(feedbackLabel(feedback), 'Rule-based explanation'); assert.match(feedbackLabel({ ...feedback, source: 'llm', provider: 'openai', model: 'returned-model' }), /openai.*returned-model/);
  assert.deepEqual(observationSummary({ db: { balances: { A: 1000 }, operations: [{}, {}], ledger: [{}] } }), { db: { balances: { A: 1000 }, operationCount: 2, ledgerCount: 1 } });
});
test('F4: mentor packet contains only selected owned content and marks missing artifacts', () => {
  const owned = attempt({ ...empty(), aiCritique: 'Private unselected critique', repairJustification: 'Selected reasoning' });
  const packet = mentorPacket(owned, null, ['hld', 'repairJustification'], 'Where is the boundary?');
  assert.equal(packet.attemptId, owned.id); assert.equal(packet.hld, 'Missing in this saved artifact'); assert.equal(packet.repairJustification, 'Selected reasoning'); assert.equal('aiCritique' in packet, false); assert.equal('tests' in packet, false); assert.equal('lld' in packet, false); assert.equal('evidenceId' in packet, false);
});
test('F1: rate-limit writes respect Retry-After and keep safe error metadata', async () => {
  let count = 0; const api = new ApiClient('https://api.example.com', async () => 'token', () => {}, async () => { count++; return new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Full', retryable: true }, meta: { requestId: id, isMock: false } }), { status: 429, headers: { 'Retry-After': '2' } }); });
  await assert.rejects(api.create(id), error => error.status === 429 && error.requestId === id && error.retryAfter === '2'); await assert.rejects(api.create(id), error => error.status === 429); assert.equal(count, 1);
});
