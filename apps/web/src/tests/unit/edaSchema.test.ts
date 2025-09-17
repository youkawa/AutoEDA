import { describe, it, expect } from 'vitest';
import { EDAReportSchema } from '@autoeda/schemas';

describe('EDAReportSchema', () => {
  it('validates a correct report', () => {
    const data = {
      summary: { rows: 100, cols: 5, missing_rate: 0.1, type_mix: { int: 2, float: 1, cat: 2 } },
      distributions: [
        { column: 'x', dtype: 'int', count: 100, missing: 0, histogram: [1, 2, 3], source_ref: { kind: 'figure', locator: 'fig:x' } },
      ],
      key_features: ['a'],
      outliers: [{ column: 'x', indices: [1, 2], evidence: { kind: 'table', locator: 'tbl:x' } }],
      data_quality_report: { issues: [{ severity: 'high', column: 'x', description: 'test', statistic: { missing_ratio: 0.3 }, evidence: { kind: 'table', locator: 'tbl:x_quality' } }] },
      next_actions: [{ title: '対応', impact: 0.9, effort: 0.4, confidence: 0.8, score: 1.8, wsjf: 1.8, rice: 18.0 }],
      references: [{ kind: 'table', locator: 'tbl:summary' }],
    };
    const parsed = EDAReportSchema.parse(data);
    expect(parsed.summary.rows).toBe(100);
  });
});
