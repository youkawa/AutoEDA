import { describe, it, expect } from 'vitest';
import { EDAReportSchema } from '@autoeda/schemas';

describe('EDAReportSchema', () => {
  it('validates a correct report', () => {
    const data = {
      summary: { rows: 100, cols: 5, missingRate: 0.1, typeMix: { int: 2, float: 1, cat: 2 } },
      issues: [],
      distributions: [
        { column: 'x', dtype: 'int', count: 100, missing: 0, histogram: [1,2,3] },
      ],
      keyFeatures: ['a'],
      outliers: [],
    };
    const parsed = EDAReportSchema.parse(data);
    expect(parsed.summary.rows).toBe(100);
  });
});

