# TrajectoryOs

TrajectoryOs is the HackShift 2026 workspace. This baseline sets up an npm workspaces monorepo and the shared v0.3 API contract. The API and web app are technical scaffolds; product routes and screens have not started.

## Requirements and commands

- Node.js 22.12 or newer
- npm 11.6.1 (the committed lockfile is generated with npm)

From the repository root:

```powershell
npm install
npm run typecheck
npm run build
npm run smoke
npm test
```

`npm run smoke` checks the health routes and representative contract behavior without requiring service credentials. `npm test` runs workspace test scripts when they exist; it currently reports that no test suites are configured. The API and web dev servers run independently:

```powershell
npm run dev --workspace=@trajectoryos/api
npm run dev --workspace=@trajectoryos/web
```

The API exposes `/health/live`. `/health/ready` returns 503 until `DATABASE_URL` can reach PostgreSQL; it does not claim the app schemas are migrated. Those checks belong to B1.

## Workspaces

- `apps/api` — Express, TypeScript, Clerk, `pg` and the Mistral SDK. B0 includes startup/config validation and infrastructure health only.
- `apps/web` — React, TypeScript, Vite, Clerk and embedded Excalidraw dependencies. It renders no product UI yet.
- `packages/contracts` — executable Zod request/response schemas and inferred DTO types for API contract v0.3.

The v0.3 contract adds nullable-in-draft `artifact.aiCritique` and `artifact.repairJustification` (each nonblank at submission), plus a reviewed `faultyAiSuggestion` challenge field with `source: "curated_fixture"`. The v0.2 routes, envelopes, lifecycle, evaluation model and database topology are carried forward. Parth should review the v0.3 contract schemas before F1 starts.

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. The example files contain variable names with empty values only.

The API will need `DATABASE_URL` for the single Neon PostgreSQL database, Clerk server keys/origins, and `MISTRAL_API_KEY` plus a verified `MISTRAL_MODEL` for live AI feedback. The web app needs `VITE_API_BASE_URL` and the Clerk publishable key. No credentials are included in this repository. B0 build and typecheck do not require these values.

## First implementation tasks

- **Backend (Rachit, B1):** complete Clerk bearer verification and PostgreSQL readiness, add the `app` schema migration for users/challenge versions/attempts, then implement authenticated create/read/list/save-draft flows with idempotent creation and revision conflicts. Confirm HLD/LLD save and reload against real PostgreSQL before evaluation or AI work.
- **Frontend (Parth, F1):** review the v0.3 contract first, then build the desktop learning/workspace shell and Excalidraw HLD/LLD scenes against typed DTO fixtures. Prove scene save/reload behavior and connect to B1's draft endpoints at the first vertical slice.

Both developers work directly from `main`; keep ownership within `apps/api` and `apps/web`. Shared schemas, root configuration and the lockfile have one writer, Rachit.
