import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AttemptDtoSchema, AttemptListDtoSchema, ChallengeDtoSchema, CourseListDtoSchema, LessonDtoSchema } from "@trajectoryos/contracts";
import { harness, readyArtifact } from "./helpers.js";
import { AttemptService } from "../src/attempts/service.js";

test("B1: signed Clerk JWT boundaries and real PostgreSQL draft lifecycle", async () => {
  const h = await harness();
  try {
    const path = "/api/v1/attempts";
    for (const bad of [null, "invalid", h.token(undefined, { exp: 1 }), h.token(undefined, { azp: "http://evil.invalid" })])
      assert.equal((await h.request(path, "GET", undefined, bad)).status, 401);
    assert.equal((await h.request(path, "GET", undefined, h.token(), { Origin: "http://evil.invalid" })).status, 403);
    assert.equal((await h.request("/health/ready")).status, 200);
    CourseListDtoSchema.parse((await h.request("/api/v1/courses")).body.data);
    LessonDtoSchema.parse((await h.request("/api/v1/lessons/retry-safe-writes/versions/1")).body.data);
    ChallengeDtoSchema.parse((await h.request("/api/v1/challenges/retry-safe-credit/versions/1")).body.data);
    const input = { challengeSlug: "retry-safe-credit", challengeVersion: 1, clientRequestId: randomUUID() };
    const creates = await Promise.all([h.request(path, "POST", input), h.request(path, "POST", input)]);
    assert.deepEqual(creates.map(r => r.status).sort(), [200, 201]);
    const draft = AttemptDtoSchema.parse(creates[0].body.data);
    assert.equal(draft.id, creates[1].body.data.id);
    const foreign = h.token(h.subjects[1]);
    assert.equal((await h.request(`${path}/${draft.id}`, "GET", undefined, foreign)).status, 404);
    assert.equal((await h.request(`${path}/${draft.id}/draft`, "PUT", { expectedRevision: 1, artifact: readyArtifact }, foreign)).status, 404);
    const saves = await Promise.all([1, 2].map(() => h.request(`${path}/${draft.id}/draft`, "PUT", { expectedRevision: 1, artifact: readyArtifact })));
    assert.deepEqual(saves.map(r => r.status).sort(), [200, 409]);
    const reloaded = AttemptDtoSchema.parse((await h.request(`${path}/${draft.id}`)).body.data);
    assert.equal(reloaded.revision, 2); assert.deepEqual(reloaded.artifact, readyArtifact);
    const owner = (await h.pool.query("SELECT id FROM app.users WHERE clerk_user_id=$1", [h.subjects[0]])).rows[0].id;
    assert.deepEqual((await new AttemptService(h.pool).get(owner, draft.id)).artifact, readyArtifact);
    const unsafe = { ...readyArtifact, hld: { ...readyArtifact.hld, elements: [{ id: "image-1", type: "image", fileId: "bad" }] } };
    assert.equal((await h.request(`${path}/${draft.id}/draft`, "PUT", { expectedRevision: 2, artifact: unsafe })).status, 422);
    assert.equal((await h.request(`${path}/${draft.id}/draft`, "PUT", { expectedRevision: 2, artifact: { ...readyArtifact, comments: "x".repeat(1100000) } })).status, 413);
    assert.equal((await h.request(path, "POST", { ...input, userId: randomUUID() })).status, 422);
    const list = AttemptListDtoSchema.parse((await h.request(path + "?limit=1")).body.data);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].id, draft.id);
    assert.equal((await h.request(path + "?cursor=broken")).status, 422);
    const second = await h.request(path, "POST", { ...input, clientRequestId: randomUUID() });
    const firstPage = (await h.request(path + "?limit=1")).body.data;
    const secondPage = (await h.request(path + "?limit=1&cursor=" + firstPage.nextCursor)).body.data;
    assert.equal(firstPage.items[0].id, second.body.data.id);
    assert.equal(secondPage.items[0].id, draft.id);
    const other = await h.request(path, "POST", input, foreign);
    assert.equal(other.status, 201); assert.notEqual(other.body.data.id, draft.id);
    assert.equal(creates[0].body.meta.isMock, false);
  } finally { await h.close(); }
});
