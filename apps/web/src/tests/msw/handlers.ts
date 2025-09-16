import { http, HttpResponse } from 'msw';
import type { PrioritizeItem, PrioritizedAction } from '@autoeda/schemas';

export const handlers = [
  http.post('/api/eda', async () => {
    return HttpResponse.json({
      summary: { rows: 100, cols: 5, missingRate: 0.1, typeMix: { int: 2, float: 1, cat: 2 } },
      issues: [
        { severity: 'high', column: 'price', description: '欠損が多い（32%）', statistic: { missing: 0.32 } },
      ],
      distributions: [
        { column: 'x', dtype: 'int', count: 100, missing: 0, histogram: [1,2,3] },
      ],
      keyFeatures: ['a'],
      outliers: [],
    });
  }),
  http.post('/api/charts/suggest', async () => {
    return HttpResponse.json([
      { id: 'c1', type: 'bar', explanation: 'MSW: 提案例', source_ref: { kind: 'figure', locator: 'fig:msw' }, consistency_score: 0.96 },
    ]);
  }),
  http.post('/api/qna', async () => {
    return HttpResponse.json([
      { text: 'MSW: 回答', references: [{ kind: 'figure', locator: 'fig:msw' }], coverage: 0.9 },
    ]);
  }),
  http.post('/api/actions/prioritize', async ({ request }) => {
    const body = (await request.json()) as { next_actions: PrioritizeItem[] };
    const items: PrioritizeItem[] = body?.next_actions ?? [];
    const ranked: PrioritizedAction[] = items
      .map((a) => ({ ...a, score: (a.impact / Math.max(1, a.effort)) * a.confidence }))
      .sort((a, b) => b.score - a.score);
    return HttpResponse.json(ranked);
  }),
  http.post('/api/pii/scan', async () => {
    return HttpResponse.json({ detected_fields: ['email'], mask_policy: 'MASK' });
  }),
  http.post('/api/leakage/scan', async () => {
    return HttpResponse.json({ flagged_columns: ['target_next_month'], rules_matched: ['time_causality'] });
  }),
];
