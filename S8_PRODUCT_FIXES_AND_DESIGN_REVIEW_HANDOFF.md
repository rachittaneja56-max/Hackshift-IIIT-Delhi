# S8 Product Fixes and Design Review Handoff

## Release state

- S7 was integrated on local `main` without rewriting history. The branch began at `ffe6631` after fast-forwarding from the then-current `origin/main` (`d788a33`) through the S6/S7 commits.
- S8 adds the UX corrections below and versioned design review contract v0.6. The API review is additive and reads a completed, owner-scoped frozen evidence snapshot; it does not alter PostgreSQL evaluation outcomes or evidence.
- Build, typecheck, unit tests and the repository smoke checks passed from a fresh, credential-free copy installed with `npm ci`.
- PostgreSQL T1–T7 and migration integration are **UNVERIFIED**. No dedicated disposable test database was configured (`TRAJECTORYOS_TEST_DATABASE_URL`, `DATABASE_URL_TEST`, and `S8_TEST_DATABASE_URL` were absent). Do not substitute a developer or production `.env` database.
- Browser and screenshot QA are **UNVERIFIED** because no browser surface was available to the UI automation session. The Google Doc text and user-provided screenshot descriptions were reviewed; embedded screenshot images were not visually accessible.
- No public deployment was performed.

## Product feedback implemented

- Career evidence now pairs each canonical T1–T7 ID with a human-readable description and result. Related checks are available in a collapsed disclosure while their canonical IDs remain intact.
- History cards have rounded, contained rows; the duplicate page-level resume action was removed while per-row actions remain.
- The retry lesson now explains the Client → API → PostgreSQL commit and response path, including the case where a commit succeeds but the response is lost. It distinguishes the user's same-key application retry from TCP retransmission and demonstrates durable idempotency lookup and replay.
- Evidence pages lead with a readable summary and place verification/run identifiers under an advanced disclosure. The immutable evidence record remains available.
- Submission validation translates common missing, blank, and server-reported issues to actionable fields. Invalid fields receive focus and visual emphasis; the draft stays available for correction.

## HLD/LLD review behavior

- Contract v0.6 adds strict design-review request and response DTOs and a versioned `GET`/`POST /api/v1/evidence/:id/design-review` API.
- Migration 007 adds a cache/claim table keyed by evidence ID, saved-artifact hash, and review version. The service joins owner-scoped frozen evidence and never writes to the evidence record.
- The extractor sends bounded diagram structure, element IDs/types, labels, geometry, and explicit/best-effort arrow bindings. Diagram labels are treated as untrusted content. Deleted elements are omitted; oversized or unsupported content is bounded and disclosed.
- HLD and LLD criteria are separate. Findings cite saved element IDs and exact label excerpts, and distinguish explicit, ambiguous, not shown, and not assessable evidence. Empty diagrams stay not assessable. The reviewer provides questions and next steps without a numerical score, competence verdict, or change to evaluation outcomes.
- Mistral/OpenAI structured providers are optional. If disabled, unavailable, or invalid, the service returns a clearly labelled limited rules review based on labels. The result records its source/provider and limitations; failure does not silently appear as model output.
- The browser displays the saved HLD and LLD beside the advisory findings. The review inspects diagram JSON structure and labels, not pixels, and does not prove that a learner authored or implemented a design.

## Verification performed

Commands were run in `tmp/s8-release-20261018`, a fresh copy of the current tracked source excluding credentials and private local documents, with dependencies installed by `npm ci`.

| Check | Result |
| --- | --- |
| `npm ci` | PASS; 490 packages added. npm reported 14 advisories (2 low, 6 moderate, 6 high, 0 critical). |
| `npm run typecheck` | PASS |
| `npm run test --workspace=@trajectoryos/api` | PASS; 32 tests |
| `npm run test --workspace=@trajectoryos/web` | PASS; 35 tests |
| `npm run build` | PASS; Vite emitted its existing large-chunk warning. |
| `npm run smoke` | PASS; API health/readiness, v0.6 schema and packaged challenge/migration assets. |
| `git diff --check` | PASS |
| PostgreSQL T1–T7 / migration integration | UNVERIFIED; no authorized disposable database URL was configured. |
| Browser / screenshot QA | UNVERIFIED; browser surface unavailable and embedded Google Doc images were not visually accessible. |
| Live model provider / E2B | Not exercised; provider behavior is covered by unit tests. Keep sandbox disabled until live sandbox and database checks pass. |

## Dependency audit follow-up

The clean install reported advisories in the existing Excalidraw/Mermaid dependency graph, including transitive KaTeX, `braces`, `lodash-es`, and `nanoid` packages. A non-forced `npm audit fix` was tried only in an isolated disposable copy and did not clear the findings. The proposed forced updates include a Mermaid major upgrade and an Excalidraw version downgrade, so they were not applied without compatibility review. Reassess upgrades in a dedicated dependency change and rerun editor/diagram tests. The `braces` finding has no patched version in the advisory currently reported by npm.

## Operational follow-up

1. Apply migration 007 through the authorized migration process to an isolated test database.
2. Run the existing PostgreSQL integration suite, including T1–T7 and ownership/recovery cases, against that disposable database.
3. Configure the intended server-side model provider and verify a real evidence review records its provider/source accurately; test the labelled fallback with the provider disabled.
4. Exercise the E2B debugging lab against the intended sandbox account and run its hidden tests before enabling `SANDBOX_ENABLED`.
5. Complete desktop and mobile browser QA for career evidence, history, validation focus/recovery, evidence summary/provenance, and both saved design diagrams with their findings.
6. Review dependency remediation for Excalidraw and Mermaid, then rerun build and editor/security checks.
