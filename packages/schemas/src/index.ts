import { z } from 'zod';

export const ReferenceSchema = z.object({
  kind: z.enum(['figure', 'table', 'query', 'doc', 'cell']).default('figure'),
  locator: z.string(),
});

export const DistributionSchema = z.object({
  column: z.string(),
  dtype: z.string(),
  count: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  histogram: z.array(z.number()),
  source_ref: ReferenceSchema.optional(),
});

export const IssueSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  column: z.string(),
  description: z.string(),
  statistic: z.record(z.any()).optional(),
});

export const EDAReportSchema = z.object({
  summary: z.object({ rows: z.number().int(), cols: z.number().int(), missingRate: z.number().min(0).max(1), typeMix: z.record(z.number()) }),
  issues: z.array(IssueSchema),
  distributions: z.array(DistributionSchema),
  keyFeatures: z.array(z.string()),
  outliers: z.array(z.object({ column: z.string(), indices: z.array(z.number().int()) })),
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

// --- B2: Prioritize ---
export const PrioritizeItemSchema = z.object({
  title: z.string(),
  impact: z.number(),
  effort: z.number(),
  confidence: z.number().min(0).max(1),
});
export type PrioritizeItem = z.infer<typeof PrioritizeItemSchema>;

export const PrioritizedActionSchema = z.object({
  title: z.string(),
  impact: z.number(),
  effort: z.number(),
  confidence: z.number(),
  score: z.number(),
});
export type PrioritizedAction = z.infer<typeof PrioritizedActionSchema>;

// --- C1: PII Scan ---
export const PIIScanResultSchema = z.object({
  detected_fields: z.array(z.string()),
  mask_policy: z.enum(['MASK', 'HASH', 'DROP']).default('MASK'),
});
export type PIIScanResult = z.infer<typeof PIIScanResultSchema>;

// --- C2: Leakage Scan ---
export const LeakageScanResultSchema = z.object({
  flagged_columns: z.array(z.string()),
  rules_matched: z.array(z.string()),
});
export type LeakageScanResult = z.infer<typeof LeakageScanResultSchema>;
