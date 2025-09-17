import { z } from 'zod';

export const ReferenceSchema = z.object({
  kind: z.enum(['table', 'column', 'cell', 'figure', 'query', 'doc']).default('figure'),
  locator: z.string(),
  evidence_id: z.string().optional(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const SummarySchema = z.object({
  rows: z.number().int().nonnegative(),
  cols: z.number().int().nonnegative(),
  missing_rate: z.number().min(0).max(1),
  type_mix: z.record(z.string(), z.number()),
});

export const DistributionSchema = z.object({
  column: z.string(),
  dtype: z.string(),
  count: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  histogram: z.array(z.number()),
  source_ref: ReferenceSchema.optional(),
});

export const DataQualityIssueSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  column: z.string(),
  description: z.string(),
  statistic: z.record(z.string(), z.any()).optional(),
  evidence: ReferenceSchema,
});

export const DataQualityReportSchema = z.object({
  issues: z.array(DataQualityIssueSchema),
});

export const OutlierSchema = z.object({
  column: z.string(),
  indices: z.array(z.number().int()),
  evidence: ReferenceSchema.optional(),
});

export const NextActionSchema = z.object({
  title: z.string(),
  reason: z.string().optional(),
  impact: z.number().min(0).max(1),
  effort: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  score: z.number(),
  wsjf: z.number(),
  rice: z.number(),
  dependencies: z.array(z.string()).optional(),
});

export const EDAReportSchema = z.object({
  summary: SummarySchema,
  distributions: z.array(DistributionSchema),
  key_features: z.array(z.string()),
  outliers: z.array(OutlierSchema),
  data_quality_report: DataQualityReportSchema,
  next_actions: z.array(NextActionSchema),
  references: z.array(ReferenceSchema),
});

export type EDAReport = z.infer<typeof EDAReportSchema>;

// --- A2: Chart Suggestion ---
export const ChartCandidateSchema = z.object({
  id: z.string(),
  type: z.enum(['bar', 'line', 'scatter']),
  explanation: z.string(),
  source_ref: ReferenceSchema,
  consistency_score: z.number().min(0).max(1),
});
export type ChartCandidate = z.infer<typeof ChartCandidateSchema>;

// --- B1: QnA ---
export const AnswerSchema = z.object({
  text: z.string(),
  references: z.array(ReferenceSchema),
  coverage: z.number().min(0).max(1),
});
export type Answer = z.infer<typeof AnswerSchema>;

// --- Responses (server objects) ---
export const ChartsSuggestResponseSchema = z.object({
  charts: z.array(ChartCandidateSchema),
});
export type ChartsSuggestResponse = z.infer<typeof ChartsSuggestResponseSchema>;

export const QnAResponseSchema = z.object({
  answers: z.array(AnswerSchema),
  references: z.array(ReferenceSchema).default([]),
});
export type QnAResponse = z.infer<typeof QnAResponseSchema>;

// --- B2: Prioritize ---
export const PrioritizeItemSchema = z.object({
  title: z.string(),
  reason: z.string().optional(),
  impact: z.number().min(0).max(1),
  effort: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  dependencies: z.array(z.string()).optional(),
});
export type PrioritizeItem = z.infer<typeof PrioritizeItemSchema>;

export const PrioritizedActionSchema = z.object({
  title: z.string(),
  reason: z.string().optional(),
  impact: z.number().min(0).max(1),
  effort: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  score: z.number(),
  wsjf: z.number(),
  rice: z.number(),
  dependencies: z.array(z.string()).optional(),
});
export type PrioritizedAction = z.infer<typeof PrioritizedActionSchema>;

// --- C1: PII Scan ---
export const PIIScanResultSchema = z.object({
  detected_fields: z.array(z.string()),
  mask_policy: z.enum(['MASK', 'HASH', 'DROP']).default('MASK'),
  masked_fields: z.array(z.string()).default([]),
  updated_at: z.string().optional(),
});
export type PIIScanResult = z.infer<typeof PIIScanResultSchema>;

export const PIIApplyRequestSchema = z.object({
  dataset_id: z.string(),
  mask_policy: z.enum(['MASK', 'HASH', 'DROP']).default('MASK'),
  columns: z.array(z.string()).default([]),
});
export type PIIApplyRequest = z.infer<typeof PIIApplyRequestSchema>;

export const PIIApplyResultSchema = z.object({
  dataset_id: z.string(),
  mask_policy: z.enum(['MASK', 'HASH', 'DROP']),
  masked_fields: z.array(z.string()),
  updated_at: z.string(),
});
export type PIIApplyResult = z.infer<typeof PIIApplyResultSchema>;

// --- C2: Leakage Scan ---
export const LeakageScanResultSchema = z.object({
  flagged_columns: z.array(z.string()),
  rules_matched: z.array(z.string()),
});
export type LeakageScanResult = z.infer<typeof LeakageScanResultSchema>;

// --- D1: Recipe Emit ---
export const RecipeEmitResultSchema = z.object({
  artifact_hash: z.string(),
  files: z.array(z.string()),
});
export type RecipeEmitResult = z.infer<typeof RecipeEmitResultSchema>;
