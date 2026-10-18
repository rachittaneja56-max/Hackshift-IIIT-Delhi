# S11 — Career Journey experience

Implemented on 18 October 2026, starting from `origin/main` at `6e0b9dd360341853f437316ea94a2cc5633508f8`. Testing route: **`/demo/journey`**, inside the existing authenticated application shell. No public deployment was performed.

## Screens and interaction changes

| Area | Before | After |
| --- | --- | --- |
| Navigation | Repeated disclaimer badges and a sequential four-stage tracker | Compact Career Journey identity, one fictional/local notice, three connected persona buttons, independent descriptive statuses and optional guidance |
| Discovery | Candidate blocked on employer publication | Published fictional opportunity, candidate profile header, job card and separate posting detail |
| Application | Two long form cards | Discover → Opportunity → Choose evidence → Review & share; selectable cards, expandable previews and a focused included/excluded package |
| Submission | Long repeated artifact bodies | Restrained success state and direct employer handoff selecting Ananya |
| Employer | Oversized inbox and full artifacts before the decision | Two-pane workspace, compact applicant controls, All/Submitted/Shortlisted filters, prominent manual decision and readable requirement comparison |
| Artifacts | Full text repeated throughout | Collapsed artifact disclosures, source labels, expandable exact observations and supporting-material controls |
| Mentorship | Another large form | Editable topic suggestions, exact context cards, separate packet preview/consent, then a question/context/guidance workspace |

The optional guide navigates to the next workspace and explains the available action. It cannot select materials, consent, submit or shortlist. The mentor perspective is always accessible independently of application or shortlist status. Switching perspectives preserves in-progress selections and questions; only one workspace is visible and exposed to normal keyboard navigation.

## Files and scope

- `apps/web/src/demo/EmployerMentorDemo.tsx`: shared validated state, persona navigation, status strip, guide, selected-applicant handoff and reset/replay confirmations.
- `CandidateWorkspace.tsx`: opportunity board/detail, evidence selection, consent preview and submission success.
- `EmployerWorkspace.tsx`: inbox/filtering, selected-only profile, deterministic requirement comparison, manual shortlist/reversal and history.
- `MentorWorkspace.tsx`: editable topics, context packet, consent and illustrative guidance with Engineering Lab link.
- `components.tsx`: evidence cards/disclosures, posting, source labels and native confirmation dialog with focus restoration.
- `model.ts`: v2 default/storage handling, draft replay transition and structured artifact/outcome references for comparison.
- `demo.css`: scoped responsive styles using the existing light/dark theme variables; mobile stacking, wrapping and reduced-motion rules.
- `apps/web/test/demo-workflow.test.mjs`, `demo-interactions.test.mjs`, `ui.test.mjs`: transition, projection, persistence, SSR, DOM interaction and route integration verification.
- `apps/web/package.json`, `package-lock.json`: add **development-only `jsdom ^26.1.0`** for DOM interaction tests, compatible with the repository's Node floor. No runtime UI dependency added.

Canonical fixtures, the real career/mentor services, API contracts, backend files, migrations, Clerk integration, global styles and environment files were not changed. No new wire-contract fields or routes are proposed. The existing untracked `tmp/` folder was preserved and excluded from commits.

## Startup, state machine and storage

The initial v2 scenario contains a **published fictional job**, Kabir/Meera's labelled pre-seeded applications, no Ananya selection/application/consent, no reviewer decisions and no requested mentor packet. This is a seeded local scenario, not a recorded real publication or an action against an employer service.

`model.ts` remains the transition authority. `version: 2` uses `trajectoryos:fictional-journey:v2`. If only the older v1 key exists, loading starts the new scenario and displays a reset notice. It does **not** import old consent, submissions or decisions. The old key is left untouched; subsequent state is saved only under v2. Unknown versions, malformed/oversized JSON and semantically invalid records recover with a visible notice. Storage denial/quota failure displays a warning and allows in-memory use.

**Replay publishing** requires a confirmation explaining that all local decisions, Ananya's application and both sharing consents will reset. Its `replay_publication` transition creates the initial fixture scenario with the job in draft. The existing explicit `publish` transition makes it visible again. Preparing an application remains blocked while the job is draft. Normal **Reset demo** requires confirmation and restores the published v2 scenario.

Unprepared card choices and editable question drafts survive persona switches but are transient across refresh. Prepared/submitted packets, consent and history use validated storage. Current persona, guide and inbox filter are transient UI state. This remains synthetic-only storage shared across signed-in users on one browser, not an authenticated history or cross-tab synchronization system.

## Sharing and review guarantees

Application and mentor evidence start unselected. Each packet requires nonempty candidate-allowlisted IDs, an explicit preview and its own unchecked consent. Preparing a revised package clears its previous consent. Submission freezes the application package; the employer projection receives only selected submitted materials. Ananya's unsubmitted artifacts never enter that projection. Kabir and Meera remain visibly pre-seeded.

Requirement matching remains deterministic, using the existing reference map. Supporting controls point only to shared artifacts. Structured `outcome` values keep T3 failures distinct from passed checks; repeated copies of the same observation are deduplicated visually. Missing evidence stays unassessed. There are no aggregate scores, automatic rankings or authorship claims. Synthetic observations describe a reviewed implementation, not a real run for these fictional candidates.

Shortlisting requires opening the reviewer dialog and explicitly confirming the human action. An optional note and timestamp are saved. Cancelling or dismissing the dialog records nothing and restores trigger focus. Reversal appends a history record. No email, invite or recruitment action occurs.

Mentorship offers five editable question topics and exact HLD/LLD/test/reasoning context cards. Its separate sharing consent is required before requesting the example review. The review shows only the selected context, labels the response **Illustrative mentor response** and retains the explicit seeded/fictional provenance. It explains transaction scope, offers a concrete two-client/failure-injection test and links to `/lab`. It does not infer an unshared failed observation, contact a real mentor, call a model, run a test or modify a diagram.

## Verification and actual limits

| Check | Observed result |
| --- | --- |
| `npm ci` | Passed in `C:\Users\tanej\Desktop\TrajectoryOs-s11-verification`, including the final lockfile |
| `npm run typecheck` | Passed for contracts, API and web |
| `npm run build` | Passed; existing Vite warning for chunks over 500 kB |
| `npm test` | **95 passed, 0 failed: 32 API + 63 web** |
| `npm run smoke` | Passed: API health/readiness, v0.6 schemas and packaged challenge/migration assets |
| `git diff --check` | Passed |
| Local development server | Started successfully at loopback port 5187; port 5180 was already occupied |

The first install in the original checkout failed with Windows `EPERM` on an in-use Rolldown native binary; an attempted repair also encountered `EBUSY`. No existing process was terminated. The clean verification worktree provided the reproducible install and checks. Missing original-checkout dependency files were restored from that install without replacing existing locked files; workspace junctions were restored to the original checkout. Local typecheck/tests were also rerun after recovery.

The install reports the same **14 advisories** documented by S9: 2 low, 6 moderate, 6 high. No forced dependency upgrade was applied. Tests use fictional fixtures; smoke does not verify live PostgreSQL, Mistral, E2B or Clerk.

The three added DOM tests exercise actual mounted React components: stage changes/focus, draft selections across persona changes, unchecked consent and disabled submission, employer handoff to Ananya, selected-only details, failed supporting observations, applicant filters, cancellation/focus restoration, confirmed shortlist/reversal, refresh, mentor topic editing, independent consent/revision, guide navigation, reset/replay and malformed-storage recovery. They also reject any fictional-action `fetch` call. JSDOM supplies a dialog stub: it does not certify native modal focus trapping, browser keyboard defaults or layout.

**Browser visual QA is incomplete. No screenshots were captured.** The browser connector reported no available browsers; Windows Computer Use found Chrome but stopped on the first new-tab action because it could not determine the current browser URL confidently enough to enforce policy. UI automation stopped at that point. The requested **1440×900, 1280×720 and 390px** visual inspections, real browser refresh, rendered light/dark contrast, overflow and native dialog keyboard behavior remain unverified. Server readiness and DOM/SSR tests are not claimed as browser QA.

## Atomic commits and integration

| Commit | Scope |
| --- | --- |
| `f66bd7a` | Versioned published startup and explicit draft replay |
| `5f31e08` | Candidate opportunity/application stages and shared evidence controls |
| `51b5cc1` | Employer inbox, evidence comparison and manual review decisions |
| `39af641` | Connected persona navigation and contextual mentor flow |
| `8b7069e` | Responsive styles, accessibility behavior, tests and DOM test dependency |
| Handoff commit containing this file | Verification, limitations and walkthrough |

Verified implementation SHA: **`8b7069e494901ec545c0d10afeec8374da11496e`**. The documentation-only commit containing this handoff follows it. Resolve the final main SHA with `git rev-parse main`; its exact value is reported in the delivery message because a commit cannot embed its own hash. `origin/main` was fetched again before integration; normal push only, preserving existing authorship.

## Two-minute judge walkthrough

1. **0:00–0:25:** Open `/demo/journey`. Point out the fictional/browser-only notice. As Ananya, open the published Northstar role and its responsibilities. No employer detour is needed.
2. **0:25–0:55:** Prepare an application. Choose HLD, synthetic observations and reasoning; leave other materials unchecked. Review included/excluded scope, explicitly consent and submit locally.
3. **0:55–1:25:** Use **See what the employer receives**. Ananya is selected. Inspect the failed T3 comparison and expand its exact synthetic observation. Explain that tests do not prove learner authorship. Confirm a manual shortlist with a note; show reversal/history if time permits.
4. **1:25–1:55:** Switch to Mentor. Choose concurrent retries, edit the question and select LLD plus the failed concurrency excerpt. Preview, separately consent and request the example. Show its illustrative label, selected context, suggested test and Engineering Lab handoff. Mentorship also works before an application or shortlist.
5. **1:55–2:00:** Reset and confirm. The published opportunity and seeded comparison applicants return; Ananya's sharing consent and review decisions clear.
