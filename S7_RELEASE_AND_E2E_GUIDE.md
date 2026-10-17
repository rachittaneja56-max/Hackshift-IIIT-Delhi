# TrajectoryOs S7 release and E2E guide

This handoff describes the reconstructed AI Debugging Lab v2, the checks actually run, and the steps to finish PostgreSQL and browser verification. It is a local setup guide, not a deployment authorization.

## A. Current status

- Work branch: `feat/sandbox-hardening`.
- Implementation commit: `66d8cce` (`feat(sandbox): reconstruct and harden debugging lab v2`). The guide is committed separately; use `git rev-parse HEAD` for the exact final branch SHA.
- Latest fetched `origin/main`: `d788a33` (`sandboxes for ai interviews`, fetched 2026-10-18). No S7 changes were pushed or merged. The local `main` ref is stale at `d9c181a`.
- S7 release status: **not promoted**. The required real PostgreSQL T1–T7 regression and API integration gates were not run because the configured Neon URL is not identified as a development/test branch. Docker is installed, but its local engine is unavailable. The available browser inventory was empty, so authenticated browser verification could not be performed.
- No migration was applied to the configured Neon database. Migration `005_sandbox.sql` was not edited. Migration `006_sandbox_v2_recovery.sql` is additive to the stored report data; it preserves submitted v1 reports and retires active v1 sessions so new work starts on v2.
- `SANDBOX_ENABLED=false` remains the safe value in `apps/api/.env.example`. Do not enable the feature in a deployment until the migration, database integration, authentication, and browser walkthrough are complete.
- The challenge source and missing pinned lockfile were **reconstructed**. Equivalence to the lost v1 source, implementation, and test corpus is unverified. New sessions use `rate-limiter-debugging` v2 and persist source, challenge, and suite hashes with their evidence.
- Railway configuration is not present in this repository. Vercel configuration now lives at the monorepo root so it can see the npm workspaces and shared contracts.
- Current audited dependency state: API production dependencies had 0 reported advisories. The web production dependency tree had 14 advisory entries (6 high, 6 moderate, 2 low), including the existing Excalidraw/Mermaid dependency tree. This S7 change did not upgrade that UI dependency family.

### What was reconstructed or changed

- E2B adapter pinned to `e2b@2.53.1`, with a fixed file allowlist, source and output bounds, symlink/path checks, pinned challenge installation, expected TAP names/counts, visible tests, fresh private grading, and cleanup.
- Bootstrap can access the package registry to install the challenge. The provider then calls the SDK's network update with internet disabled before learner source or tests run. A live post-update registry probe failed by timeout; this verifies that probe was no longer reachable, not every possible destination.
- `rate-limiter-debugging` challenge v2: intentionally faulty starter, 5 visible tests, 4 private tests, a separate correct reference, pinned `tsx` lockfile, and hash provenance.
- Durable PostgreSQL `sandbox_jobs` with idempotent request IDs, claim tokens, bounded leases/retries, source reconciliation, frozen submission source, and terminal infrastructure reports that retain earlier transcript and visible observations.
- Shared v0.5 request/DTO schemas, additive migration 006, runtime packaging for compiled API assets, pending-request persistence in the browser, v1 retirement messaging, and a visible AI Lab entry point.
- Root `vercel.json` uses the repository root, the shared contracts workspace, `apps/web/dist`, and the SPA rewrite. No Railway deployment file or deployment was created.

## B. Local prerequisites and environment

Use Windows PowerShell from the repository root. The repository requires Node.js `>=22.12.0`; the tested local runtime was Node `v24.21.0` with npm `11.6.1`.

Create local files from templates if needed:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Edit values locally in your editor. Do not paste keys into chat, commit `.env` files, or put server credentials in a `VITE_` variable. `.gitignore` ignores real `.env` files and `.env.local` while allowing `.env.example` templates.

### Backend: `apps/api/.env`

| Variable | Required for | Value source / notes |
|---|---|---|
| `DATABASE_URL` | Migrations, readiness, API persistence | Neon **development/test branch** connection string. Verify the branch in Neon before running migrations or integration tests. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Real sign-in and readiness | Matching keys from the same Clerk development instance. Secret stays in the API environment. |
| `CLERK_JWT_KEY` | Only if the configured Clerk verification mode uses it | Clerk dashboard / JWT configuration; optional for the current configuration. |
| `CLERK_AUTHORIZED_PARTIES` | Token origin checks | Comma-separated exact origins. Local value: `http://127.0.0.1:5173`. |
| `CORS_ORIGINS` | Browser API requests | Comma-separated exact origins; use `http://127.0.0.1:5173` locally. Avoid mixing `localhost` and `127.0.0.1`. |
| `PORT` | API listener | Defaults to `3000`; Railway supplies its own `PORT`. |
| `OPENAI_API_KEY` | AI Debugging Lab assistant and optional OpenAI feedback | OpenAI dashboard. Server-side only. |
| `SANDBOX_AGENT_MODEL` | AI Debugging Lab assistant | Supported OpenAI model name chosen by the owner; do not infer or copy a value from a sample. |
| `E2B_API_KEY` | Live sandbox | E2B dashboard. Server-side only; it is never uploaded into a sandbox. |
| `SANDBOX_ENABLED` | AI Debugging Lab availability | Keep `false` until all gates below pass. Set `true` only with E2B and OpenAI values configured. |
| `SANDBOX_MAX_ACTIVE` | Lab capacity | Safe sample default `4`; API validation permits `1–20`. |
| `SANDBOX_SESSION_TTL_SECONDS` | Lab session lifetime | Safe sample default `1200` seconds (20 minutes); API validation permits `120–3600`. |
| `AI_ENABLED`, `AI_PROVIDER` | Optional evidence feedback | Keep `AI_ENABLED=false` until configured. Choose `openai` or `mistral`. |
| `OPENAI_MODEL` | OpenAI evidence feedback | Separate setting from `SANDBOX_AGENT_MODEL`. |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | Mistral evidence feedback | Mistral dashboard; server-side only. |
| `APP_COMMIT_SHA` | Production configuration readiness | Set to the deployed Git SHA in production. |

The template does not contain guessed credentials or model names. `CLERK_JWT_KEY` is optional. Evidence feedback is separate from the OpenAI coding assistant.

### Frontend: `apps/web/.env.local`

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | Local: `http://127.0.0.1:3000`; production: the public Railway API origin. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Public Clerk publishable key matching the API's Clerk instance. |

Only public values belong in this file. Vite embeds `VITE_` values in browser assets.

## C. Install, migrate, start, and check the application

From `C:\Users\tanej\Desktop\TrajectoryOs`:

```powershell
npm ci
```

Before migrating, verify `DATABASE_URL` points to the intended non-production Neon branch. The migrator applies/verifies all numbered migrations in order: 001 through 006. It checks migration checksums and the published retry-safe-credit v1 content. Never edit migration 005 or delete the `app.schema_migrations` table to bypass a mismatch.

```powershell
npm run migrate --workspace=@trajectoryos/api
```

Open two PowerShell terminals at the repository root.

Terminal 1, API:

```powershell
npm run dev --workspace=@trajectoryos/api
```

Terminal 2, frontend:

```powershell
npm run dev --workspace=@trajectoryos/web
```

Use the exact local origins `http://127.0.0.1:5173` (web) and `http://127.0.0.1:3000` (API). Check liveness and readiness in another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

Liveness should return `{ status: "ok" }`. Readiness returns `{ status: "ready", dependencies: { database: "ok" } }` only when the database schema and required Clerk configuration are ready; otherwise it returns HTTP 503 with a reason. Stop each development process with **Ctrl+C** in its own terminal.

## D. Browser walkthrough after the safe database is configured

The browser walkthrough was not run in this environment. Once a safe development database is migrated and a real Clerk development instance is configured:

1. Open `http://127.0.0.1:5173`, sign in through Clerk, and confirm the app returns to the Learn page.
2. Open **Engineering Lab**. Start the retry-safe-writes challenge, inspect the design and code sections, and make the three documented design decisions. Submit only after the HLD/LLD and written reasoning fields are complete. A completed attempt should show actual PostgreSQL T1–T7 observations.
3. Open **Learn** and choose the **AI Debugging Lab** card, or navigate to `/lab/ai-debugging`.
4. Choose **Start session**. Wait for `ready`; inspect the repository and `src/rateLimiter.ts`. The initial source should be faulty. Choose **Run visible tests** and expect real E2B output with failures.
5. Send one prompt such as: “Inspect `src/rateLimiter.ts`. Compare the epoch window boundary and denied-request behavior with the README contract, make the smallest correct change, and run the visible suite. Report what the tests actually observed.”
6. Wait for the server to return to `ready`. Confirm the prompt count decremented, the source viewer changed, the **diff** view shows the patch, and the turn details contain actual `list_files`, `read_file`, `write_file`, and `run_visible_tests` events where the model called them.
7. Run visible tests manually if needed. Their stdout, exact test names/counts, status and source hash should be visible. The visible suite is partial; do not treat a visible pass as final correctness.
8. Click **Final submit**. The session freezes the source, a fresh E2B grader runs the private suite, and the UI polls until the persisted report appears. Inspect the verdict, source SHA-256, suite hashes, stdout and execution limitations. `infrastructure_error` is not a correctness failure.
9. Refresh during an accepted prompt or grading. The browser stores the session pointer and any pending request ID/payload per signed-in user. If a retry control appears, click **Retry the same request**; it reuses that request ID. Confirm the server's prompt count and turn/report remain singular.

**Five-prompt check:** use one test session, submit five distinct prompts, and confirm the server reports `0 prompts remaining`; the sixth is rejected/disabled. Duplicate a request only by retrying the same pending action. Do not count on local browser state as the enforcement boundary.

**Expiry and ownership checks:** session TTL defaults to 20 minutes. Use a disposable test session to verify expiry; do not edit production rows. For ownership, use two separate Clerk test users and verify that the second user's session/report request returns 404. The PostgreSQL sandbox integration test exercises prompt budget, duplicate IDs, owner isolation, grading and cleanup, but it was not run here.

**Failure checks:** use deterministic fakes in the API integration tests for provider/model errors, timeouts and retries. An accepted failed prompt still consumes one of five prompts, and successful earlier tool events remain recorded. Do not disable auth or network controls to simulate a failure.

**Career and mentor:** `/career/preview` needs a saved owned evidence record; its career review is backed by the API and optional configured AI. `/mentors/preview` prepares a private packet from selected owned context and explicitly does not contact a mentor; any sample response is labelled seeded. Neither preview automates job applications or makes hiring claims.

## E. Automated verification and actual results

### Clean-checkout release gates

Ran in a detached clean Git worktree at implementation commit `66d8cce`:

| Command | Observed result |
|---|---|
| `npm ci` | **PASS**, installed 490 packages. npm reported 14 advisory entries in the full workspace dependency tree. |
| `npm run typecheck` | **PASS** for contracts, API, and web. |
| `npm run build` | **PASS**; contracts, API runtime assets, and Vite frontend built. Vite emitted its existing large-chunk warning. |
| `npm test` | **PASS**; API 24/24 and web 30/30 tests. These are deterministic unit/client tests, not PostgreSQL integration tests. |
| `npm run smoke` | **PASS**; health/readiness behavior without a database, v0.5 schemas, and packaged API challenge/migration assets. |
| Challenge `npm ci --ignore-scripts --no-audit --no-fund` | **PASS**, installed 31 packages from the nested pinned lockfile. |

The same root typecheck/build/test/smoke commands also passed in the original working tree after the implementation edits.

### Live and targeted checks

| Check | Observed result and boundary |
|---|---|
| `npm run test:live:sandbox` in `apps/api` | **PASS** against E2B SDK 2.53.1. Faulty starter: 1 passed / 4 failed. Reference: visible 5/5. Fresh grader: private 4/4. Source hashes matched. The post-update npm registry probe was rejected by timeout after the provider applied the E2B outbound-deny setting. This did not test every network destination. |
| `npm run test:live:agent` in `apps/api` | **PASS**, one bounded live OpenAI Responses run using `gpt-6-luna`: observed `list_files`, `read_file` (3 calls), `write_file`, and `run_visible_tests`; source changed in E2B and the visible suite returned 5/5. This directly tested the agent/provider boundary, not the authenticated HTTP service or DB event persistence. |
| Incomplete local patch probe | **PASS as a test of the corpus distinction**: incomplete implementation passed visible 5/5 but failed one private invalid-configuration case (private 3 passed / 1 failed). Run locally only; it was not uploaded to a student sandbox. |
| Existing retry-safe-credit T1–T7 PostgreSQL smoke | **NOT RUN**; no verified safe test database. |
| `npm run test:integration --workspace=@trajectoryos/api` | **NOT RUN** for the same database-safety reason. This includes the sandbox service integration and existing API integration suites. |
| `npm run smoke:evaluation --workspace=@trajectoryos/api` | **NOT RUN**; it writes generated evaluation data to PostgreSQL. |
| Career/feedback DB smoke | **NOT RUN**; each requires a generated integration evidence ID and a safe database. |
| Real Clerk browser and full API-to-report journey | **NOT RUN**; no browser surface was available to the computer-use tool, and database writes were not safe to attempt. |
| Railway/Vercel deployment | **NOT RUN**; no deployment was requested or performed. |

Useful commands after a development database is confirmed:

```powershell
npm run test:integration --workspace=@trajectoryos/api
npm run smoke:evaluation --workspace=@trajectoryos/api
```

`smoke:career` and `smoke:ai` additionally need a generated non-synthetic integration evidence UUID. Read their help/source before using them; they write review/annotation data. The API-only production dependency audit reported 0 advisories; the web production audit reported 14 (6 high, 6 moderate, 2 low), concentrated in the current Excalidraw/Mermaid dependency tree. Review that tree before a production release.

## F. Troubleshooting

### PostgreSQL `ECONNRESET` or readiness 503

- Confirm `DATABASE_URL` is the current Neon **development/test** branch URL, the endpoint is reachable, and the provider allows the machine's network.
- Check the Neon dashboard branch and compute status. Never paste or print the connection string; it contains credentials.
- Restart the API after changing `apps/api/.env`. Check `/health/live` first, then `/health/ready`.
- Do not run tests or migrations against an unidentified or production database.

### Migration checksum mismatch

- Stop the deployment/startup and preserve the database.
- Compare the applied migration name/hash with the repository migration. Do not rewrite `005_sandbox.sql`, delete `schema_migrations`, drop the schema, or hand-edit stored reports.
- Resolve with an approved additive migration or restore the exact applied migration source before retrying.

### Clerk 401 / sign-in does not initialize

- Confirm frontend publishable and API secret keys belong to the same Clerk instance and environment.
- Check the Clerk allowed origins for `http://127.0.0.1:5173`, and `CLERK_AUTHORIZED_PARTIES` for the exact browser origin. Check `CLERK_JWT_KEY` only if the chosen Clerk mode needs it.
- Restart Vite after changing `.env.local`. Never work around a 401 by disabling server bearer verification.

### CORS error

- Use `127.0.0.1` consistently for the web origin; `localhost` is a different origin.
- Match scheme, hostname, and port exactly in `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES`. Production values must be exact HTTPS origins.

### Missing OpenAI/E2B keys, capacity, or sandbox creation failure

- Check only whether `OPENAI_API_KEY`, `SANDBOX_AGENT_MODEL`, and `E2B_API_KEY` are set in the API environment; do not print their values.
- `SANDBOX_ENABLED` must be `true` only after setup is complete. The availability route reports whether server-side prerequisites exist.
- Capacity errors mean configured active slots are occupied or E2B cannot allocate a sandbox. Check session expiry, `SANDBOX_MAX_ACTIVE`, E2B account capacity, and E2B dashboard status. Do not delete unrelated database rows.
- Bootstrap needs the pinned npm packages while network access is enabled. The provider then applies outbound denial before learner source/test execution. If bootstrap or its registry probe fails, keep the feature disabled and inspect the sanitized API error code and E2B dashboard; do not enable internet for submitted code.

### Model timeout or tool-call failure

- Inspect the persisted turn and tool events. The agent bounds each OpenAI request, turn duration, tokens, tool count, arguments, and outputs.
- A failed accepted prompt still uses one prompt. Retry the same browser action only when the UI offers the persisted request ID; a new ID is a new prompt.
- Prior successful write/test events remain visible even when a later tool/model operation fails. Do not claim a change from an error event.

### Stuck grading / session expiry / unexpected hidden output

- Read the owned session, then its report endpoint. Check job `status`, `attempts`, `failure_code`, `lease_until`, test-run `status`, and source/suite hashes using read-only SQL on a confirmed test database.
- `infrastructure_error` or `timeout` means no correctness verdict was produced. `incorrect` means the expected private tests ran and failed assertions.
- Expired sessions cannot be resumed; start a new v2 session. Submitted v1 reports remain distinguishable as challenge v1.
- Never rerun grading by editing database rows or alter stored reports. The worker uses bounded retries and will record a terminal infrastructure report if they are exhausted.

### Build or runtime asset failure

- From a clean checkout, run `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, and `npm run smoke`.
- The API build must package `dist/sandbox/challenge`, `dist/challenge-source`, and `dist/migrations`. If assets are missing, inspect the build output and `apps/api/scripts/package-runtime-assets.mjs`.
- The challenge itself has a separate lockfile under `apps/api/src/sandbox/challenge`; install it from that directory with `npm ci --ignore-scripts --no-audit --no-fund`.

### Browser refresh or lost response

- Reopen the same app origin and sign in as the same Clerk user. The browser stores the sandbox session pointer and pending action under a user-specific localStorage key.
- Use **Retry the same request** when offered. It resends the same request ID/payload. The backend queue survives API restarts; it does not promise exactly-once model billing if an external call completed just before a database interruption.

## G. Deployment readiness

### Railway API

There is no `railway.json`, Dockerfile, or Railway-specific build configuration in the repository. Configure a Railway service from the **repository root** (not `apps/api`) so npm workspaces and `packages/contracts` are available.

- Node runtime: 22.12 or newer (root `package.json` requires `>=22.12.0`). Use npm 11.6.1 to match `packageManager`.
- Install: `npm ci`.
- Build: `npm run build --workspace=@trajectoryos/contracts && npm run build --workspace=@trajectoryos/api`.
- Migration release command after confirming the target database: `npm run migrate:built --workspace=@trajectoryos/api`. It applies/verifies all numbered migrations; it is not a schema reset.
- Start: `npm run start --workspace=@trajectoryos/api`.
- Health check: `/health/live`; readiness: `/health/ready`. The app listens on Railway's `PORT` and `0.0.0.0`.
- Configure `DATABASE_URL`, both Clerk keys, exact `CLERK_AUTHORIZED_PARTIES` and `CORS_ORIGINS`, `APP_COMMIT_SHA`, and any enabled AI provider values as Railway secrets. Set `SANDBOX_ENABLED=false` until the migration and full API/browser E2E gates pass.
- Workers use PostgreSQL-backed queues and in-process polling with row claims/leases; there is no Redis/Kafka requirement. Graceful `SIGINT`/`SIGTERM` stops workers and closes the pool. Keep at least one API instance running while jobs are queued.
- After deployment, check liveness/readiness, sign in, run one development-owned workflow, and inspect stored hashes before enabling the sandbox flag.

### Vercel frontend

The repository-root `vercel.json` is the deployment config. In the Vercel dashboard set the project Root Directory to the repository root (`.`), so the root npm workspace and shared contracts are visible. The build settings are:

- Framework preset: Vite.
- Install: `npm ci`.
- Build: `npm run build --workspace=@trajectoryos/contracts && npm run build --workspace=@trajectoryos/web`.
- Output directory: `apps/web/dist`.
- SPA rewrites: configured in root `vercel.json`, preserving `/assets/` and `/excalidraw-assets/`.
- Environment: `VITE_API_BASE_URL` (Railway API origin), `VITE_CLERK_PUBLISHABLE_KEY` (public Clerk key). Add production and preview origins to the API's exact CORS and Clerk authorized-party lists only as needed.

Vercel serves the frontend only; Express, PostgreSQL migrations, and worker processes remain on Railway. The Vercel monorepo/root-directory settings follow its [monorepo guidance](https://vercel.com/docs/monorepos) and [build configuration](https://vercel.com/docs/builds/configure-a-build). E2B's SDK surface and outbound-network update behavior are documented in the [E2B JavaScript SDK source](https://github.com/e2b-dev/E2B/blob/main/packages/js-sdk/src/sandbox/sandboxApi.ts).

No production deployment was made or tested during S7.

## H. Three-to-five-minute demonstration

Use a preconfigured development environment with a safe database, Clerk test user, and `SANDBOX_ENABLED=true` only after the gates above pass.

1. **0:00–0:40 — Engineering fundamentals.** Open Learn and the retry-safe-writes lesson. Point out response loss, idempotency, and why a client retry is not a second business operation.
2. **0:40–1:30 — Existing design/credit lab.** Open Engineering Lab, show the HLD/LLD and three decision fields, then show the actual T1–T7 evaluation evidence. Say clearly that the diagrams and design choices are reviewed by a person; tests only report observed behavior.
3. **1:30–3:10 — Real AI debugging.** Open `/lab/ai-debugging`, start a v2 sandbox, run visible tests, send the first prompt above, and show actual tool events, the source diff, and visible TAP observations.
4. **3:10–4:10 — Final evidence.** Submit, wait for a fresh private grader, and show the persisted verdict plus challenge/source/suite hashes. Explain that a selected patch passing a test suite is not proof of authorship or general competence.
5. **4:10–5:00 — Mentor/career context.** Open `/mentors/preview` and show a user-selected private packet without sending it. Open `/career/preview` and show evidence-grounded requirement mapping. Identify seeded samples as seeded; no real mentor is contacted and no job application is submitted.

The current lab's E2B/provider and direct OpenAI tool boundary have live checks. The full Clerk → API → PostgreSQL → browser report journey and T1–T7 database behavior remain unverified until a safe test database and browser are available.
