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

