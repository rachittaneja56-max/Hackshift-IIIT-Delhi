# Frontend integration handoff

This guide follows the executable schemas in `packages/contracts/src/index.ts` and the v0.3 wire authority in `architecture/05-api-contract.md`. All examples use the live API envelope and routes. There is no successful mock fallback.

## Clerk session token and API client

The Vite app and API are different origins. Call Clerk's `getToken()` for each API request and send the returned session JWT as `Authorization: Bearer …`. Do not store the token in local storage or a long-lived API client. Wait until Clerk is loaded; if `getToken()` returns `null`, ask the user to sign in. On a 401, force one fresh token with `getToken({ skipCache: true })` and retry the same request once. If it still returns 401, show the sign-in/session error. Never retry indefinitely. This API accepts Clerk `session_token` tokens, not custom JWT templates.

The snippet uses the installed React SDK (`@clerk/react`) and the browser-side `VITE_API_BASE_URL`, for example `http://127.0.0.1:3000` during local development:

Clerk references: [`useAuth()`](https://clerk.com/docs/reference/react/use-auth), [cross-origin authenticated requests](https://clerk.com/docs/guides/development/making-requests), and [session tokens / forced refresh](https://clerk.com/docs/guides/sessions/session-tokens).

```ts
import type {
  ApiError,
  ApiMeta,
  AttemptDto,
  AttemptListDto,
  Artifact,
  ChallengeDto,
  CourseListDto,
  EvaluationDto,
  FeedbackDto,
  LessonDto,
} from "@trajectoryos/contracts";

type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

type Success<T> = { data: T; meta: ApiMeta };
type Failure = { error: ApiError; meta: ApiMeta };

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> | undefined,
    public retryable: boolean,
    public requestId: string | undefined,
  ) {
    super(message);
  }
}

export function createApiClient(baseUrl: string, getToken: GetToken) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const send = async (token: string) => {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      if (init.body) headers.set("Content-Type", "application/json");
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(`${baseUrl.replace(/\/$/, "")}/api/v1${path}`, { ...init, headers });
    };

    let token = await getToken();
    if (!token) throw new ApiClientError(401, "UNAUTHENTICATED", "Sign in to continue.", undefined, false, undefined);
    let response = await send(token);
    if (response.status === 401) {
      token = await getToken({ skipCache: true });
      if (!token) throw new ApiClientError(401, "UNAUTHENTICATED", "Your session has expired. Sign in again.", undefined, false, undefined);
      response = await send(token);
    }

    const body = await response.json() as Success<T> | Failure;
    if (!response.ok) {
      const failure = body as Failure;
      throw new ApiClientError(
        response.status,
        failure.error?.code ?? "HTTP_ERROR",
        failure.error?.message ?? `Request failed (${response.status}).`,
        failure.error?.details,
        failure.error?.retryable ?? false,
        failure.meta?.requestId ?? response.headers.get("X-Request-ID") ?? undefined,
      );
    }
    return (body as Success<T>).data;
  }

  const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

  return {
    listCourses: () => request<CourseListDto>("/courses"),
    getLesson: (slug: string, version: number) => request<LessonDto>(`/lessons/${encodeURIComponent(slug)}/versions/${version}`),
    getChallenge: (slug: string, version: number) => request<ChallengeDto>(`/challenges/${encodeURIComponent(slug)}/versions/${version}`),
    createAttempt: (clientRequestId: string) => request<AttemptDto>("/attempts", json("POST", {
      challengeSlug: "retry-safe-credit", challengeVersion: 1, clientRequestId,
    })),
    getAttempt: (id: string) => request<AttemptDto>(`/attempts/${id}`),
    saveDraft: (id: string, expectedRevision: number, artifact: Artifact) => request<AttemptDto>(
      `/attempts/${id}/draft`, json("PUT", { expectedRevision, artifact }),
    ),
    submit: (id: string, expectedRevision: number) => request<EvaluationDto>(
      `/attempts/${id}/submit`, json("POST", { expectedRevision }),
    ),
    getEvaluation: (id: string) => request<EvaluationDto>(`/evaluations/${id}`),
    getEvidence: (id: string) => request<EvidenceDto>(`/evidence/${id}`),
    requestFeedback: (evidenceId: string) => request<FeedbackDto>(
      `/evidence/${evidenceId}/feedback`, json("POST", {}),
    ),
    getFeedback: (evidenceId: string) => request<FeedbackDto>(`/evidence/${evidenceId}/feedback`),
    listHistory: (limit = 20, cursor?: string) => {
      const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
      return request<AttemptListDto>(`/attempts?${query}`);
    },
  };
}
```

`EvidenceDto` is the persisted immutable snapshot plus a current `feedbackStatus` view. The shared package does not currently export an evidence schema/type, so this guide declares the exact response shape locally instead of changing the shared contract:

```ts
import type { Artifact, EvaluationResult, FeedbackDto } from "@trajectoryos/contracts";

export type EvidenceDto = {
  id: string;
  evaluationId: string;
  attemptId: string;
  createdAt: string;
  artifact: Artifact;
  provenance: {
    isSynthetic: false;
    runnerKind: "approved_variant";
    challenge: { slug: "retry-safe-credit"; version: 1 };
    manifestSha256: string;
    contentSha256: string;
    artifactSha256: string;
    suiteVersion: string;
    suiteSha256: string;
    implementationSha256: string;
    appCommit: string;
    databaseVersion: string;
    runId: string;
    generation: number;
    startedAt: string;
    finishedAt: string;
  };
  result: EvaluationResult;
  limitations: string[];
  feedbackStatus: FeedbackDto["status"];
};
```

Use the hook inside a component after Clerk loads:

```tsx
import { useMemo } from "react";
import { useAuth } from "@clerk/react";

function useTrajectoryApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const api = useMemo(
    () => createApiClient(import.meta.env.VITE_API_BASE_URL, getToken),
    [getToken],
  );
  return { api, authReady: isLoaded, signedIn: isSignedIn };
}
```

For local dev, Vite opens at `http://127.0.0.1:5173`. The API development CORS and default Clerk `authorizedParties` now match that origin. In deployed environments, set `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` to the exact HTTPS frontend origin. The browser `Origin`, Clerk token `azp`, CORS allowlist and configured Clerk application must agree. CORS is not an authorization check; the backend verifies the token and derives the user identity.

## Content and new attempt

Load the one seeded course, then its lesson and challenge:

```ts
const courses = await api.listCourses();
const lesson = await api.getLesson("retry-safe-writes", 1);
const challenge = await api.getChallenge("retry-safe-credit", 1);
```

The challenge response contains the reviewed suggestion (`source: "curated_fixture"`), three approved variant IDs and labels, their reviewed TypeScript files, the T1–T7 descriptions, diagram prompts and limitations. The selected `variantId` is the only implementation choice sent on submission; no user source is accepted or executed.

Create with a stable client key. Keep the same UUID if the response is lost and the create request must be retried. Retire the key after receiving the attempt; a deliberate new attempt gets a new UUID.

```ts
const clientRequestId = crypto.randomUUID();
const attempt = await api.createAttempt(clientRequestId);
// A new request returns 201; a replay with this same key returns 200.
```

## Excalidraw scene save and restore

The API scene envelope is `{ engine: "excalidraw", formatVersion: 1, elements: [...] }`. `formatVersion` is this DTO's version; it is not the Excalidraw package version. Serialize the element array from the editor. Do not put `appState` or `files` in the scene DTO.

The API accepts up to 200 elements per scene. Every element needs a nonempty string `id` (maximum 128 characters) and `type` of `rectangle`, `ellipse`, `diamond`, `text`, `arrow`, `line`, or `freedraw`. All other vendor fields are preserved as bounded JSON: nesting depth at most 12, object size at most 100 keys, arrays at most 2,048 entries, strings at most 16,000 characters, and finite numbers with absolute value at most 1e12. `files`, `fileId`, prototype-related keys and non-null `link` values are rejected. Image, iframe and embeddable elements, external file payloads and linked URLs are unsupported. The complete JSON request body is limited to 1 MiB. Keep coordinates, bindings, text and other element values needed for Excalidraw to restore the scene; render stored labels as data, never as HTML.

With Excalidraw's editor API, serialize and restore only the supported `elements` array (the casts bridge the contract's bounded JSON records and the editor's vendor types):

```ts
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Artifact, Scene } from "@trajectoryos/contracts";

function serializeScene(editor: ExcalidrawImperativeAPI): Scene {
  return {
    engine: "excalidraw",
    formatVersion: 1,
    elements: editor.getSceneElements() as unknown as Scene["elements"],
  };
}

function restoreScene(editor: ExcalidrawImperativeAPI, scene: Scene | null) {
  editor.updateScene({
    elements: (scene?.elements ?? []) as unknown as readonly ExcalidrawElement[],
  });
}
```

The server accepts the DTO fields above, but the pinned Excalidraw editor must still be checked in a real browser for editor-level round-trip fidelity. No browser round-trip is claimed by this handoff.

Draft artifact shape (nullable fields are valid while drafting):

```ts
const artifact: Artifact = {
  hld: serializeScene(hldEditor),
  lld: serializeScene(lldEditor),
  decisions: {
    keyScope: "account",
    atomicity: "transaction",
    payloadConflict: "reject",
  },
  comments: "Optional learner notes.",
  variantId: "atomic",
  aiCritique: "The suggestion can double-credit when the response is lost.",
  repairJustification: "The atomic variant stores the key, effect and response together.",
};

const saved = await api.saveDraft(attempt.id, attempt.revision, artifact);
// Successful saves increment revision. Submit only this returned revision.
```

On a 409 `REVISION_CONFLICT`, preserve the local artifact, read `error.details.currentRevision`, fetch the current attempt, and offer an explicit reload or reconciliation choice. Do not silently replace either version or retry with the new revision while dropping the local scene. A 409 `ATTEMPT_LOCKED` means the attempt has already been submitted. A 422 `SUBMISSION_INCOMPLETE` includes field paths; drafting may remain incomplete, but submission requires both scenes to contain at least one nondeleted drawable, all three design decisions, an allowlisted variant, and nonblank `aiCritique` and `repairJustification`.

```ts
try {
  await api.saveDraft(attempt.id, attempt.revision, artifact);
} catch (error) {
  if (error instanceof ApiClientError && error.status === 409 && error.code === "REVISION_CONFLICT") {
    const currentRevision = error.details?.currentRevision;
    const current = await api.getAttempt(attempt.id);
    // Keep `artifact` locally until the learner chooses how to resolve the conflict.
    showRevisionConflict({ currentRevision, currentAttempt: current, localArtifact: artifact });
  } else {
    throw error;
  }
}
```

## Submit and poll evaluation

Submit the most recent successful save's revision. The server freezes that artifact and returns 202 while queued/running or 200 for a terminal replay.

```ts
let evaluation = await api.submit(saved.id, saved.revision);
```

Poll about once a second, backing off to two seconds when appropriate. Stop when the page is hidden/unmounted or the status becomes terminal; a browser polling timeout does not cancel or fail server work. Resume by fetching the same evaluation ID.

```ts
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

while (["queued", "running"].includes(evaluation.status)) {
  if (document.visibilityState === "hidden") break;
  await pause(1000);
  evaluation = await api.getEvaluation(evaluation.id);
}

if (evaluation.status === "completed" && evaluation.evidenceId) {
  const evidence = await api.getEvidence(evaluation.evidenceId);
  showEvidence(evidence);
} else if (evaluation.status === "error") {
  showEvaluationError(evaluation.error);
  // Offer the explicit POST /evaluations/:id/retry path only when retryable is true.
}
```

The API currently runs one suite at a time per worker process; a typical hosted-database run may take tens of seconds. Keep a visible queued/running state and make leaving the page safe. Do not invent a verdict if polling or connectivity fails.

## Evidence, AI feedback and history

Evidence contains the frozen artifact, provenance hashes and real observed test results. Display `result.tests` and `result.verdict` as the deterministic source of truth. `GET /evidence/:id` includes the current `feedbackStatus` view; it is not part of the immutable snapshot hash.

Feedback generation is explicit. POST an empty JSON object. A completed call returns 200 with `source: "llm"` or `source: "rules"`; a concurrent caller can receive 202 with `status: "generating"`. Poll GET until `ready` or `unavailable`.

```ts
let feedback = await api.requestFeedback(evidence.id);
while (feedback.status === "generating") {
  await pause(1000);
  feedback = await api.getFeedback(evidence.id);
}

if (feedback.source === "llm") {
  showFeedback(feedback.output, `${feedback.provider} · ${feedback.model}`);
} else if (feedback.source === "rules") {
  showFeedback(feedback.output, "Rule-based explanation");
} else {
  showFeedbackUnavailable(feedback);
}
```

Never label a rules result as live AI. Provider failure falls back to a persisted rule explanation; it does not change the evaluation or evidence. When listing history, treat `nextCursor` as opaque and pass it back as received:

```ts
const page = await api.listHistory(20);
const nextPage = page.nextCursor
  ? await api.listHistory(20, page.nextCursor)
  : undefined;
```

## Loading, pending, errors and retry behavior

- **Loading:** wait for `isLoaded`; then load courses/lesson/challenge and the current attempt. For a saved attempt, restore both scenes and its revision before enabling Save or Submit.
- **Saving:** disable duplicate Save for that attempt while one request is in flight. Keep the local artifact until the returned `AttemptDto` confirms the revision.
- **Queued/running:** show that evaluation is pending, poll the returned evaluation ID, and resume polling after navigation. The worker has a two-minute run deadline and a five-minute lease; abrupt worker loss becomes an explicit `RUNNER_RESTARTED` error once the lease expires. Graceful shutdown aborts the run and leaves retry state visible.
- **401:** refresh once with `getToken({ skipCache: true })`; if it still fails, request sign-in. Do not send the Clerk secret key to the browser.
- **403:** show an origin/configuration error. Check exact origin agreement for the Vite URL, API CORS, Clerk authorized parties and the Clerk app.
- **404:** show that the resource is unavailable. It can mean the record does not exist or belongs to another user.
- **409:** for `REVISION_CONFLICT`, preserve both versions and ask the learner to reconcile; for `ATTEMPT_LOCKED`, show the frozen attempt; for `RETRY_LIMIT`, explain that no infrastructure retry remains.
- **413/422:** explain the size/field issue and keep local content available for correction. Do not resend an unchanged oversized request.
- **429:** respect the response's `Retry-After` header (currently 2 seconds) and avoid retry storms.
- **503 or network failure:** show the request error and `requestId` when present. Preserve the local draft and offer explicit retry when the operation is safe. Never activate a silent mock-success path.
- **Evaluation `error`:** show the server's message and retry only if `error.retryable` is true; call `POST /evaluations/:id/retry` with `{}`. A completed behavioral failure is evidence, not an infrastructure retry.
- **AI `source: "rules"`:** display “Rule-based explanation.” A provider failure is not a live model result.

The backend-only integration tests use signed test JWTs and real PostgreSQL. They do not prove browser sign-in, Vercel/Railway origin configuration, or Excalidraw editor restoration. Those checks need the real browser and environment.
