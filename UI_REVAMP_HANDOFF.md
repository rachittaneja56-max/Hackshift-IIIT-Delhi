# TrajectoryOs UI Revamp Handoff

## Audit and scope

The initial source audit found a learning home that gave broad editorial messaging similar weight to the one published lesson, an instructional page dominated by long prose, and dense lab/history views that made the next action and actual attempt status hard to scan. The mentor preview exposed too much packet data as raw JSON. Career review had a real B5 API path, but its evidence prerequisite was not obvious: a review needs at least one owned completed evidence record, so draft attempts alone are not eligible.

The supplied attachment contained the task text but no screenshot files. The in-app browser surface was unavailable, so I could not inspect the requested viewport sizes, themes, interactions, Excalidraw behavior, or capture before/after screenshots. The audit is therefore provisional and based on source, SSR tests, API readiness, and local route delivery. All checked SPA paths returned HTTP 200; that confirms route delivery only, not authenticated rendering.

Priority order used: make the available lesson/lab obvious; teach the retry failure sequence visually; make saved lab work and evidence easier to resume/review; make mentor/career prerequisites and limitations clear.

## Screens changed

- **Learning home and lesson:** promote the published retry-safe-writes lesson and retry-safe-credit lab, resume actual saved attempts, distinguish available from planned subjects, and connect network retries to database transactions. The lesson now has concept sections, in-page navigation, a six-step response-loss sequence, expected/observed comparisons, concept checks, technical references, and a direct lab action. It explicitly separates TCP retransmission from application-level retries.
- **Lab landing and attempt workspace:** split the contract into expected behavior, important conditions, and failure cases; prioritize resuming a draft; clarify the workflow and decision fields; show HLD/LLD empty or saved states; and keep optional example diagrams outside the learner’s saved scene. Requirements open as an overlay drawer. Investigation now separates browsing source, recording an initial hypothesis, reviewing the curated AI suggestion, and selecting a repair. Existing SaveQueue, revision, recovery, conflict, and submit-freeze behavior remains in place.
- **History and evidence:** add status filters and distinct draft/completed/execution-error actions. Evidence puts the submitted artifact and selected implementation first, groups real test observations readably, and keeps provider feedback and provenance explicit.
- **Mentor preview:** keep the fictional mentor and non-sending preview model; add owned-attempt selection, a readable packet preview with JSON details available on demand, selected artifact controls, question input, and a clearly labelled seeded example. No real person is contacted.
- **Career preview:** organize the actual B5 flow into job description, eligible evidence, requirements review, and résumé draft steps. Preserve selected evidence across history pagination, explain why drafts/execution errors are ineligible, show polling/retry states and requirement coverage, and retain source labels. The editable résumé text is local to the tab; generating or editing it does not alter stored evidence or the server draft.
- **Copy and visual system:** replace generic slogans with action-focused technical language; add scoped responsive styling, visual hierarchy, readable status treatments, and clearer empty/error states without introducing a UI framework.

## Functional diagnosis

**Mentor:** `/mentors/preview` is registered in `apps/web/src/app/App.tsx`. The feature prepares a selected owned attempt packet and an optional seeded sample; it is not live mentor chat, booking, or contact. The frontend now makes this acceptance path visible. An authenticated attempt-linked packet could not be exercised without an available Clerk browser session, so account-specific selection or request failures remain unverified.

**Career:** the backend registers `POST /api/v1/career/reviews`, `GET /api/v1/career/reviews/:id`, and `POST /api/v1/career/reviews/:id/resume`; the frontend adapter uses those v0.4 routes. The create flow requires selected owned completed evidence. Multiple drafts in a history are not evidence of a broken career API. The running local API returned `200 {"status":"ready","dependencies":{"database":"ok"}}`; readiness verifies the database and migration checksums, including migration 004. Authenticated create/poll/resume and live provider outcomes were not exercised, so Clerk state, account eligibility, and configured provider success remain unverified. No mock success path was added.

**Assessment content:** reviewed challenge source comments disclose deliberate defects and can reveal the intended repair. They were left untouched as required. Recommend a separately versioned challenge update that removes answer-revealing comments while preserving the immutable v1 evaluator and evidence.

## Verification outcomes

- Local API `/health/live`: HTTP 200.
- Local API `/health/ready`: HTTP 200; database dependency reported `ok`.
- Frontend SPA delivery: HTTP 200 for `/learn`, `/learn/retry-safe-writes/1`, `/lab`, `/lab/attempts/:id`, both HLD/LLD routes, `/evidence`, `/evidence/attempts/:id`, `/mentors/preview`, and `/career/preview`. These checks do not prove signed-in UI or API interactions.
- `npm test`: passed. API: 10 tests; web: 28 tests, including rendering checks for the new learning, evidence, mentor, and career states.
- `npm run typecheck`: passed for contracts, API, and web.
- `npm run build`: passed. Vite emitted a chunk-size advisory for bundles above 500 kB.
- `npm run smoke`: passed API health/readiness fail-closed checks, v0.4 schemas, and packaged challenge/migration assets.
- `git diff --check -- apps/web`: passed.

## Accessibility and remaining QA

The revised UI uses semantic links/buttons, labelled fields, native keyboard behavior, status regions, meaningful heading structure, and the app’s existing focus-visible and reduced-motion styles. No click-only card navigation was added. Because a browser surface was unavailable, contrast at rendered sizes, keyboard walkthroughs, zoom/reflow, narrow-screen overflow, light/dark appearance, Excalidraw canvas usability at 1280×720, and HLD/LLD switching with unsaved edits still need browser QA. There are no before/after screenshots in this handoff because none could be captured.

The authenticated B1–B5 end-to-end workflow and live career provider are also unverified in a Clerk session. The build’s large-chunk advisory remains. No contract or backend behavior was changed.

## Files changed

- `apps/web/src/learning/pages.tsx`
- `apps/web/src/learning/content.tsx`
- `apps/web/src/attempts/workspace.tsx`
- `apps/web/src/evidence/pages.tsx`
- `apps/web/src/evidence/details.tsx`
- `apps/web/src/previews/pages.tsx`
- `apps/web/src/previews/selection.tsx` (new)
- `apps/web/src/previews/mentor.tsx` (new)
- `apps/web/src/previews/career.tsx` (new)
- `apps/web/src/styles.css`
- `apps/web/test/ui.test.mjs`
- `UI_REVAMP_HANDOFF.md` (this handoff)

## Commits

- `0a415562a955a2fa6099ee2f94f02b8912271963` — `feat(web): clarify learning path and lesson experience`
- `954679385a7dd845d68e82921ffdd64670806598` — `feat(web): clarify retry lab and drawing workflow`
- `8a441a93ba88ff8b255e79d32ba5193967602df5` — `feat(web): organize attempt history and evidence`
- `27a503f5c3dbe4ed5fb4774e86c5d1a58c037760` — `feat(web): guide mentor and career review previews`

## Sandbox integration for Parth

The sandbox route and implementation were not present in this checkout, so no route was guessed or registered here. Once Parth registers the agreed route in the shared router, connect the planned learning entry to that exact route in a follow-up integration patch. Keep sandbox work in Parth’s owned files and preserve the API/DTO boundary. Any seeded preview must display `meta.isMock: true` and a visible fixture label; a live network failure must not appear as success. Integrate the route only after it exists and is reviewed.
