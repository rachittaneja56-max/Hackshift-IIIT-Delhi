# Backend handoff

Owner: Rachit. Work is on `main`; no push or public deployment is authorized.
The user approved the v0.3 executable contract and subsequently switched the feedback provider to OpenAI (`gpt-6-luna`). No public DTO or route changes are proposed.

## Phase results

- B1: API build passed; 2 executable boundary tests passed; 1 comprehensive integration test passed against configured PostgreSQL 18.6. Clerk's real middleware verified locally signed RSA test JWTs, including expiry and authorized-party rejection. Live browser Clerk sign-in remains a manual integration check.
- Migration `001_foundation.sql` applied with checksum tracking; challenge v1 manifest seeded without overwriting published content.
- B2: API build and boundary tests passed. Both PostgreSQL integration tests passed; the strengthened evaluation test also passed independently (173 seconds total, including three variant suites and an additional persisted atomic evaluation). Migration `002_evaluation.sql` applied and verified.
- B3: completed with OpenAI selected by the owner's follow-up. Six unit/boundary tests and all three real PostgreSQL integration tests passed. The live `gpt-6-luna` structured inference succeeded and its annotation is persisted. Migration `003_feedback.sql` applied and verified.

The final complete integration run passed B1, B2 and B3 (3 tests, 0 failures, 0 skips; 140.85 seconds wall time with independent test processes). The integration command now runs files sequentially to avoid test workers competing for the same durable queue. Each test contains multiple behavior assertions; the count is not a count of individual assertions.
Final workspace `typecheck`, production `build`, backend `test`, and root `smoke` passed. A runtime smoke using the configured server environment returned liveness 200, readiness 200, and 401 for both missing and invalid bearer tokens.

## Observed PostgreSQL results

| Variant | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| atomic | pass | pass | pass | pass | pass | pass | pass |
| credit-first | pass | fail | fail | fail | fail | pass | pass |
| key-only | pass | pass | fail | pass | fail | pass | pass |

These are actual observations, not variant-ID verdicts. In particular, key-only's T3 outcome depends on whether replay arrives before response persistence; T5 reliably exposes its partial commit. T3 and T7 acquire separate `pg` clients before releasing a start gate. Neon transaction pooling can reuse backend PIDs between statements; PID equality alone does not imply a shared application connection.

Full synthetic observations are in `apps/api/verification/postgres-runs.json`. The evaluation test wrote immutable PostgreSQL evidence `f9743d14-104c-4384-aae5-8c95b8101c7c` for attempt `0a79befa-6ccf-4776-bd25-251ed93134ef`, evaluation `598b8cdd-12fb-4e35-867d-a104137875f7`. It is owned by that run's signed integration identity, not a browser demo user. Test-created app history is retained; fixture rows are deleted only by generated run UUID. No unrelated rows were removed.

The integration checks also observed concurrent submission convergence, admission limits, frozen drafts, terminal submit replay, cross-user 404s, lease expiry, bounded concurrent retry, stale-generation refusal, infrastructure errors without fabricated verdicts, and database rejection of evidence/result/artifact mutation.

## Current routes

Unauthenticated: `GET /health/live`, `GET /health/ready`.
Authenticated `/api/v1`: `GET /courses`, `GET /lessons/:slug/versions/:version`, `GET /challenges/:slug/versions/:version`, `POST /attempts`, `GET /attempts`, `GET /attempts/:id`, `PUT /attempts/:id/draft`.
Evaluation routes: `POST /attempts/:id/submit`, `GET /evaluations/:id`, `POST /evaluations/:id/retry`, `GET /evidence/:id` under the same authenticated prefix.
Feedback routes: `GET /evidence/:id/feedback`, `POST /evidence/:id/feedback` under the same prefix. This completes all 15 P0 routes, including the two health endpoints.

Create returns 201 or 200 on replay. Submit returns 202 while queued/running or 200 for a terminal replay. Retry returns 202 for the current/new queued generation, and 409 for completed work or exhausted infrastructure retries. Feedback returns 200 for cached/finished output and 202 when another request owns generation. Every non-health success/error uses the v0.3 envelope with a server-generated request UUID and `isMock:false`.

## Commands

From repository root: `npm run build --workspace=@trajectoryos/api`, `npm run test --workspace=@trajectoryos/api`, `npm run test:integration --workspace=@trajectoryos/api`.
Migration and runtime commands run in the API workspace so dotenv loads `apps/api/.env`.
Use `npm run migrate --workspace=@trajectoryos/api` before starting the API.

Environment values belong only in ignored server files or hosting configuration. No credentials are included in this handoff.

## Configuration and startup

Use Node >=22.12 (verified here with Node 24.21.0), npm 11.6.1 and the root workspace lockfile. The sole added dependency is the server OpenAI SDK. The root smoke expectation changed to the approved OpenAI configuration; frontend source and shared contracts were untouched.

| Variable | Behavior |
| --- | --- |
| `DATABASE_URL` | One PostgreSQL URL for `app` and `challenge_eval`; retain certificate verification. One pool, maximum six clients, 15-second connection deadline, 8-second statement timeout. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Server-side Clerk session JWT verification and internal subject resolution. |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated exact frontend HTTP(S) origins. A trailing root slash is normalized. |
| `CORS_ORIGINS` | Comma-separated exact origins. In development, defaults to authorized parties, then `http://localhost:5173`. Use the same hostname in Vite and Clerk; localhost and 127.0.0.1 are different origins. |
| `CLERK_JWT_KEY` | Optional PEM public key for Clerk networkless verification/key management. The integration tests generate ephemeral signing keys; there is no runtime auth bypass. |
| `AI_ENABLED` | `true` enables inference; otherwise feedback is a labelled deterministic rule explanation. |
| `AI_PROVIDER` | Defaults to `openai`; `mistral` remains an optional adapter. No automatic cross-provider fallback. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Server-only key and explicit model. Verified here with `gpt-6-luna`. |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | Required only when explicitly selecting/enabling Mistral. |
| `APP_COMMIT_SHA` | Build commit provenance. Required in production. Development falls back to local Git HEAD with `+dirty` if appropriate, or `unconfigured` without Git. |
| `NODE_ENV`, `PORT` | Default to development and 3000 when blank/unset. Production requires DB, Clerk, explicit origins and commit configuration. |

Run from the repository root:

```powershell
npm ci
npm run build
npm run migrate --workspace=@trajectoryos/api
npm run start --workspace=@trajectoryos/api
```

The migration command is explicit; startup never applies schema changes automatically. Ordered, transactionally applied, checksum-tracked migrations are `001_foundation.sql` (identity/content/drafts), `002_evaluation.sql` (queue/evidence/fixtures), and `003_feedback.sql` (annotations/cache). Changed applied migrations or a different manifest under published challenge v1 are rejected. Hash inputs normalize Windows line endings. Content endpoints and AI context read the immutable published database manifest; the worker checks the selected implementation against its pinned source.

The worker polls every second, runs one evaluation per process, claims with row locks/SKIP LOCKED, and uses a five-minute lease and two-minute run deadline. Query clients are destroyed on cancellation. Run cleanup targets only that generated run UUID. Expired leases become explicit infrastructure errors; the owner may retry up to two total executions. Behavioral failures still complete with evidence. Evidence insertion, result and terminal status share one transaction. Generation/run/lease checks fence stale finalization.

## AI verification

At `2026-10-17T15:03:18.762Z`, a real OpenAI call over the persisted atomic evidence succeeded: provider `openai`, resolved model `gpt-6-luna`, `source:llm`, status `ready`, no failure code. Report and validated output: `apps/api/verification/ai-smoke.json`. Returned usage was 1,293 input tokens and 439 output tokens. This was an inference call, not a provider double or rule fallback. Mistral live inference was not attempted after the owner switched providers; its adapter was tested with a transport double only.

Reproduce with synthetic integration evidence:

```powershell
npm run smoke:ai --workspace=@trajectoryos/api -- <integration-evidence-uuid>
```

The smoke refuses non-integration identities, validates the selected provider, and records whether it reused an annotation. Repeating the same evidence/prompt uses the database cache rather than billing another inference. Do not use a provider-double annotation as a live demo result.

Feedback sends compact actual observations, the pinned challenge and rubric; it excludes identities, diagrams and learner comments. OpenAI uses Responses structured output, `store:false`, no tools, no SDK retries, and a 12-second overall provider deadline. Output is validated for shape, bounds, evidence references and prohibited/contradictory claims. Provider failure, timeout or invalid output produces persisted `source:rules` text. A stale generating claim becomes unavailable with rule output; late calls cannot overwrite it. AI never changes the frozen test verdict or evidence hash. Schema/reference validation cannot establish semantic truth of arbitrary prose; display the interpretation separately from observations.

## Verification commands

```powershell
npm run typecheck
npm run build
npm test
npm run test:integration --workspace=@trajectoryos/api
npm run smoke
```

All ran successfully. The PostgreSQL tests require the configured database and never substitute SQLite/in-memory grades. Unit tests use provider transports/doubles. Integration B3 uses real PostgreSQL plus provider doubles for bad schema/reference/score, timeout, rate limit, cache concurrency, owner denial and expired-claim fencing; the separate smoke establishes actual OpenAI access. An initial database connection timeout and blank NODE_ENV startup issue were fixed before the successful runs.

## Frontend integration

Use the root v0.3 contracts without changes. Set `VITE_API_BASE_URL` to the API origin and send `Authorization: Bearer <await getToken()>` on every non-health request. Configure the matching Clerk app, CORS and authorized frontend origins. JSON failures remain visible; do not replace them with mock success.

Course slug is `reliable-backend`; lesson is `retry-safe-writes` v1; challenge is `retry-safe-credit` v1. Content is labelled seeded, and the suggestion has source `curated_fixture`. A final editorial review of the seeded lesson remains for the content owner.

Create with a stable `clientRequestId`; save the entire contract artifact using `expectedRevision`. Persist both scene element arrays, bindings/text/coordinates, decisions, variant, critique and repair justification. The contract scene root contains only engine, formatVersion and elements; appState/files are outside this DTO. Simple drawable types with element IDs are supported, up to 200 elements per scene and 1 MiB per request. Images, embeddings, external file payloads and element links are rejected. Real editor round trips must still be checked by Parth against the pinned editor build.

Submit the saved revision after a successful save. Submission requires both drawings, all decisions, an allowlisted variant and nonblank critique/justification. Poll the returned evaluation ID approximately once per second, stop on completed/error, then fetch its evidence ID. A different variant requires a new attempt. History supports limit 1–100 (default 20) and an opaque nextCursor. Ownership failures return 404; stale saves return 409 with the current revision.

Feedback is explicit: POST `{}` to generate, poll GET when status is generating. Show `source:llm` with provider/model, or clearly label `source:rules`. Evidence feedbackStatus is a current annotation view added outside the immutable hashed snapshot.

## Remaining release checks and limits

- Real browser Clerk sign-in, two real accounts, deployed origins, Excalidraw refresh/restore, Railway/Vercel deployment and an end-to-end frontend demo remain manual integration checks. No deployment or push was performed.
- `challenge_eval` is reviewed synthetic fixture execution in the same database, not a sandbox. No learner source, SQL, shell or arbitrary module path is executable. No real money is stored.
- The tests establish the disclosed observations, not every concurrency schedule, production load, diagram correctness, learner authorship, competence or hiring suitability. Model feedback remains interpretation.
- Test-created application history/evidence is retained under generated integration identities because it is immutable. Fixture cleanup is scoped, and an unrelated sentinel fixture survived the suite.

## Commits

- B1: `a013d8a9656b62ee99fe0eb0b21f7511fa535fe5`.
- B2: `3136d76`.
- Final B3 implementation SHA: recorded by the documentation-only follow-up commit after verification.
