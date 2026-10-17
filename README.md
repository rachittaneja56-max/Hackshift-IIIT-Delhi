# TrajectoryOs

TrajectoryOs is the HackShift 2026 learning workspace. It includes the integrated frontend, a seeded retry-safe credit challenge, PostgreSQL evaluation, evidence-grounded AI feedback, and an optional E2B-backed AI Debugging Lab. Browser Clerk sign-in and Excalidraw save-and-restore remain unverified integration checks.

The evaluator executes only the three reviewed variants (`atomic`, `credit-first`, `key-only`). It does not execute learner code, grade diagrams or establish authorship, general competence, or hiring suitability. The content and fixture balances are synthetic.

## Requirements and local setup

- Node.js 22.12 or newer
- npm 11.6.1
- One PostgreSQL database for both `app` and `challenge_eval` schemas

The API enforces PostgreSQL hostname and certificate verification: it normalizes an omitted `sslmode` or the legacy `prefer`, `require`, and `verify-ca` values to `verify-full`, and rejects modes that disable verification.

Install from the repository root:

```powershell
npm ci
```

Copy `apps/api/.env.example` to `apps/api/.env` and fill the server values. Copy `apps/web/.env.example` to `apps/web/.env.local` and set the browser values. Keep all keys in these ignored files or hosting configuration; only the Clerk publishable key belongs in the browser.

For the current Vite dev script, open the frontend at `http://127.0.0.1:5173`. Use `VITE_API_BASE_URL=http://127.0.0.1:3000`. The API development CORS and Clerk authorized-party defaults now use that same exact origin. `localhost` and `127.0.0.1` are different origins. If you choose another host, configure that exact origin in both `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` and use it consistently in the browser.

Build the shared contracts before running migrations or the API. This creates `packages/contracts/dist/index.js`, which resolves the `ERR_MODULE_NOT_FOUND` error from an unbuilt workspace:

```bash
npm run build --workspace=@trajectoryos/contracts
npm run migrate --workspace=@trajectoryos/api
```

Run the API and web app in separate terminals:

```powershell
npm run dev --workspace=@trajectoryos/api
npm run dev --workspace=@trajectoryos/web
```

API startup does not apply schema changes. `/health/live` checks process liveness; `/health/ready` checks database connectivity, the expected migrations, the published challenge manifest, and Clerk configuration.

The AI Debugging Lab is off by default. To use `/lab/ai-debugging`, set `SANDBOX_ENABLED=true`, `E2B_API_KEY`, `OPENAI_API_KEY`, and `SANDBOX_AGENT_MODEL` in the API environment. Keep provider keys out of `apps/web/.env.local`. See [SANDBOX_HANDOFF.md](SANDBOX_HANDOFF.md) for the lab's lifecycle, limits, API, and verification evidence.

## Implemented API

All data routes are under `/api/v1` and require `Authorization: Bearer <Clerk session token>`. Success and error responses include the v0.3 envelope and `meta.isMock: false`. The available routes are:

- `GET /courses`
- `GET /lessons/:slug/versions/:version`
- `GET /challenges/:slug/versions/:version`
- `POST /attempts`, `GET /attempts`, `GET /attempts/:id`
- `PUT /attempts/:id/draft`
- `POST /attempts/:id/submit`
- `GET /evaluations/:id`, `POST /evaluations/:id/retry`
- `GET /evidence/:id`
- `GET /evidence/:id/feedback`, `POST /evidence/:id/feedback`

The API derives user identity from the verified Clerk subject and returns 404 for another user's records. Create requests are idempotent by the caller's stable `clientRequestId`. Draft saves use `expectedRevision`; a stale revision returns 409 with the current revision. Submission freezes the saved artifact, queues the selected reviewed variant, and returns an evaluation ID. The worker records actual PostgreSQL observations and immutable evidence. AI feedback is explicit and cached; it reports `source: "llm"` with provider/model or `source: "rules"` when disabled or unavailable.

`@trajectoryos/contracts` is the v0.3 wire-contract source. The executable browser examples, Clerk token flow, error states, retry behavior and Excalidraw scene restrictions are in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). The API routes and lifecycle are governed by [architecture/05-api-contract.md](architecture/05-api-contract.md).

## AI configuration

AI is disabled by default (`AI_ENABLED=false`); feedback then uses a deterministic, clearly labelled rule explanation. To enable the owner-selected OpenAI provider, configure `AI_ENABLED=true`, `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. `gpt-6-luna` has a recorded live inference smoke in `apps/api/verification/ai-smoke.json`.

Mistral remains an optional explicit provider: set `AI_PROVIDER=mistral`, `AI_ENABLED=true`, `MISTRAL_API_KEY`, and `MISTRAL_MODEL`. Its adapter has transport-double coverage, but a live Mistral call has not been verified. Provider failure does not silently switch providers; the saved result is labelled `source: "rules"`. AI never changes the test verdict or evidence hash.

## Verification and demo smoke

From the repository root:

```powershell
npm run typecheck
npm run build
npm test
npm run smoke
npm run smoke:evaluation --workspace=@trajectoryos/api
npm run test:integration --workspace=@trajectoryos/api
```

`smoke:evaluation` runs the real atomic T1–T7 suite once against the configured PostgreSQL database, reports wall time and per-test durations, and cleans only its generated fixture run ID. The integration suite also requires the configured PostgreSQL database. It uses generated integration identities and run UUIDs, retains immutable app history/evidence, and deletes only its own generated fixture rows. Neither command substitutes an in-memory database or fabricated evaluation output. `npm run smoke` also checks that a production build contains the reviewed challenge sources needed for published content and suite hashing.

For a local or deployed demo, run migrations as an explicit release step, start the API with the required production environment, check `/health/live` and `/health/ready`, then follow the browser walkthrough in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). The browser Clerk sign-in, two real accounts, Railway/Vercel configuration, and actual Excalidraw refresh/restore still require a real browser and deployed origins; they have not been reported as verified here.

## Railway runtime packaging

Build from the repository root so npm can resolve the workspaces:

```powershell
npm ci
npm run build --workspace=@trajectoryos/contracts
npm run build --workspace=@trajectoryos/api
```

The API build copies the allowlisted reviewed challenge `.ts` sources to `apps/api/dist/challenge-source/` and the approved SQL files to `apps/api/dist/migrations/`. Compiled content, suite hashing, readiness and the compiled migration command read those packaged directories. Preserve `apps/api/dist/**` in the Railway runtime artifact. Set Railway's service root/build context to the repository root because this is a shared npm workspace; configure `DATABASE_URL`, both Clerk keys, exact frontend origins, `APP_COMMIT_SHA`, and `PORT`. After building and before starting the service, explicitly run `npm run migrate:built --workspace=@trajectoryos/api`; start with `npm run start --workspace=@trajectoryos/api`. Configure the Railway health path as `/health/ready`. See [Railway's shared monorepo guidance](https://docs.railway.com/deployments/monorepo). No deployment was run by this repository audit.
