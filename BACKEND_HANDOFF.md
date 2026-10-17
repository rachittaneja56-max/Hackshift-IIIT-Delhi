# Backend handoff

Owner: Rachit. Work is on `main`; no push or public deployment is authorized.
The user approved the v0.3 executable contract and subsequently switched the feedback provider to OpenAI (`gpt-6-luna`). No public DTO or route changes are proposed.

## Phase results

- B1: API build passed; 2 executable boundary tests passed; 1 comprehensive integration test passed against configured PostgreSQL 18.6. Clerk's real middleware verified locally signed RSA test JWTs, including expiry and authorized-party rejection. Live browser Clerk sign-in remains a manual integration check.
- Migration `001_foundation.sql` applied with checksum tracking; challenge v1 manifest seeded without overwriting published content.
- B2 and B3: in progress.

## Current routes

Unauthenticated: `GET /health/live`, `GET /health/ready`.
Authenticated `/api/v1`: `GET /courses`, `GET /lessons/:slug/versions/:version`, `GET /challenges/:slug/versions/:version`, `POST /attempts`, `GET /attempts`, `GET /attempts/:id`, `PUT /attempts/:id/draft`.

## Commands

From repository root: `npm run build --workspace=@trajectoryos/api`, `npm run test --workspace=@trajectoryos/api`, `npm run test:integration --workspace=@trajectoryos/api`.
Migration and runtime commands run in the API workspace so dotenv loads `apps/api/.env`.
Use `npm run migrate --workspace=@trajectoryos/api` before starting the API.

Environment values belong only in ignored server files or hosting configuration. No credentials are included in this handoff.
