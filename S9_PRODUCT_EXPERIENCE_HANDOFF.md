# S9/S10 Product Experience Handoff

- **Project:** TrajectoryOs — HackShift 2026
- **Status:** Product UX and S10 fictional employer/mentor journey implemented on local `main`; verified with repository tests and builds. Not publicly deployed.
- **Implementation SHA:** `4400aa21ae5c02c980ddbab622fcc046fca9788d`
**Scope:** Frontend only. No API routes, DTOs, database schema, migrations, dependencies or lockfiles changed.

## Before/after audit

The before column records the usability problems described in the supplied S9 screenshot notes. Browser screenshots could not be inspected or captured in this environment, so the after column describes source changes verified by tests and build output rather than visual certification.

| Area | Reported problem | Implemented change and acceptance evidence |
| --- | --- | --- |
| Learning home | Unclear product purpose, oversized prototype feel, repeated content and eight similar drafts | A compact journey headline and actions, one available lesson, two practice cards, a concept-to-lab bridge and subject catalog. Saved work presents one newest-created draft or latest submitted item, counts the current history page and links to full history. It does not claim completion or skill scores. |
| Lesson reader | Seed/version language and dense reading flow | Learner-facing lesson label, quieter editorial status and collapsed content provenance. Existing response-loss walkthrough, concept check, source references and lab handoff remain. Published lesson data and its hash are unchanged. |
| Engineering Lab | Duplicate stepper/tabs, large empty HLD/LLD areas, raw save revisions and dropdown decisions | One Design / Investigate / Review & submit / Results workflow; friendly saved-state wording with revision in details; saved scene previews or clearly illustrative empty diagrams; radio-card design choices. Submission and save semantics still use the original API state. |
| Code investigation | Difficult source navigation | File list, source search, line numbers and a line-note action stored in the existing notes field. Source remains read-only to the learner; only the constrained assistant edits its allowlisted file. Tool/model details are expandable. |
| My Work and evidence | Repeated challenge copy, prominent identifiers, raw statuses and test IDs | Clear draft, evaluating, results-ready and needs-attention states; one primary action per row; identifiers and revisions are in details. Evidence uses human labels, retains exact records/provenance in advanced disclosures, and links directly to saved design review. |
| Opportunities | Real JD review looked like a preview and had no completed-evidence explanation | `/opportunities` is a primary destination; the real review retains its owner-scoped career API flow and has an explicit empty state. A visibly separate fictional-demo card links to `/demo/journey`. `/career/preview` remains valid. |
| Mentor | Large local-preview warning with little contextual value | Existing mentor packet is presented as private and unsent. S10 adds a clearly fictional, selected-material example response; it is not represented as a real mentor message or a model call. |
| Employer/candidate demo | No connected employer-to-mentor demonstration | A local fictional workflow supports posting publication, candidate selection/consent/submission, selected-only employer evidence, a confirmed manual shortlist/reversal and a separate selected-material mentor example. All fixture data carries `meta.isMock: true`; no real API or candidate data is read. |

## Navigation, styling and route compatibility

Primary navigation is **Learn**, **Practice**, **My Work** and **Opportunities**. Existing `/`, `/learn`, `/lab`, `/lab/ai-debugging`, `/evidence`, `/career/preview`, attempt and evidence routes remain routed. `/demo/journey` is under the existing authenticated app wrapper, and the header marks Opportunities as active there. The S10 stylesheet is scoped to the demo and uses the application's theme variables; its link card is responsive and uses the S9 surface, border and typography tokens.

The Practice page links to both live frontend experiences and asks the existing sandbox availability endpoint whether AI Debugging is configured. It does not create a session or report a mock success. The code lab preserves the stable request IDs and documented sandbox routes.

## Evidence and design feedback

Completed PostgreSQL evidence retains actual expected/observed values, exact provenance and limitations. Learner summaries translate stored decision enums and test IDs; expandable technical views preserve exact values. Saved HLD/LLD findings show model-assisted output only when the API returns that source. Deterministic fallback is labelled as limited and label-based. Element/connection IDs are collapsed under exact-reference disclosures, and each findings section links back to its saved drawing.

The design-review API and provider code already existed. Unit tests cover owner-scoped caching, deterministic fallback, cited output validation and the Mistral adapter. **Live model output is unverified.** The current browser/session did not make a design-review request to an external provider. The UI reports the actual returned source (`Model assisted` or `Limited deterministic review`) when used.

## Sandbox, career and mentor state

- **AI Debugging Lab:** discoverable at `/practice` and `/lab/ai-debugging`. The frontend displays server availability and supports the existing session, prompt, visible-test and final-report flow. **Live E2B execution is unverified**; no session was started.
- **Real Opportunities review:** still uses the existing authenticated, owner-scoped career endpoints and real owned evidence records. It does not search or apply to jobs. Live provider-backed career analysis was not run.
- **Fictional employer/mentor demonstration:** served at `/demo/journey`. It uses only reviewed local fixtures, a versioned `localStorage` key and deterministic transitions. It is not connected to career APIs, PostgreSQL, real candidate evidence, hiring decisions or an LLM. Applications, consent and shortlist actions are visibly demo-only; seeded comparison applicants return after reset.
- **Existing mentor preview:** prepares a local packet from selected owned content and labels it private/not sent. It does not create a real mentor message.

The connected S10 workflow was exercised in a deterministic end-to-end test: publish the demo posting → select candidate materials → record consent and submit → render the employer's selected-only profile and requirement map → explicitly confirm a human demo shortlist → prepare/consent a separate mentor packet → render the labelled example response. This is transition/SSR verification, not a live-browser interaction test.

## Contextual AI assistant decision

No general contextual assistant was added. The current API contract has no approved `/assistant/ask` DTO/route, and the repository working agreement requires a versioned contract amendment before implementing new application features. Adding one only in the frontend would create an unsupported capability. A future amendment should define owner-scoped context selection, evidence references, provider readiness, prompt-injection boundaries, rate/cost limits and unavailable behavior before implementation.

## API, database and environment

No backend files, API contract schemas, endpoints, migrations or database writes changed. The demo route stays inside Clerk's existing signed-in shell, while its own fictional content makes no API calls. No environment files were opened or modified. No public deployment was performed.

For a live product walkthrough, configure the normal web API base and Clerk client/server settings. PostgreSQL integration requires an explicitly authorized disposable test database. Live AI design review/career feedback requires its server provider configuration. Live AI Debugging requires the server's E2B configuration and sandbox availability. The fictional S10 route itself needs no additional provider or database configuration after sign-in.

## Verification performed

| Command/check | Result |
| --- | --- |
| `npm ci` | Passed in an isolated disposable worktree at the pre-feature base. S9/S10 made no dependency or lockfile changes. |
| `npm run typecheck` | Passed for contracts, API and web. |
| `npm run build` | Passed. Vite reports existing bundles larger than 500 kB. |
| `npm test` | Passed: 32 API tests and 56 web tests, 88 total. |
| `npm run smoke` | Passed: API health/readiness, v0.6 schemas and packaged challenge/migration assets. It did not connect to PostgreSQL. |
| `git diff --check` | Passed for implementation changes. |
| `npm audit` in the clean install | Reports 14 existing dependency-tree advisories: 2 low, 6 moderate, 6 high. No forced upgrade was applied. |

The web suite emits a Vite WebSocket warning that port `24678` is already in use; it did not fail tests. Production build output also includes the large-chunk warning. No test is claimed as a live PostgreSQL, E2B, Clerk or model-provider integration test.

## Accessibility and browser QA

The implementation uses semantic navigation, headings, fieldsets/radio controls, labels, buttons, status regions, disclosures, current-route state and native confirmation dialogs. SSR tests check the main nav state, route entry, evidence copy and demo workflow output. No automated accessibility scanner or manual keyboard audit was run.

The available browser inventory was empty and the computer-use session stopped before a browser could be inspected. **No screenshots were captured.** Visual QA at 1440×900, 1280×720 and 390px; light/dark themes; focus order; native dialog focus; actual localStorage refresh behavior; API-dependent loading/error states; and manual interaction through the integrated route remain unverified.

## Security and remaining release gates

`npm audit` reports advisories in the existing Excalidraw/Mermaid transitive dependency graph (including `braces`, `katex`, `lodash-es` and `nanoid`). The audit recommends a forced Mermaid major change and Excalidraw downgrade for some fixes; those compatibility changes were not applied in this UX integration. Assess upgrades in a separate dependency change and rerun editor/diagram tests. No secret patterns matched in the staged S9/S10 frontend changes. The pre-existing untracked `tmp/` folder was left untouched and uncommitted.

Remaining checks: browser/accessibility QA, an authorized disposable PostgreSQL integration run, live E2B execution, live provider verification, and dependency remediation review. Do not interpret the fictional demo as real candidate evidence or its manual shortlist as a production hiring workflow.

## Main commits

| Commit | Change |
| --- | --- |
| `b3fa161672c29327cf47b79c12eef016aefacc4e` | S9 learning, practice, lab, evidence, code investigation, Career and Mentor UX. |
| `fd9f0770e2f324c853e86de7a01768e6c830867f` | Cherry-picked S10 fictional employer/mentor demo implementation. |
| `935140e65bc3d18f8f45947cb1b54ef609b86d94` | Cherry-picked S10 source handoff. |
| `4400aa21ae5c02c980ddbab622fcc046fca9788d` | `/demo/journey`, Opportunities entry, active navigation and connected workflow verification. |

The handoff documentation commit follows these product commits. The final pushed `origin/main` tip is reported in the delivery summary. No force push or public deployment is part of this work.

## Three-minute HackShift walkthrough

1. **0:00–0:25 — Learn and Practice.** Sign in, show the compact Learn landing and two practice cards. Open Practice and explain the architecture exercise and the server-reported sandbox readiness.
2. **0:25–0:55 — Design and investigate.** Start the Architecture & Reliability Lab. Show HLD/LLD cards, the single workflow rail, radio design choices, friendly save state and searchable code with a line note. Explain that choosing a reviewed implementation does not prove authorship.
3. **0:55–1:25 — Results and diagram feedback.** Open an available completed evidence record. Show observed PostgreSQL checks, the separate HLD/LLD review action and its source label. State whether the environment returned model-assisted findings or limited rules; do not claim a live provider if it was not configured.
4. **1:25–1:45 — Opportunities.** Show the real JD/evidence review and its empty state or available owned evidence. Point out the separate fictional walkthrough card.
5. **1:45–2:35 — Employer/candidate/mentor demo.** Open `/demo/journey` from Opportunities. As Employer, publish the fictional role. As Candidate, select HLD, synthetic observations and reasoning, preview the exact packet, consent and submit locally. As Employer, inspect only shared materials, open the T3 observation and requirement map, then confirm a manual demo shortlist. As Candidate/Mentor, choose the failed-concurrency excerpt and reasoning, preview and consent to the separate packet, then show Mira Sen's labelled seeded example.
6. **2:35–3:00 — Boundaries and next step.** Show the `/lab` handoff, explain that the demo has no real candidate/API data or external send, and reset it before handing over a shared browser. Identify live E2B/provider/database setup and browser QA as separate gates.
