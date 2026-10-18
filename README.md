# TrajectoryOs

A résumé can say *PostgreSQL* or *system design*. It can't show what someone did when a request timed out after the database had already committed.

**TrajectoryOs connects the lesson, the engineering decision, the test result, and the conversation that comes afterward.** It was built for HackShift 2026 at IIIT Delhi, under the Entrepreneurship & Employment theme.

**[Open the website](https://hackshift-iiit-delhi.vercel.app/)** · **[Two-minute demo shot list](docs/DEMO_VIDEO_SHOTLIST.md)**

The landing page is public. The signed-in workspace needs a running API, PostgreSQL, and Clerk; the frontend deployment alone does not make those services available.

## Start with a failure, not a checklist

Imagine a client sends a credit request. The API commits the credit, but the response is lost. The client retries.

Should the account be credited again?

That question connects networking, transactions, concurrency, and system design. In TrajectoryOs a learner reads the background, draws an HLD and LLD, investigates three reviewed implementations, explains a choice, and looks at what the PostgreSQL tests actually observed. The designs, reasoning, failures, and feedback stay attached to the attempt.

There is a second exercise, the **AI Debugging Lab**, about a faulty TypeScript rate limiter. Here the learner can inspect and edit an allowed source file, or direct a coding assistant with a five-prompt budget. Visible tests run in a sandbox; final grading uses a separate sandbox with private checks. This lab requires an E2B account and an OpenAI API model and is disabled by default.

Neither exercise produces a universal "engineering skill score." A passing test says something about the behavior tested, not everything about the engineer.

## What you can explore

| Area | What happens |
| --- | --- |
| [Learn](/) | Read the available retry-safe writes lesson and browse the wider engineering curriculum. Additional course drafts are in `content/courses/`. |
| [Practice](https://hackshift-iiit-delhi.vercel.app/practice) | Open the architecture/reliability exercise or the separate AI Debugging Lab. |
| [My Work](https://hackshift-iiit-delhi.vercel.app/evidence) | Resume saved attempts and inspect completed test observations, diagrams, and feedback. Requires sign-in and the API. |
| [Opportunities](https://hackshift-iiit-delhi.vercel.app/opportunities) | Explore a fictional job and candidate journey, or use the private JD-to-evidence review on your own completed records. |
| [Career and mentor demo](https://hackshift-iiit-delhi.vercel.app/demo/journey) | Walk through a candidate-approved application packet, employer review, manual shortlist, and illustrative mentor feedback. |

The **employer and mentor journey is fictional**. Northstar Engineering, its candidates, and its mentor are example profiles; the interactions are stored in browser-local demo state. No employer receives an application and no real mentor is contacted.

Separately, the private career tool accepts a pasted job description and selected **owned, completed evidence**, then prepares a requirement comparison and an editable, source-labelled résumé draft. The mentor preview can assemble a context packet from an owned attempt; it does not send a message to a human mentor.

## How it's built

```text
apps/
  web/              React, TypeScript, Vite, Excalidraw
  api/              Express API, PostgreSQL workers, AI and sandbox services
packages/
  contracts/        Shared Zod request/response schemas
content/courses/    Draft course material
research/           Problem framing, competitive research and pitch work
scripts/            Build/smoke and bounded provider checks
```

The frontend authenticates with Clerk and calls the Express API with a session token. The API enforces record ownership and persists application state in **one PostgreSQL database**, using the `app` schema and a separate `challenge_eval` fixture schema.

A few deliberate engineering choices:

- **Revision-controlled saves.** An outdated browser tab cannot silently overwrite a newer HLD/LLD draft; the API checks `expectedRevision`.
- **Idempotent requests.** Stable client request IDs make retries safer for creation and submission flows.
- **Evidence before explanation.** The credit evaluator runs reviewed implementations against PostgreSQL checks. Test observations and provenance are stored separately from AI-generated explanations and advisory design reviews.
- **Bounded code execution.** The AI Debugging Lab uses E2B sandboxes, server-validated editing/tool operations, durable jobs, and a separate final grader. It does not run submitted source in the API process.
- **A modular monolith.** Content, attempts, evaluation, evidence, career, reviews, and sandbox services are separate modules in one deployable API. We chose that over multiple services for the scope of this project.

The design reviewer extracts supported labels, shapes and connections from saved Excalidraw scenes. Its suggestions are advisory, not a formal verification of an architecture. When an AI provider is unavailable, feedback is explicitly labelled as limited/rules-based where supported.

## Run it locally

**Requirements:** Node.js 22.12+ and npm (the repository specifies npm 11.6.1), Git, a PostgreSQL database, and a Clerk development application.

```bash
git clone https://github.com/rachittaneja56-max/Hackshift-IIIT-Delhi.git
cd Hackshift-IIIT-Delhi
npm ci
```

Create `apps/api/.env` from `apps/api/.env.example`, and `apps/web/.env.local` from `apps/web/.env.example`. Keep the database URL, Clerk secret, OpenAI key, and E2B key **server-side**; only public `VITE_*` values belong in the web environment.

Minimum local configuration:

| API (`apps/api/.env`) | Web (`apps/web/.env.local`) |
| --- | --- |
| `DATABASE_URL` — a **development/test** PostgreSQL database | `VITE_API_BASE_URL=http://127.0.0.1:3000` |
| `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` | `VITE_CLERK_PUBLISHABLE_KEY` |
| `CORS_ORIGINS=http://127.0.0.1:5173` | |
| `CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5173` | |

Use matching Clerk keys and the exact same frontend origin; `localhost` and `127.0.0.1` are different origins.

Build the shared schemas and migrate **only the database you intend to use**:

```bash
npm run build --workspace=@trajectoryos/contracts
npm run migrate --workspace=@trajectoryos/api
```

Start the two services in separate terminals:

```bash
npm run dev --workspace=@trajectoryos/api
```

```bash
npm run dev --workspace=@trajectoryos/web
```

Open **http://127.0.0.1:5173**.

Check the API before debugging a blank workspace:

```text
GET http://127.0.0.1:3000/health/live
GET http://127.0.0.1:3000/health/ready
```

`/health/live` checks the process; `/health/ready` checks database access, required migrations/content, and Clerk configuration. A public landing page can render while private API features are unavailable.

### Optional AI and sandbox setup

The evidence-feedback provider is off by default (`AI_ENABLED=false`). To enable it, set `AI_ENABLED=true`, select `AI_PROVIDER=openai` or `mistral`, and supply the matching API key and model on the **API** service.

For AI Debugging Lab sessions, also set `SANDBOX_ENABLED=true`, `E2B_API_KEY`, `OPENAI_API_KEY`, and `SANDBOX_AGENT_MODEL`. Check account quota and run a bounded live smoke before enabling public execution. A ChatGPT subscription does not supply OpenAI API credits.

## Checks

```bash
npm run typecheck
npm run build
npm test
npm run smoke
```

Database-backed checks must run against an explicitly authorized **test database**; they create fixture records:

```bash
npm run smoke:evaluation --workspace=@trajectoryos/api
npm run test:integration --workspace=@trajectoryos/api
```

The repo also has optional live sandbox/model checks under `apps/api/test/`. Do not run those indiscriminately against paid services. Passing unit/build checks does not establish browser authentication, a live sandbox, or a deployed backend.

## Deployment

The [frontend](https://hackshift-iiit-delhi.vercel.app/) is hosted on Vercel. The API is designed for a persistent Node.js host such as Railway or Render, connected to Neon PostgreSQL and Clerk. A public frontend URL is **not** evidence that the API, workers, and optional AI services are deployed or ready.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the build, migration, environment, and verification checklist. The frontend must be rebuilt after changing its `VITE_API_BASE_URL`.

## Project boundaries

This is a working engineering assessment and prototype, not an accredited certification, production ATS, or live alumni/mentor marketplace. The credit lab evaluates **reviewed code**, not arbitrary code written by the learner. The sandbox lab evaluates bounded code execution and AI interaction; its availability depends on provider configuration. The employment and mentoring demonstration is deliberately synthetic.

That boundary matters to the project: the useful result isn't a single percentage. It's a record of **what someone chose, what actually ran, what failed, and what they can explain next**.
