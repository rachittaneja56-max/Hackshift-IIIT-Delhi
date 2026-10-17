# TrajectoryOs frontend handoff

## Excalidraw maintenance — 18 October 2026

Scoped files: `src/drawing/NativeScene.tsx`, `src/drawing/Scene.tsx`, new `src/drawing/scene-session.ts`, `src/attempts/workspace.tsx` (editor key only), `src/styles.css`, `test/core.test.mts`, and this handoff. Pre-existing scene serialization, API, Vite and dependency edits were preserved.

- Scoped host element/form styles away from native Excalidraw controls, corrected dark control accents and removed forced mobile page minimum heights.
- Added a scene session boundary: initialization and camera/tool notifications do not dirty drafts; acknowledged edits retain the mounted editor; explicit server/device replacements update the canvas and clear obsolete native history. Removed cleanup-time scene writes and editability-driven remounts.
- Restored drawings scroll into view. Binding repair receives a copied scene. Unsupported recovered data stays intact until explicit removal; unsupported clipboard content is rejected before insertion. Canvas background editing is hidden because the wire contract persists elements only.
- Editor load/render failures are contained within the drawing area so the surrounding lab controls remain accessible.
- Verified `npm test --workspace=@trajectoryos/web` (23 passed), `npm run typecheck --workspace=@trajectoryos/web`, `npm run build --workspace=@trajectoryos/web`, and `git diff --check -- apps/web`. A local editor font request returned HTTP 200 with `font/woff2`. Build retains the existing large-chunk warning. A rerun overlapped another task's dependency installation and failed on incomplete dependencies; the final rerun passed after that installation finished. Tests cover the frontend scene/save models and SSR; they are not native browser or PostgreSQL integration tests.
- Native visual/gesture verification remains pending: the computer-use inventory was empty and opening the local website returned `Browser is not available: iab`, including after the Browser mention. No public deployment or backend/shared-contract change was made by this maintenance task. Other ongoing workspace changes were preserved.

---

17 October 2026. Frontend implementation changes are inside `apps/web/**`. The frontend will be published on `frontend/trajectoryos-app`; no public deployment, migration, shared-contract edit or root lockfile edit was performed.

## Baseline and ownership

- Frontend branch base: `d9c181ac03b85a84b5246a6ba6cd261ee9a9735c`, the pushed B4 commit on `origin/main`. The executable shared contract remains v0.3, unchanged from the reviewed baseline.
- Read the current shared contracts, API routes, attempt/scene validation, evaluation worker/service, evidence read model, AI service/output, content source, backend handoff and frontend integration guide. The approved v0.3 amendment and OpenAI provider choice are recorded in `BACKEND_HANDOFF.md`.
- The implementation prompt and revision-3 design document were available in full. The supplied HTML attachment is 51,600 bytes and ends literally with `#trajec... (121 KB left)` inside its stylesheet. It is not a complete renderable reference. Layout, copper tokens, typography and behavior follow the complete approved documents.
- This branch contains only frontend-owned changes under `apps/web/**`; the backend commit remains the parent from `origin/main`.

## Implemented milestones

### F1 — Functional foundation

- Real `@clerk/react` provider, sign-in, account menu, initialization, failed/degraded service states and identity-keyed API context. No auth bypass or fake sign-in.
- Editorial curriculum, published lesson reader, source/author/version/hash attribution and a separately labelled local networking companion. The companion contains a Client/API/PostgreSQL SVG sequence, text alternative, illustrative request and separate-writes counterexample. It does not replace published v1 or claim to share its hash.
- Typed authenticated API client: every request obtains a token; 401 forces one refresh; response DTOs/envelopes are validated. Request IDs, errors, Retry-After, malformed responses and explicit mock metadata remain visible. There is no production fixture fallback.
- Deliberate attempt creation with a stable UUID across uncertain retries and refresh where session storage works. Storage failure is disclosed, and the in-memory intent key remains usable.
- Separate full-viewport native HLD/LLD editors using installed Excalidraw 0.18.1 and its stylesheet. IDs, text, geometry, bindings and supported deletion tombstones are serialized; camera/tool changes do not edit the artifact.
- Native fonts are copied from the installed editor into ignored `public/excalidraw-assets/` by predev/prebuild. No font-package installation is needed. Native drawing is lazy-loaded.

### F2 — Complete engineering workflow

- Lab brief, exact nullable design decisions, optional notes, canonical multi-file A/B/C source comparison, separate selected repair, exact curated suggestion, learner critique and justification.
- One serialized whole-artifact save queue per loaded attempt; debounced/coalesced autosave and manual save share it. Acknowledgements update the server base without replacing newer local work.
- User/attempt/challenge-version scoped device recovery, debounced storage, storage-failure disclosure and downloadable local/base snapshots. Invalid imports and oversized scenes remain recoverable locally.
- Client scene/bounds/byte checks mirror current backend limits. Unsupported native features are disabled where supported. Invalid remaining content blocks saving visibly; removal is an explicit action, with recovery download available.
- Lost PUT acknowledgements reconcile with GET before another write. Conflicts pause saves and expose base/local/server comparison with explicit load or reapplication. Locked attempts switch to frozen views.
- Accessible native submission-review dialog, shared readiness validation and exact save-before-submit sequencing. Editing is paused during submission and during an unresolved lost-submit response. Recovery checks the existing attempt/evaluation; it never creates a replacement attempt.

### F3 — Evidence and history

- Owned attempt history with opaque pagination, draft resume, immutable submitted workspace and evaluation lifecycle.
- Sequential evaluation polling, paused in hidden tabs and resumed on visibility; terminal states stop polling. Only eligible infrastructure errors offer the existing retry endpoint. No synthetic progress or inferred verdicts.
- Runtime evidence adapter reuses shared artifact/result/status schemas and explicitly guards the current provenance wrapper. No shared EvidenceDto export is invented.
- Actual returned checks, mixed/failing outcomes, per-check expected/observed summaries, complete raw records, complete limitations, saved native read-only diagrams, self-reported reasoning and full returned provenance.
- Explicit feedback generation; GET status/polling; provider/model-aware `llm` interpretation and visibly labelled `rules` explanation. Non-null unavailable output remains shown. Tests stay separate from feedback; diagrams/reasoning are not presented as AI-graded.

### F4 — Product previews

- Fictional Mira Sen profile; owned saved-attempt selection; initially unchecked artifact/test choices; focused question; exact selected-context packet; optional clearly seeded response. No messages are sent.
- Fictional junior backend JD; initially empty candidate-controlled inclusion of multiple owned records; complete run summaries/limitations; traceable requirement-to-test mapping; explicit unassessed areas and self-reported explanation. No scores, hiring claims or job API.
- Preview choices are component-local, private, reset on account change, and never mutate evidence. Evidence/lab contextual links preserve the selected attempt.
- Production code never imports backend verification artifacts. Test fixtures are newly authored frontend test doubles and are never routed into a student's live workspace.

### F5 — Verification status

Code/static verification completed. Actual browser visual/accessibility/native drawing verification is **blocked**, not passed. No screenshots were captured.

The browser tool returned an empty app/browser inventory. Opening the running frontend returned `Browser is not available: iab`. Therefore 1440×900, 1280×720, dark-mode appearance, keyboard traversal, native drawing gestures, binding/text refresh fidelity and narrow-screen overflow still require real browser inspection. Responsive styles, system appearance, focus states, semantic controls, dialog focus containment and reduced-motion CSS are implemented, but that is not a browser audit.

## Verification actually run

From the repository root:

```powershell
npm test --workspace=@trajectoryos/web
npm run typecheck --workspace=@trajectoryos/web
npm run build --workspace=@trajectoryos/web
git diff --check -- apps/web
```

- **19 tests passed, 0 failed, 0 skipped.** Node tests cover scene serialization/limits/recovery; API token refresh, malformed failures, 404 and rate limits; save races, lost save responses, conflicts, locked attempts, save-before-submit, ambiguous submission and existing-evaluation recovery; guarded evidence; rules/model labelling; selected mentor context. Vite SSR component tests cover comparison independent of repair selection, canonical-source escaping and returned mixed outcomes.
- Tests use transport/service doubles and server rendering. They do not establish browser Clerk sign-in, native-editor round trips, cross-user server authorization or actual PostgreSQL evaluation.
- Typecheck passed. Production build passed with Vite's >500 kB chunk warning for editor/diagram dependencies. Editor and Mermaid are loaded on demand. Prebuild local-font preparation passed; a served Excalifont request returned HTTP 200.
- `/learn`, `/learn/retry-safe-writes/1`, `/lab`, `/evidence`, `/mentors/preview` and `/career/preview` returned HTTP 200 from Vite. This verifies SPA delivery only.
- Compared configured server-secret values against 167 built JS/HTML files: no matches. The ignored frontend env contains only the API origin and the existing **public** Clerk publishable key.
- `git diff --check -- apps/web` passed. No backend integration suite was rerun by this frontend task.

## Live integration blockers and required checks

1. No controllable browser or authenticated Clerk browser session was available. The two-account isolation and complete signed-in journey remain unverified.
2. The earlier frontend run saw the local API exit on a PostgreSQL `read ECONNRESET`. Since then, B4 was pushed; its backend handoff records a successful runtime smoke (liveness/readiness 200 and invalid-token 401). No API process was listening at `127.0.0.1:3000` during this push, so the connected browser flow remains unverified.
3. Once available, verify: sign in → published lesson → deliberate create → draw bound text/arrows in both scenes → save → refresh → restore → edit → compare all files → select repair → review/submit → poll → evidence → explicit feedback → history. Repeat access with a second real account. Check deleted/unsupported content and conflict resolution in another tab.
4. Inspect all seven desktop templates at 1440×900 and 1280×720; inspect a narrow layout, 200% zoom, keyboard focus, system/dark appearance and reduced motion. Exercise native undo/redo, pan/zoom, scene switching and the read-only viewer.

No successful authenticated API, PostgreSQL submission or live provider feedback is claimed by this frontend handoff.

## Run and environment

Use Node >=22.12 and npm 11.6.1 with the root lockfile. On a clean checkout, install dependencies and build contracts before starting either app. The backend uses `apps/api/.env`; the frontend uses `apps/web/.env.local`.

```powershell
npm ci
npm run build --workspace=@trajectoryos/contracts
npm run migrate --workspace=@trajectoryos/api
npm run dev --workspace=@trajectoryos/api
```

Run the frontend in a second terminal from the repository root:

```powershell
npm run dev --workspace=@trajectoryos/web -- --strictPort
```

Open `http://127.0.0.1:5173`, sign in with the configured Clerk development instance, open the published retry-safe-credit lesson, start an attempt, then use the HLD/LLD lab, save/reload, investigate a code variant, submit, and open evidence/feedback/history. Confirm `http://127.0.0.1:3000/health/ready` responds before starting the lesson. No API process is currently running and no hosting action was taken.

Run the migration command once for a new database or when the backend owner has added a migration. The configured database already had migrations 001–003 applied in the backend handoff; avoid rerunning setup against a database you do not intend to change. API startup does not apply migrations.

Only frontend variables:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_CLERK_PUBLISHABLE_KEY=<matching public Clerk key>
```

An ignored `apps/web/.env.local` was created with those two public values using the backend's existing publishable configuration. No secret was copied. Standardize on `127.0.0.1`; Clerk app/origins, backend `CLERK_AUTHORIZED_PARTIES` and `CORS_ORIGINS` must agree exactly. Restart Vite after environment changes. Never put database, Clerk secret or model-provider keys in Vite variables.

`vercel.json` is prepared inside the frontend for an **apps/web project root**, workspace contract/frontend build, `dist` output and SPA rewrites excluding asset paths. Hosting configuration and deployed origins still require Rachit's review. It was not deployed or verified on Vercel.

## Dependency requests for Rachit

No dependencies were installed and the shared lockfile was not changed.

```powershell
npm install --workspace=@trajectoryos/web --save-exact framer-motion@14.3.0
npm install --workspace=@trajectoryos/web --save-exact mermaid@11.17.2
```

- `framer-motion` is **not installed**. Current interactions use restrained CSS, zero initial entrances and reduced-motion rules. The specified Framer Motion integration remains pending the shared-lockfile owner's addition. Once added, use `MotionConfig reducedMotion="user"` plus explicit zero-duration `useReducedMotion()` variants for button/panel/review interactions; never animate the canvas. Do not install a second Motion package.
- Mermaid 11.17.2 **is already installed transitively** through Excalidraw and builds successfully here. The second command requests an explicit frontend dependency for the safe Mermaid lesson renderer, rather than relying on that transitive relationship. No other UI, router, editor or test packages are requested.

## Contract findings

- No route/schema mismatch requiring a shared change was found. Current B4 origins match `127.0.0.1:5173`; the reviewed baseline's localhost wording was superseded.
- The shared package still has no EvidenceDto schema. The frontend adapter mirrors current worker/evidence fields and does not expose or invent `snapshotSha256`.
- `provenance.isSynthetic:false` is displayed only within raw provenance; the UI preserves the supplied synthetic-credit limitations and never claims real-money execution.
- Canonical source comments and filenames remain intact. A/B/C labels do not make this a blind assessment.
- Local editorial content stays outside the published lesson hash. A future reviewed publication belongs to the content/backend owners.

## Files

`src/app`: auth/configuration, appearance and browser routing. `src/lib`: validated API, evidence adapter, scene bounds and presentation helpers. `src/learning`: curriculum/lesson/companion. `src/attempts`: creation, recovery, queue, investigation and review. `src/drawing`: lazy native editable/read-only integration. `src/evidence`: polling/history/tests/artifacts/feedback. `src/previews`: typed local fixtures, owned-record selectors and packet model. `src/components`/`styles.css`: shared primitives, tokens and responsive layouts. `test`: 19 isolated frontend checks. Supporting frontend-only edits: package scripts, tsconfig, env example, HTML metadata, asset-preparation script, ignore file and Vercel configuration.
