import { z } from "zod";

export const API_CONTRACT_VERSION = "0.4" as const;

export const ApiMetaSchema = z
  .object({
    requestId: z.string().uuid(),
    isMock: z.boolean(),
  })
  .strict();

export const ApiErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean(),
  })
  .strict();

export const ApiErrorEnvelopeSchema = z
  .object({
    error: ApiErrorSchema,
    meta: ApiMetaSchema,
  })
  .strict();

export function apiSuccessEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      data: dataSchema,
      meta: ApiMetaSchema,
    })
    .strict();
}

export const ChallengeVersionSchema = z
  .object({
    slug: z.literal("retry-safe-credit"),
    version: z.literal(1),
  })
  .strict();

export const SourceRefSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    url: z.string().url().optional(),
    author: z.string().optional(),
    accessedAt: z.string().datetime().optional(),
  })
  .strict();

export const LessonBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string(),
      type: z.literal("markdown"),
      markdown: z.string(),
      sourceIds: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("code"),
      language: z.string(),
      code: z.string(),
      sourceIds: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("diagram"),
      format: z.literal("mermaid"),
      source: z.string(),
      sourceIds: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      type: z.literal("callout"),
      tone: z.enum(["info", "warning"]),
      markdown: z.string(),
      sourceIds: z.array(z.string()),
    })
    .strict(),
]);

export const CourseDtoSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    lessons: z.array(
      z
        .object({
          slug: z.string(),
          version: z.number().int().positive(),
          title: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const CourseListDtoSchema = z.array(CourseDtoSchema);

export const LessonDtoSchema = z
  .object({
    slug: z.string(),
    version: z.number().int().positive(),
    title: z.string(),
    blocks: z.array(LessonBlockSchema),
    sources: z.array(SourceRefSchema),
    authoredBy: z.string(),
    contentSha256: z.string(),
    challenge: ChallengeVersionSchema,
  })
  .strict();

export const VariantIdSchema = z.enum([
  "credit-first",
  "key-only",
  "atomic",
]);

export const FaultyAiSuggestionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
    source: z.literal("curated_fixture"),
  })
  .strict();

export const ChallengeDtoSchema = z
  .object({
    slug: z.literal("retry-safe-credit"),
    version: z.literal(1),
    title: z.string(),
    requirementMarkdown: z.string(),
    evaluationMode: z.literal("approved_variant"),
    suiteVersion: z.string(),
    hiddenCases: z.literal(false),
    faultyAiSuggestion: FaultyAiSuggestionSchema,
    variants: z.array(
      z
        .object({
          id: VariantIdSchema,
          label: z.string(),
          files: z.array(
            z
              .object({
                path: z.string(),
                language: z.literal("typescript"),
                source: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    testDescriptions: z.array(
      z
        .object({
          id: z.string(),
          description: z.string(),
        })
        .strict(),
    ),
    diagramPrompts: z
      .object({
        hld: z.string(),
        lld: z.string(),
      })
      .strict(),
    limitations: z.array(z.string()),
  })
  .strict();

export const SceneSchema = z
  .object({
    engine: z.literal("excalidraw"),
    formatVersion: z.literal(1),
    elements: z.array(z.record(z.string(), z.unknown())).max(200),
  })
  .strict();

export const ArtifactSchema = z
  .object({
    hld: SceneSchema.nullable(),
    lld: SceneSchema.nullable(),
    decisions: z
      .object({
        keyScope: z.enum(["account", "global"]).nullable(),
        atomicity: z.enum(["transaction", "separate_writes"]).nullable(),
        payloadConflict: z.enum(["reject", "replay"]).nullable(),
      })
      .strict(),
    comments: z.string().max(4000).optional(),
    variantId: VariantIdSchema.nullable(),
    aiCritique: z.string().max(1200).nullable(),
    repairJustification: z.string().max(1200).nullable(),
  })
  .strict();

const drawableTypes = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
]);

function hasNonDeletedDrawable(scene: z.infer<typeof SceneSchema> | null) {
  return (
    scene?.elements.some((element) => {
      const type = element.type;
      return (
        element.isDeleted !== true &&
        typeof type === "string" &&
        drawableTypes.has(type)
      );
    }) ?? false
  );
}

export const SubmissionReadyArtifactSchema = ArtifactSchema.extend({
  hld: SceneSchema,
  lld: SceneSchema,
  decisions: z
    .object({
      keyScope: z.enum(["account", "global"]),
      atomicity: z.enum(["transaction", "separate_writes"]),
      payloadConflict: z.enum(["reject", "replay"]),
    })
    .strict(),
  variantId: VariantIdSchema,
  aiCritique: z
    .string()
    .max(1200)
    .refine((value) => value.trim().length > 0, {
      message: "Add a nonblank critique of the reviewed AI suggestion.",
    }),
  repairJustification: z
    .string()
    .max(1200)
    .refine((value) => value.trim().length > 0, {
      message: "Explain why you selected this repair.",
    }),
})
  .strict()
  .superRefine((artifact, context) => {
    if (!hasNonDeletedDrawable(artifact.hld)) {
      context.addIssue({
        code: "custom",
        path: ["hld"],
        message: "Add at least one nondeleted drawable HLD element.",
      });
    }
    if (!hasNonDeletedDrawable(artifact.lld)) {
      context.addIssue({
        code: "custom",
        path: ["lld"],
        message: "Add at least one nondeleted drawable LLD element.",
      });
    }
  });

export const CreateAttemptSchema = z
  .object({
    challengeSlug: z.literal("retry-safe-credit"),
    challengeVersion: z.literal(1),
    clientRequestId: z.string().uuid(),
  })
  .strict();

export const SaveDraftSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    artifact: ArtifactSchema,
  })
  .strict();

export const SubmitSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const EmptyRequestSchema = z.object({}).strict();

export const AttemptStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "evaluated",
  "execution_error",
]);

export const AttemptDtoSchema = z
  .object({
    id: z.string().uuid(),
    challenge: ChallengeVersionSchema,
    status: AttemptStatusSchema,
    revision: z.number().int().positive(),
    artifact: ArtifactSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    submittedAt: z.string().datetime().nullable(),
    evaluationId: z.string().uuid().nullable(),
    evidenceId: z.string().uuid().nullable(),
  })
  .strict();

export const AttemptSummarySchema = z
  .object({
    id: z.string().uuid(),
    challenge: ChallengeVersionSchema,
    status: AttemptStatusSchema,
    createdAt: z.string().datetime(),
    submittedAt: z.string().datetime().nullable(),
    evidenceId: z.string().uuid().nullable(),
  })
  .strict();

export const AttemptListDtoSchema = z
  .object({
    items: z.array(AttemptSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const EvaluationStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "error",
]);

export const EvaluationTestSchema = z
  .object({
    id: z.string(),
    status: z.enum(["passed", "failed"]),
    expected: z.unknown(),
    observed: z.unknown(),
    durationMs: z.number().nonnegative(),
  })
  .strict();

export const EvaluationResultSchema = z
  .object({
    suiteVersion: z.string(),
    suiteSha256: z.string(),
    implementationSha256: z.string(),
    runnerKind: z.literal("approved_variant"),
    verdict: z.enum(["all_passed", "some_failed"]),
    tests: z.array(EvaluationTestSchema),
  })
  .strict();

export const EvaluationDtoSchema = z
  .object({
    id: z.string().uuid(),
    attemptId: z.string().uuid(),
    status: EvaluationStatusSchema,
    generation: z.number().int().positive(),
    executionCount: z.number().int().nonnegative(),
    queuedAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    result: EvaluationResultSchema.nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean(),
      })
      .strict()
      .nullable(),
    evidenceId: z.string().uuid().nullable(),
  })
  .strict();

export const FeedbackDtoSchema = z
  .object({
    status: z.enum([
      "not_requested",
      "generating",
      "ready",
      "unavailable",
    ]),
    source: z.enum(["llm", "rules"]).nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    promptVersion: z.string().nullable(),
    output: z
      .object({
        summary: z.string(),
        strengths: z.array(
          z
            .object({
              text: z.string(),
              evidenceRefs: z.array(z.string()),
            })
            .strict(),
        ),
        limitations: z.array(z.string()),
        nextSteps: z.array(
          z
            .object({
              text: z.string(),
              evidenceRefs: z.array(z.string()),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const CareerCandidateFactSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["experience", "education", "project", "skill", "other"]),
    text: z.string().trim().min(1).max(500),
  })
  .strict();

export const CareerCandidateFactsSchema = z
  .object({
    source: z.literal("candidate_self_reported"),
    items: z.array(CareerCandidateFactSchema).max(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.items.map((fact) => fact.id)).size !== value.items.length) {
      context.addIssue({ code: "custom", path: ["items"], message: "Candidate fact IDs must be unique." });
    }
    if (value.items.reduce((total, fact) => total + fact.text.length, 0) > 8000) {
      context.addIssue({ code: "custom", path: ["items"], message: "Candidate facts are limited to 8,000 characters in total." });
    }
  });

export const CreateCareerReviewSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    jobDescription: z.string().trim().min(1).max(8000),
    evidenceIds: z.array(z.string().uuid()).min(1).max(10),
    candidateFacts: CareerCandidateFactsSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.evidenceIds).size !== value.evidenceIds.length) {
      context.addIssue({ code: "custom", path: ["evidenceIds"], message: "Evidence IDs must be unique." });
    }
  });

export const CareerTestObservationSchema = z
  .object({
    testId: z.string().regex(/^T[1-7]$/),
    status: z.enum(["passed", "failed"]),
  })
  .strict();

export const CareerEvidenceRecordSchema = z
  .object({
    evidenceId: z.string().uuid(),
    attemptId: z.string().uuid(),
    variantId: VariantIdSchema,
    createdAt: z.string().datetime(),
    provenance: z
      .object({
        isSynthetic: z.literal(false),
        runnerKind: z.literal("approved_variant"),
        challenge: z.object({ slug: z.literal("retry-safe-credit"), version: z.literal(1) }).strict(),
        manifestSha256: z.string(),
        contentSha256: z.string(),
        artifactSha256: z.string(),
        suiteVersion: z.string(),
        suiteSha256: z.string(),
        implementationSha256: z.string(),
        appCommit: z.string(),
        databaseVersion: z.string(),
        runId: z.string().uuid(),
        generation: z.number().int().positive(),
        startedAt: z.string().datetime(),
        finishedAt: z.string().datetime(),
      })
      .strict(),
    tests: z.array(CareerTestObservationSchema),
    limitations: z.array(z.string()),
  })
  .strict();

export const CareerRequirementEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    tests: z.array(CareerTestObservationSchema).min(1).max(7),
    explanation: z.string().trim().min(1).max(600),
  })
  .strict();

export const CareerRequirementSchema = z
  .object({
    id: z.string().regex(/^R[1-9]\d{0,1}$/),
    text: z.string().trim().min(1).max(500),
    source: z
      .object({
        kind: z.literal("job_description"),
        excerpt: z.string().trim().min(1).max(400),
      })
      .strict(),
    coverage: z.enum(["related_observation", "self_reported_only", "not_observed", "unassessed"]),
    evidence: z.array(CareerRequirementEvidenceSchema).max(10),
    candidateFactIds: z.array(z.string().uuid()).max(30),
  })
  .strict();

export const CareerReviewAnalysisSchema = z
  .object({
    source: z.enum(["llm", "rules"]),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    requirements: z.array(CareerRequirementSchema).max(30),
    limitations: z.array(z.string()).min(1).max(12),
  })
  .strict();

export const CareerResumeClaimSchema = z
  .object({
    text: z.string().min(1).max(800),
    sourceLabel: z.enum(["candidate_self_reported", "observed_test_evidence"]),
    candidateFactIds: z.array(z.string().uuid()).max(30),
    evidence: z.array(CareerRequirementEvidenceSchema).max(10),
  })
  .strict();

export const CareerResumeDraftSchema = z
  .object({
    source: z.literal("rules"),
    markdown: z.string().max(12000),
    claims: z.array(CareerResumeClaimSchema).max(100),
    needsReview: z.literal(true),
    createdAt: z.string().datetime(),
  })
  .strict();

export const CareerReviewStatusSchema = z.enum(["generating", "ready", "limited", "unavailable"]);

export const CareerReviewDtoSchema = z
  .object({
    id: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    status: CareerReviewStatusSchema,
    input: z
      .object({
        jobDescription: z.string().max(8000),
        evidenceIds: z.array(z.string().uuid()).min(1).max(10),
        candidateFacts: CareerCandidateFactsSchema.nullable(),
      })
      .strict(),
    evidence: z.array(CareerEvidenceRecordSchema).min(1).max(10),
    analysisVersion: z.string(),
    analysis: CareerReviewAnalysisSchema.nullable(),
    failureCode: z.string().nullable(),
    resumeDraft: CareerResumeDraftSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ApiMeta = z.infer<typeof ApiMetaSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ChallengeVersion = z.infer<typeof ChallengeVersionSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type LessonBlock = z.infer<typeof LessonBlockSchema>;
export type CourseDto = z.infer<typeof CourseDtoSchema>;
export type CourseListDto = z.infer<typeof CourseListDtoSchema>;
export type LessonDto = z.infer<typeof LessonDtoSchema>;
export type VariantId = z.infer<typeof VariantIdSchema>;
export type FaultyAiSuggestion = z.infer<typeof FaultyAiSuggestionSchema>;
export type ChallengeDto = z.infer<typeof ChallengeDtoSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type SubmissionReadyArtifact = z.infer<
  typeof SubmissionReadyArtifactSchema
>;
export type CreateAttempt = z.infer<typeof CreateAttemptSchema>;
export type SaveDraft = z.infer<typeof SaveDraftSchema>;
export type Submit = z.infer<typeof SubmitSchema>;
export type EmptyRequest = z.infer<typeof EmptyRequestSchema>;
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;
export type AttemptDto = z.infer<typeof AttemptDtoSchema>;
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;
export type AttemptListDto = z.infer<typeof AttemptListDtoSchema>;
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type EvaluationDto = z.infer<typeof EvaluationDtoSchema>;
export type FeedbackDto = z.infer<typeof FeedbackDtoSchema>;
export type CareerCandidateFact = z.infer<typeof CareerCandidateFactSchema>;
export type CareerCandidateFacts = z.infer<typeof CareerCandidateFactsSchema>;
export type CreateCareerReview = z.infer<typeof CreateCareerReviewSchema>;
export type CareerTestObservation = z.infer<typeof CareerTestObservationSchema>;
export type CareerEvidenceRecord = z.infer<typeof CareerEvidenceRecordSchema>;
export type CareerRequirement = z.infer<typeof CareerRequirementSchema>;
export type CareerReviewAnalysis = z.infer<typeof CareerReviewAnalysisSchema>;
export type CareerResumeDraft = z.infer<typeof CareerResumeDraftSchema>;
export type CareerReviewStatus = z.infer<typeof CareerReviewStatusSchema>;
export type CareerReviewDto = z.infer<typeof CareerReviewDtoSchema>;
