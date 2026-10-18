import { z } from 'zod';

export const DesignReviewVersion = 'design-review-v1' as const;
export const DesignReviewRequestSchema = z.object({ retry: z.boolean().optional() }).strict();
export const DesignReviewStatusSchema = z.enum(['not_requested', 'generating', 'ready', 'limited', 'unavailable']);
export const DesignReviewSourceSchema = z.enum(['llm', 'rules']).nullable();
export const DesignFindingStatusSchema = z.enum(['explicitly_shown', 'ambiguous', 'not_clearly_shown', 'not_assessable']);
export const DesignCriterionSchema = z.enum([
  'system_boundaries', 'application_retry_path', 'idempotency_owner', 'durable_state', 'response_loss_boundary', 'external_dependencies',
  'account_scoped_key', 'payload_conflict', 'transaction_boundary', 'write_order', 'stored_response', 'rollback_behavior', 'concurrency',
]);
export const DesignEvidenceElementSchema = z.object({
  elementId: z.string().min(1).max(128),
  excerpt: z.string().max(180).nullable(),
}).strict();
export const DesignObservationSchema = z.object({
  text: z.string().trim().min(1).max(300),
  evidenceElements: z.array(DesignEvidenceElementSchema).max(8),
  connectionIds: z.array(z.string().min(1).max(128)).max(8),
}).strict();
export const DesignFindingSchema = z.object({
  criterion: DesignCriterionSchema,
  status: DesignFindingStatusSchema,
  explanation: z.string().trim().min(1).max(360),
  evidenceElements: z.array(DesignEvidenceElementSchema).max(8),
  connectionIds: z.array(z.string().min(1).max(128)).max(8),
  nextStep: z.string().max(240).nullable(),
}).strict();
export const DesignSectionSchema = z.object({
  observedElements: z.array(DesignObservationSchema).max(12),
  findings: z.array(DesignFindingSchema).max(10),
  questions: z.array(z.string().trim().min(1).max(220)).max(8),
  limitations: z.array(z.string().trim().min(1).max(220)).max(8),
}).strict();
export const DesignReviewContentSchema = z.object({
  hld: DesignSectionSchema,
  lld: DesignSectionSchema,
  limitations: z.array(z.string().trim().min(1).max(240)).max(10),
}).strict();
export const DesignReviewDtoSchema = z.object({
  id: z.string().uuid().nullable(),
  evidenceId: z.string().uuid(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewVersion: z.literal(DesignReviewVersion),
  status: DesignReviewStatusSchema,
  source: DesignReviewSourceSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  hld: DesignSectionSchema.nullable(),
  lld: DesignSectionSchema.nullable(),
  limitations: z.array(z.string()).max(10),
  failureCode: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
}).strict();

export type DesignReviewRequest = z.infer<typeof DesignReviewRequestSchema>;
export type DesignReviewStatus = z.infer<typeof DesignReviewStatusSchema>;
export type DesignReviewSource = z.infer<typeof DesignReviewSourceSchema>;
export type DesignFindingStatus = z.infer<typeof DesignFindingStatusSchema>;
export type DesignCriterion = z.infer<typeof DesignCriterionSchema>;
export type DesignEvidenceElement = z.infer<typeof DesignEvidenceElementSchema>;
export type DesignObservation = z.infer<typeof DesignObservationSchema>;
export type DesignFinding = z.infer<typeof DesignFindingSchema>;
export type DesignSection = z.infer<typeof DesignSectionSchema>;
export type DesignReviewContent = z.infer<typeof DesignReviewContentSchema>;
export type DesignReviewDto = z.infer<typeof DesignReviewDtoSchema>;
