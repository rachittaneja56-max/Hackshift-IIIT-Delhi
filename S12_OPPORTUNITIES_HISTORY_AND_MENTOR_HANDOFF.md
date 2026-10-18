# S12 — Opportunities, engineering history and contextual guidance

Implemented on 18 October 2026. This is the S12 extension of the existing S11 demo, not a new hiring backend. No public deployment was performed.

## Baseline and delivery

Initial local HEAD was `ecd29212eaeb931258d3f4d1c17273dcabd37725`, with a clean working tree. The connected GitHub app verified actual remote main as **`0795341f6795afc1194a287a0c24a852405197ee`**, matching the requested S11 baseline. S10/S11 handoffs, demo components/model/fixtures, routes, private career/mentor tools, evidence and code-lab flows and tests were inspected. The only supplied attachment was the request text; no screenshot image files were attached.

Terminal `git fetch origin main` and `git push origin main` could not authenticate (`could not read Username`). The connected GitHub app supplied the baseline comparison and tree. Every restored file and reconstructed baseline tree/commit was verified against its upstream Git SHA. The local baseline is a depth-one/shallow snapshot at the original S11 commit; its identity and existing upstream history were preserved, rather than recreating S11 under a new commit.

New commits were created through the connected GitHub app, with each exact commit/tree imported locally and verified against the staged tree. Main is updated only after verification, using a normal non-force fast-forward and an expected-head guard. This preserves upstream commits. There is no public deployment or real employer action.

| Commit | Scope |
| --- | --- |
| `35e7cdb00608ce68c943e7cba3cd872cbea5fd32` | Opportunities landing and route separation |
| `cb725804613911f3d0060520692c041ca0d256ce` | Validated fictional history and selected-only projections |
| `2dcb7e253de79e24849ed4e5f6a0695f92d107fa` | Candidate timeline, employer chronology, mentor continuation and unmounted private personas |
| `74d70bd514784db441594c8d3cc2710590c80f97` | Workflow, route, provenance, persistence and privacy tests |
| `aa5ce60ba7288d37a95894df016762484ba75faa` | Ensure a concurrency excerpt cannot become a second synthetic run |
| `af46f7e9faeddbda62e0db689b42bbef0946d0aa` | Real browser report and reproducible check script; local PNG captures |
| Documentation commit containing this handoff | Final findings and judge demonstration |

Final remote main is the documentation commit containing this file, following `af46f7e9faeddbda62e0db689b42bbef0946d0aa`. Its exact SHA is reported in the final delivery after reading the remote branch back; a commit cannot embed its own hash. Verify with `git rev-parse main` and the GitHub main branch.

## Before and after

| Surface | Before | After |
| --- | --- | --- |
| Opportunities | Real JD textarea and completed-evidence empty state dominated the entry point | Featured Northstar role, Ananya history preview, evidence-review example, mentor prompt and separate private-tool action |
| Candidate | Artifacts available mostly as application attachments | Prominent My Engineering Journey, related learning path, disclosed mixed result, progressive artifact inspection and current learning focus |
| Job | Requirements listed separately from candidate work | Expandable candidate-owned connections to related learning, design summaries, writing and actual synthetic observations, before selection |
| Employer | Application packet and requirement mapping | Shared engineering chronology followed by requirements, designs/reasoning, observations, discussion areas and human reviewer history |
| Mentor | Context packet and response | Challenge/difficulty continuation, exact selected context, independent consent, structured fictional guidance and a derived private next action |
| Persona privacy | Inactive workspaces remained mounted in hidden DOM | Only the active workspace mounts; a transient draft cache preserves editing across switches |

## Routes

- `/opportunities`: new Opportunities Home, inside the existing authenticated application shell.
- `/demo/journey`: existing Candidate / Employer / Mentor simulation.
- `/demo/journey?view=opportunity`: starts at the fictional job detail for a fresh scenario.
- `/demo/journey?view=history#engineering-history`: opens the candidate history section.
- `/demo/journey?view=mentor`: starts in Mentor.
- `/career/preview`: preserved real private JD analysis, owned completed-record selection and résumé drafting.
- `/mentors/preview`, `/learn`, `/practice`, `/evidence`, existing attempt/design URLs and `/lab/ai-debugging`: preserved.

The development-only `/src/demo/harness.html?screen=opportunities` renders the production `Header` and `AppRoutes` without Clerk or an API provider. `/src/demo/harness.html` starts the journey. Sample links use the real router; private routes require the signed-in application. These harness URLs are not production deployment routes.

## Fictional history schema

`apps/web/src/demo/history.ts` defines strict Zod-validated events:

```ts
type HistoryEvent = {
  id: string;
  candidateId: 'ananya';
  type: 'learning' | 'design' | 'investigation' | 'observation'
      | 'question' | 'guidance' | 'application' | 'shortlist';
  origin: 'fictional-content-interaction' | 'representative-design-summary'
        | 'fictional-candidate-writing' | 'synthetic-evaluation'
        | 'candidate-demo-action' | 'illustrative-mentor-response'
        | 'local-demo-application' | 'human-demo-action';
  title: string;
  summary: string;
  relatedArtifactIds?: string[];
};
```

Each event type has one allowed origin. Evidence events require valid, unique references to the existing canonical Ananya artifacts in `fixtures.ts`. Unknown references, contradictory origins and extra fields are rejected. Learning interactions cannot masquerade as submitted artifacts. No activity dates, skill points, certificates or completion percentages were added.

Examples:

```json
{"id":"network-concepts","candidateId":"ananya","type":"learning","origin":"fictional-content-interaction","title":"Explored network reliability","summary":"Computer Networks · HTTP request/response loss, application retries and why duplicate requests occur. Fictional viewed concept."}
```

```json
{"id":"design-a-lld","candidateId":"ananya","type":"design","origin":"representative-design-summary","title":"Created LLD design summary","summary":"LLD design","relatedArtifactIds":["a-lld"]}
```

Artifact bodies remain in the canonical S11 fixtures. History references those artifacts and derives observation counts from their checks. HLD/LLD remain representative summaries, not user-database Excalidraw scenes. The implementation was investigated, not claimed as independently authored. Ananya's result stays **six of seven synthetic checks passed; T3 concurrent retries failed, producing duplicate credit**. `a-failure` is explicitly an excerpt of the same v1 result. Selecting it alongside `a-tests` produces one observation milestone, not another run.

## Private and shared projections

`candidateHistory(state)` combines fictional learning interactions, canonical design/writing/observation milestones, the mentor question and state-dependent guidance, application and active shortlist milestones. The full history is available only in the candidate view.

`sharedHistory(artifacts)` receives the submitted packet's artifacts, not a private candidate ID or complete state. It accepts canonical Ananya artifact values and derives only design, investigation and synthetic observation events. No private learning interactions, question, guidance, notes or unselected artifact references enter this projection. An excerpt alone cannot imply the full 6/7 record.

`SharedHistory` accepts only packet artifacts. `EmployerProfile` obtains them through S11's existing `employerApplication` projection. `EngineeringTimeline` opens only the supplied related materials. Other seeded candidates retain their S11 packet and requirement review; the new detailed canonical history is specifically Ananya's, and no learning history is invented for Kabir or Meera.

Inactive candidate and mentor components unmount in Employer. They are absent from hidden DOM as well as the visible profile. Draft selections/questions survive perspective changes through an in-memory cache, and reset clears that cache. There are no debug panels exposing it. This remains a browser-local fictional simulation, not a security authorization boundary; the bundle contains fictional fixtures and must never store real private records.

## Consent, state and manual review

Application flow remains Discover → Opportunity → Choose evidence → Review & share → explicit unchecked consent → local submission. Only selected materials enter the frozen packet. Success includes role, company, material count, local status and direct employer handoff selecting Ananya.

Human shortlisting still requires the native confirmation dialog. Cancellation records nothing; reviewer note, action timestamp, reversal and decision history remain in the validated model. Candidate status says **Shortlisted in this demo.** No recruiter message, email, invitation or interview date is fabricated.

Mentor context has a separate preview and unchecked consent. Guidance appears only after `request_mentor` succeeds. The response is visibly **Illustrative mentor response — fictional**, with selected observations, a transaction-boundary explanation, a proposed two-client/failure-injection test and an Engineering Lab link. It does not infer an unshared test failure.

The candidate timeline then reveals **Mentor example reviewed**, the selected context and **Revisit the transaction boundary in LLD.** This suggestion does not rewrite a design, change test outcomes, mark proficiency, or amend the submitted application. Private mentorship never changes the employer profile. Sharing a later mentor reflection is not implemented; that would require a new explicit artifact and consented application version, rather than editing the frozen packet.

S11's `version: 2` storage schema/key is retained because all new history is derived and no persisted fields changed. Existing valid v2 actions survive refresh. Legacy v1, malformed and unknown versions retain the existing safe reset/notice behavior, without importing consent. Reset restores the published scenario, initial Ananya state and seeded comparison applicants. No backend schema, migration, API contract or real history record was added.

## Verification

| Command/check | Actual result |
| --- | --- |
| `npm ci` | Passed outside the sandbox after its esbuild execution check was denied inside it |
| `npm run typecheck` | Passed contracts, API and web |
| `npm run build` | Passed; existing Vite chunks-over-500-kB warning remains |
| `npm test` | **104 passed, 0 failed: 32 API + 72 web**, including all 95 existing tests |
| `npm run smoke` | Passed API health/readiness, v0.6 schemas and packaged challenge/migration assets |
| `git diff --check` | Passed |
| Real Chromium | Full fictional flow passed at 1440×900, 1280×720 and 390×844 |

Tests exercise route separation, canonical provenance and references, failed outcomes, gated guidance, unchanged frozen packets/results, selected-only chronology, absent private DOM, consent, manual confirmation/reversal, candidate status, reset, refresh, valid v2 and legacy handling. The real Career route is rendered with an injected owned API context and remains a JD form without fictional artifacts. Existing DOM tests reject fictional-flow `fetch` calls. No existing test coverage was removed.

`scripts/s12-browser-check.py` uses the installed Chromium/ChromeDriver and Python standard library. It exercises actual production route components in the development harness. It checks sample-link routing, both consent gates, exact context, employer DOM privacy, native Escape cancellation, manual shortlist, mentor continuation and real refresh. **49 viewport screenshots** were captured, with **no horizontal overflow**, **no browser errors excluding the irrelevant favicon 404**, and **no real `/api/v1/` requests**. Report and reproduction instructions are in `docs/s12-browser/`.

All PNG captures remain local and ignored, per the user's explicit instruction to keep screenshots local. Automatic approval review rejected a screenshot upload because destination ownership could not be established to its satisfaction. Some earlier screenshot blobs were uploaded before that rejection, but no PNG is referenced in any new commit tree or published main path; no further screenshot upload occurred after the user's instruction. Local examples are `1440-01-opportunities.png`, `1440-09-shared-timeline.png`, `390-09-shared-timeline.png`, `390-11-shortlist-dialog.png` and `390-15-mentor-response.png` under `docs/s12-browser/`.

Representative landing, candidate/employer chronology, application, mentor, failed-observation and dialog captures were manually inspected. Light mode was captured at all three sizes, plus dark-mode history. This is not a signed-in Clerk, deployed-browser, live-provider or exhaustive accessibility certification. The install still reports the baseline's 14 dependency advisories; no forced dependency upgrades were made.

## AI Debugging Lab diagnostic

The unavailable screen is consistent with server readiness, not proof of a frontend route defect. Existing `/lab/ai-debugging` navigation and the availability gate were preserved.

| Local setup | Finding |
| --- | --- |
| Availability endpoint | Authenticated `GET /api/v1/sandbox/availability`; frontend uses this exact route |
| Database configuration | Present |
| Migration `005_sandbox.sql` | Read-only database query confirmed it is recorded and its checksum matches the checked-in migration |
| `E2B_API_KEY` | **Missing** |
| `OPENAI_API_KEY` | Present; no live model call made |
| `OPENAI_MODEL` | Present for the general AI provider; does not configure the sandbox agent |
| `SANDBOX_AGENT_MODEL` | **Missing** |
| `SANDBOX_ENABLED` | Unset; **defaults to false** |
| Clerk server configuration | Keys present; no signed-in production session was tested |

`SandboxService.available()` requires the enabled flag, E2B key and configured sandbox agent, which itself needs the OpenAI key and sandbox model. The endpoint also needs a database-backed service. Therefore the inspected local configuration is unavailable even though migration 005 is applied. A deployed authenticated endpoint was not queried, so this is not a claim about remote hosting configuration.

Required operator setup is an E2B key, an accessible explicit `SANDBOX_AGENT_MODEL`, and deliberate `SANDBOX_ENABLED=true` only after provider/readiness review. Keep the existing database/Clerk/API origin configuration and migration checks. No flag was enabled, no readiness check bypassed, no sandbox session created and no provider execution fabricated. A broad diagnostic command inadvertently printed an existing local OpenAI key into tool output; subsequent checks used presence/absence only. No credential values were committed or included in screenshots; rotate that exposed key outside this feature change.

## Two-to-three-minute judge demonstration

1. **0:00–0:20:** Open `/opportunities`. Show the fictional Northstar Junior Backend Engineer role and the separate link to the real private tool. Choose the example engineering history.
2. **0:20–0:45:** In My Engineering Journey, follow Networks → Transactions → System Design. Open a design and the synthetic test observation. Point out 6/7 and the failed concurrent-retry case; this is not a PostgreSQL run or authorship claim.
3. **0:45–1:10:** Open the opportunity, expand the concurrency/history connection, then Prepare application. Select HLD, LLD, test observations and engineering explanation. Review the exact package, explicitly approve sharing and submit the demo application.
4. **1:10–1:40:** Use See what the employer receives. Ananya opens automatically. Show the shared-only chronology, inspect the failed T3 observation and explain the missing private learning/mentor activity. Manually confirm Shortlist for technical conversation and show the local human decision history.
5. **1:40–2:15:** Switch to Mentor. Choose Concurrent retries, select LLD and the failed-observation excerpt, preview exact context, separately consent and request the example review. Show the fictional label, structured guidance and proposed next test.
6. **2:15–2:35:** Return to Candidate. Show Shortlisted in this demo, Mentor example reviewed and the suggested LLD transaction-boundary action. The synthetic 6/7 result and employer packet remain unchanged. No action occurred outside this browser.

The product sequence is **Learn → Design → Investigate → Observe → Ask for Guidance → Share Evidence → Employer Review**, with mentorship usable before or after an application.
