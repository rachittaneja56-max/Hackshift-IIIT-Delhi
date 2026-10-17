import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sandboxApi, sessionSchema, reportSchema } from '../src/code-lab/api.ts';

const id = '5d22a39d-99d2-4afa-969f-e15d6bb302c8';
const session = { id, challengeSlug: 'rate-limiter-debugging', challengeVersion: 1, status: 'ready',
  expiresAt: '2026-10-18T10:00:00.000Z', createdAt: '2026-10-18T09:40:00.000Z', promptCount: 1, promptsRemaining: 4,
  visibleRunsRemaining: 9, currentSha256: 'a'.repeat(64), failureCode: null, turns: [], visibleTests: [] };

test('sandbox DTO validation rejects invented counters and missing grading provenance', () => {
  assert.equal(sessionSchema.parse(session).promptsRemaining, 4);
  assert.throws(() => sessionSchema.parse({ ...session, promptsRemaining: -1 }));
  assert.throws(() => sessionSchema.parse({ ...session, status: 'fake_complete' }));
  assert.throws(() => reportSchema.parse({ challengeSlug: 'rate-limiter-debugging', challengeVersion: 1, verdict: 'correct' }));
});

test('sandbox adapter sends stable request IDs to exact session routes', async () => {
  const calls = [];
  const api = { request: async (...args) => { calls.push(args); return session; } };
  const lab = sandboxApi(api);
  await lab.start(id);
  await lab.send(id, id, 'Check the boundary');
  await lab.visible(id, id);
  await lab.submit(id, id);
  assert.deepEqual(calls.map(([path, , method, body]) => ({ path, method, body })), [
    { path: '/sandbox/sessions', method: 'POST', body: { clientRequestId: id } },
    { path: `/sandbox/sessions/${id}/turns`, method: 'POST', body: { clientRequestId: id, prompt: 'Check the boundary' } },
    { path: `/sandbox/sessions/${id}/visible-tests`, method: 'POST', body: { clientRequestId: id } },
    { path: `/sandbox/sessions/${id}/submit`, method: 'POST', body: { clientRequestId: id } },
  ]);
});
