# Deploying TrajectoryOs from scratch

This guide covers this repository's React/Vite frontend, Express API, PostgreSQL evaluator, Clerk authentication, and optional AI Debugging Lab. Commands run from the repository root unless stated otherwise. Dashboard labels may change; the configuration values below are the important part.

Prepared on 18 October 2026 by inspecting the source and checking the providers' documentation. No cloud resources were created and no deployment or database migration was performed while writing it.

## 1. Understand what you are deploying

| Component | Location | Deploy to | Purpose |
| --- | --- | --- | --- |
| React/Vite frontend | `apps/web` | Vercel | Website, sign-in UI, diagrams, learning workspace |
| Express API and workers | `apps/api` | Railway | Authentication checks, persistence, evaluations, AI requests |
| Shared contracts | `packages/contracts` | Built with both apps | Shared runtime schemas and types |
| PostgreSQL | External database | Neon | Both `app` and `challenge_eval` schemas |
| Authentication | External service | Clerk | Accounts and session tokens |
| AI feedback/reviews | Optional external service | OpenAI or Mistral | Feedback, design reviews, career analysis |
| Debugging sandboxes | Optional external service | E2B, with OpenAI | Isolated debugging sessions and assistant |

The browser calls the Railway API using a Clerk bearer token. The API connects to Neon and calls AI services when enabled.

The evaluation and sandbox workers start inside the API process. Start with one persistent Railway API replica and disable Railway service sleeping/serverless mode: background jobs need the process to remain running. There is no separate Redis, worker service, Docker setup, or persistent filesystem volume required for this deployment path. Preserve the built API assets in the deployed image.

Both deployments use the **repository root**, because the apps share an npm workspace. Railway's [shared monorepo documentation](https://docs.railway.com/deployments/monorepo) explains this layout.

## 2. Create accounts and choose your URLs

You need accounts with repository access on GitHub, Vercel, Railway, Neon, and Clerk. OpenAI/Mistral and E2B are optional initially. Check each provider's current plan and usage limits in its dashboard; API hosting, AI tokens, sandbox compute, and a domain can incur charges.

Choose one path:

- **Initial demo:** a Vercel URL such as `https://trajectoryos-demo.vercel.app`, a generated Railway API URL, and Clerk **development** keys. Your deployed API still uses `NODE_ENV=production`; this is independent of which Clerk instance it uses.
- **Production:** a domain you own, such as `https://app.example.com`, plus Clerk **production** keys and verified DNS. The API can keep its Railway URL or use `https://api.example.com`.

Clerk requires an owned domain for a production instance; a `*.vercel.app` URL can be used with development keys for a demo. See [Clerk environments](https://clerk.com/docs/guides/development/managing-environments) and [Clerk on Vercel](https://clerk.com/docs/guides/development/deployment/vercel).

Throughout this guide, replace example URLs with your actual ones. An origin is the scheme plus hostname and optional port, with no path: `https://app.example.com`. Use one canonical frontend origin initially.

## 3. Prepare your computer and repository

Install Git and Node.js. This repository requires Node **22.12.0 or newer**, and declares npm **11.6.1**. Node 24 is a suitable supported build target. Use your Node version manager or the installer from [Node.js](https://nodejs.org/en/download).

If you already have the repository open, keep using it. For a new checkout:

```bash
git clone https://github.com/rachittaneja56-max/Hackshift-IIIT-Delhi.git
cd Hackshift-IIIT-Delhi
```

Verify the tools and install dependencies:

```bash
node --version
npm --version
# If needed, after installing Node through a user-owned version manager:
npm install --global npm@11.6.1
npm ci
```

Use the existing lockfile; do not regenerate dependencies just to deploy. Confirm the intended branch and commit:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Cloud imports deploy committed code from GitHub. If your intended changes only exist locally, review and commit those specific files, then push your chosen branch before importing it. Use a fork if you do not have write access. The commands in this guide do not require publishing `.env` files.

## 4. Create PostgreSQL in Neon

1. Create a Neon project, choose a region close to your intended Railway region, and create/select a database and role.
2. Create a separate development/test branch or database for local integration checks. Keep the production database separate from test fixtures.
3. Use **Connect** to choose the correct branch, database, and role. Start with a **direct/unpooled** PostgreSQL connection for this small deployment; the API already maintains a pool of at most six connections per replica.
4. Copy the connection string privately. It looks like:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-ENDPOINT.neon.tech/neondb?sslmode=verify-full
```

Use the actual string from Neon, preserving its real hostname and parameters. The role needs permission to create schemas, tables, functions, and triggers for migrations, then read/write the app and evaluator tables. The code uses one `DATABASE_URL` for migrations and runtime.

The API enforces TLS hostname and certificate verification. It normalizes an omitted `sslmode`, `prefer`, `require`, or `verify-ca` to `verify-full`, and rejects modes such as `disable` and `no-verify`. Do not disable certificate checks to get a deployment working. Neon is a straightforward match for this requirement; a plain PostgreSQL container without verified TLS is not interchangeable without additional setup.

See [Neon's connection instructions](https://neon.com/docs/connect/connect-from-any-app). You do not need to create application tables manually; this repository's migrations create them.

## 5. Configure Clerk

For your first demo:

1. Create a Clerk application and keep its development instance selected.
2. Enable the sign-in methods you want, such as email verification. Start with email if you want to avoid configuring a social OAuth application yet.
3. Copy the matching `pk_test_...` publishable key and `sk_test_...` secret key.
4. Use the same publishable key in the API and frontend, and the matching secret key only in the API.

The existing frontend renders Clerk's embedded sign-in UI. The API creates its own `app.users` row on the first authenticated request, so this implementation does not require a Clerk webhook to provision users.

For production, first choose your owned frontend domain, create a Clerk production instance, configure the application domain/paths, add the DNS records shown by Clerk, and finish certificate activation. Configure your own OAuth credentials if using Google/GitHub or another social provider. Replace the development keys with matching `pk_live_...` and `sk_live_...` keys and redeploy both applications. Clerk development users and production users are separate; sign up in the production instance.

Follow [Clerk's production deployment guide](https://clerk.com/docs/guides/development/deployment/production). Do not invent DNS targets or OAuth callback URLs; copy the values provided for your instance.

## 6. Verify locally against the test database

Create local environment files only if they do not already exist:

```bash
cp -n apps/api/.env.example apps/api/.env
cp -n apps/web/.env.example apps/web/.env.local
```

On Windows, create copies in your editor or use PowerShell `Copy-Item` after checking that the destination does not already exist.

Set these API values in `apps/api/.env`, using the **test** database and matching Clerk development keys:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=YOUR_TEST_DATABASE_CONNECTION_STRING
CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
CLERK_SECRET_KEY=sk_test_REPLACE
CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5173
CORS_ORIGINS=http://127.0.0.1:5173
AI_ENABLED=false
AI_PROVIDER=openai
SANDBOX_ENABLED=false
```

Set these frontend values in `apps/web/.env.local`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
```

Build contracts before migrations, then start the API:

```bash
npm run build --workspace=@trajectoryos/contracts
npm run migrate --workspace=@trajectoryos/api
npm run dev --workspace=@trajectoryos/api
```

In a second terminal at the repository root:

```bash
npm run dev --workspace=@trajectoryos/web
```

Open `http://127.0.0.1:5173`. Keep that exact hostname everywhere: `localhost` and `127.0.0.1` are different origins. Restart the dev servers after editing environment files.

Run release checks from another terminal:

```bash
npm run typecheck
npm run build
npm test
npm run smoke
# These two write generated fixtures/history to the configured database.
# Confirm apps/api/.env points to the test database first.
npm run smoke:evaluation --workspace=@trajectoryos/api
npm run test:integration --workspace=@trajectoryos/api
```

**Known check failure at the time this guide was written:** `npm run smoke` successfully builds contracts and the API, then fails at `scripts/smoke.mjs` because its expected migration list stops at `007_design_reviews.sql`. The runtime packager correctly includes `008_sandbox_candidate_edits.sql` too. Update the smoke assertion's expected list to include `008_sandbox_candidate_edits.sql`, review that change, and rerun the checks. Do not delete migration 008 or omit it from the deployment to satisfy the old assertion. This guide does not change the test source.

There are currently eight numbered migrations. Older handoffs that mention six or seven do not describe the complete current migration set. Tests and browser checks beyond the smoke failure above were not executed while preparing this guide.

## 7. Deploy the API to Railway

Create a Railway project and connect your GitHub repository. Select the release branch. If monorepo import stages multiple services, keep/configure the API service; Vercel will host the frontend. Configure the service before triggering the final deployment. An automatic first attempt may fail until you have added variables.

Use these settings:

| Railway setting | Value |
| --- | --- |
| Builder | Railpack / Node.js |
| Root directory | Repository root, `/` or blank; not `apps/api` |
| Build command | `npm run build --workspace=@trajectoryos/contracts && npm run build --workspace=@trajectoryos/api` |
| Pre-deploy command | `npm run migrate:built --workspace=@trajectoryos/api` |
| Start command | `npm run start --workspace=@trajectoryos/api` |
| Healthcheck path | `/health/ready` |
| Healthcheck timeout | Start with 300 seconds |
| Replicas | 1 initially |
| Service sleeping/serverless | Disabled for background workers |

Railpack installs dependencies before the build. Set these build-related service variables:

```dotenv
RAILPACK_NODE_VERSION=24
RAILPACK_NODE_NPM_INSTALL=npm ci --include=dev
RAILPACK_NO_SPA=true
```

The explicit install command ensures TypeScript remains available during the build even with `NODE_ENV=production`. `RAILPACK_NO_SPA` keeps this service running as the API rather than serving a detected frontend. See [Railpack's Node settings](https://railpack.com/languages/node/).

Add the following application variables in Railway. This example uses the **demo** frontend origin; substitute your owned origin and live Clerk keys for production authentication:

```dotenv
NODE_ENV=production
DATABASE_URL=YOUR_PRODUCTION_DATABASE_CONNECTION_STRING
CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
CLERK_SECRET_KEY=sk_test_REPLACE
CLERK_AUTHORIZED_PARTIES=https://trajectoryos-demo.vercel.app
CORS_ORIGINS=https://trajectoryos-demo.vercel.app
APP_COMMIT_SHA=THE_FULL_SHA_OF_THE_DEPLOYED_COMMIT
AI_ENABLED=false
AI_PROVIDER=openai
SANDBOX_ENABLED=false
SANDBOX_MAX_ACTIVE=4
SANDBOX_SESSION_TTL_SECONDS=1200
```

Determine the intended Vercel project hostname when importing that project if you do not know it yet. You can update the two origin variables after Vercel assigns the actual URL, then redeploy Railway. You do not need the frontend to be online for the API readiness check to pass.

For GitHub-triggered deploys, Railway exposes `RAILWAY_GIT_COMMIT_SHA`. You can use its variable-reference picker to set `APP_COMMIT_SHA` from that value instead of updating a literal SHA each release. Verify the resolved value; a literal `$RAILWAY_GIT_COMMIT_SHA` string is not shell-expanded by the application. For other deployment sources, set the full release SHA explicitly. See [Railway variables](https://docs.railway.com/variables/reference).

Leave `CLERK_JWT_KEY` unset unless you specifically use Clerk's optional public JWT verification key. You do not need Mistral, OpenAI, or E2B keys while their features are disabled. Never paste the example placeholders literally as credentials.

Let Railway supply `PORT`; the existing API listens on `0.0.0.0` at that port. In **Networking / Public Networking**, generate a public domain and use the API's listening port if asked for a target port. Railway provides the HTTPS URL. Save it, for example `https://YOUR-API.up.railway.app`.

**Migrations belong in pre-deploy.** They use the built image's SQL/assets, apply schema changes to Neon, verify existing checksums, and publish the challenge manifest. Application startup does not migrate the database. Railway's [pre-deploy step](https://docs.railway.com/deployments/pre-deploy-command) runs after the image build and before application startup. A nonzero exit blocks that deployment.

Preserve `packages/contracts/dist/**`, `apps/api/dist/**`, production dependencies, and workspace package metadata in the runtime image. The API build already packages reviewed challenge sources, all SQL migrations, and sandbox challenge files; running only `tsc` does not perform that packaging. Use the repository's build script.

After deployment, verify from your terminal:

```bash
curl -i https://YOUR-API.up.railway.app/health/live
curl -i https://YOUR-API.up.railway.app/health/ready
```

Expect HTTP 200 with `{"status":"ok"}` and `{"status":"ready","dependencies":{"database":"ok"}}`, respectively. Readiness checks database access, migrations/content, and presence of Clerk keys; it does not prove actual Clerk sign-in or optional provider availability. Railway's [healthcheck](https://docs.railway.com/deployments/healthchecks) gates deployment startup; add separate monitoring for ongoing availability.

## 8. Deploy the frontend to Vercel

Create/import a Vercel project from the same GitHub repository and release branch. Configure:

| Vercel setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | Repository root, `.` or blank; not `apps/web` |
| Install command | `npm ci` |
| Build command | `npm run build --workspace=@trajectoryos/contracts && npm run build --workspace=@trajectoryos/web` |
| Output directory | `apps/web/dist` |
| Node.js | A supported version meeting `>=22.12.0`; 24.x is suitable |

The existing root `vercel.json` already sets the install/build/output values and SPA rewrites. Check the dashboard agrees. The Node engine range can influence Vercel's selected major; inspect the actual build log if you need exact version consistency. See [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Add only these application environment variables for the Vercel Production environment:

```dotenv
VITE_API_BASE_URL=https://YOUR-API.up.railway.app
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
```

Use the Clerk publishable key matching Railway's instance. The API base URL is the API origin, not the frontend URL or a health endpoint. The client adds `/api/v1` itself.

Deploy, copy the actual public frontend URL, update Railway's `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` to that exact origin, and redeploy Railway if they changed.

Vite embeds `VITE_` variables into browser assets at build time. Changing them requires a **new frontend build/deployment**. Never put `DATABASE_URL`, `CLERK_SECRET_KEY`, or AI/E2B secret keys into Vercel's frontend variables. See [Vite environment variables](https://vite.dev/guide/env-and-mode).

The frontend prebuild copies Excalidraw fonts into public assets. Keep the existing rewrite exclusions for `/assets/` and `/excalidraw-assets/`; the SPA route fallback allows direct visits and refreshes on `/learn`, `/evidence`, and nested workspace URLs.

For Vercel Preview deployments, configure Preview variables separately, with Clerk development keys and a staging API/database. Preview origins must also be explicitly allowed by that API. The API compares literal origins; `*.vercel.app` is not a wildcard supported by this configuration. A stable staging hostname is simpler than allowlisting every generated preview URL.

## 9. Verify the deployed application

Run these checks after both services are online:

```bash
# Browser preflight: replace both URLs with the actual deployed origins.
curl -i -X OPTIONS https://YOUR-API.up.railway.app/api/v1/courses \
  -H 'Origin: https://trajectoryos-demo.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'

# An unauthenticated data request should be rejected.
curl -i https://YOUR-API.up.railway.app/api/v1/courses
```

The preflight should return 204 with `Access-Control-Allow-Origin` matching your frontend. The unauthenticated data request should return 401. Data routes are protected; `/health/live` and `/health/ready` are public.

In the deployed website:

1. Sign up/sign in and open the course list. Confirm authenticated API requests succeed in browser DevTools.
2. Open a lesson, create an attempt, save a draft, and refresh.
3. Open HLD and LLD diagrams, draw something, save, reopen, and refresh. Check font files load successfully.
4. Complete the required artifact fields and submit a reviewed variant. Confirm it leaves the queue and produces PostgreSQL-backed evidence.
5. Open `/evidence` and confirm your attempt history survives sign-out/sign-in.
6. Use a second real account and check it cannot access the first account's attempt/evidence URLs.
7. Open and refresh nested routes directly, including an attempt workspace.
8. If AI is enabled, explicitly request feedback/reviews and verify the returned source/provider information. If the sandbox is enabled, complete the sandbox workflow described below.

Treat these as release checks, not as outcomes already verified by this document. See `FRONTEND_INTEGRATION.md` and `SANDBOX_HANDOFF.md` for deeper walkthroughs.

## 10. Enable optional AI features

The core website, database evaluations, and deterministic feedback can run with `AI_ENABLED=false` and `SANDBOX_ENABLED=false`.

For OpenAI feedback, design reviews, and career analysis, add in Railway:

```dotenv
AI_ENABLED=true
AI_PROVIDER=openai
OPENAI_API_KEY=YOUR_SERVER_KEY
OPENAI_MODEL=YOUR_ACCESSIBLE_MODEL_ID
```

Choose an actual model available to your API project that supports the structured response behavior used by the adapters. Do not copy a guessed model name from an old handoff. Configure provider billing/usage limits and redeploy Railway. Exercise each feature you intend to demonstrate; a healthy API does not verify the model. Feedback can fall back to a labelled rules response if the provider fails; that is not proof that live AI is working.

For Mistral feedback/reviews instead, use `AI_PROVIDER=mistral`, `MISTRAL_API_KEY`, and `MISTRAL_MODEL`, keeping `AI_ENABLED=true`. Test that adapter with the actual selected model. The debugging assistant below still requires OpenAI.

For the AI Debugging Lab, configure these Railway variables after migrations, database integration, authentication, and browser checks pass:

```dotenv
SANDBOX_ENABLED=true
E2B_API_KEY=YOUR_E2B_KEY
OPENAI_API_KEY=YOUR_OPENAI_KEY
SANDBOX_AGENT_MODEL=YOUR_ACCESSIBLE_TOOL_CAPABLE_MODEL_ID
SANDBOX_MAX_ACTIVE=4
SANDBOX_SESSION_TTL_SECONDS=1200
```

The sandbox assistant uses OpenAI's Responses API with tools. `SANDBOX_AGENT_MODEL` is separate from `OPENAI_MODEL`. The sandbox can be enabled independently of `AI_ENABLED`, but needs its own required key/model settings. `SANDBOX_MAX_ACTIVE` accepts 1–20; session TTL accepts 120–3600 seconds. These settings limit capacity/session duration, not total provider spending.

Open `/lab/ai-debugging`, create a session, edit/save source, run visible tests, request an assistant turn, submit, and check the report and cleanup. Budget for E2B compute and OpenAI tokens. If any required flow fails, set `SANDBOX_ENABLED=false` while diagnosing it. There are no extra frontend secrets or feature variables to add.

## 11. Add a production domain

For example, choose `app.yourdomain.com` for the frontend and optionally `api.yourdomain.com` for the API:

1. Add the frontend domain in Vercel's project domain settings.
2. At your registrar/DNS host, add exactly the records Vercel displays. Wait for verification and HTTPS.
3. If desired, add the API domain in Railway and configure its displayed DNS record. You may keep the generated Railway API hostname instead.
4. Configure Clerk's production instance for the frontend domain, add its DNS records, complete certificates, and set production OAuth credentials where applicable.
5. Replace both API Clerk keys and the frontend publishable key with matching production-instance keys.
6. Set Railway's `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` to `https://app.yourdomain.com`.
7. Set Vercel's `VITE_API_BASE_URL` to the API URL you will actually use.
8. Redeploy both applications, sign up in the production Clerk instance, and repeat the browser checks.

Redirect alternate frontend hostnames to your canonical hostname, or explicitly configure each origin you intend to support. Do not add the API URL to authorized frontend origins as a substitute for the site's URL. See [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain) and [Clerk production setup](https://clerk.com/docs/guides/development/deployment/production).

## 12. Operate and update the deployment

- Keep separate staging/test and production databases and Clerk instances. Integration tests write generated history and fixtures; do not aim routine test runs at your live user database.
- Confirm Neon's configured backup/restore retention before relying on it. Before a schema-changing release, create a recovery point or backup and record the deployed commit. Practice restoring into a separate database before an incident.
- Configure ongoing checks for `/health/live` and `/health/ready`, inspect Railway runtime/deploy logs, and review Vercel build logs when frontend assets fail. Avoid logging credentials or tokens.
- Start with one API replica. If you scale, budget at least six possible database connections per replica plus migration/admin connections, and validate worker behavior and provider quotas under concurrent load.
- For a release, run checks against staging, review and push the chosen commit, deploy the API with its pre-deploy migrations, check readiness, then deploy/promote the matching frontend. Provider Git auto-deploys can run independently; coordinate API/contract changes rather than assuming an ordering.
- For an application rollback, redeploy the previous compatible API/frontend release and verify readiness and browser behavior. **Redeploying old code does not undo database migrations.** This repo has checksum-verified forward migrations, no automated down-migration workflow. Check schema/content compatibility; restore into a separate database only through a deliberate recovery plan.
- Keep provider budget alerts/limits enabled. Rotate a secret in the provider and update Railway if it is exposed. Only the Clerk publishable key belongs in the browser.

## 13. Troubleshooting

| Symptom | Check / action |
| --- | --- |
| `Invalid API configuration fields: ...` | Read the named variables in Railway. Production requires database URL, both Clerk keys, both origin settings, and `APP_COMMIT_SHA`; enabled AI requires its provider key and model. The migration CLI validates this configuration too. |
| Contracts `ERR_MODULE_NOT_FOUND` | Deploy from the repo root; build `@trajectoryos/contracts` before the API, frontend, or migration command. Preserve its `dist` directory. |
| `tsc` missing during Railway build | Use `RAILPACK_NODE_NPM_INSTALL=npm ci --include=dev`; do not omit development dependencies until after compilation. |
| Workspace not found / lockfile missing | Fix the service/project root to the repository root. |
| Railway serves static HTML or has no API listener | Confirm the API start command and `RAILPACK_NO_SPA=true`. |
| API fails to respond | Inspect startup logs, ensure the process remains running, and match Railway's target port to the injected `PORT`. The app already binds to `0.0.0.0`. |
| `/health/live` works but `/health/ready` returns 503 | Inspect pre-deploy migration logs, DB credentials/TLS, Clerk configuration, packaged migrations, and the published manifest. |
| Migration checksum or published challenge mismatch | Confirm the release/database pairing. Restore the expected migration/content files or make a reviewed forward/versioned change. Do not edit migration records, delete history, or overwrite published content to bypass verification. |
| Smoke check reports extra migration 008 | Update the stale expected list in `scripts/smoke.mjs`; keep all eight migration files. See step 6. |
| `ORIGIN_NOT_ALLOWED` / browser CORS error | Use the exact visible frontend origin in `CORS_ORIGINS`; no path, wildcard, or accidental different hostname. Redeploy API. |
| Sign-in works but API returns 401 | Match frontend/API Clerk instance keys, `CLERK_AUTHORIZED_PARTIES`, and the bearer session token. Do not use the Clerk secret key as a browser bearer token. |
| Clerk production fails on `vercel.app` | Use development keys for the demo, or configure an owned domain and production Clerk DNS/certificates. |
| Website displays setup instructions | Correct Vercel's two `VITE_` variables and rebuild. |
| Browser still calls `127.0.0.1` after deployment | Correct `VITE_API_BASE_URL` in the correct Vercel environment and rebuild. |
| Refresh on a nested URL returns 404 | Confirm root `vercel.json` is used and retains the SPA rewrite. |
| Excalidraw fonts/assets fail | Check that web prebuild ran and `/excalidraw-assets/` returns actual assets rather than SPA HTML. |
| Evaluation remains queued | Inspect Railway worker/database logs and confirm API sleeping is disabled. Workers run in the API process. |
| Lab returns `SANDBOX_UNAVAILABLE` | Confirm sandbox flag, E2B key, OpenAI key, agent model, migrations, provider billing/quota, and outbound connectivity. |
| AI returns rules rather than live provider output | Confirm enabled flag, selected provider credentials/model, account access, and feature-specific runtime errors. |

The deployment is ready to share after the API readiness check, real authentication, saved drafts/diagrams, completed evaluations, account isolation, direct-route refreshes, and every enabled optional feature have passed on the actual deployed origins.
