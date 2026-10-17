# Backend handoff

Owner: Rachit. Work is on `main`; no push or public deployment is authorized.
The user approved the v0.3 executable contract and subsequently switched the feedback provider to OpenAI (`gpt-6-luna`). No public DTO or route changes are proposed.

## Phase results

- B1: API build passed; 2 executable boundary tests passed; 1 comprehensive integration test passed against configured PostgreSQL 18.6. Clerk's real middleware verified locally signed RSA test JWTs, including expiry and authorized-party rejection. Live browser Clerk sign-in remains a manual integration check.
- Migration `001_foundation.sql` applied with checksum tracking; challenge v1 manifest seeded without overwriting published content.
- B2: API build and boundary tests passed. Both PostgreSQL integration tests passed; the strengthened evaluation test also passed independently (173 seconds total, including three variant suites and an additional persisted atomic evaluation). Migration `002_evaluation.sql` applied and verified.
- B3: in progress; OpenAI selected by the owner's follow-up.

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

## Commands

From repository root: `npm run build --workspace=@trajectoryos/api`, `npm run test --workspace=@trajectoryos/api`, `npm run test:integration --workspace=@trajectoryos/api`.
Migration and runtime commands run in the API workspace so dotenv loads `apps/api/.env`.
Use `npm run migrate --workspace=@trajectoryos/api` before starting the API.

Environment values belong only in ignored server files or hosting configuration. No credentials are included in this handoff.
