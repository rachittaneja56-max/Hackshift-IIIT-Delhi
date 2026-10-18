# S10 — Employer, candidate and mentor demo

Implemented on `feat/employer-mentor-demo` in the independent worktree `C:\Users\tanej\Desktop\TrajectoryOs-s10`, based on `5f4a662`. The original checkout's uncommitted S9 work was left untouched. All implementation changes are confined to `apps/web/src/demo/**` and `apps/web/test/demo-workflow.test.mjs`; this document is the only root addition. No dependency manifests, lockfiles, API contracts, backend files, migrations, global styles, production routes or navigation were changed.

Implementation commit on the source branch: `b1553e02a61a02b758eabf9982896b0e5740b8c6` — `feat(web): add fictional employer and mentor demo journey`.

Integration is complete on main. The source feature and handoff were cherry-picked as `fd9f0770e2f324c853e86de7a01768e6c830867f` and `935140e65bc3d18f8f45947cb1b54ef609b86d94`. The application route, Opportunities entry and connected workflow test were added in `4400aa21ae5c02c980ddbab622fcc046fca9788d`. See [S9_PRODUCT_EXPERIENCE_HANDOFF.md](S9_PRODUCT_EXPERIENCE_HANDOFF.md) for combined verification and remaining gates.

Feature branch: [feat/employer-mentor-demo](https://github.com/rachittaneja56-max/Hackshift-IIIT-Delhi/tree/feat/employer-mentor-demo). The documentation commit follows the implementation commit; `git log -2 --oneline feat/employer-mentor-demo` identifies both source commits. At the time this handoff was first written, the feature had not been integrated or publicly deployed. No public deployment has been made.

## Product journey and files

The demo connects the existing engineering-learning concepts to one later-stage scenario: publish a fictional opportunity → explicitly select a fictional candidate's materials → preview and consent → submit locally → inspect only that package as an employer → manually shortlist/reverse → prepare a separate mentor packet → read a clearly labelled seeded response → navigate to the real Engineering Lab.

- `apps/web/src/demo/EmployerMentorDemo.tsx`: exported `EmployerMentorDemo`, candidate/application view, employer inbox and evidence profile, manual decision dialog/history, mentor packet and example review, reset dialog.
- `apps/web/src/demo/fixtures.ts`: exact canonical fixture text, expected/observed synthetic checks, job, separate requirement references and fictional mentor.
- `apps/web/src/demo/model.ts`: typed transitions, Zod persistence validation, selected-material projections, deterministic requirement mapping and seeded mentor response.
- `apps/web/src/demo/demo.css`: styles scoped to `.demo-journey` and `.dj-dialog`, using the existing theme variables with standalone fallbacks; responsive layouts at 1000px and 760px.
- `apps/web/src/demo/harness.html` and `harness.tsx`: development-only entry point, independent of the app shell, Clerk and backend.
- `apps/web/test/demo-workflow.test.mjs`: 12 deterministic workflow and React SSR tests, picked up by the existing web test script.

No S9-specific handoff was present at inspection time. Styling follows the current theme and `UI_REVAMP_HANDOFF.md`: compact workspaces, readable packets, warm neutral surfaces, restrained accent and explicit limitations.

## Exact fictional scenario

Every candidate has `fictional: true`, `meta.isMock: true`, and `meta.provenance: "fictional-demo"`. Materials visibly label their source as synthetic observation, representative design summary, fictional candidate writing or self-report. These are never fetched from the current database.

Organization: **Northstar Engineering — Demo Company**. Job ID: `northstar-backend-demo`. Role: **Junior Backend Engineer**. Arrangement: **Fictional hybrid arrangement · New Delhi**. Topics: HTTP retries, idempotency, PostgreSQL, HLD/LLD. The posting describes internal services work, request failure/replay investigation, transaction review and documented trade-offs. It contains no raw test IDs. Five requirements cover retries, rollback, concurrency, system boundaries and communicating engineering decisions.

| Candidate | Exact material IDs | Synthetic record / limitation |
| --- | --- | --- |
| Ananya Mehta (`ananya`) | `a-hld`, `a-lld`, `a-tests`, `a-reasoning`, `a-critique`, `a-profile`, `a-failure` | Six of seven checks pass; T3 fails. HLD/LLD are representative saved-design summaries. Explanation investigates duplicate credit and key reservation. Critique challenges reliance on a unique key without one transaction. Self-report states no verified production-scale experience. `a-failure` is an excerpt of the same T3 observation, not another run. No initial application or sharing consent. |
| Kabir Sharma (`kabir`) | `b-hld`, `b-tests`, `b-profile` | Seven of seven reviewed-implementation checks pass synthetically. A representative HLD summary is available; no separate LLD or detailed reasoning. Authorship and production competence remain unassessed. |
| Meera Kapoor (`meera`) | `c-lld`, `c-question`, `c-profile` | Partial transaction-boundary notes and meaningful reservation/replay/rollback questions. No recorded test result of any kind; no invented counters or pass/fail outcome. |

Kabir and Meera begin with **pre-seeded fictional application packets**, including all their listed materials. Their fixture consent is explicitly labelled as seeded, not consent from real people. Both package timestamps are `2026-10-18T04:00:00.000Z`. The job starts in draft; these packets are an intentional comparative inbox fixture, not applications generated by publishing the draft. Ananya's application must go through the real local transition controls.

### Synthetic check vocabulary and observations

The canonical strings are in `fixtures.ts`; all numerical outcomes below are fixture values, not PostgreSQL execution evidence.

| Check | Expected fixture behavior | Ananya | Kabir |
| --- | --- | --- | --- |
| T1: one valid credit | One operation/ledger entry, balance 1000 → 1100, response balance 1100 | Matches; synthetic passed | Matches; synthetic passed |
| T2: sequential replay after module restart | Original status/body, one operation and credit | Matches; synthetic passed | Matches; synthetic passed |
| T3: concurrent duplicate requests | Two independent clients complete, one credit, balance 1100 | Synthetic failed: both return 200, two ledger entries, balance 1200 | Matches; synthetic passed |
| T4: changed-payload conflict | Changed amount returns 409; original response and balance 1100 unchanged | Matches; synthetic passed | Matches; synthetic passed |
| T5: rollback then retry | Failure leaves balance 1000, no operation/ledger; retry commits once to 1100 | Matches; synthetic passed | Matches; synthetic passed |
| T6: same key across accounts | Two accounts independently credit 100 each | Matches; synthetic passed | Matches; synthetic passed |
| T7: distinct keys on one account | Credits 100 and 200, balance 1000 → 1300, two ledger entries | Matches; synthetic passed | Matches; synthetic passed |

The fictional mentor is **Mira Sen**, focus **Backend reliability**, matching the existing seeded persona concept. Default question: “My transaction design still seems vulnerable when two requests use the same idempotency key. What should I investigate?”

## State and persistence

One shared `DemoState` drives all three perspectives. Each transition clones state and validates the result. Clock values are explicit action inputs, so transitions are deterministic for given state/action values.

| Object | Transitions | Guard |
| --- | --- | --- |
| Job | `draft → published_demo` | Explicit local publish action |
| Ananya application | `not_started → prepared → submitted_demo` | Published job, nonempty allowlisted selections, separate consent, valid timestamp |
| Mentor | `not_requested → packet_prepared → example_review_available` | Nonempty selected context, nonblank question, separate consent, valid timestamp |
| Manual shortlist | `not_shortlisted → shortlisted_demo → reversed_demo` | Submitted packet; explicit human confirmation; reversal requires an active shortlist |
| Reset | Any valid state → initial fixture state | Confirmation dialog; clears only this demo's state |

Re-preparing either packet resets consent. Changing a visible selection/question hides the stale prepared preview until the user prepares again. Submitted application selections are frozen; restart with Reset demo. Mentor packets can be revised, requiring new preview and consent. Shortlist actions append local history rather than deleting the prior decision.

Storage key: `trajectoryos:fictional-journey:v1`; internal `version: 1`. Strict Zod parsing checks object shape, metadata, candidate-scoped evidence IDs, unique selections, consent/submission consistency, mentor state, timestamps and shortlist/reversal ordering. Unknown versions, malformed JSON, oversized data, cross-candidate IDs and impossible states restore initial fictional data with a visible notice. Storage denial/quota failure shows an in-memory-only warning. No saved artifact bodies, real resumes or credentials are needed: fixture IDs, local question/note and transition state are stored.

This is a single-browser demonstration, not a cross-tab synchronisation or authorization system. Data survives refresh after preparation/confirmation; unprepared checkbox drafts and the current persona are transient UI state. The same synthetic state is visible across signed-in accounts in the same browser. The footer explains this and asks users to reset before handing over a shared device. A deliberate local storage edit is not an authenticated event or immutable production history.

## Candidate, employer and mentor behavior

**Candidate:** The initial empty board provides an employer-workspace handoff. After publication, open the posting, read the human-readable requirements, inspect materials and select exact evidence. Nothing is selected initially. Review the readable package, confirm scope, and submit. Confirmation says the application was recorded locally and not externally sent. Switch to Employer to inspect the same package.

**Employer:** The posting can be viewed and published locally. The inbox contains three fictional names; Ananya exposes no private evidence or profile text before submission. Kabir/Meera are labelled seeded packets. Profile content comes exclusively from `employerApplication`, which projects selected submitted artifacts. Exact test observations are expandable; representative HLD/LLD summaries are visibly distinct from actual diagrams. The profile explains sources, sharing scope and limitations. The dedicated Manual shortlist filter displays human-shortlisted candidates.

**Shortlist boundary:** The user must open a native confirmation dialog and choose **Confirm human demo shortlist**. They may enter a note up to 500 characters. The persisted action contains candidate ID, job ID, manual decision, note, timestamp, `human-demo-action` provenance and mock metadata. Reversing appends a reversal record. There is no automatic selection, ranking, real recruiter identity, interview invitation or external contact. Decisions are bounded to 200 records per reset.

**Mentor:** Candidate → Mentor review prepares an independently scoped question and materials. Available checkbox context includes HLD, LLD, test results, reasoning and the failed-concurrency excerpt. Preview lists exact contents; requesting requires separate consent. Switching to Mentor before any request shows an understandable empty state. After request it shows the fictional candidate, question, selected context and seeded response. It never projects other candidate materials or unselected artifacts.

Every response is labelled **“Example mentor response — fictional demonstration, not a real message.”** The deterministic example discusses transaction scope, account-scoped key reservation, a losing duplicate's post-conflict read, rollback and a concrete two-client/failure-injection investigation. It cites only selected fixture IDs. If no selected observation contains T3 failure, it explicitly says no failure outcome is inferred. General guidance is labelled illustrative. Next action: **Revisit the transaction boundary in LLD**, with `/lab` as the real navigation handoff. No scene is created or changed.

## Deterministic requirement mapping

References are stored separately from the posting. Only selected materials participate. A match means **Evidence available for review**, never “requirement passed.” Missing evidence remains **Not assessed from shared materials** and does not trigger rejection.

| Requirement | Fixture references considered |
| --- | --- |
| HTTP retries/idempotency | T1, T2, T4, T6; reasoning, critique, questions |
| Transactions/rollback | T5; reasoning, critique, questions |
| Concurrent requests | T3, T7; reasoning and questions |
| HLD/LLD boundaries | Shared HLD/LLD summaries |
| Communicating decisions/limitations | Shared reasoning, critique and questions |
| Production operations | Always unassessed |
| Independent code authorship | Always unassessed |

Failures remain failures in the mapping. Every test reference carries the reviewed-implementation/authorship limitation. Written/design material needs human review; its correctness and clarity are not inferred. There is no LLM call, AI hiring decision, employability score, credential or certificate.

## S9 integration (complete)

The application now serves the demo at `/demo/journey` inside the existing authenticated app shell. Opportunities contains a separate fictional-walkthrough link that states the demo uses no real attempts, evidence or career APIs. The primary navigation highlights Opportunities on this route. Existing `/career/preview`, `/opportunities`, attempt and evidence URLs remain available.

`EmployerMentorDemo` keeps its scoped stylesheet and local state model. It does not consume Clerk identity, real attempts, API context or tokens. The route remains within the existing signed-in `AppRoutes` boundary; no public auth bypass was added. No API contract amendment or database migration was needed.

### Standalone development harness

From this worktree, use installed dependencies and run:

```powershell
npm run dev --workspace=@trajectoryos/web -- --port 5180 --strictPort
```

Open `http://127.0.0.1:5180/src/demo/harness.html`. No `.env`, Clerk or API server is required. The harness does not register `/demo/journey` in the production app. Its `/lab` link enters the real app, which may require the usual configuration and sign-in.

The source branch also independently bundled the development harness. The integrated production application now imports the demo through its route and is covered by the root production build:

```powershell
node --input-type=module -e "import { build } from 'vite'; await build({root:'apps/web',build:{outDir:'src/demo/dist',emptyOutDir:true,rollupOptions:{input:'apps/web/src/demo/harness.html'}}});"
```

The generated `dist` is ignored and not committed. For local verification only, this worktree reused installed dependencies through ignored directory junctions; no dependencies or package versions were changed.

## Verification and remaining QA

Observed on 18 October 2026:

- `npm test`: **88 passed, 0 failed** (32 API and 56 web tests), including the connected candidate-to-mentor workflow and the production route/Opportunities entry.
- `npm run typecheck`: **passed** for contracts, API and web.
- `npm run build`: **passed**; Vite reports existing chunks above 500 kB.
- `npm run smoke`: **passed** for API health/readiness, v0.6 schemas and packaged challenge/migration runtime assets.
- Independent demo harness Vite build: **passed**, 113 modules transformed; demo JS approximately 340.49 kB / 102.65 kB gzip.
- `git diff --check` and staged whitespace check: **passed**.
- Development harness server starts on loopback port 5180. Delivery is checked separately from rendering.

The S10 tests exercise actual transition functions, Zod loaded-state validation, selected-only projections, deterministic mapping and React server rendering. They cover fixture validity, publication/visible posting, package preparation, consent gating, private-artifact exclusion, employer profile rendering, preservation of unassessed requirements, explicit shortlist and reversal, mentor selected-only packets, response labels, reset, browser-storage round trip/failure cases and escaped local question text. These are synthetic/unit/SSR tests, not live PostgreSQL or browser interaction tests.

The available browser inventory returned no browsers or native app surfaces. **No browser QA or screenshots were captured.** Mouse/keyboard interaction, dialog focus behavior, actual localStorage after a browser refresh, dark/light appearance and visual layout at 1440×900, 1280×720 and mobile widths remain for browser QA. The current environment has no DOM interaction test dependency. Native dialogs, labelled controls, pressed-state persona buttons, status feedback, responsive CSS and focus styles are implemented, but their rendered accessibility/visual behavior has not been certified here. An existing test-server WebSocket port 24678 warning appeared during the web suite; it did not fail any test. Backend tests, authenticated real workflows and Mistral were outside this change's scope and were not claimed as verified.

## 2–3 minute judge walkthrough

1. **0:00–0:25:** Open the harness. Point out Fictional demo / Not externally sent. Switch to Employer, inspect the one posting, and publish it to the demo board.
2. **0:25–1:00:** Switch to Candidate, open the job and read requirements. Select HLD, LLD, synthetic observations and engineering explanation. Leave self-report and critique unchecked. Review the exact package, consent and submit locally.
3. **1:00–1:40:** Switch to Employer and open Ananya. Inspect T3's duplicate-effect observation and the deterministic requirement map. Show that unselected profile/critique content is absent and production/authorship remain unassessed. Compare Kabir's synthetic 7/7 with Meera's lack of a recorded outcome. Manually shortlist Ananya with a short note; use the shortlist filter. Reverse if useful.
4. **1:40–2:25:** Switch to Candidate → Mentor review. Choose LLD, reasoning and failed concurrency context. Preview exact selected materials, consent and request the example. Switch to Mentor to show the same packet and the clearly labelled seeded response. Point to the concrete next check and real `/lab` handoff without claiming any diagram edit.
5. **2:25–2:45:** Refresh to inspect saved state when a browser is available, then Reset demo and confirm the initial draft/no-Ananya-application/no-shortlist/no-review state. Explain that only the two seeded comparator packets return.

Implementation and production route/navigation integration are complete on main. The deterministic workflow tests, typecheck and production build pass. Browser QA, live service verification and the remaining release gates are summarized in `S9_PRODUCT_EXPERIENCE_HANDOFF.md`.

IMPLEMENTED
